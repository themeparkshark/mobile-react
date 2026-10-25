/**
 * The shop opens already stocked: Profile reads the Shark Shop's shelf ahead (once the Profile screen has settled), so
 * a tap on the shop finds the catalog in hand and the shelf drops in at once instead of a blank loading screen.
 *
 *   prefetchShop(store);          // Profile, after it settles (one read at a time; reused for SHOP_PREFETCH.freshMs)
 *   const ready = takeShop(store); // StoreScreen's first render: the finished read, used once, or null
 *   const shop = await loadShop(store);
 *
 * A read is used at most once (the shop refetches on every later open), and only while fresh, so a piece bought since
 * never shows as still for sale. The first shelf images are warmed in the image cache too.
 */
import { Image } from 'expo-image';
import getCatalog from '../../api/endpoints/catalogs/get';
import getItems from '../../api/endpoints/catalogs/items';
import getStore from '../../api/endpoints/stores/get';
import getStores from '../../api/endpoints/stores/stores';
import getStoreRotation, { type StoreRotation } from '../../api/endpoints/stores/rotation';
import getShopToday from '../../api/endpoints/stores/today';
import type { CatalogType } from '../../models/catalog-type';
import type { ItemType } from '../../models/item-type';
import type { ShopToday } from '../../models/shop-today';
import type { StoreType } from '../../models/store-type';
import { loadSecretShopFlag } from '../../services/secretShopFlag';

export type ShopParam = number | 'shark-shop';

export const SHOP_PREFETCH = {
  /** A read ahead is used only this soon after it finished (ms). */
  freshMs: 90_000,
  /** Shelf images warmed ahead (the Shop Pick and the first screenful). */
  warmImages: 12,
} as const;

/** The first catalog page size (the shop asks for more as it scrolls). */
export const CATALOG_PAGE = 15;

export interface ShopLoad {
  readonly id: number;
  readonly store: StoreType;
  readonly secretV2: boolean;
  readonly rotation: StoreRotation | null;
  readonly catalog: CatalogType;
  readonly today: ShopToday | null;
  readonly firstPage: ItemType[];
}

/** One full shop read (the store, its rotation, its catalog, today's shelves or the first catalog page). */
export async function loadShop(store: ShopParam): Promise<ShopLoad> {
  // 'shark-shop' opens the global Shark Shop without knowing its id.
  const id = typeof store === 'number' ? store
    : Number((await getStores()).find(s => s.name === 'Shark Shop')?.id) || undefined;
  if (!id) throw new Error('Shark Shop not found');
  const nextStore = await getStore(id);
  // The secret store only asks for shelves while secret_shop_v2 is on (the server checks it too).
  const nextSecretV2 = !!nextStore.is_secret_store && await loadSecretShopFlag();
  const [rotation, catalog, today] = await Promise.all([
    getStoreRotation(id).catch(() => null),
    getCatalog(nextStore.current_catalog_id),
    // Shop v2 shelves; null on an older backend, which keeps the classic grid. The Secret Shop
    // with its flag on never falls back to the legacy grid on a hiccup: a failed day is an error
    // with a retry (getShopToday answers null only for "this store doesn't rotate").
    nextStore.is_secret_store && !nextSecretV2 ? Promise.resolve(null)
      : nextSecretV2 ? getShopToday(id) : getShopToday(id).catch(() => null),
  ]);
  const firstPage = today ? [] : await getItems(catalog.id, 1);
  return { id, store: nextStore, secretV2: nextSecretV2 && !!today, rotation, catalog, today, firstPage };
}

type Entry = { key: string; promise: Promise<ShopLoad>; done: ShopLoad | null; at: number };
let entry: Entry | null = null;
const keyOf = (store: ShopParam) => String(store);

/** Read the shop ahead (no-op while a fresh read for it exists or is under way). Never throws. */
export function prefetchShop(store: ShopParam, now = Date.now()): void {
  const key = keyOf(store);
  if (entry && entry.key === key && (!entry.done || now - entry.at < SHOP_PREFETCH.freshMs)) return;
  const next: Entry = { key, promise: loadShop(store), done: null, at: now };
  entry = next;
  next.promise.then(load => {
    if (entry !== next) return;
    next.done = load;
    next.at = Date.now();
    const urls = [load.catalog.promotion_image_url, ...load.firstPage.slice(0, SHOP_PREFETCH.warmImages).map(i => i.icon_url)]
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (urls.length) void Image.prefetch(urls, 'memory-disk').catch(() => undefined);
  }, () => { if (entry === next) entry = null; });
}

/** The finished, fresh read for this shop (used once), or null. */
export function takeShop(store: ShopParam, now = Date.now()): ShopLoad | null {
  if (!entry || entry.key !== keyOf(store) || !entry.done || now - entry.at >= SHOP_PREFETCH.freshMs) return null;
  const load = entry.done;
  entry = null;
  return load;
}

/** A read under way for this shop (used once), so the shop waits for it instead of asking twice, or null. */
export function takePendingShop(store: ShopParam): Promise<ShopLoad> | null {
  if (!entry || entry.key !== keyOf(store) || entry.done) return null;
  const pending = entry.promise;
  entry = null;
  return pending;
}

/** Forget any read ahead (tests, sign-out). */
export function resetShopPrefetch(): void {
  entry = null;
}
