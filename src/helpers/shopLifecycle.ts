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
  /** Server copy, e.g. "Rare: few sharks have this". */
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

/** The tile's calm ribbon text (navy, never red). */
export function leavingRibbon(leaving: ShopLeaving): string {
  return leaving.forever ? 'LAST RUN' : 'LEAVING SOON';
}

/** A usable rarity block, or null. */
export function rarityOf(value: { rarity?: ShopRarity | null } | null | undefined): ShopRarity | null {
  const r = value?.rarity;
  return r && ['rare', 'very_rare', 'ultra_rare'].includes(r.tier) && typeof r.label === 'string' && r.label.trim() ? r : null;
}

/** Pearl colour per tier: white (rare), silver (very rare), gold (ultra rare). */
export function pearlFor(tier: RarityTier): 'white' | 'silver' | 'gold' {
  return tier === 'ultra_rare' ? 'gold' : tier === 'very_rare' ? 'silver' : 'white';
}

/** The closet card's corner badge: RETIRED for a piece that won't come back, else RARE for a rare one. */
export function closetBadge(lifecycle: OwnedLifecycle | null | undefined): { label: 'RETIRED' | 'RARE'; pearl: 'white' | 'silver' | 'gold' | null } | null {
  if (!lifecycle) return null;
  const rarity = rarityOf(lifecycle);
  if (lifecycle.retired && lifecycle.forever) return { label: 'RETIRED', pearl: rarity ? pearlFor(rarity.tier) : null };
  if (rarity) return { label: 'RARE', pearl: pearlFor(rarity.tier) };
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
