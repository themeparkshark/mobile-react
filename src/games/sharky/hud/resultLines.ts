/**
 * resultLines.ts: Sharky Swim's results card in feelings, not data.
 *
 * "Best chain x1 · 0 Close Skims" and "Only 2262 from 1 star" read like a
 * report card. A kid gets one brag line (only things worth bragging about)
 * and one goal line (so close, or where the next star is).
 *
 * Pure, no React, so tools/tests can load it.
 */

/** The brag line under the stars. Empty when there is nothing to brag about. */
export function sharkyBragLine(bestChainMult: number, closeSkims: number): string {
  const parts: string[] = [];
  if (bestChainMult > 1) parts.push(`Best chain x${bestChainMult}`);
  if (closeSkims > 0) parts.push(`${closeSkims} Close Skim${closeSkims === 1 ? '' : 's'}`);
  return parts.join('  ·  ');
}

/**
 * The goal line for a queue run: "So close!" only when it really is close
 * (within a quarter of the next star), otherwise just where the next star is.
 */
export function sharkyStarGoalLine(score: number, nextStarAt: number): string {
  const gap = Math.max(1, Math.round(nextStarAt - score));
  if (gap <= 0.25 * nextStarAt) return `So close! ${gap.toLocaleString()} more for a star`;
  return `Next star at ${Math.round(nextStarAt).toLocaleString()}`;
}

/** Ghost splits show only when the run was ahead somewhere: a win to point at, never a row of red. */
export function showSplits(splits: readonly number[]): boolean {
  return splits.some((d) => d > 0);
}
