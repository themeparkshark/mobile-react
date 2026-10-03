import { PaintStyle, Skia, StrokeCap, StrokeJoin, createPicture, type SkCanvas } from '@shopify/react-native-skia';
import { rideProgress, type RideTrack } from '../../ridePhoto';
import { buildLut, sampleTrack, tAtProgress, uAtX, type TrackLut } from '../rideTrack';
import { drawHedge, drawSeason, drawSky, paintExtras } from './backdrop';
import { COASTER_FRAME_AT, COASTER_MAX_PITCH, COASTER_SHAPES, COASTER_STATION_X } from './shapes';
import {
  cameraRig, drawBulb, drawImg, drawRider, gradeMatrix, photoCrop, spritePaint,
  type BuildCtx, type PaintState, type RideData, type RideStage, type SceneArt,
} from './stage';
import { seeded } from './catalog';

/**
 * Coaster: the camera moment is at the bottom of the drop. A slow lift, a fast
 * drop, then the run-out past the camera. Epic and Legendary run a 2-car train.
 */

export const CAR_SCALE = 0.21;
export const CAR_ASPECT = 199 / 310;
/** Seat bottom-centre as a fraction of the car box. */
export const SEAT = { x: 0.393, y: 0.5 };
/** The rail line sits this far down the car sprite (between the running wheels and the upstops). */
export const RAIL_AT = 0.842;

// Shapes, frame positions and the pitch clamp live in shapes.ts (tested: no car ever sits off its rail).
const SHAPES = COASTER_SHAPES;
const FRAME_AT = COASTER_FRAME_AT;
const STATION_X = COASTER_STATION_X;

export function carSize(width: number) {
  const w = Math.round(width * CAR_SCALE);
  return { w, h: Math.round(w * CAR_ASPECT), rider: Math.round(w * 0.6) };
}

const RAIL = '#e8473c', RAIL_INK = '#7d1b14', TIE = '#7d1b14';
const LATTICE = '#fff5e1', LATTICE_INK = '#b98a58';

export function buildCoaster(ctx: BuildCtx): RideStage {
  const { width, height, top, spec, tier, variant, art } = ctx;
  const track: RideTrack = spec.track;
  const band = { top: Math.max(top + 70, height * 0.3), height: height * 0.6 };
  const lut = buildLut(SHAPES[track], width, band, (FRAME_AT[track] + (variant.frameShift - 0.6) * 0.04) * width, 160, COASTER_MAX_PITCH);
  const progress = (t: number) => rideProgress(track, t);
  const uFrame = uAtX(lut, lut.frameX);
  const frameT = tAtProgress(progress, uFrame);
  const uStation = uAtX(lut, width * STATION_X);
  const stationT = tAtProgress(progress, uStation);
  const car = carSize(width);
  const cars = tier >= 4 ? 2 : 1;
  // Arc-length gap between the cars of a train, as u.
  const totalLen = lut.xs.reduce((sum, x, i) => (i === 0 ? 0 : sum + Math.hypot(x - lut.xs[i - 1], lut.ys[i] - lut.ys[i - 1])), 0);
  const gapU = (car.w * 0.98) / totalLen;

  // The lit window: the whole lead car with its rider fits inside.
  const bw = car.w * (cars > 1 ? 1.45 : 1.45), bh = car.h * RAIL_AT + car.rider * 0.95 + 14;
  const box = { x: lut.frameX - bw / 2, y: lut.frameY - bh + 12, w: bw, h: bh };
  const cam = cameraRig(box, width, height, top, false, seeded(variant.seed, 47) < 0.4 ? 'hang' : 'pole');
  const crop = photoCrop(box, width, height, 0.75);
  const grade = gradeMatrix(variant.sky, variant.golden);
  const station = sampleTrack(lut, uStation);
  const seat = { x: station.x + car.w * (SEAT.x - 0.5), y: station.y - car.h * RAIL_AT + car.h * SEAT.y };

  const backdrop = createPicture((canvas: SkCanvas) => {
    drawSky(canvas, width, height, variant, art);
    drawLattice(canvas, lut, height, grade);
    const hedgeTop = drawHedge(canvas, width, height, variant, art);
    drawStation(canvas, station.x, station.y, car.w, height, grade);
    drawRails(canvas, lut, grade);
    drawSeason(canvas, width, height, variant, hedgeTop, art);
  }, { width, height });

  // Bulbs along the rail for the night chase (every 8th sample).
  const bulbs: number[] = [];
  for (let k = 4; k < lut.xs.length; k += 7) { bulbs.push(lut.xs[k], lut.ys[k] - 9); }

  const data: RideData = {
    xs: lut.xs, ys: lut.ys, angles: lut.angles, track, cars, gapU, carW: car.w, carH: car.h, rider: car.rider,
    grade, frameT, width, height, sky: variant.sky, weather: variant.weather, photobomb: variant.photobomb,
    box, bulbs,
  };
  return {
    kind: 'coaster', width, height, sky: variant.sky, variant, frameT, stationT, box, cam, crop, seat, riderSize: car.rider,
    backdrop, foreground: null, data, paint: paintCoaster,
    vehicleAt: t => sampleTrack(lut, rideProgress(track, t)),
    emissive: variant.sky === 'night' ? paintCoasterBulbs : null,
    spotlight: spec.litMs != null,
  };
}

