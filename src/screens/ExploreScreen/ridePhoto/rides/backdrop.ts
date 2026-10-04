import { PaintStyle, Skia, StrokeCap, StrokeJoin, vec, type SkCanvas } from '@shopify/react-native-skia';
import { seeded, type RideKind, type SceneVariant } from './catalog';
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
  // Seeded offset: the hedge line never sits the same way twice.
  const start = -nearW * (0.1 + 0.6 * seeded(variant.seed, 23));
  for (let x = start; x < width; x += nearW - 4) drawImg(canvas, near, x, height - nearH, nearW, nearH, paint);
  return height - nearH;
}

/**
 * Each ride's own ground: hedges by the coaster; rocks, reeds and a mist band by the flume's pool;
 * a picket fence with bunting and paper lanterns around the teacups. Prop positions are seeded.
 * Returns the top of the ground line (for the season props).
 */
export function drawGround(canvas: SkCanvas, kind: RideKind, width: number, height: number, variant: SceneVariant, art: SceneArt): number {
  // One seeded foreground swap per ride: tulip beds by the coaster, a log pile by the flume, a hedge
  // instead of the fence around the teacups.
  const swap = seeded(variant.seed, 81) < 0.5;
  if (kind === 'coaster') {
    const top = drawHedge(canvas, width, height, variant, art);
    if (swap) drawTulips(canvas, width, height, variant);
    return top;
  }
  if (kind === 'teacups' && swap) return drawHedge(canvas, width, height, variant, art);
  const filter = Skia.ColorFilter.MakeMatrix(gradeMatrix(variant.sky, variant.golden));
  const fill = Skia.Paint(); fill.setAntiAlias(true); fill.setColorFilter(filter);
  const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeWidth(3);
  ink.setStrokeJoin(StrokeJoin.Round); ink.setStrokeCap(StrokeCap.Round); ink.setColorFilter(filter);
  const r = (salt: number) => seeded(variant.seed, salt);
  if (kind === 'flume') {
    const groundTop = height - Math.min(height * 0.1, 70);
    // Grass bank.
    fill.setColor(Skia.Color('#6cc04a'));
    const bank = Skia.Path.Make();
    bank.moveTo(0, groundTop + 10);
    for (let x = 0; x <= width; x += width / 6) bank.quadTo(x + width / 12, groundTop - 6, x + width / 6, groundTop + 8);
    bank.lineTo(width, height); bank.lineTo(0, height); bank.close();
    canvas.drawPath(bank, fill);
    ink.setColor(Skia.Color('#3d7a2a')); canvas.drawPath(bank, ink);
    // Reeds with cattail tops.
    const reeds = 5 + Math.floor(r(31) * 4);
    for (let i = 0; i < reeds; i++) {
      const x = (i + r(40 + i) * 0.8) * (width / reeds), h = 30 + r(50 + i) * 26;
      ink.setColor(Skia.Color('#3d7a2a')); ink.setStrokeWidth(4);
      canvas.drawLine(x, groundTop + 6, x + (r(60 + i) - 0.5) * 8, groundTop + 6 - h, ink);
      ink.setColor(Skia.Color('#7fd05a')); ink.setStrokeWidth(2);
      canvas.drawLine(x, groundTop + 6, x + (r(60 + i) - 0.5) * 8, groundTop + 6 - h, ink);
      fill.setColor(Skia.Color('#8a5a2b'));
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x + (r(60 + i) - 0.5) * 8 - 3, groundTop + 6 - h - 4, 6, 14), 3, 3), fill);
      ink.setColor(Skia.Color('#5a3a1a')); ink.setStrokeWidth(1.6);
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x + (r(60 + i) - 0.5) * 8 - 3, groundTop + 6 - h - 4, 6, 14), 3, 3), ink);
    }
    if (swap) {
      // A pile of cut logs (ring ends showing) instead of rocks.
      for (let i = 0; i < 3; i++) {
        const lx = width * (0.08 + 0.36 * i + r(90 + i) * 0.1), ly = height - 18 - (i % 2) * 8, lw = 44 + r(95 + i) * 18;
        fill.setColor(Skia.Color('#b57a43'));
        canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(lx, ly - 14, lw, 16), 8, 8), fill);
        ink.setColor(Skia.Color('#6e4321')); ink.setStrokeWidth(3);
        canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(lx, ly - 14, lw, 16), 8, 8), ink);
        fill.setColor(Skia.Color('#e8c58f')); canvas.drawCircle(lx + lw - 8, ly - 6, 7, fill);
        canvas.drawCircle(lx + lw - 8, ly - 6, 7, ink);
        ink.setStrokeWidth(1.5); canvas.drawCircle(lx + lw - 8, ly - 6, 3.5, ink);
      }
      return groundTop;
    }
    // Rounded rocks.
    const rocks = 3 + Math.floor(r(33) * 3);
    for (let i = 0; i < rocks; i++) {
      const x = r(70 + i) * width, w = 26 + r(80 + i) * 26, h = w * 0.6;
      const rect = Skia.XYWHRect(x - w / 2, height - h - 6 - r(90 + i) * 14, w, h);
      fill.setColor(Skia.Color('#a7a9b4')); canvas.drawOval(rect, fill);
      ink.setColor(Skia.Color('#5d6070')); ink.setStrokeWidth(3); canvas.drawOval(rect, ink);
      fill.setColor(Skia.Color('rgba(255,255,255,0.45)'));
      canvas.drawOval(Skia.XYWHRect(rect.x + w * 0.2, rect.y + h * 0.15, w * 0.3, h * 0.22), fill);
    }
    return groundTop;
  }
  // Teacups: a white picket fence with bunting and paper lanterns.
  const fenceTop = height - 54;
  const pickets = Math.ceil(width / 22) + 1;
  const off = r(35) * 22;
  for (let i = 0; i < pickets; i++) {
    const x = i * 22 - off;
    const p = Skia.Path.Make();
    p.moveTo(x, height); p.lineTo(x, fenceTop + 8); p.lineTo(x + 7, fenceTop); p.lineTo(x + 14, fenceTop + 8); p.lineTo(x + 14, height); p.close();
    fill.setColor(Skia.Color('#fffaf0')); canvas.drawPath(p, fill);
    ink.setColor(Skia.Color('#b9a38a')); ink.setStrokeWidth(2.5); canvas.drawPath(p, ink);
  }
  fill.setColor(Skia.Color('#fffaf0'));
  canvas.drawRect(Skia.XYWHRect(0, fenceTop + 18, width, 7), fill);
  ink.setColor(Skia.Color('#b9a38a')); canvas.drawRect(Skia.XYWHRect(0, fenceTop + 18, width, 7), ink);
  // Bunting string across the upper scene, with pastel flags.
  const y0 = height * (0.2 + r(36) * 0.06);
  const string = Skia.Path.Make();
  string.moveTo(-10, y0); string.quadTo(width / 2, y0 + 34, width + 10, y0);
  ink.setColor(Skia.Color('#8a6a4a')); ink.setStrokeWidth(2); canvas.drawPath(string, ink);
  const colors = ['#ff8fc4', '#ffd84a', '#8fd9ff', '#b98cff', '#7fe3a8'];
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9, x = -10 + (width + 20) * t, y = y0 + 34 * 2 * t * (1 - t);
    const flag = Skia.Path.Make();
    flag.moveTo(x - 9, y); flag.lineTo(x + 9, y); flag.lineTo(x, y + 16); flag.close();
    fill.setColor(Skia.Color(colors[(i + Math.floor(r(37) * 5)) % 5])); canvas.drawPath(flag, fill);
    ink.setColor(Skia.Color('#6a4a3a')); ink.setStrokeWidth(1.8); canvas.drawPath(flag, ink);
  }
  return fenceTop;
}

