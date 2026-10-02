/**
 * Board issue (design v7.1 5.3). Deterministic from a seed so a server can
 * reproduce the exact boards (ids + transforms) of a run from the same client
 * library file. Scored contexts ignore local progress; the Quick Run uses it
 * to teach currents first and tide second.
 *
 * Run shapes (4.3, 4.4, 14.1, 14.3):
 *   quick / practice / ghost / challenge: 2 voyages, Trick Shot (5x5) matched
 *     to the Deep board's aha tag (R7) + Deep (5x7), Puzzle.
 *   ride / line (Trial): 3 voyages, Rookie coin pool Trick Shot + Standard (5x6) + Deep (5x7).
 *   daily: 3 voyages, Trick Shot matched to the Deep tag + Standard + Deep (Adept band), Puzzle.
 *   showdown: 3 voyages, Standard + Standard + Deep (all tide boards), Puzzle.
 *   chart: one curated chart node (one voyage).
 * Transforms are drawn from the board's allowed set (8 on 5x5, 4 on tall boards).
 * Retired boards (the v5 Warm-up cell, struck boards) never enter a pool.
 */

import { CQ_LIBRARY } from './boards.v3.client';
import {
  allowedTransforms, heightOf, LINE_BONUS_KNOBS, PUZZLE_KNOBS, RIDE_KNOBS, transformAllowed, transformBoard,
  type AhaTag, type Board, type Knobs, type MechanicSet, type Slot,
} from './rules';

/** Server knob (4.3): the Quick Run is 2 voyages unless the walking playtest earns it a third. */
export const QUICK_RUN_VOYAGES = 2;
/**
 * Server knob (0.A.9): rows of the Quick Run's second voyage. 7 = a Deep board.
 * If the G7b 2-voyage walking median is over 75 s it drops to 6: the second
 * voyage then draws an aha-tagged CT Standard board instead.
 */
export const QUICK_RUN_DEEP_ROWS: 6 | 7 = 7;
/** Showdown window (14.1, v7): 210 s for 3 voyages. */
export const SHOWDOWN_VOYAGES = 3;

export type RunContext = 'quick' | 'ride' | 'line' | 'ghost' | 'practice' | 'showdown' | 'daily' | 'chart' | 'challenge';

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

export function poolOf(set: MechanicSet | null, slot: Slot, coinOnly = false): Board[] {
  return CQ_LIBRARY.filter((b) => (set === null || b.set === set) && b.slot === slot && !b.teach && !b.retired && (!coinOnly || b.coin));
}

export function knobsFor(context: RunContext): Knobs {
  if (context === 'ride') return RIDE_KNOBS;
  if (context === 'line') return LINE_BONUS_KNOBS;
  if (context === 'showdown') return { ...PUZZLE_KNOBS, showdown: true };
  return PUZZLE_KNOBS;
}

/** Scored Trial contexts (server reproduces them): fixed coin pool, progress ignored. */
export function isScored(context: RunContext): boolean {
  return context === 'ride' || context === 'line';
}

/** Contexts whose boards come from the seed alone (never local progress). */
export function isSeeded(context: RunContext): boolean {
  return isScored(context) || context === 'daily' || context === 'showdown' || context === 'challenge';
}

/** Pick a board and one of its allowed transforms with two draws from `rand`. */
function drawFrom(rand: () => number, pool: Board[]): Board {
  const b = pool[Math.floor(rand() * pool.length) % pool.length];
  const allowed = allowedTransforms(heightOf(b));
  const tf = allowed[Math.floor(rand() * allowed.length) % allowed.length];
  return transformBoard(b, tf);
}

/** How many voyages a context plays. */
export function voyagesFor(context: RunContext): number {
  if (context === 'chart') return 1;
  if (isScored(context) || context === 'daily') return 3;
  if (context === 'showdown') return SHOWDOWN_VOYAGES;
  return QUICK_RUN_VOYAGES;
}

