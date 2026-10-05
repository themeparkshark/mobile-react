/**
 * One decoded Skia image per pin URL and drawn size, shared by every EnamelPin
 * (board card, sheet slot, trade-complete moment).
 *
 * Server pin art is 350 to 1350 px. Skia's encoded images decode lazily, at
 * full size, on the UI thread at first draw. Here each image is decoded once
 * on the JS thread and drawn into a raster surface at the size it is shown
 * (a few px buckets), so the UI thread only ever draws a small, ready bitmap.
 * Warm the board's images when it loads, and a pin's large size when it is held
 * or picked, so the moment starts with its pins in memory.
 */
import { FilterMode, MipmapMode, Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { PixelRatio } from 'react-native';

/** Drawn-size buckets in device px (board ~74 pt, slots ~100 pt, moment ~190 pt at 3x). */
const BUCKETS = [192, 320, 640] as const;
const MAX = 96;

const ready = new Map<string, SkImage>();
const pending = new Map<string, Promise<SkImage | null>>();
const encoded = new Map<string, Promise<SkImage | null>>();

export function bucketFor(sizePt: number): number {
  const px = sizePt * PixelRatio.get();
  return BUCKETS.find(b => b >= px) ?? BUCKETS[BUCKETS.length - 1];
}

function source(uri: string): Promise<SkImage | null> {
  let p = encoded.get(uri);
  if (!p) {
    p = Skia.Data.fromURI(uri).then(data => Skia.Image.MakeImageFromEncoded(data)).catch(() => null);
    encoded.set(uri, p);
    // The full-size source is only needed while its buckets are drawn.
    void p.then(() => setTimeout(() => encoded.delete(uri), 4000));
  }
  return p;
}

/** Decode once and draw at `bucket` px (longest side), keeping the aspect ratio. */
function draw(src: SkImage, bucket: number): SkImage | null {
  const w = src.width();
  const h = src.height();
  if (!w || !h) return null;
  const scale = Math.min(1, bucket / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  const surface = Skia.Surface.Make(dw, dh);
  if (!surface) return src;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  // Filtered + mipmapped downscale, so thin outlines stay smooth (no nearest-neighbour jaggies).
  surface.getCanvas().drawImageRectOptions(src, Skia.XYWHRect(0, 0, w, h), Skia.XYWHRect(0, 0, dw, dh), FilterMode.Linear, MipmapMode.Linear, paint);
  surface.flush();
  return surface.makeImageSnapshot().makeNonTextureImage();
}

function load(uri: string, bucket: number): Promise<SkImage | null> {
  const key = `${bucket}|${uri}`;
  const hit = ready.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (!p) {
    p = source(uri).then(src => {
      pending.delete(key);
      const image = src ? draw(src, bucket) : null;
      if (image) {
        if (ready.size >= MAX) {
          const oldest = ready.keys().next().value;
          if (oldest) ready.delete(oldest);
        }
        ready.set(key, image);
      }
      return image;
    }).catch(() => { pending.delete(key); return null; });
    pending.set(key, p);
  }
  return p;
}

/** Decode ahead of time at a drawn size in points (fire and forget). */
export function warmPinImages(uris: readonly (string | undefined)[], sizePt = 74): Promise<void> {
  const bucket = bucketFor(sizePt);
  return Promise.all(uris.filter((u): u is string => !!u).map(uri => load(uri, bucket))).then(() => undefined);
}

/** The shared image for a URL at a drawn size (null until it is ready). A hit refreshes its place in the cache. */
export function usePinImage(uri: string, sizePt: number): SkImage | null {
  const bucket = bucketFor(sizePt);
  const key = `${bucket}|${uri}`;
  const [image, setImage] = useState<SkImage | null>(() => ready.get(key) ?? null);
  useEffect(() => {
    let alive = true;
    const hit = ready.get(key);
    if (hit) {
      ready.delete(key);
      ready.set(key, hit);
      setImage(hit);
      return;
    }
    setImage(null);
    void load(uri, bucket).then(img => { if (alive) setImage(img); });
    return () => { alive = false; };
  }, [key, uri, bucket]);
  return image;
}
