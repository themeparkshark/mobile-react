import { PaintStyle, Skia, StrokeCap, StrokeJoin, vec, type SkCanvas } from '@shopify/react-native-skia';
import type { SceneVariant } from './catalog';
import { drawBulb, drawCover, drawImg, spritePaint, gradeMatrix, type SceneArt } from './stage';

/**
 * Shared scenery: the painted sky backdrop for the variant's sky, the hedge
 * line, season decorations (static, recorded once), and the moving extras
 * (breezy clouds, a photobombing gull, night fireworks) as a worklet.
 */

const SKY_FALLBACK = { day: ['#58b6f5', '#bfe6ff'], sunset: ['#8f86d8', '#ffc58f'], night: ['#0b1636', '#2a2f6b'] } as const;

/** The far backdrop for the sky: painted art per sky (day, sunset, night), never a tint over the day art. */
export function drawSky(canvas: SkCanvas, width: number, height: number, variant: SceneVariant, art: SceneArt): void {
  const colors = SKY_FALLBACK[variant.sky];
  const paint = Skia.Paint();
  paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, 0), vec(0, height), colors.map(c => Skia.Color(c)), null, 0));
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
  const far = variant.sky === 'night' ? art.farNight ?? null : variant.sky === 'sunset' ? art.farSunset ?? null : art.far ?? null;
  const farH = height * 0.92;
  if (far) drawCover(canvas, far, 0, height - farH, width, farH, spritePaint(null));
  else if (variant.sky === 'night') drawNightSky(canvas, width, height * 0.6);
  if (variant.golden) {
    const glow = Skia.Paint();
    glow.setShader(Skia.Shader.MakeLinearGradient(vec(0, 0), vec(0, height), [Skia.Color('rgba(255,190,80,0.28)'), Skia.Color('rgba(255,150,60,0.05)')], null, 0));
    canvas.drawRect(Skia.XYWHRect(0, 0, width, height), glow);
  }
}

/** Procedural night (only if the painted night art is missing): moon with a halo and two sizes of stars. */
function drawNightSky(canvas: SkCanvas, width: number, skyH: number) {
  const moon = Skia.Paint(); moon.setAntiAlias(true);
  const mx = width * 0.8, my = skyH * 0.25, r = width * 0.07;
  moon.setShader(Skia.Shader.MakeRadialGradient(vec(mx, my), r * 3, [Skia.Color('rgba(255,248,220,0.35)'), Skia.Color('rgba(255,248,220,0)')], null, 0));
  canvas.drawCircle(mx, my, r * 3, moon);
  moon.setShader(null); moon.setColor(Skia.Color('#fff4d0')); canvas.drawCircle(mx, my, r, moon);
  const star = Skia.Paint(); star.setAntiAlias(true); star.setColor(Skia.Color('#fff8e0'));
  for (let i = 0; i < 16; i++) {
    const x = ((i * 0.6180339 + 0.13) % 1) * width, y = ((i * 0.3819 + 0.07) % 1) * skyH * 0.9;
    canvas.drawCircle(x, y, i % 3 === 0 ? 2.2 : 1.2, star);
  }
}

/** The hedge line along the bottom, over every footing. */
export function drawHedge(canvas: SkCanvas, width: number, height: number, variant: SceneVariant, art: SceneArt): number {
  const near = art.near ?? null;
  const nearH = Math.min(height * 0.16, width * 0.3), nearW = nearH * 5;
  const paint = spritePaint(gradeMatrix(variant.sky, variant.golden));
  for (let x = -nearW * 0.1; x < width; x += nearW - 4) drawImg(canvas, near, x, height - nearH, nearW, nearH, paint);
  return height - nearH;
}

/** Halloween pumpkins on the hedge line, holiday bulbs on a garland. Simple outlined shapes in Alex's style. */
export function drawSeason(canvas: SkCanvas, width: number, height: number, variant: SceneVariant, hedgeTop: number, art: SceneArt): void {
  if (variant.season === 'halloween') {
    const fill = Skia.Paint(); fill.setAntiAlias(true);
    const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeWidth(3);
    [0.1, 0.46, 0.83].forEach((fx, i) => {
      const r = width * (i === 1 ? 0.045 : 0.037), x = fx * width, y = hedgeTop + r * 1.2;
      fill.setColor(Skia.Color('#ff8a2b'));
      canvas.drawOval(Skia.XYWHRect(x - r * 1.2, y - r, r * 2.4, r * 2), fill);
      ink.setColor(Skia.Color('#a8470c'));
      canvas.drawOval(Skia.XYWHRect(x - r * 1.2, y - r, r * 2.4, r * 2), ink);
      canvas.drawLine(x, y - r, x, y + r * 0.9, ink);
      fill.setColor(Skia.Color('#3c8a2f'));
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x - 2.5, y - r - 7, 5, 9), 2, 2), fill);
      // Friendly face: two triangle eyes and a smile, glowing at night.
      fill.setColor(Skia.Color(variant.sky === 'night' ? '#ffe27a' : '#5a2a08'));
      const face = Skia.Path.Make();
      face.moveTo(x - r * 0.55, y - r * 0.05); face.lineTo(x - r * 0.3, y - r * 0.45); face.lineTo(x - r * 0.08, y - r * 0.05); face.close();
      face.moveTo(x + r * 0.08, y - r * 0.05); face.lineTo(x + r * 0.3, y - r * 0.45); face.lineTo(x + r * 0.55, y - r * 0.05); face.close();
      canvas.drawPath(face, fill);
      const smile = Skia.Path.Make();
      smile.moveTo(x - r * 0.5, y + r * 0.2); smile.quadTo(x, y + r * 0.75, x + r * 0.5, y + r * 0.2); smile.close();
      canvas.drawPath(smile, fill);
    });
  } else if (variant.season === 'holiday') {
    const wire = Skia.Paint(); wire.setAntiAlias(true); wire.setStyle(PaintStyle.Stroke); wire.setStrokeWidth(2.5);
    wire.setColor(Skia.Color('#2f6b3a'));
    const y0 = hedgeTop - 6;
    const garland = Skia.Path.Make();
    garland.moveTo(0, y0);
    for (let i = 0; i < 4; i++) garland.quadTo((i + 0.5) * width / 4, y0 + 18, (i + 1) * width / 4, y0);
    canvas.drawPath(garland, wire);
    for (let i = 0; i < 12; i++) {
      const fx = (i + 0.5) / 12, seg = fx * 4 - Math.floor(fx * 4);
      drawBulb(canvas, art.glow ?? null, fx * width, y0 + 18 * 4 * seg * (1 - seg) * 0.5 + 4, 9, variant.sky === 'night' ? 1 : 0.3);
      const dot = Skia.Paint(); dot.setAntiAlias(true); dot.setColor(Skia.Color(i % 2 ? '#e8473c' : '#3ee07a'));
      canvas.drawCircle(fx * width, y0 + 18 * 4 * seg * (1 - seg) * 0.5 + 4, 3.4, dot);
    }
  }
}

