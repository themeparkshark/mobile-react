/**
 * Shark Shop v2 shelf logic (shop-v2/CONTRACT.md). Pure and import-free so
 * tools/tests can run it without React Native.
 *
 * Timer copy rules (kids read it): calm, true, no adult units above an hour.
 * Digits only appear under one hour; "LAST CHANCE" only when it is true.
 */

interface SectionLike {
  readonly type: string;
  readonly title?: string;
  readonly ends_at: string;
  readonly event_ends_at?: string | null;
  readonly event_last_day?: string | null;
  readonly final_shelf?: boolean;
  readonly last_chance?: boolean;
  readonly color?: string | null;
  readonly wave?: { readonly title: string; readonly finale?: boolean } | null;
}

interface SetLike {
  readonly slug: string;
  readonly name: string;
  readonly title: string | null;
  readonly owned: number;
  readonly total: number;
  readonly reward_state: string;
  readonly xp_reward?: number;
}

interface PieceLike {
  readonly id: number;
  readonly owned: boolean;
  readonly in_shop?: boolean;
}

interface ItemLike {
  readonly id: number;
  readonly cost?: number;
  readonly has_purchased?: boolean;
  readonly shop?: {
    readonly is_owned?: boolean;
    readonly last_chance?: boolean;
    readonly returning?: boolean;
    readonly set?: { readonly slug: string } | null;
  };
}

