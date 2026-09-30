/**
 * The player's ride coin collection, cached once for every coin surface
 * (park shelves, the All Parks index, coin detail, the post-win summary).
 *
 * A module store instead of a Provider so no root file has to mount it:
 * screens call useCoinCollection(); one request is shared by every caller
 * and reused for STALE_MS. Writes (level up, feature) patch the cache, so the
 * shelf and detail always agree without another full read.
 */
import { useCallback, useEffect, useState } from 'react';
import getRideCoins from '../api/endpoints/me/ride-coins';
import getRideCoin, { type CollectedRideCoin } from '../api/endpoints/me/ride-coins/show';

export type { CollectedRideCoin };

export const STALE_MS = 30_000;

interface Store {
  playerId: number | null;
  coins: CollectedRideCoin[] | null;
  fetchedAt: number;
  inflight: Promise<CollectedRideCoin[]> | null;
  version: number;
}

const store: Store = { playerId: null, coins: null, fetchedAt: 0, inflight: null, version: 0 };
const listeners = new Set<() => void>();
const notify = () => { store.version++; listeners.forEach(listener => listener()); };

/** Forget everything (sign out, account switch, tests). */
export function resetCoinCollection(): void {
  store.playerId = null; store.coins = null; store.fetchedAt = 0; store.inflight = null;
  notify();
}

/** Mark the cache stale so the next read goes to the server. */
export function invalidateCoinCollection(): void {
  store.fetchedAt = 0;
}

export function cachedCoins(playerId: number | null | undefined): CollectedRideCoin[] | null {
  return playerId && store.playerId === playerId ? store.coins : null;
}

export function cachedCoin(playerId: number | null | undefined, assetId: number): CollectedRideCoin | null {
  return cachedCoins(playerId)?.find(coin => coin.id === assetId) ?? null;
}

/** Load the collection, sharing one in-flight request. `force` skips the freshness window. */
export async function loadCoinCollection(playerId: number, { force = false, timeoutMs = 10_000 } = {}): Promise<CollectedRideCoin[]> {
  if (store.playerId !== playerId) {
    store.playerId = playerId; store.coins = null; store.fetchedAt = 0; store.inflight = null;
  }
  if (!force && store.coins && Date.now() - store.fetchedAt < STALE_MS) return store.coins;
  if (store.inflight) return store.inflight;
  const request = getRideCoins(timeoutMs).then(response => {
    if (store.playerId !== playerId) return response.data as CollectedRideCoin[];
    store.coins = response.data as CollectedRideCoin[];
    store.fetchedAt = Date.now();
    notify();
    return store.coins;
  }).finally(() => { if (store.inflight === request) store.inflight = null; });
  store.inflight = request;
  return request;
}

/** One coin: the cache when fresh, otherwise the single-coin endpoint (never the whole list). */
export async function loadCoin(playerId: number, assetId: number, { force = false } = {}): Promise<CollectedRideCoin | null> {
  const fresh = !force && store.playerId === playerId && Date.now() - store.fetchedAt < STALE_MS;
  const cached = fresh ? cachedCoin(playerId, assetId) : null;
  if (cached) return cached;
  try {
    const { data } = await getRideCoin(assetId);
    upsertCoin(playerId, data);
    return data;
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) return null;
    throw error;
  }
}

/** Patch one coin after a confirmed write (level up, feature) or a single read. */
export function upsertCoin(playerId: number, coin: CollectedRideCoin): void {
  if (store.playerId !== playerId) return;
  if (!store.coins) return;
  const index = store.coins.findIndex(existing => existing.id === coin.id);
  const merged = index >= 0 ? { ...store.coins[index], ...coin } : coin;
  store.coins = index >= 0
    ? store.coins.map((existing, i) => i === index ? merged : existing)
    : [...store.coins, merged];
  notify();
}

/** Only one coin can be featured on the profile. */
export function setFeaturedCoin(playerId: number, assetId: number | null): void {
  if (store.playerId !== playerId || !store.coins) return;
  store.coins = store.coins.map(coin => ({ ...coin, is_featured: coin.id === assetId }));
  notify();
}

export interface CoinCollectionState {
  readonly coins: CollectedRideCoin[];
  readonly loaded: boolean;
  readonly error: boolean;
  readonly reload: (force?: boolean) => Promise<CollectedRideCoin[] | null>;
}

/** Subscribe a screen to the shared collection. Loads on mount; pass force to reload. */
export function useCoinCollection(playerId: number | null | undefined, { autoload = true } = {}): CoinCollectionState {
  const [, setVersion] = useState(store.version);
  const [error, setError] = useState(false);
  useEffect(() => {
    const listener = () => setVersion(store.version);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const reload = useCallback(async (force = false) => {
    if (!playerId) return null;
    try {
      const coins = await loadCoinCollection(playerId, { force });
      setError(false);
      return coins;
    } catch {
      setError(true);
      return null;
    }
  }, [playerId]);
  useEffect(() => { if (autoload && playerId) void reload(); }, [autoload, playerId, reload]);
  const coins = cachedCoins(playerId);
  return { coins: coins ?? [], loaded: !!coins, error, reload };
}

export interface ParkCoinGroup {
  readonly parkId: number | null;
  readonly parkName: string;
  readonly coins: CollectedRideCoin[];
}

/**
 * The All Parks index: coins grouped by park in the server's order (park,
 * then ride name). Coins without a park sit in a last "More coins" group.
 */
export function groupCoinsByPark(coins: readonly CollectedRideCoin[]): ParkCoinGroup[] {
  const groups = new Map<string, { parkId: number | null; parkName: string; coins: CollectedRideCoin[] }>();
  for (const coin of coins) {
    const parkId = typeof coin.park_id === 'number' ? coin.park_id : null;
    const key = parkId === null ? 'none' : String(parkId);
    if (!groups.has(key)) groups.set(key, { parkId, parkName: parkId === null ? 'More coins' : coin.park_name || 'Park', coins: [] });
    groups.get(key)!.coins.push(coin);
  }
  const ordered = [...groups.values()];
  return [...ordered.filter(group => group.parkId !== null), ...ordered.filter(group => group.parkId === null)];
}

/** Ready to power up with what the player owns right now. */
export function isUpgradeReady(coin: Pick<CollectedRideCoin, 'is_unlocked' | 'current_level' | 'max_level' | 'available_parts' | 'parts_to_next_level' | 'energy_to_next_level'>, energy: number): boolean {
  return coin.is_unlocked && coin.current_level < coin.max_level &&
    (coin.available_parts ?? 0) >= coin.parts_to_next_level && energy >= coin.energy_to_next_level;
}
