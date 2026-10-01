/**
 * Board issue (design v5 5.3). Deterministic from a seed so a server can
 * reproduce the exact boards (ids + transforms) of a run from the same client
 * library file. Scored contexts ignore local progress; the Quick Run uses it
 * to teach currents first and tide second.
 *
 * Run shapes (4.3, 4.4):
 *   quick / practice / ghost: 2 voyages, Warm-up (5x5) + Treasure (5x7), Puzzle.
 *   ride / line (Trial):      3 voyages, Rookie coin pool Warm-up + Standard (5x6) + Treasure (5x7).
 *   showdown:                 2 voyages, Standard + Treasure (tide set).
 * Transforms are drawn from the board's allowed set (8 on 5x5, 4 on tall boards).
 */

import { CQ_LIBRARY } from './boards.v2.client';
import {
  allowedTransforms, heightOf, LINE_BONUS_KNOBS, PUZZLE_KNOBS, RIDE_KNOBS, transformAllowed, transformBoard,
  type Board, type Knobs, type MechanicSet, type Slot,
} from './rules';

/** Server knob (4.3): the Quick Run is 2 voyages unless the walking playtest earns it a third. */
export const QUICK_RUN_VOYAGES = 2;

export type RunContext = 'quick' | 'ride' | 'line' | 'ghost' | 'practice' | 'showdown';

export interface RunProgressHint {
  /** Completed runs on this device (0 = first run ever: teach currents). */
  readonly runsCompleted: number;
  /** Has this player met the tide teach board? */
  readonly tideSeen: boolean;
}

export const NO_PROGRESS: RunProgressHint = { runsCompleted: 0, tideSeen: false };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a of a short string (context salt). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function boardById(id: string): Board | undefined {
  const base = id.split('~')[0];
  return CQ_LIBRARY.find((b) => b.id === base);
}

export function poolOf(set: MechanicSet, slot: Slot, coinOnly = false): Board[] {
  return CQ_LIBRARY.filter((b) => b.set === set && b.slot === slot && !b.teach && (!coinOnly || b.coin));
}

export function knobsFor(context: RunContext): Knobs {
  if (context === 'ride') return RIDE_KNOBS;
  if (context === 'line') return LINE_BONUS_KNOBS;
  if (context === 'showdown') return { ...PUZZLE_KNOBS, showdown: true };
  return PUZZLE_KNOBS;
}

/** Scored contexts (server reproduces them): fixed coin pool, progress ignored. */
export function isScored(context: RunContext): boolean {
  return context === 'ride' || context === 'line';
}

/** Pick a board and one of its allowed transforms with two draws from `rand`. */
function drawFrom(rand: () => number, pool: Board[]): Board {
  const b = pool[Math.floor(rand() * pool.length) % pool.length];
  const allowed = allowedTransforms(heightOf(b));
  const tf = allowed[Math.floor(rand() * allowed.length) % allowed.length];
  return transformBoard(b, tf);
}

/** How many voyages a context plays (2 for queue runs and Showdowns, 3 for Trials). */
export function voyagesFor(context: RunContext): number {
  return isScored(context) ? 3 : context === 'showdown' ? 2 : QUICK_RUN_VOYAGES;
}

/** The boards of a run, in play order, transformed. */
export function pickRun(seed: number, context: RunContext, progress: RunProgressHint = NO_PROGRESS): Board[] {
  const rand = mulberry32((seed >>> 0) ^ hashString(`cq:${context}`));
  const draw = (pool: Board[]): Board => drawFrom(rand, pool);
  const teach = (id: string) => CQ_LIBRARY.find((b) => b.id === id) as Board;
  if (context === 'showdown') return showdownBoards(seed);
  if (isScored(context)) {
    // Ride Challenge / LinePlay bonus: Rookie band only, fixed coin window (4.4).
    return [draw(poolOf('C', 'warmup', true)), draw(poolOf('CT', 'standard', true)), draw(poolOf('CT', 'treasure', true))];
  }
  const three = QUICK_RUN_VOYAGES >= 3;
  if (progress.runsCompleted <= 0) {
    // First run ever: the current teach board (riding is the only way through), then currents only.
    return three ? [teach('T1'), draw(poolOf('C', 'standard')), draw(poolOf('C', 'treasure'))] : [teach('T1'), draw(poolOf('C', 'treasure'))];
  }
  if (!progress.tideSeen) {
    // Tide arrives through its teach board; one twist per voyage, never two at once.
    return three ? [draw(poolOf('C', 'warmup')), teach('T2'), draw(poolOf('CT', 'treasure'))] : [draw(poolOf('C', 'warmup')), teach('T2')];
  }
  return three
    ? [draw(poolOf('C', 'warmup')), draw(poolOf('CT', 'standard')), draw(poolOf('CT', 'treasure'))]
    : [draw(poolOf('C', 'warmup')), draw(poolOf('CT', 'treasure'))];
}

/** Proof board refs for a run (ids without the transform suffix + transform). */
export function boardRefs(boards: readonly Board[]): { id: string; tf: number }[] {
  return boards.map((b) => {
    const at = b.id.indexOf('~');
    return { id: at < 0 ? b.id : b.id.slice(0, at), tf: at < 0 ? 0 : Number(b.id.slice(at + 1)) | 0 };
  });
}

/** Rebuild a run's boards from proof refs (server side of pickRun). */
export function boardsFromRefs(refs: readonly { id: string; tf: number }[]): Board[] | null {
  const out: Board[] = [];
  for (const r of refs) {
    const b = boardById(r.id);
    if (!b || !transformAllowed(r.tf, heightOf(b))) return null;
    out.push(transformBoard(b, r.tf));
  }
  return out;
}

/** The two Same-Board Showdown voyages for a seed (Standard + Treasure, tide set). */
export function showdownBoards(seed: number): Board[] {
  const rand = mulberry32((seed >>> 0) ^ hashString('cq:showdown'));
  return [drawFrom(rand, poolOf('CT', 'standard')), drawFrom(rand, poolOf('CT', 'treasure'))];
}
