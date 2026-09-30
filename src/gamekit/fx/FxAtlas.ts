/**
 * FxAtlas.ts: the shared studio FX atlas, built once at runtime.
 *
 * One 1024x512 texture (8 x 4 cells of 128 px) so every particle in a game is
 * a single <Atlas> draw call. Cells come from two sources:
 *   - Existing art in the app (Alex's coin, star and sparkle, the queue-kit
 *     outlined particles, the map FX splash and bubble). Reused as drawn.
 *   - Tiny procedural FX primitives (dots, rings, droplets, streaks,
 *     confetti rects, shards, puffs) drawn white with the house navy cartoon
 *     outline so they tint cleanly and read as the same hand-drawn family.
 *     These are FX shapes, not icons or characters (art rule).
 *
 * Games can pass their own Alex-style FX sheet made by the GPT Image pipeline
 * (same 128 px grid, same indices) and it replaces the procedural cells.
 */

import { useMemo } from 'react';
import {
  Skia,
  useImage,
  PaintStyle,
  StrokeCap,
  StrokeJoin,
  TileMode,
  type SkCanvas,
  type SkImage,
  type SkRect,
} from '@shopify/react-native-skia';
import { FX_SPRITE, FX_SPRITE_COUNT } from '../core/particles';

export const FX_CELL = 128;
export const FX_COLS = 8;
const PAD = 8;
const INK = '#05346e';

export interface FxAtlas {
  image: SkImage;
  /** Source rect per sprite index. */
  rects: SkRect[];
  cell: number;
}

/** Source rect of a sprite index in an 8-column 128 px grid. */
export function fxCellRect(index: number): SkRect {
  const col = index % FX_COLS;
  const row = Math.floor(index / FX_COLS);
  return Skia.XYWHRect(col * FX_CELL, row * FX_CELL, FX_CELL, FX_CELL);
}

function cellOrigin(index: number): { x: number; y: number } {
  return { x: (index % FX_COLS) * FX_CELL, y: Math.floor(index / FX_COLS) * FX_CELL };
}

function fill(color: string) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  return p;
}

function stroke(color: string, width: number) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(width);
  p.setStrokeJoin(StrokeJoin.Round);
  p.setStrokeCap(StrokeCap.Round);
  p.setColor(Skia.Color(color));
  return p;
}

/** Fill white + navy outline: the cartoon look for tintable primitives. */
function inked(canvas: SkCanvas, path: ReturnType<typeof Skia.Path.Make>, outline = 7, fillColor = '#ffffff') {
  canvas.drawPath(path, stroke(INK, outline));
  canvas.drawPath(path, fill(fillColor));
}

function starPath(cx: number, cy: number, points: number, outer: number, inner: number, rot = -Math.PI / 2) {
  const p = Skia.Path.Make();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.close();
  return p;
}

function drawImageCell(canvas: SkCanvas, image: SkImage | null, index: number, scaleX = 1) {
  if (!image) return false;
  const o = cellOrigin(index);
  const w = image.width();
  const h = image.height();
  const box = FX_CELL - PAD * 2;
  const s = Math.min(box / w, box / h);
  const dw = w * s * scaleX;
  const dh = h * s;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(0, 0, w, h),
    Skia.XYWHRect(o.x + (FX_CELL - dw) / 2, o.y + (FX_CELL - dh) / 2, dw, dh),
    paint,
  );
  return true;
}

