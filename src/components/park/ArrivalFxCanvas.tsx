/**
 * The park arrival's loose particles in ONE Skia canvas: two showers of blue,
 * white and gold confetti, the gold-and-white sparkle burst behind the name,
 * and the gold trail each today card leaves on its flight home. One picture
 * is recorded per frame on the UI thread from the stage's shared values (no
 * React renders, no per-piece native views: round 2 had about 55 animated
 * views here). The canvas starts below the map's HUD row, so confetti never
 * rains over the header counters or Ride Control. Counts come in already
 * capped by momentParticles (power budget, Battery Saver, Reduce Motion).
 */
import { Canvas, PaintStyle, Picture, Skia, createPicture, type SkCanvas, type SkPaint } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { GOLD_FX } from '../../ui/motionEasing';
import { BRAND } from '../../ui/tokens';
import { flyPoint } from './parkArrival';

type Point = { x: number; y: number };

export interface ConfettiPieceSpec {
  readonly x: number; readonly delay: number; readonly fall: number; readonly drift: number;
  readonly spin: number; readonly w: number; readonly color: string;
}

const CONFETTI_COLORS = [GOLD_FX.rays, BRAND.white, BRAND.blueBright, BRAND.gold, BRAND.sky, GOLD_FX.raysSoft];

/** Deterministic pieces (no Math.random in render): a seed makes the second shower different from the first. */
export function confettiPieces(count: number, width: number, fall: number, seed: number): ConfettiPieceSpec[] {
  return Array.from({ length: Math.max(0, count) }, (_, k) => {
    const i = k + seed;
    return {
      x: ((i * 61) % 97) / 97 * width,
      delay: ((i * 37) % 10) / 10 * 0.28,
      fall: fall * (0.55 + ((i * 23) % 40) / 100),
      drift: (i % 2 ? 1 : -1) * (14 + ((i * 17) % 22)),
      spin: (i % 2 ? 1 : -1) * (240 + ((i * 41) % 300)),
      w: 13 + (i % 3) * 4,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    };
  });
}

export function drawRain(canvas: SkCanvas, paint: SkPaint, ink: SkPaint, progress: number, pieces: readonly ConfettiPieceSpec[]) {
  'worklet';
  if (progress <= 0 || progress >= 1) return;
  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    const t = Math.max(0, Math.min(1, (progress - piece.delay) / (1 - piece.delay)));
    if (t <= 0 || t >= 1) continue;
    const alpha = t < 0.75 ? 1 : (1 - t) / 0.25;
    const x = piece.x + Math.sin(t * Math.PI * 3) * piece.drift;
    // Gravity: slow at the top, faster as it falls.
    const y = piece.fall * (0.35 * t + 0.65 * t * t);
    const h = piece.w * 0.6;
    canvas.save();
    canvas.translate(x, y);
    canvas.rotate(piece.spin * t, 0, 0);
    // The flutter: the piece turns over as it falls.
    canvas.scale(1, 0.25 + 0.75 * Math.abs(Math.cos(t * Math.PI * 4)));
    const rect = Skia.RRectXY(Skia.XYWHRect(-piece.w / 2, -h / 2, piece.w, h), 2, 2);
    paint.setColor(Skia.Color(piece.color));
    paint.setAlphaf(alpha);
    canvas.drawRRect(rect, paint);
    ink.setAlphaf(0.35 * alpha);
    canvas.drawRRect(rect, ink);
    canvas.restore();
  }
}

/** A four-point star (hand-drawn sparkle), unit size, centred on 0,0. */
function starPath() {
  'worklet';
  const p = Skia.Path.Make();
  p.moveTo(0, -1);
  p.quadTo(0.14, -0.14, 1, 0);
  p.quadTo(0.14, 0.14, 0, 1);
  p.quadTo(-0.14, 0.14, -1, 0);
  p.quadTo(-0.14, -0.14, 0, -1);
  p.close();
  return p;
}

