/**
 * Skia images for the fright map from server URLs, through one app-wide cache
 * (each URL is fetched and decoded once, failures retried at most once a
 * minute). While a URL loads or after it fails, the bundled fallback (if any)
 * draws instead.
 */
import { Skia, useImage, type SkImage } from '@shopify/react-native-skia';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { createImageCache } from './frightAssets';

const cache = createImageCache<SkImage>(async url => {
  const data = await Skia.Data.fromURI(url);
  const image = Skia.Image.MakeImageFromEncoded(data);
  // The encoded bytes are not needed once decoded.
  data.dispose?.();
  return image;
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
