import { PaintStyle, Skia, StrokeCap, StrokeJoin, createPicture, vec, type SkCanvas } from '@shopify/react-native-skia';
import { buildLut, sampleTrack, tAtProgress, uAtX, type TrackLut } from '../rideTrack';
import { drawHedge, drawSeason, drawSky, paintExtras } from './backdrop';
import {
  cameraRig, drawBulb, drawImg, drawRider, gradeMatrix, photoCrop, spritePaint,
  type BuildCtx, type PaintState, type RideData, type RideStage, type SceneArt,
} from './stage';

/**
 * Log flume: a slow clank up the lift, a float at the top, a fast slide down the
 * chute, and the camera moment is the SPLASH at the bottom, when the spray is
 * at its peak around the log. Same ms windows as every ride.
 */

// Lift on the left, the chute lands just left of centre, so the camera stands right of the splash.
const SHAPE: readonly (readonly [number, number])[] = [
  [-0.25, 0.74], [0.02, 0.74], [0.1, 0.74], [0.2, 0.24], [0.26, 0.17], [0.31, 0.17], [0.4, 0.76], [0.48, 0.8], [0.7, 0.8], [1.25, 0.8],
];
const CREST_X = 0.25, DROP_X = 0.32, BOTTOM_X = 0.41, FRAME_X = 0.45, STATION_X = 0.07;
export const BOAT_SCALE = 0.3;
/** log-boat.webp is about 3:1 after cleanup; the waterline sits at 78% of its height. */
export const BOAT_ASPECT = 211 / 640;
const WATERLINE = 0.72;
const SEAT_X = 0.46, SEAT_Y = 0.6;
const WOOD = '#c9874a', WOOD_INK = '#7a4a22', WATER = '#5fc8f0', WATER_INK = '#2a83b8', FOAM = '#e9fbff';

/** Pass progress: lift (slow), float, drop (accelerating), then the water drags it to a cruise. */
export function flumeProgress(t: number, uCrest: number, uDrop: number, uBottom: number): number {
  'worklet';
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.48) return uCrest * (x / 0.48);
  if (x < 0.56) return uCrest + (uDrop - uCrest) * ((x - 0.48) / 0.08);
  if (x < 0.68) { const r = (x - 0.56) / 0.12; return uDrop + (uBottom - uDrop) * (0.25 * r + 0.75 * r * r); }
  const r = (x - 0.68) / 0.32;
  return uBottom + (1 - uBottom) * (1 - (1 - r) ** 1.7);
}

