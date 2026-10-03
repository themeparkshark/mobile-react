/**
 * F5: the pace chip and the haunt sheet order. Pure, unit tested.
 * "4 down, 6 to go · 3h 10m left". It hides when the wait feed is down.
 */
import type { FrightSpot } from '../../api/endpoints/fright/types';
import { formatDuration } from './dates';
import { distanceMeters } from './geo';

export function paceText(done: number, total: number, msLeft: number | null): string {
  const safeTotal = Math.max(0, total);
  const safeDone = Math.min(Math.max(0, done), safeTotal);
  if (safeTotal > 0 && safeDone >= safeTotal) return `All ${safeTotal}! Ten-in-One Fin unlocked.`;
  const head = `${safeDone} down, ${safeTotal - safeDone} to go`;
  return msLeft != null && msLeft > 0 ? `${head} · ${formatDuration(msLeft)} left` : head;
}

/** "4 of 10 haunts" for the pill. */
export function hauntCountText(done: number, total: number): string {
  return `${Math.max(0, done)} of ${Math.max(0, total)} haunts`;
}

/** F5: the chip hides when no haunt has a live feed status or posted wait. */
export function paceVisible(spots: readonly FrightSpot[]): boolean {
  const haunts = spots.filter(spot => spot.kind === 'haunt');
  return haunts.length > 0 && haunts.some(spot => spot.status != null || spot.posted_minutes != null);
}

/**
 * Haunt sheet order: by posted wait (shortest first; no wait last; closed
 * after open), then walking distance from the player.
 */
export function sortHaunts(spots: readonly FrightSpot[], from?: { latitude: number; longitude: number } | null): FrightSpot[] {
  const rank = (spot: FrightSpot) => spot.status && spot.status !== 'OPERATING' ? 2 : spot.posted_minutes == null ? 1 : 0;
  const dist = (spot: FrightSpot) => from ? distanceMeters(from, spot) : 0;
  return spots.filter(spot => spot.kind === 'haunt').slice().sort((a, b) =>
    rank(a) - rank(b)
    || (a.posted_minutes ?? Infinity) - (b.posted_minutes ?? Infinity)
    || dist(a) - dist(b)
    || a.sort - b.sort);
}

/** "Fan favorite #1" only from the server's fan rank (top lists only). */
export function fanBadge(fanRank: number | null | undefined): string | null {
  return fanRank != null && fanRank >= 1 && fanRank <= 3 ? `Fan favorite #${fanRank}` : null;
}
