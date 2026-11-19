/**
 * The lean Ticket ladder on every server (fix w4 T221, decision default Nov 18).
 *
 * A server with ECONOMY_LEAN_LADDER answers `ladder: 'lean'` and already lists the lean set: no 12 or 25
 * Ticket packs (the Park Day and Park Trip Packs give more for about the same money), the Park Trip Pack
 * once a day, the two biggest coin packs only after a first purchase. An older server answers no ladder
 * (or 'full') and lists every pack, so this OTA hides the two Ticket packs that contradict the ladder
 * there too. It only changes what is listed: a bought pack of either kind is still delivered (purchases
 * replay by transaction, not by this list). The big coin packs stay under More on an older server,
 * because only the server knows whether this player has bought before.
 */
import type { ShopCatalog } from '../../api/endpoints/me/shop';

/** Ticket packs the lean ladder never lists. */
export const UNLISTED_ON_LEAN = ['tickets.12', 'tickets.25'] as const;

const unlisted = (productId: string) => UNLISTED_ON_LEAN.some(key => productId === key || productId.endsWith(`.${key}`));

export function leanLadder(catalog: ShopCatalog): ShopCatalog {
  if (catalog.ladder === 'lean') return catalog;
  return { ...catalog, products: catalog.products.filter(p => !unlisted(p.product_id)) };
}