export function buildFlume(ctx: BuildCtx): RideStage {
  const { width, height, top, spec, variant, art } = ctx;
  const band = { top: Math.max(top + 70, height * 0.3), height: height * 0.6 };
  const frameX = (FRAME_X + (variant.frameShift - 0.6) * 0.04) * width;
  const lut = buildLut(SHAPE, width, band, frameX, 160, (40 * Math.PI) / 180);
  const uCrest = uAtX(lut, CREST_X * width), uDrop = uAtX(lut, DROP_X * width), uBottom = uAtX(lut, BOTTOM_X * width);
  const progress = (t: number) => flumeProgress(t, uCrest, uDrop, uBottom);
  const uFrame = uAtX(lut, lut.frameX);
  const frameT = tAtProgress(progress, uFrame);
  const tHit = tAtProgress(progress, uBottom);
  const uStation = uAtX(lut, STATION_X * width);
  const stationT = tAtProgress(progress, uStation);
  const boatW = Math.round(width * BOAT_SCALE), boatH = Math.round(boatW * BOAT_ASPECT);
  const riderSize = Math.round(boatW * 0.5);

  const bw = boatW * 1.15, bh = boatH * WATERLINE + riderSize * 0.95 + 26;
  const box = { x: lut.frameX - bw / 2, y: lut.frameY - bh + 10, w: bw, h: bh };
  const cam = cameraRig(box, width, height, top);
  const crop = photoCrop(box, width, height, 0.75);
  const grade = gradeMatrix(variant.sky, variant.golden);
  const station = sampleTrack(lut, uStation);
  const seat = { x: station.x + boatW * (SEAT_X - 0.5), y: station.y - boatH * WATERLINE + boatH * SEAT_Y };
  const pool = { x: BOTTOM_X * width - width * 0.02, y: sampleTrack(lut, uBottom).y + 6, w: width * 0.5 };

  const backdrop = createPicture((canvas: SkCanvas) => {
    drawSky(canvas, width, height, variant, art);
    drawTrestle(canvas, lut, height, grade);
    const hedgeTop = drawHedge(canvas, width, height, variant, art);
    drawPool(canvas, pool, height, grade);
    drawTrough(canvas, lut, grade, 'back');
    drawSeason(canvas, width, height, variant, hedgeTop, art);
  }, { width, height });
  const foreground = createPicture((canvas: SkCanvas) => drawTrough(canvas, lut, grade, 'front'), { width, height });

  const lamps: number[] = [];
  for (let k = 6; k < lut.xs.length; k += 9) lamps.push(lut.xs[k], lut.ys[k] + 14);

  const data: RideData = {
    xs: lut.xs, ys: lut.ys, angles: lut.angles, uCrest, uDrop, uBottom, tHit, frameT, boatW, boatH, rider: riderSize,
    grade, width, height, sky: variant.sky, weather: variant.weather, photobomb: variant.photobomb, box, lamps,
    splashX: sampleTrack(lut, uBottom).x + boatW * 0.25, splashY: sampleTrack(lut, uBottom).y,
  };
  return {
    kind: 'flume', width, height, sky: variant.sky, frameT, stationT, box, cam, crop, seat, riderSize,
    backdrop, foreground, data, paint: paintFlume,
    emissive: variant.sky === 'night' ? paintFlumeLamps : null,
    spotlight: spec.litMs != null,
  };
}

export function paintFlume(canvas: SkCanvas, s: PaintState, d: RideData, art: SceneArt): void {
  'worklet';
  const lut = { xs: d.xs as number[], ys: d.ys as number[], angles: d.angles as number[] };
  if (!s.ghost) paintExtras(canvas, s.t, s.clock, d.frameT as number, d.width as number, d.height as number,
    d.sky as string, d.weather as string, d.photobomb as string, d.box as { x: number; y: number; w: number; h: number });
  const u = flumeProgress(s.t, d.uCrest as number, d.uDrop as number, d.uBottom as number);
  const p = sampleTrack(lut, u);
  const boatW = d.boatW as number, boatH = d.boatH as number;
  const paint = spritePaint(d.grade as number[], s.ghost ? 0.45 * s.alpha : s.alpha);
  // A bob on the water (not on the lift or the chute).
  const onWater = u < (d.uCrest as number) * 0.15 || u > (d.uBottom as number);
  const bob = onWater && !s.photo ? Math.sin(s.clock * 5.5) * 1.6 : 0;
  canvas.save();
  canvas.translate(p.x, p.y + bob);
  canvas.rotate(((p.angle + s.rock * 0.05) * 180) / Math.PI, 0, 0);
  canvas.translate(-boatW / 2, -boatH * WATERLINE);
  // The log, the find in its seat well, then the log's near wall over the find's lower half.
  drawImg(canvas, art.logBoat ?? null, 0, 0, boatW, boatH, paint);
  drawRider(canvas, art.rider ?? null, boatW * SEAT_X, boatH * SEAT_Y, d.rider as number, -p.angle * 0.35, s.riderIn, paint);
  drawImg(canvas, art.logBoatFront ?? null, 0, 0, boatW, boatH, paint);
  canvas.restore();
  if (s.ghost) return;
  // The splash: peaks at the camera moment, a crown of water plus droplets on arcs.
  const tHit = d.tHit as number, frameT = d.frameT as number;
  const age = (s.t - tHit) / Math.max(0.02, (frameT - tHit) * 2.2);
  if (age > 0 && age < 1.6) {
    const grow = age < 0.45 ? age / 0.45 : 1;
    const fade = age < 0.9 ? 1 : Math.max(0, 1 - (age - 0.9) / 0.7);
    const sx = d.splashX as number, sy = d.splashY as number;
    const w = boatW * 1.35 * (0.4 + 0.6 * grow), h = boatW * 0.85 * grow;
    const spray = spritePaint(d.grade as number[], fade);
    if (art.splash) drawImg(canvas, art.splash, sx - w / 2, sy - h * 0.92, w, h, spray);
    const drop = Skia.Paint(); drop.setAntiAlias(true); drop.setColor(Skia.Color(FOAM)); drop.setAlphaf(fade);
    const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeWidth(2);
    ink.setColor(Skia.Color(WATER_INK)); ink.setAlphaf(fade);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.12 + 0.76 * (i / 8));
      const v = boatW * (0.55 + 0.25 * ((i * 7) % 3) / 2);
      const k = Math.min(1.4, age);
      const x = sx + Math.cos(a) * v * k * (i % 2 ? 1 : -1) * 0.8;
      const y = sy - Math.sin(a) * v * k + 0.5 * boatW * 1.6 * k * k;
      const r = 3 + (i % 3);
      canvas.drawCircle(x, y, r, drop);
      canvas.drawCircle(x, y, r, ink);
    }
  }
}

