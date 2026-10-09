/**
 * The money math every offer shows, in one place, so every number a player or
 * a grown-up reads is computed from the server catalog and Apple's prices and
 * covered by a test (tools/tests/money-offers.test.cjs). Nothing here invents
 * a number: no price, no "worth", no bonus appears unless both sides of the
 * comparison are real.
 *
 * - Base rate: the cheapest single-currency pack in a section sets what one
 *   ticket, coin or Rescue Pass costs at the regular price.
 * - Bonus: a bigger single-currency pack shows "+N% more" against that rate.
 * - Worth: a bundle (Starter, Daily Deal, Park Day) shows what its contents
 *   cost at regular pack prices. Energy has no pack of its own, so it is
 *   never priced into a "worth" (it is listed as a plus).
 * - Top-up: the cheapest pack that covers a shortfall, so a kid who is 120
 *   coins short is offered 500 coins, not 7,000.
 */
import type { ShopCurrency, ShopGrants, ShopProduct } from '../../api/endpoints/me/shop';

export type Price = { readonly price: string; readonly amount: number };
export type PriceMap = Readonly<Record<string, Price | undefined>>;

const PRICED: readonly ShopCurrency[] = ['tickets', 'coins', 'rescue_passes'];

/** The one currency a pack sells, or null for a bundle. */
export function singleCurrency(grants: ShopGrants): ShopCurrency | null {
  const kinds = (Object.keys(grants) as ShopCurrency[]).filter(k => (grants[k] ?? 0) > 0);
  return kinds.length === 1 ? kinds[0] : null;
}

/** What one unit of each currency costs at the regular (smallest pack) price. */
export function baseRates(products: readonly ShopProduct[], prices: PriceMap): Partial<Record<ShopCurrency, number>> {
  const rates: Partial<Record<ShopCurrency, { amount: number; units: number }>> = {};
  for (const product of products) {
    if (product.section === 'featured') continue;
    const kind = singleCurrency(product.grants);
    const price = prices[product.product_id];
    const units = kind ? product.grants[kind] ?? 0 : 0;
    if (!kind || !price || price.amount <= 0 || units <= 0) continue;
    const current = rates[kind];
    if (!current || price.amount < current.amount) rates[kind] = { amount: price.amount, units };
  }
  const out: Partial<Record<ShopCurrency, number>> = {};
  for (const kind of PRICED) {
    const rate = rates[kind];
    if (rate) out[kind] = rate.amount / rate.units;
  }
  return out;
}

/** "+21% more" for a bigger single-currency pack; null for the base pack or anything under 5%. */
export function bonusPercent(product: ShopProduct, prices: PriceMap, rates: Partial<Record<ShopCurrency, number>>): number | null {
  const kind = singleCurrency(product.grants);
  const price = prices[product.product_id];
  const rate = kind ? rates[kind] : undefined;
  if (!kind || !price || !rate || price.amount <= 0) return null;
  const regular = (product.grants[kind] ?? 0) * rate;
  const percent = Math.floor((regular / price.amount - 1) * 100);
  return percent >= 5 ? percent : null;
}

/** What a bundle's priced contents cost at regular pack prices (energy left out). Null if any priced part has no rate. */
export function regularValue(grants: ShopGrants, rates: Partial<Record<ShopCurrency, number>>): number | null {
  let total = 0;
  for (const kind of PRICED) {
    const units = grants[kind] ?? 0;
    if (units <= 0) continue;
    const rate = rates[kind];
    if (!rate) return null;
    total += units * rate;
  }
  return total > 0 ? total : null;
}

/**
 * "$1.99" -> "$6.60" in the same storefront format: Apple's own currency
 * symbol and placement, our number. Null when the format can't be read.
 */
export function formatLike(sample: string, amount: number): string | null {
  const match = sample.match(/(\d[\d.,\s  ]*\d|\d)/);
  if (!match || !Number.isFinite(amount)) return null;
  const digits = match[1];
  const comma = /\d,\d{2}$/.test(digits);
  const fixed = amount.toFixed(2);
  const [whole, cents] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, comma ? '.' : ',');
  return sample.replace(digits, `${grouped}${comma ? ',' : '.'}${cents}`);
}

