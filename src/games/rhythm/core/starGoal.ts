/**
 * starGoal: Rhythm's next goal, as the shared results bar and a spoken line.
 * Pure (no React), so tools/tests can load it.
 */

import { RIDE_RULES, STAR_ACCURACY } from './types';

/**
 * Rhythm's next-star bar. Stars come from timing, not points, so the game
 * hands the shared bar its own fill: how far the stage timing is from the
 * next star. A ride run fills toward the 3-of-4 beats win. The exact goal is
 * spoken only (a11y), never printed on the card.
 */
export function rhythmStarGoal(acc: number, stars: number, judged: number, ride?: { hitRate: number; win: boolean }):
  { progress: number; nextStar: number; near: boolean; a11y: string } {
  if (ride) {
    if (ride.win) return { progress: 1, nextStar: 0, near: false, a11y: 'Ride challenge won' };
    const progress = Math.max(0, Math.min(1, ride.hitRate / RIDE_RULES.hitRate));
    return { progress, nextStar: 1, near: progress >= 0.85, a11y: 'Hit 3 of every 4 beats to win' };
  }
  const tiers: [number, number][] = [[STAR_ACCURACY.one, 1], [STAR_ACCURACY.two, 2], [STAR_ACCURACY.three, 3]];
  const next = tiers.find(([, n]) => n > stars);
  if (!next) return { progress: 1, nextStar: 0, near: false, a11y: 'All three stars' };
  const lo = next[1] === 1 ? 0 : tiers[next[1] - 2][0];
  const span = next[0] - lo;
  const progress = span > 0 ? Math.max(0, Math.min(1, (acc - lo) / span)) : 0;
  return { progress, nextStar: next[1], near: progress >= 0.85, a11y: queueNextGoal(acc, stars, false, judged) || `Star ${next[1]} is next` };
}

/**
 * The queue run's next goal, always above the stars already earned (a warm-up
 * can light a star early, so "for 1 star" on a 1-star card never shows).
 */
export function queueNextGoal(acc: number, stars: number, fullCombo: boolean, judged: number): string {
  const tiers: [number, number][] = [[STAR_ACCURACY.one, 1], [STAR_ACCURACY.two, 2], [STAR_ACCURACY.three, 3]];
  const next = tiers.find(([at, n]) => n > stars && acc < at) ?? null;
  if (!next) return stars >= 3 && !fullCombo ? 'Go for FULL COMBO' : '';
  const more = Math.max(1, Math.ceil(((next[0] - acc) * judged) / 60));
  return `${more} more PERFECT${more > 1 ? 'S' : ''} for ${stars > 0 ? 'the next star' : 'a star'}`;
}
