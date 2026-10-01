/**
 * imageCache: Whack's SkImage loader with a module-level cache.
 *
 * Skia's useImage disposes the old image when its source changes (a theme
 * switch on PLAY AGAIN, the boss art between Bursts). The board's per-frame
 * SkPicture worklet can still hold the old image for a frame, and drawing a
 * disposed image aborts the app. Cached images here are never disposed, so a
 * source change is always safe; only themes actually played are decoded.
 */

import { useEffect, useState } from 'react';
import { loadData, Skia, type SkImage } from '@shopify/react-native-skia';

const cache = new Map<number, SkImage>();
const pending = new Map<number, Promise<SkImage | null>>();

export function loadCachedImage(src: number): Promise<SkImage | null> {
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(src);
  if (!p) {
    p = loadData(src, (d) => Skia.Image.MakeImageFromEncoded(d)).then((img) => {
      if (img) cache.set(src, img);
      pending.delete(src);
      return img;
    }).catch(() => {
      pending.delete(src);
      return null;
    });
    pending.set(src, p);
  }
  return p;
}

/** Like useImage, but the image is cached and never disposed. */
export function useCachedImage(src: number | null | undefined): SkImage | null {
  const [img, setImg] = useState<SkImage | null>(() => (src != null ? cache.get(src) ?? null : null));
  useEffect(() => {
    let alive = true;
    if (src == null) {
      setImg(null);
      return undefined;
    }
    const hit = cache.get(src);
    if (hit) {
      setImg(hit);
      return undefined;
    }
    void loadCachedImage(src).then((i) => { if (alive) setImg(i); });
    return () => { alive = false; };
  }, [src]);
  return img;
}