/** Night: lanterns along the trough rail. */
export function paintFlumeLamps(canvas: SkCanvas, s: PaintState, d: RideData, art: SceneArt): void {
  'worklet';
  const lamps = d.lamps as number[];
  for (let i = 0; i < lamps.length / 2; i++) {
    const flicker = s.photo ? 1 : 0.8 + 0.2 * Math.sin(s.clock * 3 + i * 1.7);
    drawBulb(canvas, art.glow ?? null, lamps[i * 2], lamps[i * 2 + 1], 13, flicker);
  }
}

/** Chunky wooden A-frame trestles with X braces under the raised trough (reads as wood, never as a coaster). */
function drawTrestle(canvas: SkCanvas, lut: TrackLut, height: number, grade: number[]) {
  const paint = Skia.Paint(); paint.setAntiAlias(true); paint.setStyle(PaintStyle.Stroke); paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setColorFilter(Skia.ColorFilter.MakeMatrix(grade));
  const legs = Skia.Path.Make(), braces = Skia.Path.Make();
  for (const post of lut.posts) {
    if (post.y > height * 0.78) continue;
    const top = post.y + 22, spread = 16;
    legs.moveTo(post.x - 5, top); legs.lineTo(post.x - spread, height);
    legs.moveTo(post.x + 5, top); legs.lineTo(post.x + spread, height);
    for (let y = top + 10; y < height - 30; y += 46) {
      const k0 = (y - top) / (height - top), k1 = (y + 46 - top) / (height - top);
      const w0 = 5 + (spread - 5) * k0, w1 = 5 + (spread - 5) * k1;
      braces.moveTo(post.x - w0, y); braces.lineTo(post.x + w1, y + 46);
      braces.moveTo(post.x + w0, y); braces.lineTo(post.x - w1, y + 46);
    }
  }
  paint.setStrokeWidth(5.5); paint.setColor(Skia.Color(WOOD_INK)); canvas.drawPath(braces, paint);
  paint.setStrokeWidth(2.8); paint.setColor(Skia.Color('#b0703a')); canvas.drawPath(braces, paint);
  paint.setStrokeWidth(11); paint.setColor(Skia.Color(WOOD_INK)); canvas.drawPath(legs, paint);
  paint.setStrokeWidth(7); paint.setColor(Skia.Color(WOOD)); canvas.drawPath(legs, paint);
}

