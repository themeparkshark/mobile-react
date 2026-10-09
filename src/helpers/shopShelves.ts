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
    readonly leaving?: { readonly on: string; readonly forever: boolean } | null;
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

/** Daily: always calm. No countdown on anything you can buy. */
export function dailyPill(section: SectionLike, nowMs: number): Pill {
  const left = Date.parse(section.ends_at) - nowMs;
  if (left <= 0) return { label: 'New stuff now', urgent: false, a11y: 'New items are arriving now' };
  return { label: 'New stuff tonight', urgent: false, a11y: 'New items arrive tonight' };
}

/** Featured: names the day it changes. */
export function featuredPill(section: SectionLike, nowMs: number): Pill {
  const left = Date.parse(section.ends_at) - nowMs;
  if (left <= 0) return { label: 'New now', urgent: false, a11y: 'New featured items now' };
  if (left < DAY) return { label: 'New tonight', urgent: false, a11y: 'New featured items tonight' };
  // A whole week away (flip day itself): "New in 7 days", never today's own weekday, which a kid reads as today.
  const days = Math.ceil(left / DAY);
  if (left > 6 * DAY) return { label: `New in ${days} days`, urgent: false, a11y: `New featured items in ${days} days` };
  const day = weekdayOf(section.ends_at) ?? 'soon';
  return { label: `New on ${day}`, urgent: false, a11y: `New featured items on ${day}` };
}

/**
 * The classic Shark Shop's restock (rotation next_rotation_at), as one small calm chip that names
 * the day (Dustin, Oct 8: "the countdown for new items doesn't need to be that big"). No seconds,
 * no hours: "New gear on Monday", "New gear tomorrow", "New gear tonight", "New gear soon" at zero.
 * The day is read in park time (the shop flips at midnight Pacific; 7 h back lands on its date).
 */
export function restockPill(nextAt: string | null | undefined, nowMs: number): Pill | null {
  const at = nextAt ? Date.parse(nextAt) : NaN;
  if (!Number.isFinite(at)) return null;
  const left = at - nowMs;
  if (left <= 0) return { label: 'New gear soon', urgent: false, a11y: 'New gear is on its way' };
  if (left < 12 * HOUR) return { label: 'New gear tonight', urgent: false, a11y: 'New gear arrives tonight' };
  if (left < 36 * HOUR) return { label: 'New gear tomorrow', urgent: false, a11y: 'New gear arrives tomorrow' };
  const days = Math.ceil(left / DAY);
  if (left > 6 * DAY) return { label: `New gear in ${days} days`, urgent: false, a11y: `New gear in ${days} days` };
  const day = weekdayOf(new Date(at - 7 * HOUR).toISOString()) ?? 'soon';
  return { label: `New gear on ${day}`, urgent: false, a11y: `New gear arrives on ${day}` };
}

/** Owned pieces sink to the end (the shelf is mostly things you can still get); order is otherwise the server's. */
export function shelfOrder<T extends { id: number; has_purchased?: boolean }>(items: readonly T[], keepFirst: readonly number[] = []): T[] {
  const sinks = (i: T) => !!i.has_purchased && !keepFirst.includes(i.id);
  return [...items.filter(i => !sinks(i)), ...items.filter(sinks)];
}

/** Event, timer 1 of 2: when the shelf gets its next drop (null on the final shelf). */
export function eventDropPill(section: SectionLike, nowMs: number): Pill | null {
  if (section.final_shelf) return null;
  const left = Date.parse(section.ends_at) - nowMs;
  if (left <= 0) return { label: 'New items now', urgent: false, a11y: 'New items are arriving now' };
  if (left < HOUR) return { label: 'New items soon', urgent: false, a11y: 'New items soon' };
  if (left < DAY) return { label: 'New items tonight', urgent: false, a11y: 'New items tonight' };
  const days = Math.ceil(left / DAY);
  const label = days === 1 ? 'New items tomorrow' : `New items in ${days} days`;
  return { label, urgent: false, a11y: label };
}