/** The Trick Shot opener for a Deep board (R7): same aha tag, else any opener of the same mechanic set. */
export function trickFor(rand: () => number, deep: Board, coinOnly = false): Board {
  const tag = deep.ahaTag;
  const sameSet = poolOf(deep.P > 0 ? null : 'C', 'trick', coinOnly);
  const matched = tag ? sameSet.filter((b) => b.ahaTag === tag) : [];
  return drawFrom(rand, matched.length ? matched : poolOf('C', 'trick', coinOnly));
}

/** Second Quick Run voyage: a tagged Deep board, or a tagged CT Standard under quickRunDeepRows = 6 (0.A.9). */
function quickDeepPool(set: MechanicSet): Board[] {
  const slot: Slot = QUICK_RUN_DEEP_ROWS === 7 ? 'treasure' : 'standard';
  const tagged = poolOf(set, slot).filter((b) => !!b.ahaTag);
  return tagged.length ? tagged : poolOf(set, slot);
}

/** The boards of a run, in play order, transformed. */
export function pickRun(seed: number, context: RunContext, progress: RunProgressHint = NO_PROGRESS): Board[] {
  const rand = mulberry32((seed >>> 0) ^ hashString(`cq:${context}`));
  const draw = (pool: Board[]): Board => drawFrom(rand, pool);
  const teach = (id: string) => CQ_LIBRARY.find((b) => b.id === id) as Board;
  if (context === 'showdown') return showdownBoards(seed);
  if (context === 'daily') return dailyBoards(seed);
  if (isScored(context)) {
    // Ride Challenge / LinePlay bonus: Rookie band only, fixed coin window (4.4); the opener never brings tide.
    return [draw(poolOf('C', 'trick', true)), draw(poolOf('CT', 'standard', true)), draw(poolOf('CT', 'treasure', true))];
  }
  const fresh = context === 'challenge' ? { runsCompleted: 9, tideSeen: true } : progress;
  if (fresh.runsCompleted <= 0) {
    // First run ever: the current teach board (riding is the only way through), then a currents-only Deep board.
    return [teach('T1'), draw(quickDeepPool('C'))];
  }
  if (!fresh.tideSeen) {
    // Tide arrives through its teach board; one twist per voyage, never two at once.
    return [draw(poolOf('C', 'trick')), teach('T2')];
  }
  const deep = draw(quickDeepPool('CT'));
  return [trickFor(rand, deep), deep];
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

/** The three Same-Board Showdown voyages for a seed (Standard, Standard, Deep; all tide boards; 14.1). */
export function showdownBoards(seed: number): Board[] {
  const rand = mulberry32((seed >>> 0) ^ hashString('cq:showdown'));
  const std = poolOf('CT', 'standard').filter((b) => (b.splashPhase ?? -1) >= 1);
  const deep = poolOf('CT', 'treasure').filter((b) => (b.splashPhase ?? -1) >= 1);
  const a = drawFrom(rand, std);
  let b = drawFrom(rand, std);
  for (let k = 0; k < 4 && b.id.split('~')[0] === a.id.split('~')[0]; k++) b = drawFrom(rand, std);
  return [a, b, drawFrom(rand, deep)];
}

/** Daily Tide (14.3): Trick Shot matched to the Deep tag, then Adept Standard and Deep (client pool stands in for the sealed set). */
export function dailyBoards(seed: number): Board[] {
  const rand = mulberry32((seed >>> 0) ^ hashString('cq:daily'));
  const adept = (bs: Board[]) => { const a = bs.filter((b) => b.band === 'adept'); return a.length ? a : bs; };
  const deep = drawFrom(rand, adept(poolOf('CT', 'treasure').filter((b) => !!b.ahaTag)));
  const std = drawFrom(rand, adept(poolOf('CT', 'standard')));
  return [trickFor(rand, deep), std, deep];
}

/** Daily seed for a park and a park-local date (YYYY-MM-DD). The server uses hmac(park_id + date); this is the lab stub. */
export function dailySeed(parkKey: string, date: string): number {
  return hashString(`daily:${parkKey}:${date}`);
}

/** Tag of a board id (for the share card and curator copy). */
export function ahaTagOf(id: string): AhaTag | undefined {
  return boardById(id)?.ahaTag;
}
