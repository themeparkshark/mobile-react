/**
 * A gold-and-white burst drawn in one Skia canvas on the UI thread: an
 * optional thick gold ring with a white inner ring spreading out, and up to
 * 12 hand-drawn four-point stars flying out, growing, then falling and fading
 * with a little gravity. Driven by one shared progress (0 to 1, one pass), so
 * it lands on the same frame as the rest of its moment. The count comes in
 * already capped by momentParticles (power budget, Battery Saver, Reduce
 * Motion: 0 draws nothing). Used by the shelf landing, the row complete and
 * the First coin today! ribbon.
 */
import { Canvas, PaintStyle, Picture, Skia, createPicture, type SkCanvas } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { GOLD_FX } from '../../ui/motionEasing';

/** One star of a burst (precomputed on JS, read by the worklet). */
export interface BurstStar { dx: number; dy: number; reach: number; size: number; gold: boolean; spin: number }

/** The stars of a burst: `count` evenly spread (a second wave sits on the half-step angles). */
export function burstStars(count: number, starSize: number, delayed = 0): BurstStar[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const a = ((i + (delayed > 0 ? 0.5 : 0)) / Math.max(1, count)) * Math.PI * 2;
    return { dx: Math.cos(a), dy: Math.sin(a), reach: 0.7 + ((i * 7) % 5) / 14, size: starSize * (0.75 + (i % 3) * 0.22), gold: i % 3 !== 1, spin: i % 2 ? 1 : -1 };
  });
}

/**
 * Draws one burst (ring plus stars) centred on (cx, cy) at progress `raw` (0..1) into a Skia
 * canvas. A worklet, so a moment can draw several bursts and its other layers into one canvas.
 */
export function drawBurst(canvas: SkCanvas, raw: number, cx: number, cy: number, stars: readonly BurstStar[],
  radius: number, ring: number, delayed: number): void {
  'worklet';
  canvas.save();
  canvas.translate(cx, cy);
  drawBurstAtOrigin(canvas, raw, 0, stars, radius, ring, delayed);
  canvas.restore();
}

function drawBurstAtOrigin(canvas: SkCanvas, raw: number, c: number, stars: readonly BurstStar[],
  radius: number, ring: number, delayed: number): void {
  'worklet';
    const b = delayed > 0 ? (raw - delayed) / (1 - delayed) : raw;
    if (b <= 0 || b >= 1) return;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    if (ring > 0) {
      // The ring: fast out (ease-out), thinning as it spreads.
      const r = ring * (1 + 1.1 * (1 - (1 - b) * (1 - b)));
      const stroke = Skia.Paint();
      stroke.setAntiAlias(true);
      stroke.setStyle(PaintStyle.Stroke);
      stroke.setStrokeWidth(Math.max(1, 7 * (1 - b)));
      stroke.setColor(Skia.Color(GOLD_FX.rays));
      stroke.setAlphaf(1 - b);
      canvas.drawCircle(c, c, r, stroke);
      stroke.setStrokeWidth(Math.max(1, 3.5 * (1 - b)));
      stroke.setColor(Skia.Color('#ffffff'));
      stroke.setAlphaf(0.9 * (1 - b));
      canvas.drawCircle(c, c, r * 0.82, stroke);
    }
    if (stars.length === 0) return;
    const star = Skia.Path.Make();
    star.moveTo(0, -1);
    star.quadTo(0.14, -0.14, 1, 0);
    star.quadTo(0.14, 0.14, 0, 1);
    star.quadTo(-0.14, 0.14, -1, 0);
    star.quadTo(-0.14, -0.14, 0, -1);
    star.close();
    const out = 1 - Math.pow(1 - b, 3);
    const pop = b < 0.22 ? b / 0.22 : 1 - (b - 0.22) * 0.75;
    for (let i = 0; i < stars.length; i += 1) {
      const s = stars[i];
      const d = radius * s.reach * out;
      canvas.save();
      canvas.translate(c + s.dx * d, c + s.dy * d + 26 * b * b);
      canvas.rotate(s.spin * 120 * b, 0, 0);
      const k = s.size * Math.max(0, pop);
      canvas.scale(k, k);
      paint.setColor(Skia.Color(s.gold ? GOLD_FX.rays : '#ffffff'));
      paint.setAlphaf(b < 0.65 ? 1 : (1 - b) / 0.35);
      canvas.drawPath(star, paint);
      canvas.restore();
    }
}

function BurstCanvas({ progress, count, radius, ring = 0, starSize = 12, x, y, delayed = 0 }: {
  readonly progress: SharedValue<number>;
  readonly count: number;
  /** How far the stars fly (pt). */
  readonly radius: number;
  /** Ring start radius (pt); 0 draws no ring. */
  readonly ring?: number;
  readonly starSize?: number;
  /** The burst's centre in the parent's coordinates. */
  readonly x: number;
  readonly y: number;
  /** A second wave: the stars start this far into the progress (0..0.5) and sit on the half-step angles. */
  readonly delayed?: number;
}) {
  const box = Math.ceil((radius + starSize * 2 + ring * 1.2) * 2 + 20);
  const c = box / 2;
  const stars = useMemo(() => burstStars(count, starSize, delayed), [count, starSize, delayed]);
  const picture = useDerivedValue(() => createPicture(canvas => {
    drawBurstAtOrigin(canvas, progress.value, c, stars, radius, ring, delayed);
  }, { width: box, height: box }));
  if (count <= 0 && ring <= 0) return null;
  return <Canvas pointerEvents="none" style={[styles.canvas, { left: x - c, top: y - c, width: box, height: box }]}>
    <Picture picture={picture} />
  </Canvas>;
}

const styles = StyleSheet.create({ canvas: { position: 'absolute' } });

export default memo(BurstCanvas);
