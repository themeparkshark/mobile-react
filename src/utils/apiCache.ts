import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@tps_cache:';
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

/**
 * Generate a deterministic cache key from URL + params.
 * Format: @tps_cache:{url}:{sorted_params_hash}
 */
function buildCacheKey(url: string, params?: Record<string, unknown>): string {
  const paramStr = params
    ? Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&')
    : '';
  return `${CACHE_PREFIX}${url}:${paramStr}`;
}

/**
 * Read a cached value directly (no network). Returns null if missing or expired.
 */
export async function getCached<T>(
  url: string,
  params?: Record<string, unknown>
): Promise<T | null> {
  try {
    const key = buildCacheKey(url, params);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttlMs) return null; // expired

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Save a value to cache.
 */
export async function setCache<T>(
  url: string,
  params: Record<string, unknown> | undefined,
  data: T,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  try {
    const key = buildCacheKey(url, params);
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttlMs };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * Clear all TPS cache entries.
 */
export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {
    // Non-fatal
  }
}
