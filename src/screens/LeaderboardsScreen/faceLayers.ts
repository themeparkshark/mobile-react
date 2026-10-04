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

const MAX_REFS = 240;
const refs = new Map<string, ImageRef>();
const pending = new Map<string, Promise<ImageRef | null>>();

/** Pixel width for a face drawn `points` wide, in 96 px buckets so a few sizes share one decode. */
export function faceBucket(points: number, scale = PixelRatio.get()): number {
  const px = Math.max(1, Math.ceil(points * scale));
  return Math.min(576, Math.ceil(px / 96) * 96);
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
  const request = ExpoImage.loadAsync({ uri }, { maxWidth: px })
    .then(ref => {
      refs.set(key, ref);
      while (refs.size > MAX_REFS) {
        const oldest = refs.keys().next().value;
        if (oldest === undefined) break;
        refs.delete(oldest);
      }
      return ref;
    })
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
  pending.clear();
}
