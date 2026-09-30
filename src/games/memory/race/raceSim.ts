/**
 * raceSim.ts: Memory Race rules (design 4.5), pure and replayable.
 *
 * Everyone plays the same board from the round seed, in parallel. First to
 * clear wins; at the 45s cap it is most pairs, then score. Chain 3 sends a
 * Gull Swap to the current leader (max 2 stored, max 1 incoming per 3000ms,
 * 5s opening shield, 1000ms telegraph, a match inside the telegraph blocks it).
 *
 * House crew seats (the same crew Line Party uses) are simulated with the
 * engine itself, so their pace, slips and Showtimes are real, not faked.
 */

import { botPick } from '../bot';
import {
  createEngine,
  raceConfig,
  step,
  type MMEvent,
  type MMState,
} from '../engine';
import { buildLayout, makeRng, type Layout } from '../logic';

export const RACE_MS = 45000;
export const RACE_GLIMPSE_MS = 1000;
export const ATTACK_TELEGRAPH_MS = 1000;
export const ATTACK_GAP_MS = 3000;
export const ATTACK_SHIELD_MS = 5000;
export const ATTACK_MAX_STORED = 2;
/** A Gull Swap pushes a ghost/bot timeline back by this much (design 4.5). */
export const GHOST_PUSHBACK_MS = 1200;

export type CrewProfile = 'rookie' | 'regular' | 'ace';

export const CREW_PROFILES: Record<CrewProfile, { recall: number; turnMs: number; jitterMs: number }> = {
  rookie: { recall: 0.55, turnMs: 2400, jitterMs: 600 },
  regular: { recall: 0.72, turnMs: 2000, jitterMs: 450 },
  ace: { recall: 0.88, turnMs: 1750, jitterMs: 350 },
};

export interface CrewSeat {
  id: string;
  name: string;
  profile: CrewProfile;
  /** Alex shark colour key (party/partyArt SHARKS). */
  shark: 'blue' | 'pink' | 'red' | 'orange' | 'green';
}

export const HOUSE_CREW: CrewSeat[] = [
  { id: 'bot:captain', name: 'Captain Fin', profile: 'ace', shark: 'blue' },
  { id: 'bot:bubbles', name: 'Bubbles', profile: 'regular', shark: 'pink' },
  { id: 'bot:chomps', name: 'Chomps', profile: 'rookie', shark: 'red' },
  { id: 'bot:coral', name: 'Coral', profile: 'regular', shark: 'orange' },
  { id: 'bot:tidal', name: 'Tidal', profile: 'rookie', shark: 'green' },
];

export function raceLayout(seed: number): Layout {
  return buildLayout({ pairs: 8, deckSize: 10, seed, golden: true });
}