/** Event, timer 2 of 2: when the whole event ends. */
export function eventEndPill(section: SectionLike, nowMs: number): Pill {
  const end = Date.parse(section.event_ends_at ?? section.ends_at);
  const left = end - nowMs;
  const date = shortDate(section.event_last_day) ?? '';
  // Calm and true, never a countdown or a red "hurry": just the day it ends.
  if (left < DAY) return { label: 'Ends today', urgent: false, a11y: 'This event ends today' };
  return { label: `Ends ${date}`, urgent: false, a11y: `This event ends ${date}` };
}

/** The small line above an event title: LAST CHANCE only when true, else the wave or "EVENT". */
export function eventKicker(section: SectionLike, secret = false): string {
  if (section.last_chance) return 'LAST CHANCE';
  // The Secret Shop's seasonal shelf (secret-shop/DESIGN.md 5): its own name, not the Shark Shop's waves.
  if (secret) return 'SECRET SEASON DROP';
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
  last_chance: 'LEAVING',
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

/** Calm, true leaving-soon copy for the try-on ("It comes back next Halloween."). No hurry words. */
export function lastChanceLine(season: string | null | undefined): string {
  const name = season ? SEASON_NAME[season] : null;
  return name ? `It leaves soon. It comes back next ${name}.` : 'It leaves soon. It comes back another time.';
}

/**
 * The member promise on every Secret and members-only piece (secret-shop/DESIGN.md 6.7, Dustin's member
 * rule): it stays owned forever, and members can wear it. True whether or not the wear lock is on.
 */
export const MEMBER_PROMISE = 'VIP members can wear this. It stays in your closet forever.';

/**
 * Honest Favorites copy (one name everywhere for the heart): it says where they went, and
 * alerts on promise a note while off or not asked promise nothing.
 */
export const FAVORITES_WHERE = 'See them in Favorites at the top of the shop.';
export function wishSavedCopy(alerts: boolean | null | undefined): string {
  return alerts ? `Saved to Favorites! We’ll tell you when it’s in the shop. ${FAVORITES_WHERE}` : `Saved to Favorites! ${FAVORITES_WHERE}`;
}

/** Hint under the try-on buttons. */
export function wishHintCopy(wished: boolean, alerts: boolean | null | undefined): string {
  if (wished) return alerts ? `Saved to Favorites. We’ll tell you when it’s in the shop. ${FAVORITES_WHERE}` : `Saved to Favorites. ${FAVORITES_WHERE}`;
  return alerts ? 'Tap the heart to save it to Favorites. We’ll tell you when it’s in the shop.' : 'Tap the heart to save it to Favorites.';
}

export type TileRibbon = 'new' | 'last_chance' | 'leaving' | 'returning' | null;

/**
 * Fixed tile lanes: rarity top-left, heart or owned check top-right, and one
 * full-width top ribbon for a time tag that replaces (never overlaps) the
 * rarity chip. LAST CHANCE beats BACK AGAIN beats NEW. Owned tiles show no ribbon.
 */
export function tileLanes(item: ItemLike & { shop?: ItemLike['shop'] & { is_new?: boolean } }, quiet = false): { ribbon: TileRibbon } {
  if (item.shop?.is_owned ?? item.has_purchased) return { ribbon: null };
  // quiet: the banner already says LAST CHANCE once, so tiles never repeat it in red.
  // LEAVING / RETIRING is calm navy and says a date in the try-on: it outranks BACK AGAIN and NEW.
  // A dated LEAVING / RETIRING (calm navy) outranks the red event LAST CHANCE, so one piece never says both.
  const ribbon: TileRibbon = item.shop?.leaving?.on ? 'leaving' : item.shop?.last_chance && !quiet ? 'last_chance'
    : item.shop?.returning ? 'returning' : item.shop?.is_new ? 'new' : null;
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

export type TryOnPhase = 'idle' | 'confirm' | 'buying' | 'landing' | 'bought' | 'failed' | 'unknown' | 'checking';

export type TryOnState = {
  readonly owned: boolean; readonly worn: boolean; readonly vipLocked: boolean; readonly short: number;
  readonly phase: TryOnPhase;
  readonly wear: 'idle' | 'busy' | 'spinning' | 'failed'; readonly finishes: boolean; readonly cost: number;
  /** Today's shop is still building (fallback): buying waits a moment. */
  readonly paused?: boolean;
  /** A Secret Shop piece (secret-shop/DESIGN.md 4.2). */
  readonly secret?: boolean;
  /** Owned member piece, membership ended: still in the closet, worn again after rejoining (DESIGN.md 4.3). */
  readonly wearLocked?: boolean;
};

export type TryOnAction = 'wear' | 'close' | 'vip' | 'recheck' | 'earn' | 'buy' | 'ask' | 'none';

/**
 * The try-on's one primary button and its message, for every state (the label cross-fades).
 * look: 'go' is the normal face, 'busy' pulses while the shop answers, 'paused' is the quiet
 * "Opening soon" face that can't be tapped, 'checking' is that muted face pulsing (busy, not tappable).
 */
export function tryOnCta(s: TryOnState): { label: string; action: TryOnAction; note: string | null; look: 'go' | 'busy' | 'paused' | 'checking' } {
  if (s.owned) {
    if (s.wearLocked && !s.worn) return { label: 'Ask a grown-up', action: 'vip', note: MEMBER_PROMISE, look: 'go' };
    if (s.wear === 'failed') return { label: 'Try again', action: 'wear', note: 'Couldn’t put it on. Try again.', look: 'go' };
    if (s.wear === 'spinning' || s.worn) return { label: 'Wearing it', action: 'close', note: null, look: 'go' };
    return { label: 'Wear it now', action: 'wear', note: null, look: s.wear === 'busy' ? 'busy' : 'go' };
  }
  if (s.vipLocked && s.secret) return { label: 'Ask a grown-up', action: 'vip', note: 'VIP members can buy Secret Shop pieces.', look: 'go' };
  if (s.vipLocked) return { label: 'VIP only: see VIP', action: 'vip', note: null, look: 'go' };
  // Its own state: asking the server never shows "Yes, buy it!".
  if (s.phase === 'checking') return { label: 'Checking…', action: 'none', note: 'Asking the shop if it went through.', look: 'checking' };
  // Confirmed not charged: Try again goes back to the confirm step (two taps, never a silent buy).
  if (s.phase === 'failed') return { label: 'Try again', action: 'ask', note: 'That didn’t work. You still have all your coins.', look: 'go' };
  // Never a silent re-buy: "Check again" only asks the server what happened.
  if (s.phase === 'unknown') return { label: 'Check again', action: 'recheck', note: 'We couldn’t reach the shop. Let’s check if it went through.', look: 'go' };
  if (s.phase === 'buying' || s.phase === 'landing') return { label: 'Yes, buy it!', action: 'none', note: null, look: 'busy' };
  if (s.short > 0) return { label: `Need ${formatCoins(s.short)} more coins`, action: 'earn', note: 'Win ride coins at the park or open your daily chest.', look: 'go' };
  if (s.paused) return { label: 'Opening soon', action: 'none', note: 'Today’s shop is opening in a moment. Buying is back right after.', look: 'paused' };
  if (s.phase === 'confirm') return { label: 'Yes, buy it!', action: 'buy', note: null, look: 'go' };
  return { label: s.finishes ? `Complete the look: ${formatCoins(s.cost)}` : `Buy for ${formatCoins(s.cost)}`, action: 'ask', note: null, look: 'go' };
}

/**
 * After a buy error is settled with the server, where the try-on goes. The first error that is
 * confirmed not charged says so (failed: "You weren't charged", Try again). Only a "Check again"
 * that finds nothing returns quietly to idle.
 */
export function settleBuyError(outcome: 'bought' | 'not_charged' | 'unknown', source: 'buy' | 'recheck'): 'bought' | 'failed' | 'idle' | 'unknown' {
  if (outcome === 'bought') return 'bought';
  if (outcome === 'unknown') return 'unknown';
  return source === 'buy' ? 'failed' : 'idle';
}

/**
 * The try-on's button row. While a buy is in flight (buying, landing, checking) the server's
 * ownership is ignored: the row stays laid out as it was during buying and the wish heart never
 * pops back. Owned shows only once the piece has landed.
 */
export function tryOnLayout(s: { phase: TryOnPhase; serverOwned: boolean; startBought: boolean; vipLocked: boolean }):
  { owned: boolean; showWish: boolean; secondary: 'keep_shopping' | 'not_now' | null; secondaryEnabled: boolean } {
  const inFlight = s.phase === 'buying' || s.phase === 'landing' || s.phase === 'checking';
  const owned = s.startBought || s.phase === 'bought' || (!inFlight && s.serverOwned);
  const holdRow = s.phase === 'confirm' || s.phase === 'buying' || s.phase === 'landing';
  return {
    owned,
    showWish: !owned && !s.vipLocked && s.phase === 'idle',
    secondary: owned ? 'keep_shopping' : holdRow ? 'not_now' : null,
    secondaryEnabled: owned || s.phase === 'confirm',
  };
}

/** Is a Set Complete reveal waiting for this item's set? (The try-on then closes after the landing beat.) */
export function rewardPendingFor(reveals: { reward: { slug: string } }[], setSlug: string | null | undefined): boolean {
  return !!setSlug && reveals.some(r => r.reward.slug === setSlug);
}

/** How long the landing breathes before the sheet slides away for the reveal (null: stay open). */
export function revealHoldMs(rewardPending: boolean, landed: number, still: boolean): number | null {
  if (!rewardPending || landed <= 0) return null;
  return still ? 400 : 1200;
}

interface RecoverSet { readonly slug: string; readonly name: string; readonly title: string | null; readonly xp_reward?: number;
  readonly item_ids?: number[]; readonly owned: number; readonly total: number; readonly reward_state: string }

/**
 * A buy that errored but went through (found by the check), and it finished a set. The purchase
 * reply with the reward was lost, so: a set already rewarded plays its reveal from the fresh set;
 * a set waiting for its title is on the ready card; with no fresh set, at least say "Set complete!".
 */
export function recoveredSetOutcome(finishes: boolean, set: RecoverSet | null | undefined):
  { kind: 'reveal'; reward: { slug: string; name: string; title: string | null; xp: number; item_ids?: number[] } } | { kind: 'ready' } | { kind: 'toast' } | null {
  if (!finishes) return null;
  if (!set || set.owned < set.total) return { kind: 'toast' };
  if (set.reward_state === 'claimed') return { kind: 'reveal', reward: { slug: set.slug, name: set.name, title: set.title, xp: set.xp_reward ?? 0, item_ids: set.item_ids } };
  if (set.reward_state === 'ready') return { kind: 'ready' };
  return { kind: 'toast' };
}

/** WEAR IT ALL, optimistic: done on tap, failed rolls back with a message, a tap on failed tries again. */
export type WearAllState = 'idle' | 'done' | 'failed';
export function wearAllNext(state: WearAllState, event: 'tap' | 'fail'): WearAllState {
  if (event === 'fail') return state === 'done' ? 'failed' : state;
  return 'done';
}
export function wearAllCopy(state: WearAllState): { label: string; note: string | null; wearing: boolean } {
  if (state === 'done') return { label: 'All on!', note: null, wearing: true };
  if (state === 'failed') return { label: 'Try again', note: 'Couldn’t put it all on. Your look didn’t change.', wearing: false };
  return { label: 'Wear it all', note: null, wearing: false };
}

/** The slots to save for WEAR IT ALL: each piece not already worn, by its slot (last piece per slot wins). */
export function wearAllSlots(pieces: { id: number; slot: string | null; worn: boolean }[]): Record<string, number> {
  const slots: Record<string, number> = {};
  for (const p of pieces) if (p.slot && !p.worn) slots[p.slot] = p.id;
  return slots;
}

/**
 * One request at a time, in order (inventory writes race on the server otherwise). A failed
 * step rejects its own caller only; the next step still runs.
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>) => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

/**
 * Fallback polling (today is still building). One timer at a time; it stops for good when the
 * screen goes away (cancel), after maxMisses failed or empty answers in a row, or at once when the
 * server says the shop is gone (404, the kill switch). Timers are injectable for tests.
 */
export function startFallbackPoll(o: {
  /** alive() turns false once the poll is cancelled: an answer that lands after that is ignored. */
  refresh: (alive: () => boolean) => Promise<'ok' | 'miss' | 'gone'>;
  delayMs: () => number;
  maxMisses?: number;
  onStop?: (why: 'gone' | 'misses') => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}): () => void {
  const setT = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = o.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const max = o.maxMisses ?? 20;
  let cancelled = false;
  let misses = 0;
  let timer: unknown = null;
  const arm = () => {
    if (cancelled) return;
    timer = setT(() => {
      timer = null;
      if (cancelled) return;
      o.refresh(() => !cancelled).catch(() => 'miss' as const).then(result => {
        if (cancelled) return;
        if (result === 'gone') { o.onStop?.('gone'); return; }
        misses = result === 'ok' ? 0 : misses + 1;
        if (misses >= max) { o.onStop?.('misses'); return; }
        arm();
      });
    }, o.delayMs());
  };
  arm();
  return () => { cancelled = true; if (timer != null) clearT(timer); timer = null; };
}

/** The fallback banner: "back in a moment" while polling, "pull down" once polling has stopped. */
export function fallbackBannerCopy(pollStopped: boolean): string {
  return pollStopped ? 'Today’s shop is still opening. Pull down to try again.' : 'Today’s shop is opening. Back in a moment!';
}

/**
 * Event jump chips: a themed UI kit icon per event (never two the same), filled with the banner
 * art's own tint and ringed in the event colour, so each chip looks like its banner.
 */
const EVENT_ICON: [RegExp, string][] = [
  [/^halloween/, 'streak'], [/birthday/, 'gift'], [/^(new_year|july_4th)/, 'sparkle'], [/^valentines/, 'heart'],
  [/^summer/, 'ride'], [/^holiday/, 'gift'], [/^(winter|spring|harvest|st_patricks|lunar_new_year|mardi_gras)/, 'sparkle'],
];
const ICON_FALLBACKS = ['sparkle', 'medal1', 'ride', 'star', 'dice'];
/** Measured from each banner's art (its most saturated mid tone). */
export const EVENT_ART_TINT: Record<string, string> = {
  epic_universe_birthday: '#4e50bd', halloween: '#58359e', halloween_finale: '#5a3b97', harvest: '#b16923', holiday: '#1d6ab7',
  july_4th: '#1564b0', lunar_new_year: '#b46c5d', mardi_gras: '#673bad', new_year: '#3535c6', park_birthday: '#be7eb4',
  spring: '#5f8f8b', st_patricks: '#39b581', summer: '#07a5de', valentines: '#e97ea8', winter: '#5abcf0',
};
export function eventChips(events: { key: string; event_key?: string | null; art_url?: string | null; color?: string | null }[]):
  { icon: string; fill: string; ring: string }[] {
  const used = new Set<string>();
  return events.map(e => {
    const key = e.event_key ?? e.key.replace(/^event:/, '');
    let icon = EVENT_ICON.find(([re]) => re.test(key))?.[1] ?? 'sparkle';
    if (used.has(icon)) icon = ICON_FALLBACKS.find(f => !used.has(f)) ?? icon;
    used.add(icon);
    const art = /\/([a-z0-9_]+)\.(?:webp|png)(?:\?|$)/.exec(e.art_url ?? '')?.[1];
    const ring = e.color ?? '#7cc6f5';
    return { icon, fill: (art && EVENT_ART_TINT[art]) || ring, ring };
  });
}

/**
 * The shelf the jump bar highlights: the last one whose top has passed under the bar. At the end
 * of the scroll the last shelf wins (a short last shelf can never reach the top).
 */
export function activeShelf(tops: number[], scrollY: number, lead = 24, maxScrollY = Infinity): number {
  'worklet';
  if (tops.length && scrollY >= maxScrollY - 4) return tops.length - 1;
  let active = 0;
  for (let i = 0; i < tops.length; i++) if (tops[i] - lead <= scrollY) active = i;
  return active;
}

/** Fallback polling: every 15 to 30 s (jittered so phones don't all ask at once). */
export function fallbackPollMs(random: number): number {
  return 15_000 + Math.round(Math.max(0, Math.min(1, random)) * 15_000);
}

/** An empty shop day (no shelves came back): what to say instead of a blank page. */
export function emptyShelvesCopy(fallback: boolean | undefined): { title: string; body: string } {
  return fallback
    ? { title: 'Today’s shop is opening', body: 'Back in a moment. Pull down to check again.' }
    : { title: 'The shelves are being stocked', body: 'Nothing here right now. Pull down to check again.' };
}

/** "Level 12 · 48% to 62%" for the reveal's XP bar (fractions 0..1). */
export function levelProgress(level: number, before: number, needed: number, gained: number): { level: number; from: number; to: number; levelUp: boolean } {
  const need = Math.max(1, needed);
  const after = before + gained;
  if (after >= need) return { level: level + 1, from: before / need, to: Math.min(1, (after - need) / need), levelUp: true };
  return { level, from: before / need, to: after / need, levelUp: false };
}

/**
 * Shark art (shark-colored-v2 and every skin) measured from the PNG (tools/tests checks these
 * against the file): width/height, the tail tip (lowest opaque pixel), the head top and the left
 * edge. Hats are drawn in a paper frame of the same shape, and the tallest (witch and magic hats,
 * measured from the CDN art) reach its very top, so hatTop is 0.
 */
export const SHARK_ART = { aspect: 1180 / 1333, tailX: 0.725, tailY: 0.819, headTop: 0.183, hatTop: 0, leftEdge: 0.083 } as const;
/** ShopStage plinth geometry: insets as fractions of the stage, plinth drawn in a 200x64 box, top face centre at y 27. */
export const PLINTH = { side: 0.14, bottom: 0.03, aspect: 200 / 64, faceY: 27 / 64 } as const;
/** Playercard draws its art 5% of its width down from the top of its box. */
const CARD_INSET = 0.05;

/**
 * Where the Playercard goes on a stage so the tail tip rests on the plinth's top face, for any
 * stage size (square try-on and reveal, portrait hero). `lift` is the most the stage ever moves
 * the shark up (a hop): the card shrinks until a hat at the top of the paper frame still clears
 * the stage top at the peak of the hop.
 */
export function stageCard(stageW: number, stageH: number, lift = 0, widthCap = 1.05): {
  box: { left: number; top: number; width: number; height: number };
  plinthTopY: number; tailY: number; hatY: number; shadow: { left: string; top: string };
} {
  const plinthW = stageW * (1 - 2 * PLINTH.side);
  const plinthH = plinthW / PLINTH.aspect;
  const plinthTopY = stageH * (1 - PLINTH.bottom) - plinthH + plinthH * PLINTH.faceY;
  // As big as the stage allows: the tail sits on the plinth and the head stays in frame.
  const byHeight = plinthTopY / (SHARK_ART.tailY + CARD_INSET * SHARK_ART.aspect);
  // Hat top (box top + inset + hatTop*h) minus the lift stays at or below the stage top.
  const byLift = (plinthTopY - lift) / (SHARK_ART.tailY - SHARK_ART.hatTop);
  const height = Math.min(byHeight, byLift, (stageW / SHARK_ART.aspect) * widthCap);
  const width = height * SHARK_ART.aspect;
  const tailInBox = CARD_INSET * width + SHARK_ART.tailY * height;
  const top = plinthTopY - tailInBox;
  const left = (stageW - width) / 2;
  return {
    box: { left, top, width, height },
    plinthTopY,
    tailY: top + tailInBox,
    hatY: top + CARD_INSET * width + SHARK_ART.hatTop * height,
    shadow: { left: `${(SHARK_ART.tailX * 100 - 16).toFixed(1)}%`, top: `${((tailInBox / height) * 100 - 2.2).toFixed(1)}%` },
  };
}

/** Advance widths of the Shark display font (units per em 1000), ASCII 32..126, from the TTF. */
const SHARK_ADVANCE = [352, 233, 287, 707, 440, 524, 535, 143, 336, 305, 410, 364, 170, 359, 169, 370, 520, 274, 507, 446, 478, 437, 491,
  474, 480, 473, 178, 169, 401, 414, 463, 454, 786, 550, 497, 499, 505, 490, 438, 504, 499, 161, 463, 468, 437, 537, 466, 499, 465, 500,
  454, 469, 490, 508, 482, 599, 478, 499, 496, 219, 307, 220, 412, 462, 248, 448, 473, 396, 473, 416, 344, 448, 397, 139, 189, 391, 151,
  496, 408, 389, 469, 478, 361, 333, 268, 389, 459, 495, 399, 476, 420, 440, 123, 437, 499];

/** Width of a line set in the Shark font. */
export function displayTextWidth(text: string, size: number, letterSpacing = 0): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    units += code >= 32 && code <= 126 ? SHARK_ADVANCE[code - 32] : ch === '\u2019' ? 144 : 520;
  }
  return (units * size) / 1000 + letterSpacing * [...text].length;
}

