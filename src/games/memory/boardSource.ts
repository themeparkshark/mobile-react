/**
 * boardSource.ts: where faces come from (design v8 10, 13).
 *
 * Three sources behind one interface, driving the same engine reducer:
 *
 *   LocalBoard       Warm-up, Time Attack, Pass & Play. The layout lives on the
 *                    client (glimpse, Peek and Photo Flash read faces directly).
 *   RevealBoard      Ride Sprint, Steal Duel. A fixed seeded layout lives on the
 *                    server; the client learns one face per flip, never the seed.
 *                    Each flip carries `client_t` and `rx_prev_t`, the server
 *                    answers with the face, its verdict and the running
 *                    `charged_ms` (charged.ts). A buffered tap is pipelined.
 *   FairRevealBoard  Daily, Line Duel, Race. No layout exists: the server binds a
 *                    face to a slot the moment it is first flipped (Fair Deck).
 *
 * Until WS7 ships the memory_sessions endpoints (POST
 * /me/task-attempts/{id}/memory/start, /memory/sessions/{id}/flips, /pause,
 * /resume) the authority runs in-process (`createSimReveal`,
 * `createSimFairReveal`): it holds the layout (or seed) in a closure and runs
 * its own copy of the engine on charged time, exactly like the PHP port will.
 * Both take a latency injector (fixed, jittered or a park trace).
 */

import {
  FACE_UNKNOWN,
  createEngine,
  step,
  summarize,
  type EngineInit,
  type MMAction,
  type MMConfig,
  type MMEvent,
  type MMState,
} from './engine';
import { buildLayout, shapeForPairs, type Layout, type LayoutOptions } from './logic';
import { chargeFlip, createCharge, revealSent, type ChargeState, type Latency } from './charged';
import { createFairDeck, fairFlip, type FairDeck } from './modes/fairDeck';

export interface BoardInfo {
  cols: number;
  rows: number;
  pairs: number;
  /** Deck faces to preload. A reveal board lists every deck face (reveals nothing). */
  preloadFaces: number[];
  golden: boolean;
  gull: boolean;
}

export interface FlipReveal {
  face: number;
  /** Server verdict events (authoritative for reveal boards). */
  events: MMEvent[];
  /** Running charged ms on the server (charged-clock modes). */
  chargedMs?: number;
  /** The try's network allowance is used up: the rope's glint turns orange. */
  capHit?: boolean;
}

/** Client timing sent with every flip (10.1). */
export interface FlipTimingIn {
  /** Client monotonic ms since GO when the tap happened. */
  clientT: number;
  /** When the previous reveal was rendered (0 before the first). */
  rxPrevT: number;
  /** A buffered tap sent before the previous reveal arrived. */
  pipelined?: boolean;
}

export interface BoardSource {
  readonly kind: 'local' | 'reveal' | 'fair';
  readonly info: BoardInfo;
  /** Local boards only: the face of the card at a slot (glimpse, Photo Flash, Peek). */
  faceAt(slot: number, ids: number[]): number | null;
  /** Mirror a non-flip action (dismiss, walking, freeze) to the authority. */
  send(action: MMAction): void;
  /** Flip a card: resolves with its face. */
  flip(slot: number, at: number, timing?: FlipTimingIn): FlipReveal | Promise<FlipReveal>;
  /** Authoritative summary (server verdict for proofs). */
  verdict(): Record<string, number | string>;
  /** Full layout by slot, only once the session is over (timeout reveal). */
  endReveal(ids: number[]): number[] | null;
}

/** Local layout: faces are on the client. */
export function createLocalBoard(opts: LayoutOptions, deckSize: number): BoardSource & { layout: Layout } {
  const layout = buildLayout(opts);
  return {
    kind: 'local',
    layout,
    info: {
      cols: layout.cols,
      rows: layout.rows,
      pairs: layout.pairs,
      preloadFaces: Array.from({ length: deckSize }, (_, i) => i),
      golden: !!opts.golden,
      gull: !!opts.gull,
    },
    faceAt: (slot, ids) => layout.faces[ids[slot]] ?? null,
    send: () => undefined,
    flip: (slot) => ({ face: layout.faces[slot] ?? -1, events: [] }),
    verdict: () => ({}),
    endReveal: (ids) => ids.map((id) => layout.faces[id]),
  };
}

export interface SimRevealOptions {
  cfg: MMConfig;
  layout: LayoutOptions;
  deckSize: number;
  engineSeed: number;
  /** Simulated round trip per flip (ms, or a latency function). 0 = instant. */
  latencyMs?: number | Latency;
  /** Await a delay (tests pass an immediate one). */
  wait?: (ms: number) => Promise<void>;
}

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function latencyFn(l: number | Latency | undefined): Latency {
  if (typeof l === 'function') return l;
  const ms = Math.max(0, l ?? 0);
  return () => ms;
}

/**
 * The shared authority core: an engine on charged time plus the charge ledger.
 * The authority's clock is the sum of charged time, so its timeout, stars and
 * verdict match what the server will compute.
 */
