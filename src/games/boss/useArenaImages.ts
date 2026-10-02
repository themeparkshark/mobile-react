/**
 * Boss arena images, loaded once per app session into a module cache and never
 * disposed. `useImage` disposes its SkImage when its effect re-runs, and a
 * memoized Skia tree can still hold (and measure) the old one for a frame,
 * which crashed the simulator at a bout intermission. Static game art is
 * small, so one long-lived copy is the safe, simple answer.
 */
import { useEffect, useState } from 'react';
import { Image as RNImage } from 'react-native';
import { Skia, type SkImage } from '@shopify/react-native-skia';

const cache = new Map<number, SkImage>();
const inflight = new Map<number, Promise<SkImage | null>>();

function load(src: number): Promise<SkImage | null> {
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(src);
  if (pending) return pending;
  const uri = RNImage.resolveAssetSource(src)?.uri;
  const p = !uri ? Promise.resolve(null) : Skia.Data.fromURI(uri).then((d) => {
    const img = Skia.Image.MakeImageFromEncoded(d);
    if (img) cache.set(src, img);
    return img;
  }).catch(() => null).finally(() => inflight.delete(src));
  inflight.set(src, p);
  return p;
}

/** Loads every source; returns them keyed like the input (null until loaded). */
export function useArenaImages<K extends string>(sources: Record<K, number>): Record<K, SkImage | null> {
  const keys = Object.keys(sources) as K[];
  const snapshot = () => {
    const out = {} as Record<K, SkImage | null>;
    keys.forEach((k) => { out[k] = cache.get(sources[k]) ?? null; });
    return out;
  };
  const [imgs, setImgs] = useState(snapshot);
  const sig = keys.map((k) => sources[k]).join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(keys.map((k) => load(sources[k]))).then(() => {
      if (live) setImgs(snapshot());
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return imgs;
}

/** Pixel aspect (w/h) of a loaded image, read once at load, never at render. */
const aspects = new WeakMap<SkImage, number>();
export function aspectOf(img: SkImage | null, fallback = 1): number {
  if (!img) return fallback;
  let a = aspects.get(img);
  if (a === undefined) {
    a = img.width() / Math.max(1, img.height());
    aspects.set(img, a);
  }
  return a;
}