/** Tile chip band metrics (ShopTile styles): chip padding, the SET chip's icon, gaps. */
export const TILE_BAND = { tileChrome: 6 + 8, gap: 4, chipPad: 10, chipBorder: 3, rarityFont: 12, rarityTracking: 0.4, setIcon: 12, setGap: 2 } as const;

/**
 * Rarity word or a rarity dot, from the tile's measured width: the full chips only when rarity
 * plus SET fit inside the band. fontScale is the Dynamic Type growth the chips allow (max 1.1).
 */
export function tileBand(tileWidth: number, rarityLabel: string | null | undefined, hasSet: boolean, fontScale = 1): 'full' | 'dot' {
  if (!rarityLabel || !hasSet) return 'full';
  const k = Math.min(1.1, Math.max(1, fontScale));
  const inner = tileWidth - TILE_BAND.tileChrome;
  const rarity = displayTextWidth(rarityLabel, TILE_BAND.rarityFont * k, TILE_BAND.rarityTracking) + TILE_BAND.chipPad;
  const set = TILE_BAND.setIcon + TILE_BAND.setGap + displayTextWidth('SET', TILE_BAND.rarityFont * k) + TILE_BAND.chipPad + TILE_BAND.chipBorder;
  return rarity + TILE_BAND.gap + set <= inner ? 'full' : 'dot';
}

