/**
 * Items that come and go (cp-catalogs/DESIGN.md): the shop's pieces have runs. Some leave
 * for a while and come back, seasonal ones return every year (the existing BACK AGAIN
 * ribbon), and a few retire forever, which makes them rare. Nothing is ever taken away.
 *
 * Copy rules (kid-safe, calm): a date, never a countdown; "won't come back" said once,
 * plainly, never in red; rarity is a calm fact, never "only" or "hurry". Pure functions,
 * tested in tools/tests/shop-lifecycle.test.cjs.
 */

export interface ShopLeaving {
  /** The last day it's in the shop (YYYY-MM-DD). */
  readonly on: string;
  /** Retires forever after that day. */
  readonly forever: boolean;
}

export type RarityTier = 'rare' | 'very_rare' | 'ultra_rare';

export interface ShopRarity {
  readonly tier: RarityTier;
  /**
   * Server copy, e.g. "Rare find: few sharks have this". Always "find", so it never reads as the
   * piece's own tier chip (Common, Uncommon, RARE, Epic) on the tile.
   */
  readonly label: string;
}

/** On owned items in the closet. */
export interface OwnedLifecycle {
  readonly retired: boolean;
  readonly forever: boolean;
  readonly first_released_on?: string | null;
  readonly rarity?: ShopRarity | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Nov 30". */
export function shortDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : '';
}

/** "November 2026". */
export function monthYear(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(ymd ?? '');
  return m ? `${MONTHS_LONG[Number(m[2]) - 1]} ${m[1]}` : '';
}

/** A usable leaving block, or null (bad or missing data never shows a label). */
export function leavingOf(shop: { leaving?: ShopLeaving | null } | null | undefined): ShopLeaving | null {
  const l = shop?.leaving;
  return l && /^\d{4}-\d{2}-\d{2}$/.test(l.on) ? l : null;
}

/** The try-on line: when it leaves, and honestly whether it comes back. */
export function leavingLine(leaving: ShopLeaving): string {
  return leaving.forever
    ? `Leaving after ${shortDay(leaving.on)}. Won't come back.`
    : `Leaving after ${shortDay(leaving.on)}. It might come back someday.`;
}

/** The promise that follows any leaving line. */
export const KEEP_LINE = 'Every piece you buy is yours forever.';

/**
 * The tile's calm ribbon (navy and gold, never red), with a picture so it reads without words:
 * a moon for LEAVING (it rests and might come back), a star for RETIRING (a keeper: it won't).
 * RETIRING pairs with the closet's RETIRED, so kids learn one word in two places.
 */
export function leavingRibbon(leaving: ShopLeaving): string {
  // Short: the tile ribbon shares its row with the heart.
  return leaving.forever ? 'RETIRING' : 'LEAVING';
}

export function leavingIcon(leaving: ShopLeaving): 'star' | 'moon' {
  return leaving.forever ? 'star' : 'moon';
}

/** VoiceOver: exactly what the ribbon shows, plus the date. */
export function leavingSay(leaving: ShopLeaving): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(leaving.on);
  const day = m ? `${MONTHS_LONG[Number(m[2]) - 1]} ${Number(m[3])}` : '';
  return leaving.forever ? `retiring after ${day}, it won't come back` : `leaving after ${day}`;
}

/**
 * The leaving block a player should see. A members-only Secret piece shows nothing to a
 * non-member: "won't come back" next to a paywall would be a subscription nudge.
 */
export function visibleLeaving(shop: { leaving?: ShopLeaving | null } | null | undefined, opts: { secret: boolean; vipLocked: boolean }): ShopLeaving | null {
  if (opts.secret && opts.vipLocked) return null;
  return leavingOf(shop);
}

/**
 * Ownership rarity shows on pieces you own, or on a piece retiring forever. Never on a fresh
 * piece for sale: a new piece has few owners only because it is new, and "hardly any sharks
 * have this" beside a Buy button is scarcity selling.
 */
export function visibleRarity(shop: { rarity?: ShopRarity | null; leaving?: ShopLeaving | null } | null | undefined, owned: boolean): ShopRarity | null {
  const rarity = rarityOf(shop);
  if (!rarity) return null;
  return owned || leavingOf(shop)?.forever ? rarity : null;
}

/** The heart hint never promises a return for a piece that is retiring forever. */
export function retiringWishHint(wished: boolean): string {
  return wished ? 'Saved to your wishlist.' : 'Heart it to save it for later.';
}

/** Rarity pearls (Codex GPT Image 2.5 with Alex's references, cp-catalogs/art), 64 px. */
export const PEARLS = {
  white: require('../../assets/shop-life/pearl-white.webp'),
  silver: require('../../assets/shop-life/pearl-silver.webp'),
  gold: require('../../assets/shop-life/pearl-gold.webp'),
} as const;

/** A usable rarity block, or null. */
export function rarityOf(value: { rarity?: ShopRarity | null } | null | undefined): ShopRarity | null {
  const r = value?.rarity;
  return r && ['rare', 'very_rare', 'ultra_rare'].includes(r.tier) && typeof r.label === 'string' && r.label.trim() ? r : null;
}

/** Pearl colour per tier: white (rare), silver (very rare), gold (ultra rare). */
export function pearlFor(tier: RarityTier): 'white' | 'silver' | 'gold' {
  return tier === 'ultra_rare' ? 'gold' : tier === 'very_rare' ? 'silver' : 'white';
}

/**
 * The closet card's corner badge, one chip style: RETIRED (word plus pearl) for a piece that
 * won't come back, else a pearl alone for one few sharks own. No word "rare" here, so it never
 * reads as the RARE tier chip; the full sentence is on VoiceOver.
 */
export function closetBadge(lifecycle: OwnedLifecycle | null | undefined): { label: 'RETIRED' | null; pearl: 'white' | 'silver' | 'gold' | null } | null {
  if (!lifecycle) return null;
  const rarity = rarityOf(lifecycle);
  if (lifecycle.retired && lifecycle.forever) return { label: 'RETIRED', pearl: rarity ? pearlFor(rarity.tier) : null };
  if (rarity) return { label: null, pearl: pearlFor(rarity.tier) };
  return null;
}

/** VoiceOver words for the closet badge. */
export function closetBadgeSay(lifecycle: OwnedLifecycle | null | undefined): string {
  const badge = closetBadge(lifecycle);
  if (!badge) return '';
  const rarity = rarityOf(lifecycle);
  return badge.label === 'RETIRED'
    ? `, retired: it won't come back to the shop${rarity ? `. ${rarity.label}` : ''}`
    : `, ${rarity!.label}`;
}
