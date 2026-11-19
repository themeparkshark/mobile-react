/**
 * What Supplies shows first, and what waits under More (fix round w3: T154, T155, T168, T170, T221).
 *
 * The page opens at the top, always (no door scrolls it to a section). First block:
 * - a hand-off card when a door came for one thing ("Your shark is out of Tickets": the smallest
 *   pack of that thing, plus the free way), so the grown-up holding the phone knows why they are here;
 * - one hero pack: the Starter Pack while it is unbought; after it, the Park Trip Pack as "Your next
 *   pack" (no timer, no discount); from the out-of-Tickets door, today's Park Day Pack;
 * - one Ticket row (at most 3 cards; today's deal joins it only when it gives Tickets only);
 * then VIP. Everything else (other bundles, the Shark Pass door, Shark Coins, extra tries) waits
 * under More, so a first look holds about 4 price points, not 13.
 *
 * Pure: no React, no network. Exported pieces are tested in tools/tests/shop-w3.test.cjs.
 */
import type { ShopCurrency, ShopProduct } from '../../api/endpoints/me/shop';
import type { PriceMap } from './offers';

export type SuppliesNeed = 'tickets' | 'coins' | 'rescue';
export type HeroKind = 'starter' | 'next' | 'parkday';

export type SuppliesPlan = {
  readonly handoff: { readonly need: SuppliesNeed; readonly out: boolean; readonly pack: ShopProduct | null } | null;
  readonly hero: { readonly product: ShopProduct; readonly kind: HeroKind } | null;
  readonly ticketRow: readonly ShopProduct[];
  /** Today's deal, when it is truly the best Tickets per dollar on the page today. */
  readonly bestTicketDeal: string | null;
  readonly more: {
    readonly bundles: readonly ShopProduct[];
    readonly deals: readonly ShopProduct[];
    readonly packs: readonly { readonly key: 'tickets' | 'coins' | 'rescue'; readonly packs: readonly ShopProduct[] }[];
  };
};

const NEED_KEY: Record<SuppliesNeed, ShopCurrency> = { tickets: 'tickets', coins: 'coins', rescue: 'rescue_passes' };
export const TICKET_ROW_MAX = 3;

export const isStarter = (p: ShopProduct): boolean => p.limit === 'once';
export const isParkDay = (p: ShopProduct): boolean => p.product_id.endsWith('.pack.parkday');
export const isParkTrip = (p: ShopProduct): boolean => p.product_id.endsWith('.pack.parktrip');
export const isDeal = (p: ShopProduct): boolean => !!p.deal_key || p.product_id.endsWith('.deal.daily');

function amount(p: ShopProduct, prices: PriceMap): number | null {
  const a = prices[p.product_id]?.amount;
  return typeof a === 'number' && a > 0 ? a : null;
}

/**
 * Today's deal is labelled "Today's best Ticket deal" only when it gives Tickets and nothing else,
 * and more Tickets per dollar than every other priced, buyable thing that gives Tickets
 * (packs and bundles, counting their Tickets only). Null otherwise: never a claim that is not true.
 */
export function bestTicketDeal(products: readonly ShopProduct[], prices: PriceMap): string | null {
  const deal = products.find(p => isDeal(p) && p.available);
  if (!deal) return null;
  const keys = Object.keys(deal.grants).filter(k => (deal.grants[k as ShopCurrency] ?? 0) > 0);
  const price = amount(deal, prices);
  if (keys.length !== 1 || keys[0] !== 'tickets' || !price) return null;
  const rate = (deal.grants.tickets ?? 0) / price;
  const beaten = products.some(p => p !== deal && p.available && (p.grants.tickets ?? 0) > 0
    && amount(p, prices) !== null && (p.grants.tickets ?? 0) / (amount(p, prices) as number) >= rate);
  return beaten ? null : deal.product_id;
}

const ticketsOnly = (p: ShopProduct): boolean => (p.grants.tickets ?? 0) > 0
  && Object.keys(p.grants).every(k => k === 'tickets' || !(p.grants[k as ShopCurrency] ?? 0));

/**
 * Bigger price always gives more (hold-fix 3, T221). A Tickets-only card is left off the page while another
 * buyable Tickets-only card costs the same or less and gives more Tickets: TODAY'S PICK at 9 Tickets for $0.99
 * never sits beside 5 Tickets for $0.99. On a day the pick is something else (or bought), the pack comes back.
 */