/**
 * The Featured hero card, shared by ShopShelves and the layout test. A kicker row on top holds
 * "THIS WEEK'S STAR" and the timer pill (never on the hat), then the text column on the left and
 * the stage on the right.
 */
export const HERO = {
  margin: 10, border: 4, pad: 14, kickerH: 36, kickerFont: 13, kickerTracking: 1, pillFont: 13, pillChrome: 20 + 15 + 5, rowGap: 8,
  setLine: 18, pieces: 36, pieceGap: 6, piecesTop: 4, priceRow: 22, priceFont: 18, rarityFont: 12, cta: 44, ctaFont: 16, ctaPad: 16, gap: 4,
  textCol: 0.46, stageCol: 0.62, sharkCap: 0.96, clear: 2,
} as const;

/**
 * The hero card at a screen width. The shark is capped to the stage width, and the text column
 * ends where the shark's art starts (it never sits on the shark); a narrow column gets a smaller
 * name, fewer piece chips and a rarity dot.
 */
export function heroLayout(screenW: number): {
  cardW: number; innerW: number; bodyH: number; stage: { left: number; top: number; width: number; height: number };
  card: ReturnType<typeof stageCard>; sharkLeft: number; textW: number; textH: number; kickerW: number;
  nameSize: number; nameLine: number; chips: number;
} {
  const cardW = screenW - 2 * HERO.margin;
  const innerW = cardW - 2 * HERO.border;
  const bodyH = Math.round(Math.min(320, screenW * 0.76));
  const stageW = Math.round(innerW * HERO.stageCol);
  const stage = { left: innerW - stageW, top: HERO.kickerH, width: stageW, height: bodyH - 8 };
  const card = stageCard(stage.width, stage.height, 0, HERO.sharkCap);
  const sharkLeft = stage.left + card.box.left + SHARK_ART.leftEdge * card.box.width;
  const textW = Math.floor(Math.min(innerW * HERO.textCol, sharkLeft - HERO.pad - HERO.clear));
  const nameSize = textW < 130 ? 21 : 24;
  return {
    cardW, innerW, bodyH, stage, card, sharkLeft, textW,
    textH: bodyH - 2 * HERO.pad,
    kickerW: innerW - 2 * HERO.pad,
    nameSize, nameLine: nameSize + 2,
    chips: Math.max(1, Math.floor((textW + HERO.pieceGap) / (HERO.pieces + HERO.pieceGap))),
  };
}

