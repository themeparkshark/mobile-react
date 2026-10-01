/**
 * SpriteAtlas: build a per-game / per-theme sprite atlas at mount from
 * already-decoded art (Alex's originals or gate-passed GPT Image frames).
 *
 *   const finn = useImage(require('.../finn_idle.png')); ...
 *   const atlas = useSpriteAtlas([finn, finnPeek, hole, lip], { cell: 256 });
 *   <Atlas image={atlas.image} sprites={atlas.rects} transforms={rsx} />
 *
 * One offscreen surface draw per mount, then a non-texture snapshot so the UI
 * thread can draw it. The atlas is released with the component (unmount).
 */

import { useMemo } from 'react';
import { Skia, type SkImage, type SkRect } from '@shopify/react-native-skia';
import { layoutAtlas, type AtlasLayout } from '../core/atlasLayout';

export interface SpriteAtlas {
  image: SkImage;
  /** Source rect per frame (the drawn area, not the padded cell). */
  rects: SkRect[];
  layout: AtlasLayout;
}

export interface SpriteAtlasOptions {
  cell?: number;
  maxSize?: number;
  /** Per-frame anchors ('base' for characters). */
  anchors?: Array<'base' | 'center'>;
}

export function buildSpriteAtlas(images: readonly SkImage[], opts: SpriteAtlasOptions = {}): SpriteAtlas | null {
  if (images.length === 0) return null;
  try {
    const layout = layoutAtlas(
      images.map((im, i) => ({ w: im.width(), h: im.height(), anchor: opts.anchors?.[i] ?? 'center' })),
      opts.cell ?? 256,
      opts.maxSize ?? 2048,
    );
    const surface = Skia.Surface.MakeOffscreen(layout.width, layout.height);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('transparent'));
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const rects: SkRect[] = [];
    images.forEach((im, i) => {
      const c = layout.cells[i];
      canvas.drawImageRect(im, Skia.XYWHRect(0, 0, im.width(), im.height()), Skia.XYWHRect(c.dx, c.dy, c.dw, c.dh), paint);
      rects.push(Skia.XYWHRect(c.dx, c.dy, c.dw, c.dh));
    });
    surface.flush();
    const image = surface.makeImageSnapshot().makeNonTextureImage();
    return { image, rects, layout };
  } catch {
    return null;
  }
}

/** Hook: builds once all images are decoded (null until then). */
export function useSpriteAtlas(images: ReadonlyArray<SkImage | null>, opts: SpriteAtlasOptions = {}): SpriteAtlas | null {
  const ready = images.every(Boolean);
  const { cell, maxSize } = opts;
  const anchorsKey = opts.anchors?.join(',') ?? '';
  return useMemo(() => {
    if (!ready) return null;
    return buildSpriteAtlas(images as SkImage[], { cell, maxSize, anchors: anchorsKey ? (anchorsKey.split(',') as Array<'base' | 'center'>) : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cell, maxSize, anchorsKey, ...images]);
}