export function outdoneOnTickets(p: ShopProduct, products: readonly ShopProduct[], prices: PriceMap): boolean {
  const price = amount(p, prices);
  if (!ticketsOnly(p) || price === null) return false;
  return products.some(q => q !== p && q.available && ticketsOnly(q)
    && (amount(q, prices) ?? Infinity) <= price && (q.grants.tickets ?? 0) > (p.grants.tickets ?? 0));
}

export function planSupplies({ products, prices, focus, wallet, priced }: {
  products: readonly ShopProduct[];
  prices: PriceMap;
  focus?: string | null;
  wallet: Partial<Record<ShopCurrency, number>>;
  /** Whether Apple priced this product (an unpriced product is never a dead card). */
  priced: (p: ShopProduct) => boolean;
}): SuppliesPlan {
  const live = products.filter(priced).filter((p, _i, all) => !outdoneOnTickets(p, all, prices));
  const bySection = (key: ShopProduct['section']) => live.filter(p => p.section === key);
  const featured = bySection('featured');
  const need: SuppliesNeed | null = focus === 'tickets' || focus === 'coins' || focus === 'rescue' ? focus : null;

  // The hand-off pack: the smallest buyable pack of the one thing the door came for (for Tickets, today's
  // Tickets-only pick counts as a pack: the cheapest card that gives the most Tickets for that price).
  const handoffCands = need === 'tickets' ? [...bySection('tickets'), ...bySection('featured').filter(p => isDeal(p) && ticketsOnly(p))]
    : need ? bySection(need) : [];
  const handoffPack = need
    ? handoffCands.filter(p => p.available).sort((a, b) => ((amount(a, prices) ?? 99) - (amount(b, prices) ?? 99))
      || ((b.grants.tickets ?? 0) - (a.grants.tickets ?? 0)))[0] ?? null
    : null;
  const handoff = need ? { need, out: (wallet[NEED_KEY[need]] ?? 0) <= 0, pack: handoffPack } : null;

  const starter = featured.find(p => isStarter(p) && p.available);
  const parkDay = featured.find(p => isParkDay(p) && p.available);
  const trip = featured.find(p => isParkTrip(p) && p.available)
    ?? featured.find(p => !isStarter(p) && !isDeal(p) && !isParkDay(p) && !p.limit && p.available);
  const hero: SuppliesPlan['hero'] = starter ? { product: starter, kind: 'starter' }
    : need === 'tickets' && parkDay ? { product: parkDay, kind: 'parkday' }
      : trip ? { product: trip, kind: 'next' }
        : parkDay ? { product: parkDay, kind: 'parkday' } : null;

  const deals = featured.filter(isDeal);
  // A deal joins the Ticket row only when it gives Tickets and nothing else (its card names one thing).
  const ticketDeals = deals.filter(p => ticketsOnly(p) && p !== handoffPack);
  const ticketPacks = bySection('tickets').filter(p => p !== handoffPack);
  const ticketRow = [...ticketDeals, ...ticketPacks].slice(0, TICKET_ROW_MAX);

  const shown = new Set<ShopProduct>([...(hero ? [hero.product] : []), ...ticketRow, ...(handoffPack ? [handoffPack] : [])]);
  // A bundle that can't be bought now (bought today, bought once) is left off: never a dead card.
  const bundles = featured.filter(p => !isDeal(p) && !shown.has(p) && p.available);
  const more = {
    bundles,
    deals: deals.filter(p => !shown.has(p)),
    packs: (['tickets', 'coins', 'rescue'] as const)
      .map(key => ({ key, packs: bySection(key).filter(p => !shown.has(p)) }))
      .filter(s => s.packs.length > 0),
  };
  return { handoff, hero, ticketRow, bestTicketDeal: bestTicketDeal(live, prices), more };
}

/** The hand-off card's head line, in the words a grown-up holding the phone needs. */
export function handoffHead(need: SuppliesNeed, out: boolean): string {
  const thing = need === 'tickets' ? 'Tickets' : need === 'coins' ? 'Shark Coins' : 'extra tries';
  return out ? `Your shark is out of ${thing}` : `Need more ${thing}?`;
}

/** The free way the hand-off card names beside the price (free always comes first in the words). */
export function handoffFreeWay(need: SuppliesNeed): string {
  switch (need) {
    case 'tickets': return 'Or free: 3 treats at home = 1 Ticket';
    case 'coins': return 'Or free: win ride coins and grab treats';
    case 'rescue': return 'Or free: tomorrow brings a new free try';
  }
}
