import { useEffect, useState } from 'react';
import { Image as RNImage } from 'react-native';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { preloadCatchAudio } from './catchAudio';

/**
 * One decode per app session for everything the Ride Photo draws. A find that
 * can start a Ride Photo warms this up while it sits on the map, so the open
 * is a pure shared-value animation: no image, font or sound loads on the tap.
 */

export const RIDE_ART = {
  far: require('../../../../assets/images/ride-photo/scene-far.webp'),
  farNight: require('../../../../assets/images/ride-photo/scene-far-night.webp'),
  farSunset: require('../../../../assets/images/ride-photo/scene-far-sunset.webp'),
  glow: require('../../../../assets/images/ride-photo/glow.webp'),
  logBoat: require('../../../../assets/images/ride-photo/log-boat.webp'),
  logBoatFront: require('../../../../assets/images/ride-photo/log-boat-front.webp'),
  splash: require('../../../../assets/images/ride-photo/splash.webp'),
  cupBack: require('../../../../assets/images/ride-photo/teacup-back.webp'),
  cupFront: require('../../../../assets/images/ride-photo/teacup-front.webp'),
  teapot: require('../../../../assets/images/ride-photo/teapot-hub.webp'),
  near: require('../../../../assets/images/ride-photo/scene-near.webp'),
  carBack: require('../../../../assets/images/ride-photo/car-back.webp'),
  carFront: require('../../../../assets/images/ride-photo/car-front.webp'),
  camera: require('../../../../assets/images/ride-photo/camera.webp'),
  cameraPole: require('../../../../assets/images/ride-photo/camera-pole.webp'),
  grain: require('../../../../assets/images/ride-photo/grain.webp'),
  sparkle: require('../../../../assets/images/ride-photo/sparkle.webp'),
} as const;
export type RideArtKey = keyof typeof RIDE_ART;
export type RideArt = Record<RideArtKey, SkImage | null>;

const cache = new Map<string, SkImage>();
const pending = new Map<string, Promise<SkImage | null>>();

function keyOf(source: number | string): string {
  return typeof source === 'number' ? `m:${source}` : `u:${source}`;
}

/** Load and fully decode one image (bundled module id or URL). */
export function loadSkImage(source: number | string | null | undefined): Promise<SkImage | null> {
  if (source == null || source === '') return Promise.resolve(null);
  const key = keyOf(source);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const uri = typeof source === 'number' ? RNImage.resolveAssetSource(source)?.uri : source;
  const job = (uri ? Skia.Data.fromURI(uri) : Promise.reject(new Error('no uri')))
    .then(data => {
      const encoded = Skia.Image.MakeImageFromEncoded(data);
      // Force the decode now, off the open path (a raster copy draws without decoding).
      const decoded = encoded?.makeNonTextureImage() ?? encoded;
      if (decoded) cache.set(key, decoded);
      return decoded ?? null;
    })
    .catch(() => null)
    .finally(() => { pending.delete(key); });
  pending.set(key, job);
  return job;
}

export function cachedSkImage(source: number | string | null | undefined): SkImage | null {
  return source == null || source === '' ? null : cache.get(keyOf(source)) ?? null;
}

let artReady: Promise<void> | null = null;
/** Warm the scene art and sounds (idempotent). */
export function preloadRidePhoto(riders: (number | string | null | undefined)[] = []): Promise<void> {
  if (!artReady) {
    artReady = Promise.all([
      ...Object.values(RIDE_ART).map(source => loadSkImage(source)),
      preloadCatchAudio(),
    ]).then(() => undefined);
  }
  return Promise.all([artReady, ...riders.map(rider => loadSkImage(rider))]).then(() => undefined);
}

function currentArt(): RideArt {
  const out = {} as RideArt;
  (Object.keys(RIDE_ART) as RideArtKey[]).forEach(key => { out[key] = cachedSkImage(RIDE_ART[key]); });
  return out;
}

/** The decoded scene art; re-renders once when it finishes loading (normally already done). */
export function useRideArt(): RideArt {
  const [art, setArt] = useState<RideArt>(currentArt);
  useEffect(() => {
    if (Object.values(art).every(Boolean)) return;
    let alive = true;
    void preloadRidePhoto().then(() => { if (alive) setArt(currentArt()); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return art;
}

export function useRider(source: number | string | null | undefined): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(() => cachedSkImage(source));
  useEffect(() => {
    const hit = cachedSkImage(source);
    if (hit) { setImage(hit); return; }
    let alive = true;
    void loadSkImage(source).then(img => { if (alive) setImage(img); });
    return () => { alive = false; };
  }, [source]);
  return image;
}
