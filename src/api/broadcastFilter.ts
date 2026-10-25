/**
 * A request that shows its own reward moment (the Watch page's +25 coin
 * modal, the daily chest's flying coins and ticket punch) marks itself with
 * QUIET_COIN_BROADCAST, so the server's matching "You earned 25 coins!" or
 * "You earned 1 Ticket!" banner is not shown a second time (or, worse, slid in
 * behind the chest while it is still opening). Every other broadcast in the
 * same response (level ups, unlocks, XP) still shows.
 */
export const QUIET_COIN_BROADCAST = 'quietCoinBroadcast';
/**
 * The daily chest also shows its own energy (the battery climbs out of the chest and counts up), so its
 * "You gained 20 Energy!" banner is skipped too. It used to slide in over the top of the chest card while the
 * lid popped, and the app update it caused could draw the shut chest for a frame in the middle of the pop.
 */
export const QUIET_ENERGY_BROADCAST = 'quietEnergyBroadcast';

// The server says "You earned 25 coins!" (HasCurrency) and older copy said "Shark Coins"; tickets the same way.
const COIN_EARNED = /^You earned \d+ (?:Shark )?(?:coins?|tickets?)!$/i;

// The server says "You gained 20 Energy!" (HasCurrency).
const ENERGY_GAINED = /^You (?:gained|earned) \d+ energy!$/i;

export function visibleBroadcasts<T>(broadcasts: readonly T[], quietCoins: boolean, quietEnergy = false): T[] {
  if (!quietCoins && !quietEnergy) return [...broadcasts];
  return broadcasts.filter(b => !(typeof b === 'string'
    && ((quietCoins && COIN_EARNED.test(b.trim())) || (quietEnergy && ENERGY_GAINED.test(b.trim())))));
}