/** A seat's seed is a pure function of the round seed and the seat. */
export function seatSeed(seed: number, seat: number): number {
  let h = (seed ^ Math.imul(seat + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export interface RaceFrame {
  at: number;
  pairs: number;
  chain: number;
  score: number;
  showtime: boolean;
}

export interface CrewRun {
  seat: CrewSeat;
  /** Board-time flips [slot, at] (log format of engine.ts). */
  log: number[];
  frames: RaceFrame[];
  /** Board times when this seat's chain reached 3 (Gull Swap sends). */
  sends: number[];
  clearAt: number | null;
  final: RaceFrame;
}

function frameOf(s: MMState, at: number): RaceFrame {
  return { at, pairs: s.pairs, chain: s.chain, score: s.score, showtime: s.showLeftMs > 0 || s.showTurnsLeft > 0 };
}

/** Everyone gets the same glimpse at the start of the round. */
export function glimpseAll(s: MMState, layout: Layout): void {
  const slots = layout.faces.map((_, i) => i);
  step(s, { t: 'reveal', slots, faces: layout.faces.slice(), at: 0 });
}

/** Play a crew seat through the round with the engine. `delays` push the timeline back (attacks received). */
export function simulateCrew(seed: number, seatIndex: number, seat: CrewSeat, layout: Layout, delays: number[] = []): CrewRun {
  const p = CREW_PROFILES[seat.profile];
  const s = createEngine(raceConfig(), { cols: layout.cols, rows: layout.rows, seed: seatSeed(seed, seatIndex) });
  const rng = makeRng(seatSeed(seed, seatIndex + 97));
  glimpseAll(s, layout);
  // Imperfect glimpse memory: rookies forget most of it.
  for (let i = 0; i < s.n; i++) if (rng() > p.recall * 0.35) s.know[i] = 0;
  const frames: RaceFrame[] = [frameOf(s, 0)];
  const sends: number[] = [];
  let t = RACE_GLIMPSE_MS;
  const pending = delays.slice().sort((a, b) => a - b);
  for (let guard = 0; guard < 400 && s.status === 'play'; guard++) {
    let half = Math.max(260, (p.turnMs + (rng() * 2 - 1) * p.jitterMs) / 2);
    while (pending.length && pending[0] <= t + half) {
      pending.shift();
      half += GHOST_PUSHBACK_MS;
    }
    t += half;
    if (t >= RACE_MS + RACE_GLIMPSE_MS) break;
    step(s, { t: 'tick', at: t });
    if (s.status !== 'play') break;
    if (s.phase === 2) step(s, { t: 'dismiss', slot: -1, at: t });
    const slot = botPick(s, p.recall, rng);
    if (slot < 0) break;
    const before = s.chain;
    const ev: MMEvent[] = step(s, { t: 'flip', slot, face: layout.faces[s.ids[slot]], at: t });
    if (ev.some((e) => e.k === 'match')) frames.push(frameOf(s, t));
    else if (ev.some((e) => e.k === 'slip')) frames.push(frameOf(s, t));
    if (before < 3 && s.chain >= 3) sends.push(t);
  }
  const clearAt = s.status === 'cleared' ? frames[frames.length - 1].at : null;
  return { seat, log: s.log.slice(), frames, sends, clearAt, final: frames[frames.length - 1] };
}

/** A seat's state at a board time. */
export function frameAt(run: CrewRun, at: number): RaceFrame {
  let f = run.frames[0];
  for (const x of run.frames) {
    if (x.at > at) break;
    f = x;
  }
  return f;
}

export interface RaceEntry {
  key: string;
  pairs: number;
  score: number;
  clearAt: number | null;
}

/** 1-based placements: cleared first (earliest wins), then pairs, then score. */
export function placements(entries: RaceEntry[]): Record<string, number> {
  const sorted = entries.slice().sort((a, b) => {
    if (a.clearAt != null || b.clearAt != null) {
      if (a.clearAt == null) return 1;
      if (b.clearAt == null) return -1;
      if (a.clearAt !== b.clearAt) return a.clearAt - b.clearAt;
    }
    if (a.pairs !== b.pairs) return b.pairs - a.pairs;
    return b.score - a.score;
  });
  const out: Record<string, number> = {};
  sorted.forEach((e, i) => { out[e.key] = i + 1; });
  return out;
}

/** Attack gate: shield, gap between incoming, storage cap. */
export interface AttackGate {
  stored: number;
  lastIncomingAt: number;
}

export function createAttackGate(): AttackGate {
  return { stored: 0, lastIncomingAt: -1e9 };
}

/** Queue an attack; returns true when it may start its telegraph now. */
export function offerAttack(g: AttackGate, at: number): boolean {
  if (at < ATTACK_SHIELD_MS) return false;
  if (at - g.lastIncomingAt < ATTACK_GAP_MS) {
    g.stored = Math.min(ATTACK_MAX_STORED, g.stored + 1);
    return false;
  }
  g.lastIncomingAt = at;
  return true;
}

/** Release a stored attack once the gap has passed. */
export function releaseStored(g: AttackGate, at: number): boolean {
  if (g.stored <= 0 || at < ATTACK_SHIELD_MS || at - g.lastIncomingAt < ATTACK_GAP_MS) return false;
  g.stored -= 1;
  g.lastIncomingAt = at;
  return true;
}

/** Deterministic crew for a round: 3 seats, a mix of profiles, picked from the seed. */
export function crewFor(seed: number): CrewSeat[] {
  const rng = makeRng(seed ^ 0x51ed27);
  const pool = HOUSE_CREW.slice();
  const out: CrewSeat[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
