/**
 * One in-memory copy of the collection book for this app session, so the
 * book opens instantly (no blank panel, no loader) and the menu badge needs
 * no request of its own.
 *
 * - The menu prefetches on open (`prefetchBook`), and the book renders the
 *   cached copy at once, then refreshes in place.
 * - The menu's "reward waiting" badge reads `has_claimable` from the v3 dex
 *   summary when the server sends it (requested in home-hunt-v3/CONTRACT.md),
 *   else the cached book, else one list read.
 */
import getPrepItemSets, { getPrepItemSet, type PrepItemSetDetailResponse, type PrepItemSetListItem } from '../../api/endpoints/me/prep-item-sets';
import { getHomeHuntDex, getHomeHuntDexSet } from '../../api/endpoints/me/homeHuntDex';
import { buildBook, hasClaimable, initialSlug, type DexBook } from './dexModel';

type Detail = PrepItemSetDetailResponse['data'];

export interface BookCache {
  readonly at: number;
  readonly legacy: PrepItemSetListItem[];
  readonly dex: unknown;
  readonly book: DexBook;
  readonly details: Record<string, { readonly raw: Detail; readonly dex: unknown }>;
}

let cache: BookCache | null = null;
let inflight: Promise<BookCache | null> | null = null;

export const FRESH_MS = 2 * 60 * 1000;

export function cachedBook(): BookCache | null {
  return cache;
}

export function storeBook(legacy: PrepItemSetListItem[], dex: unknown, book: DexBook): void {
  cache = { at: Date.now(), legacy, dex, book, details: cache?.details ?? {} };
}

export function storeDetail(slug: string, raw: Detail, dex: unknown): void {
  if (!cache) return;
  cache = { ...cache, details: { ...cache.details, [slug]: { raw, dex } } };
}

export function invalidateBook(): void {
  if (cache) cache = { ...cache, at: 0 };
}

/** Read the list (and the first set's page) into the cache. Safe to call often: one request set at a time, skipped while fresh. */
export function prefetchBook(): Promise<BookCache | null> {
  if (cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [legacy, dex] = await Promise.all([getPrepItemSets(), getHomeHuntDex()]);
      const book = buildBook(legacy, dex);
      storeBook(legacy, dex, book);
      const slug = initialSlug(book.sets, null);
      if (slug && !cache?.details[slug]) {
        const [raw, page] = await Promise.all([getPrepItemSet(slug), getHomeHuntDexSet(slug)]);
        storeDetail(slug, raw, page);
      }
      return cache;
    } catch {
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** The server's flag when it has one, else what the cached book says. */
export function rewardWaitingFrom(entry: BookCache | null): boolean {
  const flag = (entry?.dex as { has_claimable?: unknown } | null)?.has_claimable;
  if (typeof flag === 'boolean') return flag;
  return !!entry?.book.sets.some(hasClaimable);
}
