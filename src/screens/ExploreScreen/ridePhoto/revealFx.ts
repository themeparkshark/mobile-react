import { BlurStyle, PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode, vec, type SkCanvas } from '@shopify/react-native-skia';

/**
 * R7: the Legendary signature drawn in one Skia canvas (one picture a frame, nothing mounted per piece):
 * a soft 8-point star flash behind the medallion, two gold fireworks and three continuous curling ribbons.
 * House style: gold fills, a navy ink edge on the ribbons, white gloss. Every function is a worklet.
 */

const INK = '#1b3a5c';

/** A soft, glowing 8-point star: scales up and fades in about 300 ms (f 0..1). */
export function paintStarFlash(canvas: SkCanvas, cx: number, cy: number, r: number, f: number): void {
  'worklet';
  if (f <= 0 || f >= 1) return;
  const alpha = f < 0.25 ? f / 0.25 : (1 - f) / 0.75;
  // Built at a fixed size (100) and scaled by the canvas, so the blur sigma never changes frame to frame.
  const R = 100, rIn = R * 0.38;
  const path = Skia.Path.Make();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? R : rIn;
    if (i === 0) path.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else path.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  path.close();
  canvas.save();
  canvas.translate(cx, cy);
  canvas.rotate(f * 28, 0, 0);
  const k = (r * (0.45 + 0.75 * f)) / R;
  canvas.scale(k, k);
  const glow = Skia.Paint(); glow.setAntiAlias(true);
  glow.setColor(Skia.Color('#ffe27a')); glow.setAlphaf(0.75 * alpha);
  glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 12, true));
  canvas.drawPath(path, glow);
  const core = Skia.Paint(); core.setAntiAlias(true);
  core.setShader(Skia.Shader.MakeRadialGradient(vec(0, 0), R, [Skia.Color('#fffbe6'), Skia.Color('#ffd23f'), Skia.Color('rgba(255,210,63,0)')],
    [0, 0.45, 1], TileMode.Clamp));
  core.setAlphaf(alpha);
  canvas.drawPath(path, core);
  canvas.restore();
}

/** A firework about `size` across: a bright gold core, 12 tapered gold and white spokes, 8 glitter stars that hang. */
export function paintFirework(canvas: SkCanvas, x: number, y: number, size: number, p: number): void {
  'worklet';
  if (p <= 0 || p >= 1) return;
  const reach = size / 2;
  const coreA = (1 - p) * 0.95, coreR = reach * (0.25 + 0.55 * Math.min(1, p * 3.2));
  const core = Skia.Paint(); core.setAntiAlias(true);
  core.setShader(Skia.Shader.MakeRadialGradient(vec(x, y), coreR, [Skia.Color('#fff6cf'), Skia.Color('#ffc93b'), Skia.Color('rgba(255,170,30,0)')],
    [0, 0.4, 1], TileMode.Clamp));
  core.setAlphaf(coreA);
  canvas.drawCircle(x, y, coreR, core);
  const out = 1 - (1 - Math.min(1, p * 1.7)) ** 3;
  const fade = p > 0.55 ? (1 - p) / 0.45 : 1;
  const spoke = Skia.Paint(); spoke.setAntiAlias(true); spoke.setStyle(PaintStyle.Fill);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const long = i % 2 === 0;
    const tip = 8 + out * (long ? reach - 6 : reach - 16);
    const tail = Math.max(4, tip - (long ? 22 : 16) * (0.5 + 0.6 * (1 - p)));
    const w = long ? 3.6 : 3;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const path = Skia.Path.Make();
    path.moveTo(x + ca * tail + px * w, y + sa * tail + py * w);
    path.lineTo(x + ca * tip, y + sa * tip);
    path.lineTo(x + ca * tail - px * w, y + sa * tail - py * w);
    path.close();
    spoke.setColor(Skia.Color(long ? '#ffffff' : '#ffd23f'));
    spoke.setAlphaf(fade);
    canvas.drawPath(path, spoke);
  }
  if (p > 0.12) {
    const g = Skia.Paint(); g.setAntiAlias(true);
    const ga = p > 0.7 ? (1 - p) / 0.3 : 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const d = 6 + (1 - (1 - Math.min(1, p * 1.4)) ** 2) * (reach + 4);
      const gx = x + Math.sin(a) * d, gy = y - Math.cos(a) * d + p * p * 14;
      const tw = 2 + 2 * Math.sin(p * 18 + i) ** 2;
      g.setColor(Skia.Color(i % 2 ? '#fff1b8' : '#ffffff')); g.setAlphaf(ga);
      canvas.drawCircle(gx, gy, tw, g);
    }
  }
}

/**
 * A continuous curling ribbon unfurling from (x, y): one stroked path with a navy ink edge, a gold body and a
 * white gloss line, revealed along its length over the first ~40%, then drifting down and fading.
 */
export function paintRibbon(canvas: SkCanvas, x: number, y: number, angleDeg: number, curl: number, p: number, len = 150): void {
  'worklet';
  if (p <= 0 || p >= 1) return;
  const shown = Math.min(1, p * 2.6);
  const fall = p > 0.45 ? (p - 0.45) * (p - 0.45) * 160 : 0;
  const alpha = p > 0.8 ? (1 - p) / 0.2 : 1;
  const steps = 24, seg = len / steps, n = Math.max(2, Math.round(steps * shown));
  const path = Skia.Path.Make();
  let px = x, py = y + fall, th = (angleDeg * Math.PI) / 180;
  path.moveTo(px, py);
  for (let i = 0; i < n; i++) {
    th += curl * (0.06 + i * 0.012) + Math.sin(p * 9 + i * 0.5) * 0.02;
    px += Math.cos(th) * seg; py += Math.sin(th) * seg;
    path.lineTo(px, py);
  }
  const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke);
  ink.setStrokeCap(StrokeCap.Round); ink.setStrokeJoin(StrokeJoin.Round);
  ink.setColor(Skia.Color(INK)); ink.setStrokeWidth(13); ink.setAlphaf(alpha);
  canvas.drawPath(path, ink);
  const body = ink.copy(); body.setColor(Skia.Color('#ffc21a')); body.setStrokeWidth(9); body.setAlphaf(alpha);
  canvas.drawPath(path, body);
  const shade = ink.copy(); shade.setColor(Skia.Color('#e09200')); shade.setStrokeWidth(3); shade.setAlphaf(alpha * 0.8);
  canvas.save(); canvas.translate(0, 2.5); canvas.drawPath(path, shade); canvas.restore();
  const gloss = ink.copy(); gloss.setColor(Skia.Color('#ffffff')); gloss.setStrokeWidth(2.4); gloss.setAlphaf(alpha * 0.7);
  canvas.save(); canvas.translate(0, -2); canvas.drawPath(path, gloss); canvas.restore();
}