/**
 * Moving extras, drawn every frame and into the photo:
 * - breezy: two flat cloud puffs drifting (day and sunset)
 * - gull: crosses the frame around the camera moment, so it photobombs the print
 * - fireworks: a burst blooms behind the ride near the moment (night)
 */
export function paintExtras(canvas: SkCanvas, t: number, clock: number, frameT: number, width: number, height: number,
  sky: string, weather: string, photobomb: string, box: { x: number; y: number; w: number; h: number }): void {
  'worklet';
  if (weather === 'breezy' && sky !== 'night') {
    const fill = Skia.Paint(); fill.setAntiAlias(true); fill.setColor(Skia.Color(sky === 'sunset' ? '#ffe2d0' : '#ffffff'));
    const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeWidth(2.5);
    ink.setColor(Skia.Color(sky === 'sunset' ? '#e0a48a' : '#9fc9ea'));
    for (let i = 0; i < 2; i++) {
      const speed = 8 + i * 5;
      const x = ((clock * speed + i * width * 0.55) % (width + 160)) - 80;
      const y = height * (0.1 + i * 0.09);
      const s = 1 - i * 0.25;
      const cloud = Skia.Path.Make();
      cloud.addCircle(x, y, 18 * s); cloud.addCircle(x + 20 * s, y - 8 * s, 22 * s); cloud.addCircle(x + 42 * s, y, 17 * s);
      cloud.addRRect(Skia.RRectXY(Skia.XYWHRect(x - 10 * s, y, 66 * s, 14 * s), 7 * s, 7 * s));
      canvas.drawPath(cloud, ink);
      canvas.drawPath(cloud, fill);
    }
  }
  if (photobomb === 'gull') {
    // Crosses right to left, passing the window's top corner at the moment.
    const k = (t - frameT) * 2.2;
    if (k > -1 && k < 1) {
      const x = box.x + box.w * 0.7 - k * width * 0.6, y = box.y + box.h * 0.12 + Math.sin(k * 6) * 6;
      const flap = Math.sin(clock * 18) * 0.5 + 0.5;
      const wing = Skia.Path.Make();
      wing.moveTo(x - 16, y - 4 - flap * 8); wing.quadTo(x - 7, y - 6, x, y + 2); wing.quadTo(x + 7, y - 6, x + 16, y - 4 - flap * 8);
      const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeCap(StrokeCap.Round);
      ink.setStrokeJoin(StrokeJoin.Round); ink.setStrokeWidth(6); ink.setColor(Skia.Color('#4a5d78'));
      canvas.drawPath(wing, ink);
      ink.setStrokeWidth(3); ink.setColor(Skia.Color('#ffffff'));
      canvas.drawPath(wing, ink);
      const beak = Skia.Paint(); beak.setAntiAlias(true); beak.setColor(Skia.Color('#ffb02e'));
      canvas.drawCircle(x - 3, y + 2, 2.2, beak);
    }
  }
  if (photobomb === 'fireworks' && sky === 'night') {
    const age = (t - frameT) * 3 + 0.35;
    if (age > 0 && age < 1.2) {
      const cx = box.x + box.w * 0.5, cy = Math.max(30, box.y - box.h * 0.6);
      const r = 18 + 52 * Math.min(1, age);
      const fade = age < 0.8 ? 1 : 1 - (age - 0.8) / 0.4;
      const dot = Skia.Paint(); dot.setAntiAlias(true);
      const colors = ['#ffd84a', '#ff6fb5', '#7fe3ff'];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        dot.setColor(Skia.Color(colors[i % 3]));
        dot.setAlphaf(Math.max(0, fade));
        canvas.drawCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r + age * 6, 3.2, dot);
      }
    }
  }
}
