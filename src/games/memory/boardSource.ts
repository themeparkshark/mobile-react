/**
 * boardSource.ts: where faces come from (design 10, 13).
 *
 * Two sources behind one interface, driving the same engine reducer:
 *
 *   LocalBoard   Time Attack, practice. The layout lives on the client
 *                (glimpse and Photo Flash can read faces directly).
 *   RevealBoard  Ride Sprint, ranked Daily, Race, Crew. The layout lives on the
 *                server; the client learns one face per flip and never gets the
 *                seed. Until WS7 ships the memory_sessions endpoints
 *                (POST /me/task-attempts/{id}/memory/start, /flips, /pause,
 *                /resume) the reveal side runs in-process (`createSimReveal`),
 *                holding the layout in a closure and running its own copy of
 *                the engine, exactly like the PHP port will.
 */

import {
  createEngine,
  step,
  summarize,
  type EngineInit,
  type MMConfig,
  type MMEvent,
  type MMState,
} from './engine';
import { buildLayout, type Layout, type LayoutOptions } from './logic';

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
}

export interface BoardSource {
  readonly kind: 'local' | 'reveal';
  readonly info: BoardInfo;
  /** Local boards only: the face of the card at a slot (glimpse, Photo Flash, Peek). */
  faceAt(slot: number, ids: number[]): number | null;
  /** Mirror a non-flip action (tick, dismiss, walking, freeze) to the authority. */
  send(action: Parameters<typeof step>[1]): void;
  /** Flip a card: resolves with its face. */
  flip(slot: number, at: number): FlipReveal | Promise<FlipReveal>;
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
    flip: (slot, _at) => ({ face: layout.faces[slot] ?? -1, events: [] }),
    verdict: () => ({}),
    endReveal: (ids) => ids.map((id) => layout.faces[id]),
  };
}

export interface SimRevealOptions {
  cfg: MMConfig;
  layout: LayoutOptions;
  deckSize: number;
  engineSeed: number;
  /** Simulated round trip for exercising the network-hold pose (0 = instant). */
  latencyMs?: number;
}

/**
 * In-process reveal authority. The layout never leaves this closure: the
 * returned object exposes the board shape and one face per flip only.
 */
export function createSimReveal(o: SimRevealOptions): BoardSource {
  const layout = buildLayout(o.layout);
  const faces = layout.faces;
  const init: EngineInit = { cols: layout.cols, rows: layout.rows, seed: o.engineSeed };
  const authority: MMState = createEngine(o.cfg, init);
  const latency = Math.max(0, o.latencyMs ?? 0);
  const info: BoardInfo = {
    cols: layout.cols,
    rows: layout.rows,
    pairs: layout.pairs,
    preloadFaces: Array.from({ length: o.deckSize }, (_, i) => i),
    golden: !!o.layout.golden,
    gull: !!o.layout.gull,
  };
  return {
    kind: 'reveal',
    info,
    faceAt: () => null,
    send(action) {
      step(authority, action);
    },
    flip(slot, at) {
      const face = faces[authority.ids[slot]];
      const events = step(authority, { t: 'flip', slot, face, at });
      if (!latency) return { face, events };
      return new Promise((resolve) => setTimeout(() => resolve({ face, events }), latency));
    },
    verdict: () => summarize(authority),
    endReveal: () => (authority.status === 'play' ? null : authority.ids.map((id) => faces[id])),
  };
}