/** The splash pool: a wide oval of water with a foam rim. */
function drawPool(canvas: SkCanvas, pool: { x: number; y: number; w: number }, height: number, grade: number[]) {
  const rect = Skia.XYWHRect(pool.x - pool.w / 2, pool.y - 10, pool.w, Math.min(70, height - pool.y + 10));
  const fill = Skia.Paint(); fill.setAntiAlias(true); fill.setColorFilter(Skia.ColorFilter.MakeMatrix(grade));
  fill.setShader(Skia.Shader.MakeLinearGradient(vec(0, rect.y), vec(0, rect.y + rect.height), [Skia.Color('#7fd8f6'), Skia.Color('#3aa4d8')], null, 0));
  canvas.drawRRect(Skia.RRectXY(rect, 30, 30), fill);
  const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeWidth(3.5);
  ink.setColor(Skia.Color(WATER_INK)); ink.setColorFilter(Skia.ColorFilter.MakeMatrix(grade));
  canvas.drawRRect(Skia.RRectXY(rect, 30, 30), ink);
  ink.setStrokeWidth(2.5); ink.setColor(Skia.Color(FOAM));
  canvas.drawLine(rect.x + 24, rect.y + 6, rect.x + rect.width - 24, rect.y + 6, ink);
}

/**
 * The trough: a wide wooden channel of water along the path. 'back' draws the far wall, its
 * inside and the water the log floats on; 'front' draws the near wall over the log's hull.
 */
function drawTrough(canvas: SkCanvas, lut: TrackLut, grade: number[], side: 'back' | 'front') {
  const path = Skia.Path.MakeFromSVGString(lut.path) ?? Skia.Path.Make();
  const paint = Skia.Paint(); paint.setAntiAlias(true); paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeCap(StrokeCap.Butt); paint.setStrokeJoin(StrokeJoin.Round);
  paint.setColorFilter(Skia.ColorFilter.MakeMatrix(grade));
  const at = (dy: number) => { const p = path.copy(); p.offset(0, dy); return p; };
  if (side === 'back') {
    // Far wall rising above the water, with its own outline and a light top lip.
    paint.setStrokeWidth(30); paint.setColor(Skia.Color(WOOD_INK)); canvas.drawPath(at(-4), paint);
    paint.setStrokeWidth(24); paint.setColor(Skia.Color('#9a5f2e')); canvas.drawPath(at(-4), paint);
    paint.setStrokeWidth(3); paint.setColor(Skia.Color('#e3b37a')); canvas.drawPath(at(-17), paint);
    // Water: a bright band with a foam line.
    paint.setStrokeWidth(12); paint.setColor(Skia.Color(WATER_INK)); canvas.drawPath(at(4), paint);
    paint.setStrokeWidth(8); paint.setColor(Skia.Color(WATER)); canvas.drawPath(at(4), paint);
    paint.setStrokeWidth(2); paint.setColor(Skia.Color(FOAM)); canvas.drawPath(at(1), paint);
    return;
  }
  // Near wall: top lip at the waterline + 4, 20 pt deep.
  paint.setStrokeWidth(26); paint.setColor(Skia.Color(WOOD_INK)); canvas.drawPath(at(16), paint);
  paint.setStrokeWidth(20); paint.setColor(Skia.Color(WOOD)); canvas.drawPath(at(16), paint);
  paint.setStrokeWidth(3); paint.setColor(Skia.Color('rgba(255,230,190,0.85)')); canvas.drawPath(at(7.5), paint);
  // Plank seams.
  const seam = Skia.Paint(); seam.setAntiAlias(true); seam.setColor(Skia.Color(WOOD_INK));
  seam.setColorFilter(Skia.ColorFilter.MakeMatrix(grade));
  for (let k = 0; k < lut.xs.length; k += 5) {
    canvas.save();
    canvas.translate(lut.xs[k], lut.ys[k] + 16);
    canvas.rotate((lut.angles[k] * 180) / Math.PI, 0, 0);
    canvas.drawRect(Skia.XYWHRect(-1.2, -8, 2.4, 16), seam);
    canvas.restore();
  }
}