export type BundleWorth = {
  /** "$6.60": what the priced contents cost in regular packs, in the storefront's format. */
  readonly worth: string;
  /** 3 for "3x the value"; only whole multiples of 2 or more are claimed. */
  readonly times: number | null;
  /** True when the bundle also holds energy, which is never priced in. */
  readonly plusEnergy: boolean;
};

/** A bundle's honest worth. Null unless it is at least 1.5x its own price. */
export function bundleWorth(product: ShopProduct, prices: PriceMap, rates: Partial<Record<ShopCurrency, number>>): BundleWorth | null {
  // A regular single-currency pack shows its bonus instead; featured deals (a Coin Chest) show their worth.
  if (singleCurrency(product.grants) && product.section !== 'featured') return null;
  const price = prices[product.product_id];
  const value = regularValue(product.grants, rates);
  if (!price || price.amount <= 0 || !value || value < price.amount * 1.5) return null;
  // Round the worth DOWN to the cent and the multiple DOWN to a whole number: never overclaim.
  const worth = formatLike(price.price, Math.floor(value * 100) / 100);
  if (!worth) return null;
  const times = Math.floor(value / price.amount);
  return { worth, times: times >= 2 ? times : null, plusEnergy: (product.grants.energy ?? 0) > 0 };
}

/**
 * The cheapest pack the player can buy right now that covers `need` of a
 * currency. Bundles count (a Daily Deal of 1,000 coins covers 300). When
 * nothing covers it, the pack with the most of that currency. Null when no
 * pack sells it or nothing has a price yet.
 */
export function pickTopUp(need: number, kind: ShopCurrency, products: readonly ShopProduct[], prices: PriceMap): ShopProduct | null {
  const options = products.filter(p => p.available && (p.grants[kind] ?? 0) > 0 && prices[p.product_id]);
  if (!options.length) return null;
  const covering = options.filter(p => (p.grants[kind] ?? 0) >= Math.max(1, need));
  if (covering.length) {
    return [...covering].sort((a, b) =>
      prices[a.product_id]!.amount - prices[b.product_id]!.amount
      // Same price: the one that gives more of what was asked for.
      || (b.grants[kind] ?? 0) - (a.grants[kind] ?? 0))[0];
  }
  return [...options].sort((a, b) => (b.grants[kind] ?? 0) - (a.grants[kind] ?? 0))[0];
}

/** "$3.33 a month" for a yearly plan, in the storefront's format; null otherwise. */
export function perMonthText(plan: { price: string; amount: number; period: string }): string | null {
  if (plan.period !== 'year' || plan.amount <= 0) return null;
  const monthly = formatLike(plan.price, Math.floor((plan.amount / 12) * 100) / 100);
  return monthly ? `${monthly} a month` : null;
}

/** The VIP ride multiplier, read from the server's own perk line ("2x XP and coins"). Null if it isn't there. */
export function vipRideMultiplier(perks: readonly { key?: string; title: string }[] | null | undefined): number | null {
  const ride = perks?.find(p => p.key === 'ride') ?? perks?.find(p => /\bXP\b/.test(p.title) && /coin/i.test(p.title));
  const n = Number(ride?.title.match(/^(\d+)x\b/i)?.[1]);
  return Number.isFinite(n) && n >= 2 ? n : null;
}

/**
 * "VIP would have made it 60 coins and 40 XP": what this exact win pays a
 * member, from the server's multiplier. Null without a multiplier or a win.
 */
export function vipWinLine(coins: number, xp: number, multiplier: number | null): string | null {
  if (!multiplier || multiplier < 2 || (coins <= 0 && xp <= 0)) return null;
  const parts = [
    coins > 0 ? `${(coins * multiplier).toLocaleString('en-US')} coins` : null,
    xp > 0 ? `${(xp * multiplier).toLocaleString('en-US')} XP` : null,
  ].filter(Boolean);
  return `VIP would make this ${parts.join(' and ')}`;
}

/** "4h 12m" until the shop day rolls over (the real midnight in the parks' time zone). */
export function untilText(endsAtIso: string | null | undefined, now: number = Date.now()): string | null {
  const end = endsAtIso ? Date.parse(endsAtIso) : NaN;
  if (!Number.isFinite(end)) return null;
  const left = Math.max(0, end - now);
  const minutes = Math.floor(left / 60_000);
  if (minutes < 1) return 'any minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