function ArrivalFxCanvas({ width, height, top, rain, rain2, pieces, pieces2, burst, sparkles, burstAt, burstRadius,
  fly, targets, froms, stack }: {
  readonly width: number; readonly height: number;
  /** The canvas starts here (below the HUD row); everything is drawn in layer coordinates. */
  readonly top: number;
  readonly rain: SharedValue<number>; readonly rain2: SharedValue<number>;
  readonly pieces: readonly ConfettiPieceSpec[]; readonly pieces2: readonly ConfettiPieceSpec[];
  readonly burst: SharedValue<number>; readonly sparkles: number; readonly burstAt: Point; readonly burstRadius: number;
  readonly fly: readonly SharedValue<number>[]; readonly targets: SharedValue<(Point | null)[]>;
  readonly froms: readonly Point[]; readonly stack: Point;
}) {
  const canvasHeight = Math.max(1, height - top);
  // Sparkle directions, fixed per mount.
  const rays = useMemo(() => Array.from({ length: sparkles }, (_, i) => {
    const a = (i / Math.max(1, sparkles)) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
    return { dx: Math.cos(a), dy: Math.sin(a), reach: 0.62 + ((i * 7) % 5) / 12, size: 7 + (i % 3) * 3, gold: i % 3 !== 2 };
  }), [sparkles]);
  const fly0 = fly[0], fly1 = fly[1], fly2 = fly[2];
  const picture = useDerivedValue(() => createPicture(canvas => {
    canvas.translate(0, -top);
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const ink = Skia.Paint();
    ink.setAntiAlias(true);
    ink.setStyle(PaintStyle.Stroke);
    ink.setStrokeWidth(1);
    ink.setColor(Skia.Color('#05346e'));
    // Confetti falls from just under the HUD row.
    canvas.save();
    canvas.translate(0, top);
    drawRain(canvas, paint, ink, rain.value, pieces);
    drawRain(canvas, paint, ink, rain2.value, pieces2);
    canvas.restore();

    // The sparkle burst: stars fly out from behind the name, grow, then shrink and fade with a little gravity.
    const b = burst.value;
    if (b > 0 && b < 1 && rays.length > 0) {
      const star = starPath();
      const ease = 1 - (1 - b) * (1 - b);
      for (let i = 0; i < rays.length; i += 1) {
        const r = rays[i];
        const d = burstRadius * r.reach * ease;
        const x = burstAt.x + r.dx * d;
        const y = burstAt.y + r.dy * d * 0.7 + 40 * b * b;
        const s = r.size * (b < 0.3 ? b / 0.3 : 1 - (b - 0.3) / 0.7 * 0.7);
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(b * 90 * (i % 2 ? 1 : -1), 0, 0);
        canvas.scale(s, s);
        paint.setColor(Skia.Color(r.gold ? GOLD_FX.rays : BRAND.white));
        paint.setAlphaf(b < 0.7 ? 1 : (1 - b) / 0.3);
        canvas.drawPath(star, paint);
        canvas.restore();
      }
    }

    // Each card's gold trail on its flight home: a comet of soft gold dots behind it.
    const flights = [fly0.value, fly1.value, fly2.value];
    for (let c = 0; c < froms.length && c < 3; c += 1) {
      const f = flights[c];
      if (f <= 0 || f >= 1) continue;
      const target = targets.value[c] ?? null;
      const to = target ?? stack;
      const from = froms[c];
      for (let k = 1; k <= 6; k += 1) {
        const tf = f - k * 0.045;
        if (tf <= 0) break;
        const at = flyPoint(from.x, from.y, to.x, to.y, target !== null, tf);
        const fade = (1 - k / 7) * (f > 0.85 ? (1 - f) / 0.15 : 1);
        paint.setColor(Skia.Color(k % 2 ? GOLD_FX.rays : '#fff6cf'));
        paint.setAlphaf(0.85 * fade);
        canvas.drawCircle(at.x, at.y, 9 - k, paint);
      }
    }
  }, { width, height: canvasHeight + top }));
  return <Canvas pointerEvents="none" style={[styles.canvas, { top, width, height: canvasHeight }]}>
    <Picture picture={picture} />
  </Canvas>;
}

const styles = StyleSheet.create({ canvas: { position: 'absolute', left: 0 } });

export default memo(ArrivalFxCanvas);