export interface Pill {
  readonly label: string;
  /** Red, gently pulsing (only when the deadline is real and close). */
  readonly urgent: boolean;
  readonly a11y: string;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "5,000": the same thousands format on every surface. */
export function formatCoins(n: number): string {
  const value = Math.max(0, Math.round(Number(n) || 0));
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Server clock: device time plus the offset measured when the shop loaded. */
export function clockOffset(serverTimeIso: string | null | undefined, deviceNowMs: number): number {
  const server = Date.parse(serverTimeIso ?? '');
  return Number.isFinite(server) ? server - deviceNowMs : 0;
}

/** "Nov 1" from "2026-11-01" (calendar date, no timezone shift). */
export function shortDate(ymd: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? '');
  if (!m) return null;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}

/** Weekday name of the calendar date in an ISO timestamp's own offset ("2026-10-05T00:00:00-07:00" is Monday). */
export function weekdayOf(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
}

function minutes(ms: number): string {
  return `${Math.max(1, Math.ceil(ms / 60_000))}m`;
}

/** Daily: calm until the last hour, then a real countdown in red. */
export function dailyPill(section: SectionLike, nowMs: number): Pill {
  const left = Date.parse(section.ends_at) - nowMs;
  if (left <= 0) return { label: 'New stuff now', urgent: false, a11y: 'New items are arriving now' };
  if (left < HOUR) return { label: `Leaving in ${minutes(left)}`, urgent: true, a11y: `These leave in ${minutes(left).replace('m', ' minutes')}` };
  return { label: 'New stuff tonight', urgent: false, a11y: 'New items arrive tonight' };
}

/** Featured: names the day it changes. */
export function featuredPill(section: SectionLike, nowMs: number): Pill {
  const left = Date.parse(section.ends_at) - nowMs;
  if (left <= 0) return { label: 'New now', urgent: false, a11y: 'New featured items now' };
  if (left < DAY) return { label: 'New tonight', urgent: false, a11y: 'New featured items tonight' };
  const day = weekdayOf(section.ends_at) ?? 'soon';
  return { label: `New on ${day}`, urgent: false, a11y: `New featured items on ${day}` };
}

/** Event, timer 1 of 2: when the shelf gets its next drop (null on the final shelf). */
export function eventDropPill(section: SectionLike, nowMs: number): Pill | null {
  if (section.final_shelf) return null;
  const left = Date.parse(section.ends_at) - nowMs;
  if (left <= 0) return { label: 'New drop now', urgent: false, a11y: 'A new drop is arriving now' };
  if (left < HOUR) return { label: `New drop in ${minutes(left)}`, urgent: false, a11y: 'New drop in under an hour' };
  if (left < DAY) return { label: 'New drop tonight', urgent: false, a11y: 'New drop tonight' };
  const days = Math.ceil(left / DAY);
  const label = days === 1 ? 'New drop tomorrow' : `New drop in ${days} days`;
  return { label, urgent: false, a11y: label };
}

/** Event, timer 2 of 2: when the whole event ends. */
export function eventEndPill(section: SectionLike, nowMs: number): Pill {
  const end = Date.parse(section.event_ends_at ?? section.ends_at);
  const left = end - nowMs;
  const date = shortDate(section.event_last_day) ?? '';
  if (left <= 0) return { label: 'Ending now', urgent: true, a11y: 'This event is ending now' };
  if (left < HOUR) return { label: `Ends in ${minutes(left)}`, urgent: true, a11y: 'This event ends in under an hour' };
  if (left < DAY) return { label: 'Last day!', urgent: true, a11y: 'Today is the last day of this event' };
  if (section.last_chance) return { label: `Last chance: ends ${date}`, urgent: true, a11y: `Last chance, ends ${date}` };
  return { label: `Ends ${date}`, urgent: false, a11y: `This event ends ${date}` };
}

/** The small line above an event title: LAST CHANCE only when true, else the wave or "EVENT". */
export function eventKicker(section: SectionLike): string {
  if (section.last_chance) return 'LAST CHANCE';
  return section.wave?.title ? section.wave.title.toUpperCase() : 'SHARK SHOP EVENT';
}

/** Section accent: event colour from the calendar, gold Featured, sky Daily. */
export function sectionAccent(section: SectionLike): string {
  if (section.type === 'event' && section.color) return section.color;
  if (section.type === 'featured') return '#ffcf3b';
  return '#7cc6f5';
}

/** Readable ink on an accent colour (navy on light, white on dark). */
export function inkOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#ffffff';
  const n = parseInt(match[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#05346e' : '#ffffff';
}

export type TileTag = 'owned' | 'last_chance' | 'returning' | null;

/** One tag per tile, most useful first. */
export function tileTag(item: ItemLike): TileTag {
  if (item.shop?.is_owned ?? item.has_purchased) return 'owned';
  if (item.shop?.last_chance) return 'last_chance';
  if (item.shop?.returning) return 'returning';
  return null;
}

export const TILE_TAG_LABEL: Record<Exclude<TileTag, null>, string> = {
  owned: 'OWNED',
  last_chance: 'LAST CHANCE',
  returning: 'BACK AGAIN',
};

/** "2 of 4", or "Complete!" once every piece is yours. */
export function setProgressText(set: SetLike): string {
  if (set.reward_state === 'claimed' || set.owned >= set.total) return 'Complete!';
  return `${set.owned} of ${set.total}`;
}

/** Screen reader line for a set callout. */
export function setA11y(set: SetLike): string {
  const reward = set.title ? `, finish it for the ${set.title} title` : '';
  return `${set.name} set, ${set.owned} of ${set.total}${set.reward_state === 'ready' ? ', ready to claim' : reward}. Tap to try it on.`;
}

export type PieceState = 'owned' | 'in_shop' | 'away';

/** Every slot of a set: owned (tick), on today's shelves (tap to try), or away (comes back). */
export function pieceState(piece: PieceLike, todayIds: number[]): PieceState {
  if (piece.owned) return 'owned';
  if (piece.in_shop || todayIds.includes(piece.id)) return 'in_shop';
  return 'away';
}

/**
 * What the try-on shark wears: the item, every set piece the player owns, and
 * (with "Try the full look") every other piece too, plus any toggled extras.
 */
export function wearingIds(itemId: number, pieces: PieceLike[], fullLook: boolean, extras: number[] = []): number[] {
  const ids = [itemId];
  for (const piece of pieces) {
    if (piece.id === itemId) continue;
    if (piece.owned || fullLook || extras.includes(piece.id)) ids.push(piece.id);
  }
  return ids;
}

/** Buying this finishes the set (every other piece is owned). */
export function completesSet(itemId: number, pieces: PieceLike[]): boolean {
  return pieces.length > 1 && pieces.some(p => p.id === itemId) && pieces.every(p => p.id === itemId || p.owned);
}

/** Coins short for an item, or 0. */
export function shortfall(balance: number, cost: number): number {
  return Math.max(0, Math.round(cost) - Math.round(balance));
}

/** Pieces of a set on today's shelves that the player doesn't own yet. */
export function missingPiecesToday<T extends ItemLike>(slug: string, items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter(item => {
    if (item.shop?.set?.slug !== slug || seen.has(item.id)) return false;
    seen.add(item.id);
    return !(item.shop?.is_owned ?? item.has_purchased);
  });
}

/** The big tile for a section: the server's hero, else the first unowned item. */
export function heroItem<T extends ItemLike>(heroId: number | null | undefined, items: T[]): T | null {
  return items.find(item => item.id === heroId) ?? items.find(item => !(item.shop?.is_owned ?? item.has_purchased)) ?? items[0] ?? null;
}

/** Toggle an id in a wishlist (optimistic UI before the server answers). */
export function toggleWish(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
}

/** Apply the server's answer for one item only, keeping other in-flight taps. */
export function reconcileWish(local: number[], server: number[], id: number): number[] {
  const want = server.includes(id);
  const has = local.includes(id);
  if (want === has) return local;
  return want ? [...local, id] : local.filter(x => x !== id);
}

/**
 * Keep a tile where the kid saw it for this visit: the first order seen per
 * section wins, new ids go to the end. Owned items re-sort on the next visit.
 */
export function stableOrder(ids: number[], seen: number[] | undefined): number[] {
  if (!seen) return ids;
  const rank = new Map(seen.map((id, i) => [id, i]));
  return [...ids].sort((a, b) => (rank.get(a) ?? 1e9 + ids.indexOf(a)) - (rank.get(b) ?? 1e9 + ids.indexOf(b)));
}

/** Retry delay for the restock reload: 5s, 15s, 45s, then every 2 minutes. */
export function restockBackoffMs(attempt: number): number {
  return Math.min(120_000, 5_000 * Math.pow(3, Math.max(0, attempt)));
}

const SEASON_NAME: Record<string, string> = {
  halloween: 'Halloween', holiday: 'holiday season', valentines: "Valentine's Day", st_patricks: "St. Patrick's Day",
  spring: 'spring', summer: 'summer', july_4th: 'Fourth of July', lunar_new_year: 'Lunar New Year', new_year: 'New Year',
  harvest: 'fall', winter: 'winter', mardi_gras: 'Mardi Gras', park_birthday: 'park birthday',
};

/** Calm, true last-chance copy for the try-on ("It comes back next Halloween."). */
export function lastChanceLine(season: string | null | undefined): string {
  const name = season ? SEASON_NAME[season] : null;
  return name ? `Last chance! It comes back next ${name}.` : 'Last chance! It comes back another time.';
}

/** Honest wishlist copy: alerts on promise a note; off or not asked promise nothing. */
export function wishSavedCopy(alerts: boolean | null | undefined): string {
  return alerts ? 'Saved! We’ll tell you next time it’s in the shop.' : 'Saved to your wishlist.';
}

/** Hint under the try-on buttons. */
export function wishHintCopy(wished: boolean, alerts: boolean | null | undefined): string {
  if (wished) return alerts ? 'Saved. We’ll tell you next time it’s in the shop.' : 'Saved to your wishlist.';
  return alerts ? 'Heart it to save it. We’ll tell you next time it’s in the shop.' : 'Heart it to save it for later.';
}

export type TileRibbon = 'new' | 'last_chance' | 'returning' | null;

/**
 * Fixed tile lanes: rarity top-left, heart or owned check top-right, and one
 * full-width top ribbon for a time tag that replaces (never overlaps) the
 * rarity chip. LAST CHANCE beats BACK AGAIN beats NEW. Owned tiles show no ribbon.
 */
export function tileLanes(item: ItemLike & { shop?: ItemLike['shop'] & { is_new?: boolean } }, quiet = false): { ribbon: TileRibbon } {
  if (item.shop?.is_owned ?? item.has_purchased) return { ribbon: null };
  // quiet: the banner already says LAST CHANCE once, so tiles never repeat it in red.
  const ribbon: TileRibbon = item.shop?.last_chance && !quiet ? 'last_chance' : item.shop?.returning ? 'returning'
    : item.shop?.is_new ? 'new' : null;
  return { ribbon };
}

/** "3 new today" for a section header, or null. */
export function newCountLabel(n: number | undefined): string | null {
  if (!n || n <= 0) return null;
  return n === 1 ? '1 new today' : `${n} new today`;
}

/** One card for every finished-but-unclaimed set. */
export function readySummary(sets: { name: string }[]): { count: number; title: string } | null {
  if (!sets.length) return null;
  return { count: sets.length, title: sets.length === 1 ? `You finished ${sets[0].name}!` : `You finished ${sets.length} sets!` };
}

interface XpLike { readonly level: number; readonly experience: number; readonly needed: number }

/**
 * The reveal's XP bar from the server's exact before/after: fractions for the
 * bar, the level shown at the end, and a kid caption (no percentages).
 */
export function xpBar(before: XpLike | undefined, after: XpLike | undefined, gained: number):
  { level: number; from: number; to: number; levelUp: boolean; caption: string } | null {
  if (!before || !after) return null;
  const levelUp = after.level > before.level;
  return {
    level: after.level,
    from: levelUp ? 0 : Math.min(1, before.experience / Math.max(1, before.needed)),
    to: Math.min(1, after.experience / Math.max(1, after.needed)),
    levelUp,
    caption: levelUp ? `Level up! You're level ${after.level}` : `+${gained} XP`,
  };
}

/** Pending Set Complete reveals: one per set, in the order they were won. */
export function queueReveal<T extends { slug: string }>(list: T[], reward: T): T[] {
  return list.some(r => r.slug === reward.slug) ? list : [...list, reward];
}

export function dropReveal<T extends { slug: string }>(list: T[], slug: string): T[] {
  return list.filter(r => r.slug !== slug);
}

/** Claim all: rewards to reveal in order, and the sets whose claim failed (they stay on the card). */
export function settleClaims<S extends { slug: string }, R>(sets: S[], results: (R | null)[]): { won: { set: S; reward: R }[]; failed: S[] } {
  const won: { set: S; reward: R }[] = [];
  const failed: S[] = [];
  sets.forEach((set, i) => { const r = results[i]; if (r) won.push({ set, reward: r }); else failed.push(set); });
  return { won, failed };
}

/**
 * After a buy request errors (timeout, 500), what is true? Never claim "you
 * weren't charged" without checking: a refreshed player who owns the item, or
 * whose balance dropped by the price, did buy it.
 */
export function afterBuyError(balanceBefore: number, cost: number, fresh: { coins: number; owns: boolean } | null): 'bought' | 'not_charged' | 'unknown' {
  if (!fresh) return 'unknown';
  if (fresh.owns || fresh.coins === balanceBefore - cost) return 'bought';
  if (fresh.coins === balanceBefore) return 'not_charged';
  return 'unknown';
}

export type TryOnState = {
  readonly owned: boolean; readonly worn: boolean; readonly vipLocked: boolean; readonly short: number;
  readonly phase: 'idle' | 'confirm' | 'buying' | 'bought' | 'failed' | 'unknown';
  readonly wear: 'idle' | 'busy' | 'spinning' | 'failed'; readonly finishes: boolean; readonly cost: number;
};

/** The try-on's one primary button and its message, for every state (the label cross-fades). */
export function tryOnCta(s: TryOnState): { label: string; action: 'wear' | 'close' | 'vip' | 'retry_buy' | 'earn' | 'buy' | 'ask' | 'none'; note: string | null } {
  if (s.owned) {
    if (s.wear === 'failed') return { label: 'Try again', action: 'wear', note: 'Couldn’t put it on. Try again.' };
    if (s.wear === 'spinning' || s.worn) return { label: 'Wearing it', action: 'close', note: null };
    return { label: 'Wear it now', action: 'wear', note: null };
  }
  if (s.vipLocked) return { label: 'VIP only: see VIP', action: 'vip', note: null };
  if (s.phase === 'failed') return { label: 'Try again', action: 'retry_buy', note: 'That didn’t go through. You weren’t charged.' };
  if (s.phase === 'unknown') return { label: 'Check again', action: 'retry_buy', note: 'We couldn’t reach the shop. Check your coins, then try again.' };
  if (s.short > 0) return { label: `Need ${formatCoins(s.short)} more coins`, action: 'earn', note: 'Catch ride coins or open your daily chest to earn more.' };
  if (s.phase === 'confirm' || s.phase === 'buying') return { label: 'Yes, buy it!', action: 'buy', note: null };
  return { label: s.finishes ? `Complete the look: ${formatCoins(s.cost)}` : `Buy for ${formatCoins(s.cost)}`, action: 'ask', note: null };
}

/** "Level 12 · 48% to 62%" for the reveal's XP bar (fractions 0..1). */
export function levelProgress(level: number, before: number, needed: number, gained: number): { level: number; from: number; to: number; levelUp: boolean } {
  const need = Math.max(1, needed);
  const after = before + gained;
  if (after >= need) return { level: level + 1, from: before / need, to: Math.min(1, (after - need) / need), levelUp: true };
  return { level, from: before / need, to: after / need, levelUp: false };
}