function drawProcedural(canvas: SkCanvas, index: number) {
  const o = cellOrigin(index);
  const c = FX_CELL / 2;
  const cx = o.x + c;
  const cy = o.y + c;
  const R = c - PAD - 4;
  switch (index) {
    case FX_SPRITE.dot: {
      const p = Skia.Path.Make();
      p.addCircle(cx, cy, R * 0.8);
      inked(canvas, p, 9);
      return;
    }
    case FX_SPRITE.softDot:
    case FX_SPRITE.ember: {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      const core = index === FX_SPRITE.ember ? '#ffe07a' : '#ffffff';
      paint.setShader(Skia.Shader.MakeRadialGradient({ x: cx, y: cy }, R, [Skia.Color(core), Skia.Color('rgba(255,255,255,0)')], [0.15, 1], TileMode.Clamp));
      canvas.drawCircle(cx, cy, R, paint);
      return;
    }
    case FX_SPRITE.ring: {
      canvas.drawCircle(cx, cy, R - 6, stroke(INK, 16));
      canvas.drawCircle(cx, cy, R - 6, stroke('#ffffff', 9));
      return;
    }
    case FX_SPRITE.streak: {
      const p = Skia.Path.Make();
      p.addRRect(Skia.RRectXY(Skia.XYWHRect(o.x + PAD + 4, cy - 9, FX_CELL - PAD * 2 - 8, 18), 9, 9));
      inked(canvas, p, 6);
      return;
    }
    case FX_SPRITE.speedLine: {
      const p = Skia.Path.Make();
      p.moveTo(o.x + PAD, cy);
      p.lineTo(o.x + FX_CELL - PAD - 10, cy - 6);
      p.quadTo(o.x + FX_CELL - PAD, cy, o.x + FX_CELL - PAD - 10, cy + 6);
      p.close();
      inked(canvas, p, 4);
      return;
    }
    case FX_SPRITE.droplet: {
      // Teardrop pointing +x (aligned to velocity).
      const p = Skia.Path.Make();
      p.moveTo(cx + R, cy);
      p.cubicTo(cx + R * 0.2, cy - R * 0.62, cx - R * 0.95, cy - R * 0.55, cx - R * 0.55, cy);
      p.cubicTo(cx - R * 0.95, cy + R * 0.55, cx + R * 0.2, cy + R * 0.62, cx + R, cy);
      p.close();
      inked(canvas, p, 7, '#7fd6f2');
      const hl = Skia.Path.Make();
      hl.addOval(Skia.XYWHRect(cx - R * 0.45, cy - R * 0.28, R * 0.35, R * 0.18));
      canvas.drawPath(hl, fill('#ffffff'));
      return;
    }
    case FX_SPRITE.glint:
    case FX_SPRITE.sparkle: {
      const p = starPath(cx, cy, 4, R, R * 0.26, -Math.PI / 2);
      inked(canvas, p, 6, index === FX_SPRITE.sparkle ? '#ffe07a' : '#ffffff');
      return;
    }
    case FX_SPRITE.star: {
      inked(canvas, starPath(cx, cy, 5, R, R * 0.46), 8);
      return;
    }
    case FX_SPRITE.impactStar: {
      inked(canvas, starPath(cx, cy, 9, R, R * 0.58, -Math.PI / 2 + 0.2), 8);
      return;
    }
    case FX_SPRITE.inkBlob: {
      const p = Skia.Path.Make();
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = R * (0.72 + 0.18 * Math.sin(i * 2.7) + 0.1 * Math.cos(i * 5.1));
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      p.close();
      canvas.drawPath(p, fill('#ffffff'));
      return;
    }
    case FX_SPRITE.puff: {
      const p = Skia.Path.Make();
      p.addCircle(cx - R * 0.35, cy + R * 0.12, R * 0.45);
      p.addCircle(cx + R * 0.35, cy + R * 0.12, R * 0.45);
      p.addCircle(cx, cy - R * 0.2, R * 0.55);
      // Outline every lobe first, then fill: inner outlines disappear.
      canvas.drawPath(p, stroke(INK, 6));
      canvas.drawPath(p, fill('#ffffff'));
      return;
    }
    case FX_SPRITE.shard: {
      const p = Skia.Path.Make();
      p.moveTo(cx - R * 0.2, cy - R);
      p.lineTo(cx + R * 0.7, cy + R * 0.3);
      p.lineTo(cx - R * 0.6, cy + R * 0.8);
      p.close();
      inked(canvas, p, 7);
      return;
    }
    case FX_SPRITE.heart: {
      const p = Skia.Path.Make();
      p.moveTo(cx, cy + R * 0.8);
      p.cubicTo(cx - R * 1.2, cy - R * 0.1, cx - R * 0.6, cy - R * 1.0, cx, cy - R * 0.35);
      p.cubicTo(cx + R * 0.6, cy - R * 1.0, cx + R * 1.2, cy - R * 0.1, cx, cy + R * 0.8);
      p.close();
      inked(canvas, p, 7, '#ff6b5c');
      return;
    }
    default:
      break;
  }
  // Confetti frames 16..19: rect foreshortened by frame.
  if (index >= FX_SPRITE.confetti && index < FX_SPRITE.confetti + 4) {
    const f = index - FX_SPRITE.confetti;
    const w = R * 1.1 * [1, 0.66, 0.34, 0.1][f];
    const p = Skia.Path.Make();
    p.addRRect(Skia.RRectXY(Skia.XYWHRect(cx - w / 2, cy - R * 0.55, Math.max(4, w), R * 1.1), 4, 4));
    inked(canvas, p, 6);
    return;
  }
  // Ribbon curl frames 20..23.
  if (index >= FX_SPRITE.ribbon && index < FX_SPRITE.ribbon + 4) {
    const f = index - FX_SPRITE.ribbon;
    const k = [1, 0.66, 0.34, 0.12][f];
    const p = Skia.Path.Make();
    p.moveTo(cx - R * k, cy - R * 0.6);
    p.cubicTo(cx + R * k, cy - R * 0.4, cx - R * k, cy + R * 0.4, cx + R * k, cy + R * 0.6);
    canvas.drawPath(p, stroke(INK, 20));
    canvas.drawPath(p, stroke('#ffffff', 12));
  }
}