export function paintCoaster(canvas: SkCanvas, s: PaintState, d: RideData, art: SceneArt): void {
  'worklet';
  const xs = d.xs as number[], ys = d.ys as number[], angles = d.angles as number[];
  const lut = { xs, ys, angles };
  const carW = d.carW as number, carH = d.carH as number, size = d.rider as number;
  if (!s.ghost) paintExtras(canvas, s.t, s.clock, d.frameT as number, d.width as number, d.height as number,
    d.sky as string, d.weather as string, d.photobomb as string, d.box as { x: number; y: number; w: number; h: number });
  const u = rideProgress(d.track as RideTrack, s.t);
  const paint = spritePaint(d.grade as number[], s.ghost ? 0.45 * s.alpha : s.alpha);
  const cars = d.cars as number;
  // Trailer first (behind), then the lead car with the find.
  for (let i = cars - 1; i >= 0; i--) {
    const p = sampleTrack(lut, u - i * (d.gapU as number));
    canvas.save();
    canvas.translate(p.x, p.y);
    canvas.rotate(((p.angle + (i === 0 ? s.rock * 0.055 : 0)) * 180) / Math.PI, 0, 0);
    if (!s.ghost) {
      const shadow = Skia.Paint(); shadow.setAntiAlias(true); shadow.setColor(Skia.Color('rgba(22,58,102,0.22)'));
      shadow.setAlphaf(0.22 * s.alpha);
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-carW * 0.42, -2, carW * 0.84, 6), 3, 3), shadow);
    }
    canvas.translate(-carW / 2, -carH * RAIL_AT);
    drawImg(canvas, art.carBack ?? null, 0, 0, carW, carH, paint);
    if (i === 0) drawRider(canvas, art.rider ?? null, carW * SEAT.x, carH * SEAT.y, size, -p.angle * 0.3, s.riderIn, paint, 1, d.sky === 'night' && !s.ghost);
    drawImg(canvas, art.carFront ?? null, 0, 0, carW, carH, paint);
    canvas.restore();
  }
}

/** Warm bulbs chasing along the rail at about 6 bulbs a second (night). */
export function paintCoasterBulbs(canvas: SkCanvas, s: PaintState, d: RideData, art: SceneArt): void {
  'worklet';
  const bulbs = d.bulbs as number[];
  const n = bulbs.length / 2;
  const head = s.photo ? 0 : Math.floor(s.clock * 6);
  for (let i = 0; i < n; i++) {
    const on = (i + head) % 4 === 0 ? 1 : 0.45;
    drawBulb(canvas, art.glow ?? null, bulbs[i * 2], bulbs[i * 2 + 1], 14, on);
  }
}

/** Lattice supports: cream legs with a darker outline and X braces; the hedge covers the footings. */
function drawLattice(canvas: SkCanvas, lut: TrackLut, height: number, grade: number[]) {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setColorFilter(Skia.ColorFilter.MakeMatrix(grade));
  const legs = Skia.Path.Make(), braces = Skia.Path.Make();
  for (const post of lut.posts) {
    if (post.y > height * 0.94) continue;
    const top = post.y + 8, bottom = height, half = 7;
    legs.moveTo(post.x - half * 0.4, top); legs.lineTo(post.x - half, bottom);
    legs.moveTo(post.x + half * 0.4, top); legs.lineTo(post.x + half, bottom);
    for (let y = top + 18; y < bottom - 10; y += 26) {
      const k0 = (y - top) / (bottom - top), k1 = (y + 26 - top) / (bottom - top);
      const w0 = half * 0.4 + (half - half * 0.4) * k0, w1 = half * 0.4 + (half - half * 0.4) * k1;
      braces.moveTo(post.x - w0, y); braces.lineTo(post.x + w1, y + 26);
      braces.moveTo(post.x + w0, y); braces.lineTo(post.x - w1, y + 26);
    }
  }
  paint.setStrokeWidth(7); paint.setColor(Skia.Color(LATTICE_INK)); canvas.drawPath(legs, paint);
  paint.setStrokeWidth(3.5); paint.setColor(Skia.Color(LATTICE)); canvas.drawPath(legs, paint);
  paint.setStrokeWidth(3.8); paint.setColor(Skia.Color(LATTICE_INK)); canvas.drawPath(braces, paint);
  paint.setStrokeWidth(1.6); paint.setColor(Skia.Color(LATTICE)); canvas.drawPath(braces, paint);
}

