/**
 * Lagoon Dash: Current Quest as a Line Party micro-round (design v5 14.1,
 * Same-Board Showdown, in the netcode stream's PartySim contract).
 *
 * Everyone in the line gets the same seeded Standard board (5x6, currents and
 * often tide) and 45 seconds. A tap log is [boardMs, action] with the Current
 * Quest action codes 0..6 (swim up/right/down/left, tread, undo, restart). The
 * server's Node sidecar replays this exact file through the same rules engine
 * the app ships, so the only score that counts is the replay's.
 *
 * Ranking never uses time (design v5 E8): a cleared board scores
 * 10000 + 1000 * shells - 20 * strokes - undos (strokes capped at 30, undos at
 * 19, so the order is strictly shells, then strokes, then undos), and equal
 * scores share a placement. An unfinished board scores by progress (pearls),
 * never zero for trying. Walking is free: no clock inside the board, the
 * window is sized for a moving line, and a HOLD or a dropped player is covered
 * by ghostFill (their own taps, then their bot from that exact state).
 *
 * Rules for this file (sidecar bundle): integers only, no Math.random, no
 * Date, no clock reads, no package imports.
 */

import {
  A_RESTART, A_UNDO, allowedTransforms, applyAction, createRun, heightOf, PUZZLE_KNOBS, strokesLeft, totalShells, transformBoard,
  type Board, type RunState,
} from '../rules';
import { distanceFrom, hintFrom } from '../solver';
import { hashString, poolOf } from '../library';

export const LAGOON_DASH_VERSION = 1;
export const ROUND_MS = 45000;
export const MAX_TAPS = 120;
/** First stroke no earlier than this after GO (think floor, design 16). */
export const THINK_FLOOR_MS = 900;

export type DashTap = [number, number];
export type DashProfile = 'rookie' | 'regular' | 'ace';

export interface DashResult {
  score: number;
  cleared: boolean;
  shells: number;
  strokes: number;
  undos: number;
  pearls: number;
  golden: boolean;
  /** Board time of the clearing stroke (integrity and replays only; never ranked). */
  clearedAt: number;
}

/** mulberry32 as uint32 (no floats in state), mirrored by the bonk sim. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** The shared board: a Standard-slot board, tide on odd seeds, under one of its allowed transforms. */
export function buildBoard(seed: number): Board {
  const next = rng((seed >>> 0) ^ hashString('cq:lagoon_dash'));
  const pool = poolOf((next() & 1) === 1 ? 'CT' : 'C', 'standard');
  const b = pool[next() % pool.length];
  const allowed = allowedTransforms(heightOf(b));
  return transformBoard(b, allowed[next() % allowed.length]);
}

export function validTaps(taps: unknown): taps is DashTap[] {
  if (!Array.isArray(taps) || taps.length > MAX_TAPS) return false;
  let last = 0;
  for (const tap of taps) {
    if (!Array.isArray(tap) || tap.length !== 2) return false;
    const [t, a] = tap;
    if (!Number.isInteger(t) || !Number.isInteger(a)) return false;
    if (t < 0 || t > ROUND_MS || t < last || a < 0 || a > A_RESTART) return false;
    last = t;
  }
  return true;
}

function replay(board: Board, taps: DashTap[]): { run: RunState; clearedAt: number } {
  let run = createRun([board], PUZZLE_KNOBS);
  let clearedAt = -1;
  for (const [t, a] of taps) {
    if (run.complete) break;
    const res = applyAction(run, a, t);
    if (res.ok) run = res.run;
    if (run.complete && clearedAt < 0) clearedAt = t;
  }
  return { run, clearedAt };
}

export function scoreOf(cleared: boolean, shells: number, strokes: number, undos: number, pearls: number, golden: boolean): number {
  if (cleared) return 10000 + 1000 * shells - 20 * Math.min(30, strokes) - Math.min(19, undos);
  return 100 * pearls + (golden ? 40 : 0);
}

