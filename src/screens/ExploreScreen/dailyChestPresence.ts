/**
 * The daily chest presents itself once. "Back to map" puts it away until the
 * next app open (this module's memory lives as long as the JS runtime) or the
 * next day, and the map's chest button reopens it any time before then.
 */

let dismissed: { readonly giftId: number; readonly day: string } | null = null;

/** Local calendar day, so "tomorrow" means the player's tomorrow. */
export function localDay(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function markChestDismissed(giftId: number, now: Date = new Date()): void {
  dismissed = { giftId, day: localDay(now) };
}

export function chestDismissed(giftId: number, now: Date = new Date()): boolean {
  return dismissed != null && dismissed.giftId === giftId && dismissed.day === localDay(now);
}

/** Tests only: a fresh app open. */
export function resetChestDismissal(): void {
  dismissed = null;
}

/**
 * Whether the chest card is on screen. It presents itself when the overlay
 * queue allows (after the first catch, never over a find or dialog) and it
 * was not put away today. A tap on the map's chest button opens it whenever
 * nothing else is on screen, first catch or not.
 */
export function chestShouldShow(state: {
  readonly unclaimed: boolean;
  /** The queue lets the chest present itself (chestMayPresent). */
  readonly autoReady: boolean;
  /** Nothing else is open, so a requested chest can show. */
  readonly screenFree: boolean;
  readonly requested: boolean;
  readonly dismissed: boolean;
}): boolean {
  if (!state.unclaimed) return false;
  if (state.requested) return state.screenFree;
  return state.autoReady && !state.dismissed;
}
