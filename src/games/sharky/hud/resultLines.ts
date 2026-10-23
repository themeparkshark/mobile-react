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

/**
 * Ghost splits show only when the whole run finished ahead of the ghost (the
 * last shared gate), so "AHEAD OF YOUR BEST" is always true. One lucky gate in
 * a run that ended behind shows nothing.
 */
export function showSplits(splits: readonly number[]): boolean {
  return splits.length > 0 && splits[splits.length - 1] > 0;
}

/** Only the gates where you were ahead get a bar (green, no numbers); two or more, or none. */
export function aheadBars(splits: readonly number[]): number[] {
  const ahead = splits.filter((d) => d > 0);
  return ahead.length >= 2 ? ahead : [];
}

/** "Only 120 from your best" without the number a kid has to work out. */
export function sharkyNearBestLine(score: number, best: number): string {
  if (!(best > score) || best - score >= 0.12 * best) return '';
  return 'So close to your best!';
}