export function resolve(board: Board, taps: DashTap[]): DashResult {
  const { run, clearedAt } = replay(board, validTaps(taps) ? taps : []);
  const cleared = run.complete;
  const v = run.voyage;
  const r = run.results[0];
  let pearls = 0;
  for (let k = 0; k < board.pearls.length; k++) if (cleared || (v.mask & (1 << k))) pearls++;
  const golden = cleared ? r.shellGolden : v.golden;
  const shells = cleared ? totalShells(run.results) : 0;
  const strokes = cleared ? r.strokes : v.strokes;
  const undos = cleared ? r.undos : v.undos;
  return { score: scoreOf(cleared, shells, strokes, undos, pearls, golden), cleared, shells, strokes, undos, pearls, golden, clearedAt };
}

export function resultHash(r: DashResult): string {
  const text = [r.score, r.cleared ? 1 : 0, r.shells, r.strokes, r.undos, r.pearls, r.golden ? 1 : 0, r.clearedAt].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Bots (house crew and ghosts): human think times, human wrong turns undone,
// the golden pearl only when it fits the budget. Fully deterministic.

const PROFILE: Record<DashProfile, { think: [number, number]; mistake: number; gold: number }> = {
  rookie: { think: [2400, 4200], mistake: 22, gold: 30 },
  regular: { think: [1700, 3000], mistake: 10, gold: 65 },
  ace: { think: [1100, 2100], mistake: 3, gold: 100 },
};

function botFrom(board: Board, start: RunState, seed: number, seat: number, profile: DashProfile, fromMs: number): DashTap[] {
  const p = PROFILE[profile] ?? PROFILE.regular;
  const next = rng(((seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b1)) >>> 0);
  const think = () => p.think[0] + (next() % (p.think[1] - p.think[0] + 1));
  const chaseGold = next() % 100 < p.gold;
  const out: DashTap[] = [];
  let run = start;
  let t = Math.max(fromMs, THINK_FLOOR_MS) + think();
  let pendingUndo = false;
  let guard = 0;
  while (!run.complete && t <= ROUND_MS && out.length < MAX_TAPS && guard++ < 200) {
    const v = run.voyage;
    let a: number;
    if (v.stalled) a = A_RESTART;
    else if (pendingUndo) { a = A_UNDO; pendingUndo = false; }
    else if (next() % 100 < p.mistake && v.strokes > 0) {
      const good = hintFrom(board, v, 1, Infinity)[0];
      a = [0, 1, 2, 3].filter((d) => d !== good)[next() % 3];
      pendingUndo = true;
    } else {
      const left = strokesLeft(run);
      const best = hintFrom(board, v, 1, chaseGold ? left : 0)[0];
      a = best ?? (distanceFrom(board, v, false) < 99 ? 0 : A_RESTART);
    }
    const res = applyAction(run, a, t);
    if (res.ok && res.recorded) {
      run = res.run;
      out.push([t, a]);
    } else pendingUndo = false;
    t += a === A_UNDO ? 700 + (next() % 500) : think();
  }
  return out;
}

export function botTaps(board: Board, seed: number, seat: number, profile: DashProfile, fromMs = 0): DashTap[] {
  return botFrom(board, createRun([board], PUZZLE_KNOBS), seed, seat, profile, fromMs);
}

/** A dropped or held-too-long player: their own taps until `untilMs`, then their bot from that exact state. */
export function ghostFill(board: Board, seed: number, seat: number, own: DashTap[], untilMs: number, profile: DashProfile): DashTap[] {
  const mine = own.filter(([t]) => t < untilMs);
  const { run } = replay(board, mine);
  if (run.complete) return mine;
  const last = mine.length ? mine[mine.length - 1][0] : 0;
  return [...mine, ...botFrom(board, run, seed, seat, profile, Math.max(untilMs, last + 1))].slice(0, MAX_TAPS);
}
