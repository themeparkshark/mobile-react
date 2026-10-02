/**
 * Current Quest image cache.
 *
 * Skia's `useImage` disposes its SkImage in an effect cleanup but keeps the
 * stale object in React state until the reload resolves. Any render (or UI
 * thread worklet) that touches that object in between calls width() on a
 * freed native image: the SIGSEGV in RNSkia::JsiSkImage::width seen when
 * entering Quick Run and on Fast Refresh.
 *
 * The game's art is about 40 small PNGs (under 10 MB decoded), so every image
 * is decoded once per app session and never disposed. A component gets null
 * until its image is ready and every draw site already null-guards.
 */
import { useEffect, useState } from 'react';
import { Image as RNImage } from 'react-native';
import { Skia, type SkImage } from '@shopify/react-native-skia';

type Source = number;

const ready = new Map<Source, SkImage>();
const pending = new Map<Source, Promise<SkImage | null>>();

function isUsable(img: SkImage | null | undefined): img is SkImage {
  if (!img) return false;
  try {
    return img.width() > 0 && img.height() > 0;
  } catch {
    return false;
  }
}

/** Decode (once) and cache. Resolves null if the asset cannot be decoded. */
export function loadCqImage(src: Source): Promise<SkImage | null> {
  const hit = ready.get(src);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(src);
  if (inflight) return inflight;
  const uri = RNImage.resolveAssetSource(src)?.uri;
  const p = (uri ? Skia.Data.fromURI(uri) : Promise.reject(new Error('no uri')))
    .then((data) => {
      const img = Skia.Image.MakeImageFromEncoded(data);
      if (!isUsable(img)) return null;
      ready.set(src, img);
      return img;
    })
    .catch(() => null)
    .finally(() => { pending.delete(src); });
  pending.set(src, p);
  return p;
}

/** Synchronous peek: the decoded image, or null while it is still loading. */
export function peekCqImage(src: Source): SkImage | null {
  return ready.get(src) ?? null;
}

/** Warm the cache (the hub calls this so a run's first frame has its art). */
export function preloadCqImages(srcs: Source[]): Promise<void> {
  return Promise.all(srcs.map(loadCqImage)).then(() => undefined);
}

/** Drop-in for Skia's useImage that never hands out a disposed image. */
export function useCqImage(src: Source): SkImage | null {
  const [img, setImg] = useState<SkImage | null>(() => peekCqImage(src));
  useEffect(() => {
    const hit = peekCqImage(src);
    if (hit) {
      if (hit !== img) setImg(hit);
      return undefined;
    }
    let alive = true;
    loadCqImage(src).then((loaded) => { if (alive) setImg(loaded); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  return img;
}

/** Every Skia sprite a run draws on its first frame (the hub warms these). */
export const CQ_RUN_ART: Source[] = [
  require('../../assets/games/current-quest/cq_shark_idle_swim.png'),
  require('../../assets/games/current-quest/cq_shark_swim_dash.png'),
  require('../../assets/games/current-quest/cq_shark_surf_ride.png'),
  require('../../assets/games/current-quest/cq_shark_bump_ouch.png'),
  require('../../assets/games/current-quest/cq_shark_cheer.png'),
  require('../../assets/games/current-quest/cq_shark_brace.png'),
  require('../../assets/games/current-quest/cq_shark_dizzy.png'),
  require('../../assets/games/current-quest/cq_shark_idle_swim_blink.png'),
  require('../../assets/games/current-quest/coral_a.png'),
  require('../../assets/games/current-quest/coral_b.png'),
  require('../../assets/games/current-quest/coral_c.png'),
  require('../../assets/games/current-quest/sandbar.png'),
  require('../../assets/games/current-quest/sandbar_wet.png'),
  require('../../assets/games/current-quest/foam_strip.png'),
  require('../../assets/games/current-quest/pearl.png'),
  require('../../assets/games/current-quest/golden_pearl.png'),
  require('../../assets/games/current-quest/chest_closed.png'),
  require('../../assets/games/current-quest/chest_open.png'),
  require('../../assets/games/current-quest/padlock.png'),
  require('../../assets/games/current-quest/current_chevron.png'),
  require('../../assets/games/current-quest/shell_socket.png'),
  require('../../assets/games/current-quest/shield_bubble.png'),
  require('../../assets/games/current-quest/life_ring_v2.png'),
  require('../../assets/games/current-quest/tide_medallion.png'),
];
