/**
 * One decoded Skia image per pin URL, shared by every EnamelPin (board card,
 * sheet slot, picker, trade-complete moment). Skia's own useImage loads and
 * decodes per instance; this decodes once and lets the moment start with its
 * pins already in memory (warm them when a pin is held or picked).
 */
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

const ready = new Map<string, SkImage>();
const pending = new Map<string, Promise<SkImage | null>>();
/** Keep the cache bounded (a board is 15 pins plus your pins). */
const MAX = 80;

function load(uri: string): Promise<SkImage | null> {
  const hit = ready.get(uri);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(uri);
  if (!p) {
    p = Skia.Data.fromURI(uri)
      .then(data => Skia.Image.MakeImageFromEncoded(data))
      .then(image => {
        pending.delete(uri);
        if (image) {
          if (ready.size >= MAX) {
            const oldest = ready.keys().next().value;
            if (oldest) ready.delete(oldest);
          }
          ready.set(uri, image);
        }
        return image;
      })
      .catch(() => { pending.delete(uri); return null; });
    pending.set(uri, p);
  }
  return p;
}

/** Decode ahead of time (fire and forget). */
export function warmPinImages(uris: readonly (string | undefined)[]): void {
  uris.forEach(uri => { if (uri) void load(uri); });
}

/** The shared decoded image for a URL (null until it is ready). */
export function usePinImage(uri: string): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(() => ready.get(uri) ?? null);
  useEffect(() => {
    let alive = true;
    const hit = ready.get(uri);
    if (hit) { setImage(hit); return; }
    setImage(null);
    void load(uri).then(img => { if (alive) setImage(img); });
    return () => { alive = false; };
  }, [uri]);
  return image;
}