/** A little station platform (and a striped sign) where the car waits for the find. */
function drawStation(canvas: SkCanvas, x: number, railY: number, carW: number, height: number, grade: number[]) {
  // The platform sits under the flat stretch of rail only.
  const w = carW * 1.25, deckY = railY + 6, left = x - w / 2;
  const fill = Skia.Paint(); fill.setAntiAlias(true); fill.setColorFilter(Skia.ColorFilter.MakeMatrix(grade));
  const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(PaintStyle.Stroke); ink.setStrokeWidth(3.5);
  ink.setStrokeJoin(StrokeJoin.Round); ink.setColorFilter(Skia.ColorFilter.MakeMatrix(grade));
  // Deck and posts down to the ground.
  fill.setColor(Skia.Color('#fff5e1'));
  canvas.drawRect(Skia.XYWHRect(left + 8, deckY, 8, height - deckY), fill);
  canvas.drawRect(Skia.XYWHRect(left + w - 16, deckY, 8, height - deckY), fill);
  ink.setColor(Skia.Color('#b98a58'));
  canvas.drawRect(Skia.XYWHRect(left + 8, deckY, 8, height - deckY), ink);
  canvas.drawRect(Skia.XYWHRect(left + w - 16, deckY, 8, height - deckY), ink);
  fill.setColor(Skia.Color('#3d7fd6'));
  const deck = Skia.RRectXY(Skia.XYWHRect(left, deckY, w, 14), 5, 5);
  canvas.drawRRect(deck, fill);
  ink.setColor(Skia.Color('#1d3f75')); canvas.drawRRect(deck, ink);
  // A small striped sign on the left post (no awning: the rail never runs through the station's roof).
  const signY = deckY - carW * 0.62;
  fill.setColor(Skia.Color('#fff5e1'));
  canvas.drawRect(Skia.XYWHRect(left + 2, signY, 5, deckY - signY), fill);
  ink.setColor(Skia.Color('#b98a58'));
  canvas.drawRect(Skia.XYWHRect(left + 2, signY, 5, deckY - signY), ink);
  const sign = Skia.RRectXY(Skia.XYWHRect(left - 12, signY - 18, 34, 20), 6, 6);
  fill.setColor(Skia.Color('#e8473c')); canvas.drawRRect(sign, fill);
  ink.setColor(Skia.Color(RAIL_INK)); canvas.drawRRect(sign, ink);
  fill.setColor(Skia.Color('#fff5e1'));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(left - 6, signY - 12, 22, 4), 2, 2), fill);
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(left - 6, signY - 6, 14, 4), 2, 2), fill);
}

/** Ties and the two-tone rail tube over the hedge line. */
function drawRails(canvas: SkCanvas, lut: TrackLut, grade: number[]) {
  const rail = Skia.Path.MakeFromSVGString(lut.path) ?? Skia.Path.Make();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setColorFilter(Skia.ColorFilter.MakeMatrix(grade));
  const shadow = rail.copy(); shadow.offset(0, 9);
  paint.setStrokeWidth(16); paint.setColor(Skia.Color('rgba(22,58,102,0.10)')); canvas.drawPath(shadow, paint);
  const fill = Skia.Paint(); fill.setAntiAlias(true); fill.setColor(Skia.Color(TIE));
  fill.setColorFilter(Skia.ColorFilter.MakeMatrix(grade));
  for (let k = 0; k < lut.xs.length; k += 3) {
    canvas.save();
    canvas.translate(lut.xs[k], lut.ys[k]);
    canvas.rotate((lut.angles[k] * 180) / Math.PI, 0, 0);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-2.5, -8, 5, 16), 2.5, 2.5), fill);
    canvas.restore();
  }
  paint.setStrokeWidth(12); paint.setColor(Skia.Color(RAIL_INK)); canvas.drawPath(rail, paint);
  paint.setStrokeWidth(7); paint.setColor(Skia.Color(RAIL)); canvas.drawPath(rail, paint);
  const gloss = rail.copy(); gloss.offset(0, -1.8);
  paint.setStrokeWidth(1.6); paint.setColor(Skia.Color('rgba(255,255,255,0.45)')); canvas.drawPath(gloss, paint);
}