function authority(cfg: MMConfig, init: EngineInit) {
  const eng: MMState = createEngine(cfg, init);
  const charge: ChargeState = createCharge(0);
  const charged = cfg.clockMs != null;
  let serverNow = 0;
  return {
    eng,
    charge,
    /** Apply a flip received at server time `recvAt` with the given face. */
    flip(slot: number, face: number, timing: FlipTimingIn | undefined, recvAt: number): { events: MMEvent[]; chargedMs?: number; capHit?: boolean } {
      serverNow = Math.max(serverNow, recvAt);
      let at: number;
      if (charged && timing) {
        chargeFlip(charge, { clientT: timing.clientT, rxPrevT: timing.rxPrevT, recvAt: serverNow, pipelined: timing.pipelined });
        at = charge.chargedMs;
      } else {
        at = timing ? timing.clientT : recvAt;
      }
      const events: MMEvent[] = [];
      if (eng.phase === 2) events.push(...step(eng, { t: 'dismiss', slot, at }));
      else events.push(...step(eng, { t: 'tick', at }));
      events.push(...step(eng, { t: 'flip', slot, face, at }));
      revealSent(charge, serverNow);
      return charged ? { events, chargedMs: charge.chargedMs, capHit: charge.capHit } : { events };
    },
  };
}

/**
 * In-process reveal authority (Ride Sprint, Steal Duel). The layout never
 * leaves this closure: the returned object exposes the board shape and one
 * face per flip only.
 */
export function createSimReveal(o: SimRevealOptions): BoardSource {
  const layout = buildLayout(o.layout);
  const faces = layout.faces;
  const auth = authority(o.cfg, { cols: layout.cols, rows: layout.rows, seed: o.engineSeed });
  const lat = latencyFn(o.latencyMs);
  const wait = o.wait ?? defaultWait;
  let i = 0;
  const info: BoardInfo = {
    cols: layout.cols,
    rows: layout.rows,
    pairs: layout.pairs,
    preloadFaces: Array.from({ length: o.deckSize }, (_, k) => k),
    golden: !!o.layout.golden,
    gull: !!o.layout.gull,
  };
  return {
    kind: 'reveal',
    info,
    faceAt: () => null,
    send(action) {
      // Only state the server tracks; clock actions are server-owned.
      if (action.t === 'dismiss' || action.t === 'walking' || action.t === 'freeze') step(auth.eng, { ...action, at: auth.eng.now });
    },
    flip(slot, at, timing) {
      const rtt = lat(i++);
      const run = () => {
        const face = faces[auth.eng.ids[slot]];
        const recvAt = (timing?.clientT ?? at) + rtt / 2;
        const r = auth.flip(slot, face, timing, recvAt);
        return { face, ...r };
      };
      if (!rtt) return run();
      return wait(rtt).then(run);
    },
    verdict: () => ({ ...summarize(auth.eng), chargedMs: auth.charge.chargedMs, allowanceMs: auth.charge.allowanceMs }),
    endReveal: () => (auth.eng.status === 'play' ? null : auth.eng.ids.map((id) => faces[id])),
  };
}

export interface SimFairOptions {
  cfg: MMConfig;
  /** The board's face set (e.g. the Daily's face set of the day). */
  faces: number[];
  pairs: number;
  /** Server seed (never sent to the client in production). */
  seed: number;
  engineSeed: number;
  latencyMs?: number | Latency;
  wait?: (ms: number) => Promise<void>;
}

/** In-process Fair Deck authority (Daily, Line Duel, Race). No layout exists. */
export function createSimFairReveal(o: SimFairOptions): BoardSource & { deck: FairDeck } {
  const sh = shapeForPairs(o.pairs);
  const deck = createFairDeck(o.seed, o.faces, sh.cols, sh.rows);
  const auth = authority(o.cfg, { cols: sh.cols, rows: sh.rows, seed: o.engineSeed });
  const lat = latencyFn(o.latencyMs);
  const wait = o.wait ?? defaultWait;
  let i = 0;
  return {
    kind: 'fair',
    deck,
    info: { cols: sh.cols, rows: sh.rows, pairs: o.pairs, preloadFaces: o.faces.slice(0, o.pairs), golden: false, gull: false },
    faceAt: () => null,
    send(action) {
      if (action.t === 'dismiss' || action.t === 'walking' || action.t === 'freeze') step(auth.eng, { ...action, at: auth.eng.now });
    },
    flip(slot, at, timing) {
      const rtt = lat(i++);
      const run = () => {
        const e = auth.eng;
        // B binds against A's face; after a miss hold the next flip is a new A.
        const aFace = e.phase === 1 ? e.faces[e.a] : null;
        const face = fairFlip(deck, e.ids[slot], aFace);
        const recvAt = (timing?.clientT ?? at) + rtt / 2;
        return { face, ...auth.flip(slot, face, timing, recvAt) };
      };
      if (!rtt) return run();
      return wait(rtt).then(run);
    },
    verdict: () => ({ ...summarize(auth.eng), chargedMs: auth.charge.chargedMs }),
    endReveal: (ids) => {
      if (auth.eng.status === 'play') return null;
      // Bind what's left so the end screen can show it (the seed is public after close).
      return ids.map((id) => (deck.slots[id] !== FACE_UNKNOWN ? deck.slots[id] : fairFlip(deck, id, null)));
    },
  };
}