/** A row of tulips in front of the hedges (the coaster's seeded dressing swap). */
function drawTulips(canvas: SkCanvas, width: number, height: number, variant: SceneVariant) {
  const filter = Skia.ColorFilter.MakeMatrix(gradeMatrix(variant.sky, variant.golden));
  const stem = Skia.Paint(); stem.setAntiAlias(true); stem.setStyle(PaintStyle.Stroke); stem.setStrokeWidth(3);
  stem.setColor(Skia.Color('#3d7a2a')); stem.setColorFilter(filter);
  const petal = Skia.Paint(); petal.setAntiAlias(true); petal.setColorFilter(filter);
  const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeWidth(2); ink.setColorFilter(filter);
  const colors = ['#ff6f91', '#ffd84a', '#ff8a3d', '#b98cff'];
  for (let i = 0; i < 9; i++) {
    const x = (i + 0.5) * (width / 9) + (seeded(variant.seed, 100 + i) - 0.5) * 10, y = height - 10 - (i % 2) * 6;
    canvas.drawLine(x, y, x, y - 18, stem);
    const c = colors[(i + Math.floor(seeded(variant.seed, 99) * 4)) % 4];
    petal.setColor(Skia.Color(c));
    const cup = Skia.Path.Make();
    cup.moveTo(x - 6, y - 26); cup.lineTo(x - 3, y - 20); cup.lineTo(x, y - 27); cup.lineTo(x + 3, y - 20); cup.lineTo(x + 6, y - 26);
    cup.quadTo(x + 6, y - 15, x, y - 15); cup.quadTo(x - 6, y - 15, x - 6, y - 26); cup.close();
    canvas.drawPath(cup, petal);
    ink.setColor(Skia.Color('#7a2a3a')); canvas.drawPath(cup, ink);
  }
}

