/**
 * The Halloween Shop (Fin-ister Nights) is event-only: it is never in a shop
 * list, and the only way in is its stall on the event map. Players away from
 * the event, or outside event hours, see "Only at Fin-ister Nights" and no buy
 * button; the server refuses the store and every purchase too (FrightShop).
 */
export const HALLOWEEN_SHOP_SLUG = 'fright-shelf';
export const HALLOWEEN_SHOP_NAME = 'Halloween Shop';
/** Names the shelf has had, for servers that do not send its slug yet. */
export const HALLOWEEN_SHOP_NAMES: readonly string[] = ['The Sunken Sideshow', HALLOWEEN_SHOP_NAME];
export const AWAY_LINE = 'Only at Fin-ister Nights';

type StoreLike = { readonly name?: string | null; readonly slug?: string | null; readonly event?: { readonly only_at_event?: boolean } | null };

/** True for the event-only Halloween Shop under any of its names. */
export function isEventShop(store: StoreLike | null | undefined): boolean {
  if (!store) return false;
  if (store.slug === HALLOWEEN_SHOP_SLUG || store.event?.only_at_event === true) return true;
  return !store.slug && HALLOWEEN_SHOP_NAMES.includes(String(store.name ?? ''));
}

/** "Ends in 29 days" / "Ends in 5 hours" / "Ends in 20 min" / "Closed". */
export function endsInLabel(endsAt: string | null | undefined, nowMs: number): string {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  if (!Number.isFinite(end)) return '';
  const left = end - nowMs;
  if (left <= 0) return 'Closed';
  const days = Math.floor(left / 86_400_000);
  if (days >= 2) return `Ends in ${days} days`;
  const hours = Math.floor(left / 3_600_000);
  if (hours >= 2) return `Ends in ${hours} hours`;
  if (hours === 1) return 'Ends in 1 hour';
  return `Ends in ${Math.max(1, Math.floor(left / 60_000))} min`;
}

/** What a stall tap does: open the shop, or the away teaser (never a buy button). */
export function stallAction(stall: { readonly open: boolean; readonly store_id: number } | null | undefined): 'open' | 'away' | 'none' {
  if (!stall || !Number.isFinite(Number(stall.store_id))) return 'none';
  return stall.open ? 'open' : 'away';
}

/** The teaser line under "Only at Fin-ister Nights" for a player who cannot shop right now. */
export function awayMessage(reason: string | null | undefined): string {
  if (reason === 'not_event_hours') return 'The Halloween Shop opens during Fin-ister Nights event hours. Come back tonight!';
  if (reason === 'off_season') return 'The Halloween Shop is closed for the season.';
  return 'Come to the event at the park during event hours to shop.';
}