const SOURCES = {
  starArt: require('../../assets/games/gamekit/particle-star.png'),
  sparkArt: require('../../assets/games/gamekit/particle-spark.png'),
  bubble: require('../../assets/games/gamekit/particle-bubble.png'),
  coin: require('../../../assets/images/coingold.png'),
  splash: require('../../../assets/images/map/fx/splash@3x.png'),
  sparkle: require('../../../assets/images/map/fx/sparkle@3x.png'),
};

export type FxAtlasImages = Partial<Record<keyof typeof SOURCES, SkImage | null>>;

/** Build the atlas texture (call once; the result is shareable across threads). */
export function buildFxAtlas(images: FxAtlasImages, override?: SkImage | null): FxAtlas | null {
  const rects: SkRect[] = [];
  for (let i = 0; i < FX_SPRITE_COUNT; i++) rects.push(fxCellRect(i));
  if (override) return { image: override, rects, cell: FX_CELL };
  try {
    const surface = Skia.Surface.MakeOffscreen(FX_CELL * FX_COLS, FX_CELL * Math.ceil(FX_SPRITE_COUNT / FX_COLS));
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('transparent'));
    for (let i = 0; i < FX_SPRITE_COUNT; i++) {
      let drawn = false;
      switch (i) {
        case FX_SPRITE.starArt: drawn = drawImageCell(canvas, images.starArt ?? null, i); break;
        case FX_SPRITE.sparkArt: drawn = drawImageCell(canvas, images.sparkArt ?? null, i); break;
        case FX_SPRITE.bubble: drawn = drawImageCell(canvas, images.bubble ?? null, i); break;
        case FX_SPRITE.coin: drawn = drawImageCell(canvas, images.coin ?? null, i); break;
        case FX_SPRITE.splash: drawn = drawImageCell(canvas, images.splash ?? null, i); break;
        case FX_SPRITE.sparkle: drawn = drawImageCell(canvas, images.sparkle ?? null, i); break;
        default:
          if (i >= FX_SPRITE.coinFlip && i < FX_SPRITE.coinFlip + 4) {
            drawn = drawImageCell(canvas, images.coin ?? null, i, [1, 0.7, 0.36, 0.12][i - FX_SPRITE.coinFlip]);
          }
      }
      if (!drawn) {
        // Procedural primitive (or fallback when an art file is unavailable).
        const fallback = i === FX_SPRITE.starArt ? FX_SPRITE.star
          : i === FX_SPRITE.sparkArt ? FX_SPRITE.glint
          : i === FX_SPRITE.bubble || i === FX_SPRITE.coin || (i >= FX_SPRITE.coinFlip && i < FX_SPRITE.coinFlip + 4) ? FX_SPRITE.dot
          : i === FX_SPRITE.splash ? FX_SPRITE.droplet
          : i;
        if (fallback !== i) {
          canvas.save();
          const from = cellOrigin(fallback);
          const to = cellOrigin(i);
          canvas.translate(to.x - from.x, to.y - from.y);
          drawProcedural(canvas, fallback);
          canvas.restore();
        } else {
          drawProcedural(canvas, i);
        }
      }
    }
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    // Texture-backed images belong to one thread; the atlas is drawn on the UI thread.
    return { image: snapshot.makeNonTextureImage(), rects, cell: FX_CELL };
  } catch {
    return null;
  }
}

/**
 * Hook: load the art and build the shared atlas once per mount. Returns null
 * until the images decode (particles simply wait a frame or two).
 */
export function useFxAtlas(override?: SkImage | null): FxAtlas | null {
  const starArt = useImage(SOURCES.starArt);
  const sparkArt = useImage(SOURCES.sparkArt);
  const bubble = useImage(SOURCES.bubble);
  const coin = useImage(SOURCES.coin);
  const splash = useImage(SOURCES.splash);
  const sparkle = useImage(SOURCES.sparkle);
  const ready = !!(starArt && sparkArt && bubble && coin && splash && sparkle);
  return useMemo(() => {
    if (override) return buildFxAtlas({}, override);
    if (!ready) return null;
    return buildFxAtlas({ starArt, sparkArt, bubble, coin, splash, sparkle });
  }, [override, ready, starArt, sparkArt, bubble, coin, splash, sparkle]);
}