/** Piece chips shown in the hero column: all if they fit, else n-1 and a "+N" chip. */
export function heroChips(total: number, room: number): { shown: number; more: number } {
  if (total <= room) return { shown: total, more: 0 };
  const shown = Math.max(0, room - 1);
  return { shown, more: total - shown };
}

/** Price and rarity on one row, or the rarity as a dot when the column is too narrow. */
export function heroPriceRow(textW: number, cost: string, rarityLabel: string | null | undefined): 'inline' | 'dot' {
  const price = 18 + 4 + displayTextWidth(cost, HERO.priceFont);
  if (!rarityLabel) return 'inline';
  return price + 4 + 14 + displayTextWidth(rarityLabel, HERO.rarityFont, 0.5) + 3 <= textW ? 'inline' : 'dot';
}

/** Width of the hero's TRY IT ON / WEAR IT pill. */
export function heroCtaWidth(label: string): number {
  return 2 * HERO.ctaPad + displayTextWidth(label, HERO.ctaFont) + 6;
}

/** Height the hero's text column needs (name, set line, pieces, then the price row and the CTA). */
export function heroTextNeed(o: { nameLines: number; nameLine?: number; set: boolean; pieces: boolean; owned: boolean }): number {
  const parts = [o.nameLines * (o.nameLine ?? 26)];
  if (o.set) parts.push(HERO.setLine);
  if (o.pieces) parts.push(HERO.pieces + HERO.piecesTop);
  parts.push(o.owned ? HERO.cta : HERO.priceRow + HERO.gap + HERO.cta);
  return parts.reduce((a, b) => a + b, 0) + HERO.gap * (parts.length - 1);
}

/** Does "THIS WEEK'S STAR" plus the pill fit the kicker row? */
export function heroKickerFits(screenW: number, pillLabel: string): boolean {
  const { kickerW } = heroLayout(screenW);
  const kicker = displayTextWidth("THIS WEEK'S STAR", HERO.kickerFont, HERO.kickerTracking);
  return kicker + HERO.rowGap + HERO.pillChrome + displayTextWidth(pillLabel, HERO.pillFont) <= kickerW;
}
