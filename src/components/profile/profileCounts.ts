/**
 * Profile and lanyard counts, one source each, in kid words.
 *
 * One source for "ride coins owned" on a profile: the same per-park ride coin counts the
 * Your Parks rows show. The old Ride Coins tile read `park_coins_count`, a different
 * (legacy) count, so a kid saw "1 RIDE COINS" next to parks listing 9/29, 13/30 and more.
 */
export interface ParkRideCoins {
  readonly ride_coins_collected?: number | null;
}

/** Sum of every park's ride coins, or null when no park row carries the count (keep the old value). */
export function rideCoinTotal(parks: readonly ParkRideCoins[] | null | undefined): number | null {
  if (!parks?.length) return null;
  let total = 0;
  let any = false;
  for (const park of parks) {
    const n = Number(park?.ride_coins_collected);
    if (park?.ride_coins_collected == null || !Number.isFinite(n)) continue;
    any = true;
    total += Math.max(0, Math.floor(n));
  }
  return any ? total : null;
}

/** "1 pin", "2 pins": kid-readable counts with the right plural. */
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The lanyard's count line. "27 pins" over an empty strap read as "my pins are gone", so the
 * line says how many are hanging out of how many you own: "0 of 27 pins on", "1 pin".
 */
export function lanyardCountLabel(worn: number, owned: number): string {
  const w = Math.max(0, Math.floor(worn || 0));
  const o = Math.max(0, Math.floor(owned || 0));
  if (o === 0) return 'No pins yet';
  if (w >= o) return countLabel(o, 'pin', 'pins');
  return `${w} of ${countLabel(o, 'pin', 'pins')} on`;
}

/** The hint under an empty strap: what to do next, in kid words. */
export function lanyardEmptyHint(owned: number): string {
  return owned > 0 ? 'Tap + to hang a pin' : 'Win pins from boxes and park sets';
}
