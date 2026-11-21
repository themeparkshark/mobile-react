/**
 * Coins a park's shelf just loaded, by name (P2). The shelf, Coin Guide and coin sheet know a coin's id; a
 * caller that still hands LinePlay only the coin's name ("Buzz Lightyear's Space Ranger Spin") is resolved
 * through this index to that coin's id, and resolveRide then finds the ride by rides.task_id, never by a ride
 * name. No imports, so the shelf loader can fill it without pulling the ride catalog in.
 */

/** Lower case, straight quotes and dashes, no wrapping quotes, single spaces: "it’s a small world" = It's A Small World. */
export function normalizeRideName(s: string): string {
  return s.toLowerCase()
    .replace(/[‘’ʼ`]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ').trim();
}

/** A coin as the shelf and map know it. */
export interface CoinRef { readonly id: number; readonly name: string }

const parkCoinIds = new Map<number, Map<string, number>>();

/** Remember this park's coins (parkShelfPrefetch calls it on every shelf read). */
export function rememberParkCoins(parkId: number, coins: readonly (CoinRef | null | undefined)[]): void {
  if (!(parkId > 0)) return;
  const byName = parkCoinIds.get(parkId) ?? new Map<string, number>();
  for (const coin of coins) {
    if (coin && Number.isInteger(coin.id) && coin.id > 0 && typeof coin.name === 'string') byName.set(normalizeRideName(coin.name), coin.id);
  }
  parkCoinIds.set(parkId, byName);
}

/** The id of the coin in this park with that name, when the shelf has loaded it. */
export function parkCoinIdByName(parkId: number, name: string): number | undefined {
  return parkCoinIds.get(parkId)?.get(normalizeRideName(name));
}
