/**
 * Small, pre-decoded shark layers for Standings rows (v3 perf).
 *
 * Outfit and skin art is 1353 x 1530 px, and a row draws 2 to 6 of those
 * layers into a 40 pt circle. Drawing full-size art made every new row upload
 * and scale megabytes of texture on the UI thread: that was the scroll hitch
 * (Release capture: frames over 17 ms dropped from 9-119 per run to 2-5 with
 * faces off). Each layer is now decoded once at the size it is drawn
 * (Image.loadAsync with maxWidth, iOS), kept in a small LRU, and drawn from
 * that native image, so a row costs a few tiny textures.
 */
import { Image as ExpoImage, type ImageRef } from 'expo-image';
import { Image, PixelRatio } from 'react-native';

export type LayerSource = { readonly uri: string } | number;

/** Decoded bytes kept (about 24 MB: ~140 layers at the 192 px row size). */
const MAX_BYTES = 24 * 1024 * 1024;
/** Decodes running at once; the rest wait their turn, so a landing page never floods the JS thread. */
const MAX_RUNNING = 4;
const refs = new Map<string, ImageRef>();
const sizes = new Map<string, number>();
let bytes = 0;
const pending = new Map<string, Promise<ImageRef | null>>();
let running = 0;
const waiting: (() => void)[] = [];

function turn(): Promise<void> {
  if (running < MAX_RUNNING) { running += 1; return Promise.resolve(); }
  return new Promise(resolve => waiting.push(() => { running += 1; resolve(); }));
}

function done(): void {
  running = Math.max(0, running - 1);
  waiting.shift()?.();
}

function remember(key: string, ref: ImageRef, px: number): void {
  const size = Math.round(px * px * 1.13 * 4);
  refs.set(key, ref);
  sizes.set(key, size);
  bytes += size;
  while (bytes > MAX_BYTES && refs.size > 1) {
    const oldest = refs.keys().next().value as string;
    refs.delete(oldest);
    bytes -= sizes.get(oldest) ?? 0;
    sizes.delete(oldest);
    // No explicit release(): a face still on screen may hold this bitmap, and
    // releasing it would blank that face. Hermes GC frees it once unused.
  }
}

/** Pixel width for a face drawn `points` wide, in 96 px buckets so a few sizes share one decode. */
export function faceBucket(points: number, scale = PixelRatio.get()): number {
  const px = Math.max(1, Math.ceil(points * scale));
  // 768 covers the 120 pt card portrait at 3x (the hero face stays sharp).
  return Math.min(768, Math.ceil(px / 96) * 96);
}

function uriOf(source: LayerSource): string | null {
  if (typeof source === 'number') return Image.resolveAssetSource(source)?.uri ?? null;
  return source.uri || null;
}

const keyOf = (uri: string, px: number) => `${px}|${uri}`;

/** The decoded layer if it is ready, else null (and nothing is started). */
export function readyLayer(source: LayerSource, px: number): ImageRef | null {
  const uri = uriOf(source);
  if (!uri) return null;
  const key = keyOf(uri, px);
  const hit = refs.get(key);
  if (hit) {
    // LRU: a hit moves to the back of the line.
    refs.delete(key);
    refs.set(key, hit);
  }
  return hit ?? null;
}

/** Decode one layer at `px` wide (once; concurrent callers share the request). Null if it cannot load. */
export function loadLayer(source: LayerSource, px: number): Promise<ImageRef | null> {
  const uri = uriOf(source);
  if (!uri) return Promise.resolve(null);
  const key = keyOf(uri, px);
  const hit = refs.get(key);
  if (hit) return Promise.resolve(hit);
  const running = pending.get(key);
  if (running) return running;
  const request = turn()
    .then(() => ExpoImage.loadAsync({ uri }, { maxWidth: px }).finally(done))
    .then(ref => { remember(key, ref, px); return ref; })
    .catch(() => null)
    .finally(() => { pending.delete(key); });
  pending.set(key, request);
  return request;
}

/** Warm the layers of faces about to scroll in, at row size. */
export function prefetchLayers(sources: readonly LayerSource[], points: number): void {
  const px = faceBucket(points);
  sources.forEach(source => { void loadLayer(source, px); });
}

/** Tests and sign-out. */
export function resetFaceLayers(): void {
  refs.clear();
  sizes.clear();
  bytes = 0;
  pending.clear();
}
