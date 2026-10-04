/**
 * A request that shows its own reward moment (the Watch page's +25 coin
 * modal) marks itself with QUIET_COIN_BROADCAST, so the server's matching
 * "You earned N Shark Coins!" banner is not shown a second time. Every other
 * broadcast in the same response (level ups, unlocks) still shows.
 */
export const QUIET_COIN_BROADCAST = 'quietCoinBroadcast';

const COIN_EARNED = /^You earned \d+ Shark Coins?!$/;

export function visibleBroadcasts<T>(broadcasts: readonly T[], quietCoins: boolean): T[] {
  if (!quietCoins) return [...broadcasts];
  return broadcasts.filter(b => !(typeof b === 'string' && COIN_EARNED.test(b.trim())));
}
