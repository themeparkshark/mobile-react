/**
 * A request that shows its own reward moment (the Watch page's +25 coin
 * modal, the daily chest's flying coins and ticket punch) marks itself with
 * QUIET_COIN_BROADCAST, so the server's matching "You earned 25 coins!" or
 * "You earned 1 Ticket!" banner is not shown a second time (or, worse, slid in
 * behind the chest while it is still opening). Every other broadcast in the
 * same response (level ups, unlocks, XP) still shows.
 */
export const QUIET_COIN_BROADCAST = 'quietCoinBroadcast';

// The server says "You earned 25 coins!" (HasCurrency) and older copy said "Shark Coins"; tickets the same way.
// "You won a ride coin!" lands over the map a beat before the win card says the same thing (core loop row 329).
const COIN_EARNED = /^You earned \d+ (?:Shark )?(?:coins?|tickets?)!$|^You won a ride coin!$/i;

export function visibleBroadcasts<T>(broadcasts: readonly T[], quietCoins: boolean): T[] {
  if (!quietCoins) return [...broadcasts];
  return broadcasts.filter(b => !(typeof b === 'string' && COIN_EARNED.test(b.trim())));
}
