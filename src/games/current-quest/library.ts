/**
 * Board issue (design 5.3). Deterministic from a seed so a server can
 * reproduce the exact three boards (ids + transforms) of a run from the same
 * client library file. Scored contexts ignore local progress; the Quick Run
 * uses it to teach currents first and tide second.
 */

import { CQ_LIBRARY } from './boards.v2.client';
import {
  LINE_BONUS_KNOBS, PUZZLE_KNOBS, RIDE_KNOBS, transformBoard,
  type Board, type Knobs, type MechanicSet, type Slot,
} from './rules';

export type RunContext = 'quick' | 'ride' | 'line' | 'ghost' | 'practice';

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
  return PUZZLE_KNOBS;
}

/** Scored contexts (server reproduces them): fixed coin pool, progress ignored. */
export function isScored(context: RunContext): boolean {
  return context === 'ride' || context === 'line';
}

/** The three boards of a run: [warm-up, standard, treasure], transformed. */
export function pickRun(seed: number, context: RunContext, progress: RunProgressHint = NO_PROGRESS): Board[] {
  const rand = mulberry32((seed >>> 0) ^ hashString(`cq:${context}`));
  const draw = (pool: Board[]): Board => {
    const b = pool[Math.floor(rand() * pool.length) % pool.length];
    const tf = Math.floor(rand() * 8) & 7;
    return transformBoard(b, tf);
  };
  const teach = (id: string) => CQ_LIBRARY.find((b) => b.id === id) as Board;
  if (isScored(context)) {
    return [draw(poolOf('C', 'warmup', true)), draw(poolOf('CT', 'standard', true)), draw(poolOf('CT', 'treasure', true))];
  }
  if (progress.runsCompleted <= 0) {
    // First run ever: the current teach board, then currents only.
    return [teach('T1'), draw(poolOf('C', 'standard')), draw(poolOf('C', 'treasure'))];
  }
  if (!progress.tideSeen) {
    // Tide arrives in the Standard slot through its teach board; Treasure deepens it.
    return [draw(poolOf('C', 'warmup')), teach('T2'), draw(poolOf('CT', 'treasure'))];
  }
  return [draw(poolOf('C', 'warmup')), draw(poolOf('CT', 'standard')), draw(poolOf('CT', 'treasure'))];
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
    if (!b) return null;
    out.push(transformBoard(b, r.tf & 7));
  }
  return out;
}
