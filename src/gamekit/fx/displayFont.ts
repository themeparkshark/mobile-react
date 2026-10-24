/**
 * displayFont: the Shark display font as a Skia typeface, loaded once for the
 * whole app and kept (wow-games lane). Skia's useFont loads and disposes the
 * typeface on every mount, so a countdown mounting with a new game drew its
 * first numbers before the font arrived (a blank 3 and 2 on a busy phone).
 * Loading starts when this module is imported (with the games), so the 3 is
 * there on the first frame of every countdown.
 */

import { useEffect, useMemo, useState } from 'react';
import { Image } from 'react-native';
import { Skia, type SkTypeface } from '@shopify/react-native-skia';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SOURCE = require('../../../assets/fonts/shark-random-funnyness-2.ttf');

let typeface: SkTypeface | null = null;
let pending: Promise<SkTypeface | null> | null = null;

export function loadDisplayTypeface(): Promise<SkTypeface | null> {
  if (typeface) return Promise.resolve(typeface);
  if (!pending) {
    pending = (async () => {
      try {
        const uri = Image.resolveAssetSource(SOURCE)?.uri;
        if (!uri) return null;
        const data = await Skia.Data.fromURI(uri);
        typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
        return typeface;
      } catch {
        pending = null;
        return null;
      }
    })();
  }
  return pending;
}

/** The display font at `size`, ready on the first frame once any game has loaded it. */
export function useDisplayFont(size: number) {
  const [tf, setTf] = useState<SkTypeface | null>(typeface);
  useEffect(() => {
    if (tf) return undefined;
    let live = true;
    void loadDisplayTypeface().then((t) => { if (live && t) setTf(t); });
    return () => { live = false; };
  }, [tf]);
  return useMemo(() => (tf ? Skia.Font(tf, size) : null), [tf, size]);
}

// Start loading with the games so the first countdown already has its font.
void loadDisplayTypeface();
