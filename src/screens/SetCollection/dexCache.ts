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
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationType } from '../../models/location-type';
import { buildBook, hasClaimable, initialSlug, type DexBook } from './dexModel';

type Detail = PrepItemSetDetailResponse['data'];

export interface BookCache {
  /** The signed-in player this copy belongs to: another player (or signed out) never sees it. */
  readonly playerId: number;
  readonly at: number;
  readonly legacy: PrepItemSetListItem[];
  readonly dex: unknown;
  readonly book: DexBook;
  readonly details: Record<string, { readonly raw: Detail; readonly dex: unknown }>;
}

let cache: BookCache | null = null;
let inflight: { playerId: number; ticket: object; promise: Promise<BookCache | null> } | null = null;

export const FRESH_MS = 2 * 60 * 1000;

/** The copy for this player, or null (signed out, another account, or nothing read yet). */
export function cachedBook(playerId: number | null | undefined): BookCache | null {
  if (playerId == null) { cache = null; return null; }
  if (cache && cache.playerId !== playerId) cache = null;
  return cache;
}

export function storeBook(playerId: number, legacy: PrepItemSetListItem[], dex: unknown, book: DexBook): void {
  const keep = cache?.playerId === playerId ? cache.details : {};
  cache = { playerId, at: Date.now(), legacy, dex, book, details: keep };
}

/** Sign-out and account switches: drop everything. */
export function clearBook(): void {
  cache = null;
  inflight = null;
  landOffsets = null;
}

export function storeDetail(playerId: number, slug: string, raw: Detail, dex: unknown): void {
  if (!cache || cache.playerId !== playerId) return;
  cache = { ...cache, details: { ...cache.details, [slug]: { raw, dex } } };
}

export function invalidateBook(): void {
  if (cache) cache = { ...cache, at: 0 };
}

/** Read the list (and the first set's page) into the cache. Safe to call often: one request set at a time, skipped while fresh. */
/** Same requests (and the same location params) the book screen sends, so the copy matches what it would read. */
export function prefetchBook(playerId: number | null | undefined, location?: LocationType | null): Promise<BookCache | null> {
  if (playerId == null) { clearBook(); return Promise.resolve(null); }
  const current = cachedBook(playerId);
  if (current && Date.now() - current.at < FRESH_MS) return Promise.resolve(current);
  if (inflight && inflight.playerId === playerId) return inflight.promise;
  void loadLandOffsets(playerId);
  const ticket = {};
  const promise = (async (): Promise<BookCache | null> => {
    try {
      const [legacy, dex] = await Promise.all([getPrepItemSets(location ?? undefined), getHomeHuntDex(location)]);
      const book = buildBook(legacy, dex);
      if (inflight?.ticket !== ticket) return null; // signed out or switched while this was loading
      storeBook(playerId, legacy, dex, book);
      const slug = initialSlug(book.sets, null);
      if (slug && !cache?.details[slug]) {
        const [raw, page] = await Promise.all([getPrepItemSet(slug, location ?? undefined), getHomeHuntDexSet(slug, location)]);
        storeDetail(playerId, slug, raw, page);
      }
      return cache?.playerId === playerId ? cache : null;
    } catch {
      return cache?.playerId === playerId ? cache : null;
    } finally {
      if (inflight?.ticket === ticket) inflight = null;
    }
  })();
  inflight = { playerId, ticket, promise };
  return promise;
}

/** The server's flag when it has one, else what the cached book says. */
export function rewardWaitingFrom(entry: BookCache | null): boolean {
  const flag = (entry?.dex as { has_claimable?: unknown } | null)?.has_claimable;
  if (typeof flag === 'boolean') return flag;
  return !!entry?.book.sets.some(hasClaimable);
}

// Where the book first landed per player and set (the claim panel offset), kept across launches so the first
// open after a launch can start there before first paint.
const LAND_KEY = (playerId: number) => `dex_land_offsets_v1_${playerId}`;
let landOffsets: { playerId: number; map: Record<string, number> } | null = null;

export function landOffset(playerId: number | null | undefined, slug: string | null | undefined): number | null {
  if (playerId == null || !slug || landOffsets?.playerId !== playerId) return null;
  const value = landOffsets.map[slug];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function saveLandOffset(playerId: number | null | undefined, slug: string, offset: number): void {
  if (playerId == null) return;
  if (landOffsets?.playerId !== playerId) landOffsets = { playerId, map: {} };
  landOffsets.map[slug] = Math.round(offset);
  void AsyncStorage.setItem(LAND_KEY(playerId), JSON.stringify(landOffsets.map)).catch(() => undefined);
}

/** Read the saved offsets once per player (the menu calls this with the prefetch). */
export async function loadLandOffsets(playerId: number | null | undefined): Promise<void> {
  if (playerId == null || landOffsets?.playerId === playerId) return;
  try {
    const raw = await AsyncStorage.getItem(LAND_KEY(playerId));
    const map = raw ? JSON.parse(raw) as Record<string, number> : {};
    landOffsets = { playerId, map: map && typeof map === 'object' ? map : {} };
  } catch {
    landOffsets = { playerId, map: {} };
  }
}
