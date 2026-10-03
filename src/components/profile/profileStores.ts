/**
 * Which stores the Profile shortcut row shows.
 *
 * The Shark Shop is the one place to buy gear with Shark Coins (its catalog
 * holds every published coin cosmetic, so it covers the legacy weekly "Store"
 * too). Two coin shops side by side ("Store" and "Shark Shop") confuse kids,
 * so when the Shark Shop exists the legacy "Store" is left off the row. The
 * Secret Store (VIP) and any other global store still show, after the Shark
 * Shop.
 */
export const SHARK_SHOP_NAME = 'Shark Shop';
export const LEGACY_STORE_NAME = 'Store';

type StoreLike = { readonly id: string | number; readonly name: string; readonly is_secret_store: boolean };

export function profileStores<T extends StoreLike>(stores: readonly T[]): { sharkShop: T | null; others: T[] } {
  const sharkShop = stores.find((s) => s.name === SHARK_SHOP_NAME) ?? null;
  const others = stores.filter((s) => s !== sharkShop && !(sharkShop && !s.is_secret_store && s.name === LEGACY_STORE_NAME));
  // Secret (VIP) stores last, so the free shops come first.
  others.sort((a, b) => Number(a.is_secret_store) - Number(b.is_secret_store));
  return { sharkShop, others };
}
