/**
 * Small pure rules for the coin card (fix round W3), kept here so they are
 * testable without React. No em dashes.
 */

export interface PreviewTile { readonly label: string; readonly amount: number; readonly icon: string; readonly show?: boolean }

/**
 * The tiles on the card before PLAY (T035): one consistent preview for the same coin on every visit.
 * A ride or sight coin promises its Shark Coins only (the ladder opening Parts or XP between two visits
 * never changes it; the win card shows everything the server granted). A secret coin exists only once
 * coin levels are open, so its Parts and Energy promise is the same on every visit and stays.
 */
export function previewRewardTiles<T extends PreviewTile>(tiles: readonly T[], taskType: 'task' | 'secret_task' | null): T[] {
  if (taskType === 'secret_task') return tiles.filter(tile => tile.label !== 'XP');
  return tiles.filter(tile => tile.label === 'SHARK COINS');
}

/**
 * The big button on the NEED A TICKET card (T030, T031): never a dead end. LinePlay at a ride with a
 * line while the line Ticket is on (the wait itself earns the Ticket); otherwise a free practice game.
 * The map is always the small second button.
 */
export function needTicketMain(input: { readonly queueTicketsOn: boolean; readonly rideHasLine: boolean; readonly practice: boolean }): 'lineplay' | 'practice' | 'map' {
  if (input.queueTicketsOn && input.rideHasLine) return 'lineplay';
  if (input.practice) return 'practice';
  return 'map';
}

/** Meters between two points (haversine), enough for "the player moved". */
export function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How far the player must move before a "move closer" answer is stale. */
export const RANGE_RECHECK_METERS = 4;

/**
 * T055: the server's "Move closer to the ride" answer was true where the player stood when PLAY! was
 * pressed. Once they have moved, it is old news: the card clears it and PLAY! asks again.
 */
export function rangeErrorCleared(at: { latitude: number; longitude: number } | null, now: { latitude: number; longitude: number } | null): boolean {
  if (!at || !now) return false;
  return metersBetween(at, now) >= RANGE_RECHECK_METERS;
}

/** The game the next PLAY deals at this ride today, from current-redeemable (fix w4 T039, core-loop servers). */
export interface RideDeal { readonly game?: string | null; readonly tries_per_ticket?: number | null }

const DEAL_GAME_NAMES: Readonly<Record<string, string>> = { tap: 'Whack-a-Shark', memory: 'Memory Match', trivia: 'Beat the Buzzer' };

/**
 * What one PLAY! buys, shown on the card before PLAY (fix w4 T039; T9 arcade plan Nov 20 2026): one game,
 * and for Memory Match its 3 boards (like 9 balls for one Skee-Ball token), one picture per board. Never
 * "tries" for a Ticket. Null without a deal from the server (older servers): the card is as today.
 */
export function dealTries(deal: RideDeal | null | undefined): { shells: number; label: string } | null {
  const n = Number(deal?.tries_per_ticket);
  if (!deal || !Number.isFinite(n) || n < 1) return null;
  const shells = Math.min(5, Math.floor(n));
  const game = typeof deal.game === 'string' ? DEAL_GAME_NAMES[deal.game] : undefined;
  const boards = shells > 1 ? `One game, ${shells} boards` : 'One game';
  return { shells, label: game ? `${boards} of ${game}` : boards };
}
