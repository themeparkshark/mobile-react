/**
 * Skia images for the fright map from server URLs, through one app-wide cache
 * (each URL is fetched and decoded once, failures retried at most once a
 * minute). While a URL loads or after it fails, the bundled fallback (if any)
 * draws instead. Remote files go through expo-image's disk cache first, so a
 * park's cast downloads once per install, not once per launch.
 */
import { Skia, useImage, type SkImage } from '@shopify/react-native-skia';
import { Image as ExpoImage } from 'expo-image';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { createImageCache } from './frightAssets';

/**
 * expo-image cache policy for fright art. 'disk' rather than 'memory-disk':
 * Skia keeps the one decoded copy each sprite draws from (the cache below),
 * so expo-image's memory tier would only hold a second decoded bitmap of every
 * 1280 x 512 sheet.
 */
export const FRIGHT_CACHE_POLICY = 'disk' as const;

const isRemote = (url: string) => /^https?:\/\//i.test(url);

/** A local file for a remote URL (expo-image disk cache, downloading it once), else the URL itself. */
async function cachedUri(url: string): Promise<string> {
  if (!isRemote(url)) return url;
  try {
    let path = await ExpoImage.getCachePathAsync(url);
    if (!path && await ExpoImage.prefetch(url, { cachePolicy: FRIGHT_CACHE_POLICY })) path = await ExpoImage.getCachePathAsync(url);
    if (path) return path.startsWith('file://') ? path : `file://${path}`;
  } catch {
    // No cache entry: read straight from the network.
  }
  return url;
}

/** Warm the disk cache for these URLs (the current park's cast). Fire and forget, at most once per URL per launch. */
const prefetched = new Set<string>();
export function prefetchFrightImages(urls: readonly string[]): void {
  const todo = urls.filter(url => url && isRemote(url) && !prefetched.has(url));
  if (!todo.length) return;
  todo.forEach(url => prefetched.add(url));
  ExpoImage.prefetch(todo, { cachePolicy: FRIGHT_CACHE_POLICY }).catch(() => todo.forEach(url => prefetched.delete(url)));
}

async function decode(uri: string): Promise<SkImage | null> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  // The encoded bytes are not needed once decoded.
  data.dispose?.();
  return image;
}

const cache = createImageCache<SkImage>(async url => {
  const local = await cachedUri(url);
  if (local === url) return decode(url);
  // A bad cache file falls back to the network.
  try {
    const image = await decode(local);
    if (image) return image;
  } catch {
    // fall through
  }
  return decode(url);
}, Date.now, image => image.dispose?.());

// Release decoded images nobody has drawn for a minute (checked every 30 s while any image is held).
let sweeper: ReturnType<typeof setInterval> | null = null;
function ensureSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => {
    cache.sweep();
    if (cache.size() === 0 && sweeper) { clearInterval(sweeper); sweeper = null; }
  }, 30_000);
}

export function useRemoteImage(url: string | null | undefined): SkImage | null {
  const snapshot = useCallback(() => (url ? cache.peek(url) : null), [url]);
  const image = useSyncExternalStore(cache.subscribe, snapshot);
  useEffect(() => {
    if (!url) return;
    cache.retain(url);
    cache.get(url);
    ensureSweeper();
    return () => cache.release(url);
  }, [url]);
  return image;
}

/** Decoded fright images held right now (the dev perf probe logs it). */
export function frightImagesHeld(): number {
  return cache.size();
}

export function useFrightImage(url: string | null | undefined, fallback?: number | null): SkImage | null {
  const remote = useRemoteImage(url);
  const local = useImage(remote ? null : fallback ?? null);
  return remote ?? local;
}
