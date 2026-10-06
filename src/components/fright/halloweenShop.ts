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

/** Tonight's event window, as GET /parks/{id}/fright sends it (ISO with the park's offset). */
type NightLike = { readonly opens_at?: string | null; readonly early_opens_at?: string | null; readonly closes_at?: string | null } | null | undefined;

/** "6:30 PM" from the ISO's own wall time (the park's clock, not the phone's). */
export function parkClock(iso: string | null | undefined): string | null {
  const match = /T(\d{2}):(\d{2})/.exec(iso ?? '');
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The shop opens with the night's early entry when it has one, else at the gates. */
function shopOpensAt(night: NightLike): string | null {
  const early = night?.early_opens_at && night.opens_at && Date.parse(night.early_opens_at) < Date.parse(night.opens_at) ? night.early_opens_at : null;
  return early ?? night?.opens_at ?? null;
}

/** The stall's second line, with tonight's real hours: "Open till 2 AM", "Opens at 6:30 PM", "Closed for tonight". */
export function stallLine(stall: { readonly open: boolean; readonly reason?: string | null; readonly ends_at?: string | null },
  night: NightLike, nowMs: number): string {
  const opens = shopOpensAt(night);
  const closes = night?.closes_at ?? null;
  if (stall.open) return parkClock(closes) ? `Open till ${parkClock(closes)}` : endsInLabel(stall.ends_at, nowMs);
  if (stall.reason === 'off_season') return 'Closed for the season';
  if (stall.reason === 'not_event_hours') {
    if (opens && nowMs < Date.parse(opens) && parkClock(opens)) return `Opens at ${parkClock(opens)}`;
    if (closes && nowMs >= Date.parse(closes)) return 'Closed for tonight';
  }
  return AWAY_LINE;
}

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

/** The teaser under "Only at Fin-ister Nights" for a player who cannot shop right now, with tonight's real hours. */
export function awayMessage(reason: string | null | undefined, night?: NightLike, nowMs: number = Date.now()): string {
  const opens = parkClock(shopOpensAt(night));
  const closes = parkClock(night?.closes_at);
  const hours = opens && closes ? ` Tonight it's open ${opens} to ${closes}.` : '';
  if (reason === 'off_season') return 'The Halloween Shop is closed for the season.';
  if (reason === 'not_event_hours') {
    if (night?.closes_at && nowMs >= Date.parse(night.closes_at)) return 'The Halloween Shop is closed for tonight. Come back next event night!';
    return opens ? `The Halloween Shop opens at ${opens}, when Fin-ister Nights starts.${closes ? ` It stays open till ${closes}.` : ''}`
      : 'The Halloween Shop opens during Fin-ister Nights event hours. Come back tonight!';
  }
  return `Come to Fin-ister Nights at the park to shop.${hours}`;
}

/** The away dialog's ribbon headline (at most 22 characters, the ribbon limit): what is true right now. */
export function awayHeadline(reason: string | null | undefined, night: NightLike, nowMs: number): string {
  if (reason === 'off_season') return 'Closed for the season';
  if (reason === 'not_event_hours') {
    // Without tonight's window there is nothing true to promise: no "Opens tonight".
    if (!night?.closes_at) return 'Event only';
    if (nowMs >= Date.parse(night.closes_at)) return 'Closed for tonight';
    return 'Opens tonight';
  }
  return 'Event only';
}
