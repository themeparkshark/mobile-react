/**
 * endWatch.ts: the one results watchdog every game shares (GameShellV2).
 *
 * When a run is over, the game tells the shell (`shell.endWatch(ms, rescue)`).
 * If the game's result has not reached the shell `ms` later, the shell asks the
 * game's `rescue` for one (built from its live state). If the game still has
 * nothing after END_WATCH_GRACE_MS, the shell shows the shared card with the
 * score it already knows. A finished run can never sit on a dark board.
 *
 * Pure: the shell owns the timers; this file decides what the rescue card says
 * and keeps a small trace for release-JS soak checks (capture builds read it).
 */

import { starsFor, type StarThresholds } from './scoring';

/** Default wait from "the run is over" to a result before the shell steps in. */
export const END_WATCH_MS = 4000;
/** After the game's rescue had its chance, the shell's own card follows this fast. */
export const END_WATCH_GRACE_MS = 1500;

/** The fields of a game result the rescue needs (GameShellV2's GameResult has more). */
export interface EndWatchResult {
  score: number;
  stars: number;
  message?: string;
  thresholds?: StarThresholds;
  meta?: Record<string, unknown>;
}

/**
 * The card a rescued run shows. A game's rescue keeps its own numbers; with none,
 * the shell's live score earns its stars. Never a RUN SAVED stamp (the run really
 * ended), and meta says the watch stepped in.
 */
export function endWatchResult<T extends { score: number; meta?: Record<string, unknown> }>(
  fromGame: T | null | undefined, score: number, thresholds?: StarThresholds,
): T | EndWatchResult {
  if (fromGame) {
    const meta = { ...(fromGame.meta ?? {}), endWatch: 'game' };
    delete (meta as Record<string, unknown>).partial;
    return { ...fromGame, meta };
  }
  const s = Math.max(0, Math.round(Number(score) || 0));
  return { score: s, stars: thresholds ? starsFor(s, thresholds) : 0, thresholds, meta: { endWatch: 'shared', score: s } };
}

/** One finished run, for the soak log: when it ended, when a card was lit, and who lit it. */
export interface EndTraceRow {
  game: string;
  run: number;
  overAt: number;
  litAt: number | null;
  by: 'game' | 'rescue' | 'shared' | null;
}

const TRACE_CAP = 40;
const trace: EndTraceRow[] = [];
let runSeq = 0;

/** A run just ended (the watch is armed): returns its row number. */
export function traceRunOver(game: string, now: number): number {
  runSeq += 1;
  trace.push({ game, run: runSeq, overAt: now, litAt: null, by: null });
  if (trace.length > TRACE_CAP) trace.splice(0, trace.length - TRACE_CAP);
  return runSeq;
}

/** The results card for that run is lit (solid on screen). The first call wins. */
export function traceLit(run: number, now: number, by: 'game' | 'rescue' | 'shared'): void {
  const row = trace.find((r) => r.run === run);
  if (!row || row.litAt != null) return;
  row.litAt = now;
  row.by = by;
}

/** The newest rows (oldest first). */
export function endTrace(): readonly EndTraceRow[] {
  return trace;
}
