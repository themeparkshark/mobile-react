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
  return Skia.Image.MakeImageFromEncoded(data);
});

export function useRemoteImage(url: string | null | undefined): SkImage | null {
  const snapshot = useCallback(() => (url ? cache.peek(url) : null), [url]);
  const image = useSyncExternalStore(cache.subscribe, snapshot);
  useEffect(() => { if (url) cache.get(url); }, [url]);
  return image;
}

export function useFrightImage(url: string | null | undefined, fallback?: number | null): SkImage | null {
  const remote = useRemoteImage(url);
  const local = useImage(remote ? null : fallback ?? null);
  return remote ?? local;
}