/** Halloween pumpkins on the hedge line, holiday bulbs on a garland. Simple outlined shapes in Alex's style. */
export function drawSeason(canvas: SkCanvas, width: number, height: number, variant: SceneVariant, hedgeTop: number, art: SceneArt): void {
  if (variant.season === 'halloween') {
    const fill = Skia.Paint(); fill.setAntiAlias(true);
    const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeWidth(3);
    [0.08 + 0.1 * seeded(variant.seed, 41), 0.42 + 0.12 * seeded(variant.seed, 42), 0.78 + 0.12 * seeded(variant.seed, 43)].forEach((fx, i) => {
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

/**
 * A far-plane landmark in the upper third of the photo crop, low contrast so the park reads before the
 * ride: a castle spire, a ferris wheel or a balloon cluster (seeded). Night adds the moon inside the crop.
 */
export function drawFarProps(canvas: SkCanvas, crop: { x: number; y: number; w: number; h: number }, variant: SceneVariant,
  track?: { xs: number[]; ys: number[] }, avoid: { x: number; y: number; w: number; h: number }[] = []): void {
  const r = (salt: number) => seeded(variant.seed, salt);
  const night = variant.sky === 'night', sunset = variant.sky === 'sunset';
  // How clear a point is of the track and of the boxes in front (camera, hub): the landmark and the moon
  // never sit behind them.
  const clearance = (x: number, y: number) => {
    let best = Infinity;
    if (track) for (let k = 0; k < track.xs.length; k += 2) best = Math.min(best, Math.hypot(track.xs[k] - x, track.ys[k] - y));
    for (const b of avoid) {
      const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dy = Math.max(b.y - y, 0, y - (b.y + b.h));
      best = Math.min(best, Math.hypot(dx, dy));
    }
    return best;
  };
  // The object sits at 15 to 25% of the photo's height, at the clearest of five slots (seeded tie-break).
  const midY = crop.y + crop.h * 0.2;
  const slots = [0.14, 0.32, 0.5, 0.68, 0.86].map(f => crop.x + crop.w * f);
  const s = crop.h * 0.11;
  const score = (x: number, y: number) => Math.min(clearance(x, y), s * 2.5) + r(51 + x) * s * 0.4;
  let cx = slots[0];
  for (const x of slots) if (score(x, midY) > score(cx, midY)) cx = x;
  const left = cx < crop.x + crop.w / 2;
  const base = midY + s * 1.15;
  const tone = night ? '#2c3f7c' : sunset ? '#a88bc0' : '#8fbfe6';
  const ink = night ? '#18224a' : sunset ? '#7e66a0' : '#5f93c4';
  const fill = Skia.Paint(); fill.setAntiAlias(true); fill.setColor(Skia.Color(tone));
  const line = Skia.Paint(); line.setAntiAlias(true); line.setStyle(PaintStyle.Stroke); line.setStrokeWidth(2.5);
  line.setColor(Skia.Color(ink)); line.setStrokeJoin(StrokeJoin.Round); line.setStrokeCap(StrokeCap.Round);
  const kind = Math.floor(r(52) * 3);
  if (kind === 0) {
    // Castle spire: a tower with a cone roof and a pennant, plus a shorter side tower.
    const t = Skia.Path.Make();
    t.addRect(Skia.XYWHRect(cx - s * 0.3, base - s * 1.4, s * 0.6, s * 1.4));
    t.addRect(Skia.XYWHRect(cx + s * 0.3, base - s * 0.9, s * 0.45, s * 0.9));
    canvas.drawPath(t, fill); canvas.drawPath(t, line);
    const roof = Skia.Path.Make();
    roof.moveTo(cx - s * 0.42, base - s * 1.4); roof.lineTo(cx, base - s * 2.3); roof.lineTo(cx + s * 0.42, base - s * 1.4); roof.close();
    roof.moveTo(cx + s * 0.24, base - s * 0.9); roof.lineTo(cx + s * 0.52, base - s * 1.45); roof.lineTo(cx + s * 0.8, base - s * 0.9); roof.close();
    canvas.drawPath(roof, fill); canvas.drawPath(roof, line);
    canvas.drawLine(cx, base - s * 2.3, cx, base - s * 2.7, line);
    if (night) {
      const lit = Skia.Paint(); lit.setColor(Skia.Color('#ffd86a'));
      canvas.drawRect(Skia.XYWHRect(cx - s * 0.08, base - s * 1.1, s * 0.16, s * 0.22), lit);
    }
  } else if (kind === 1) {
    // Ferris wheel: a rim, spokes and little gondolas.
    const rad = s * 0.95, wy = base - rad - s * 0.3;
    canvas.drawCircle(cx, wy, rad, line);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      canvas.drawLine(cx, wy, cx + Math.cos(a) * rad, wy + Math.sin(a) * rad, line);
      const g = Skia.Paint(); g.setAntiAlias(true); g.setColor(Skia.Color(night ? '#ffd86a' : tone));
      canvas.drawCircle(cx + Math.cos(a) * rad, wy + Math.sin(a) * rad, s * 0.12, g);
    }
    canvas.drawLine(cx, wy, cx - s * 0.5, base, line); canvas.drawLine(cx, wy, cx + s * 0.5, base, line);
  } else {
    // A balloon cluster drifting over the park.
    const colors = night ? ['#3b4a85', '#4a3b85', '#2f5f85'] : sunset ? ['#e8a3b8', '#f0c08a', '#b9a0d9'] : ['#ffb3c7', '#ffe08a', '#a8dcff'];
    for (let i = 0; i < 3; i++) {
      const bx = cx + (i - 1) * s * 0.45, by = base - s * (1.6 + (i % 2) * 0.3);
      const b = Skia.Paint(); b.setAntiAlias(true); b.setColor(Skia.Color(colors[i])); b.setAlphaf(0.75);
      canvas.drawOval(Skia.XYWHRect(bx - s * 0.28, by - s * 0.36, s * 0.56, s * 0.72), b);
      canvas.drawOval(Skia.XYWHRect(bx - s * 0.28, by - s * 0.36, s * 0.56, s * 0.72), line);
      canvas.drawLine(bx, by + s * 0.36, cx, base - s * 0.4, line);
    }
  }
  if (night) {
    // The moon, inside the crop, on the other side from the landmark.
    // At 18 to 25% of the photo's height, opposite the landmark, and never behind the track.
    const mr = crop.h * 0.05, my = crop.y + crop.h * 0.21;
    let mx = slots[left ? 4 : 0];
    for (const x of slots) {
      if (Math.abs(x - cx) < crop.w * 0.3) continue;
      if (Math.min(clearance(x, my), mr * 3) > Math.min(clearance(mx, my), mr * 3)) mx = x;
    }
    const halo = Skia.Paint(); halo.setAntiAlias(true);
    halo.setShader(Skia.Shader.MakeRadialGradient(vec(mx, my), mr * 3, [Skia.Color('rgba(255,244,210,0.35)'), Skia.Color('rgba(255,244,210,0)')], null, 0));
    canvas.drawCircle(mx, my, mr * 3, halo);
    const moon = Skia.Paint(); moon.setAntiAlias(true); moon.setColor(Skia.Color('#fff2c8'));
    canvas.drawCircle(mx, my, mr, moon);
    const rim = Skia.Paint(); rim.setAntiAlias(true); rim.setStyle(PaintStyle.Stroke); rim.setStrokeWidth(2.5); rim.setColor(Skia.Color('#e3c98a'));
    canvas.drawCircle(mx, my, mr, rim);
  }
}
