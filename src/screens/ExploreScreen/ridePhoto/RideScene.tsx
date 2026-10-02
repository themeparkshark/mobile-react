import { memo, useMemo } from 'react';
import {
  Circle, Group, Image as SkImage, LinearGradient, Path, Picture, RadialGradient, Rect, RoundedRect, Skia, createPicture,
  vec, StrokeCap, StrokeJoin, PaintStyle, type SkImage as SkImageType, type SkPicture, type SkCanvas,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { sampleTrack, type TrackLut } from './rideTrack';

/**
 * The coaster vignette inside the viewfinder, drawn in Skia inside a parent
 * <Canvas>. Moving parts read SharedValues; everything static (lattice
 * supports, ties, two-tone rails, night bulbs) is recorded once into a Picture
 * that the photo render reuses. No saveLayers, image filters or blur masks.
 */

export const CAR_SCALE = 0.21; // car width as a fraction of the scene width
export const CAR_ASPECT = 189 / 300;
/** The find sits in the seat: bottom centre of the seat as a fraction of the car box. */
export const SEAT = { x: 0.39, y: 0.5 };
/** The rail line sits this far down the car sprite (the bogie clamps it). */
export const RAIL_AT = 0.86;
export type Sky = 'day' | 'sunset' | 'night';

export interface SceneImages {
  readonly far: SkImageType | null;
  readonly near: SkImageType | null;
  readonly carBack: SkImageType | null;
  readonly carFront: SkImageType | null;
  readonly camera: SkImageType | null;
  readonly cameraPole: SkImageType | null;
  readonly sparkle: SkImageType | null;
  readonly rider: SkImageType | null;
}

export function carSize(width: number) {
  const w = Math.round(width * CAR_SCALE);
  return { w, h: Math.round(w * CAR_ASPECT), rider: Math.round(w * 0.6) };
}

/** The lit frame box: the whole car with its rider fits inside. */
export function frameBox(lut: TrackLut, width: number) {
  const car = carSize(width);
  const w = car.w * 1.45, h = car.h * RAIL_AT + car.rider * 0.95 + 14;
  return { x: lut.frameX - w / 2, y: lut.frameY - h + 12, w, h };
}

/** Camera head on its lattice pole, right of the frame, lens facing the window; the pole runs to the ground. */
export function cameraBox(lut: TrackLut, width: number, height: number) {
  const box = frameBox(lut, width);
  const w = Math.min(width * 0.24, 96), h = w * (190 / 200);
  const x = Math.min(box.x + box.w - w * 0.1, width - w - 6);
  const y = Math.max(8, box.y - h * 0.62);
  return { x, y, w, h, lens: { x: x + w * 0.2, y: y + h * 0.39 },
    // The ready light: a navy panel over the camera's lamp side (lamps 18 pt or larger).
    leds: { x: x + w * 0.7, y: y + h * 0.1, w: 30, h: 78 },
    pole: { x: x + w * 0.45, y: y + h * 0.92, w: w * 0.35, h: height - (y + h * 0.92) + 4 } };
}

const RAIL = '#e8473c', RAIL_INK = '#7d1b14', TIE = '#7d1b14';
const LATTICE = '#fff5e1', LATTICE_INK = '#b98a58';

/** Record the static track once: lattice supports, ties, two-tone rails (and night bulbs). */
export function buildRailsPicture(lut: TrackLut, width: number, height: number, sky: Sky): SkPicture {
  return createPicture((canvas: SkCanvas) => drawRails(canvas, lut, height, sky), { width, height });
}

function drawRails(canvas: SkCanvas, lut: TrackLut, height: number, sky: Sky) {
  const rail = Skia.Path.MakeFromSVGString(lut.path) ?? Skia.Path.Make();
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  // Lattice supports: two cream legs with a darker-shade outline and X braces, footings in the hedges.
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
  paint.setStrokeWidth(6.5); paint.setColor(Skia.Color(LATTICE_INK)); canvas.drawPath(legs, paint);
  paint.setStrokeWidth(3.5); paint.setColor(Skia.Color(LATTICE)); canvas.drawPath(legs, paint);
  paint.setStrokeWidth(3.5); paint.setColor(Skia.Color(LATTICE_INK)); canvas.drawPath(braces, paint);
  paint.setStrokeWidth(1.6); paint.setColor(Skia.Color(LATTICE)); canvas.drawPath(braces, paint);
  // Soft rail shadow (offset strokes, no blur filter)
  const shadow = rail.copy(); shadow.offset(0, 9);
  paint.setStrokeWidth(16); paint.setColor(Skia.Color('rgba(22,58,102,0.10)')); canvas.drawPath(shadow, paint);
  // Rounded ties in the rail's outline colour
  const fill = Skia.Paint(); fill.setAntiAlias(true); fill.setColor(Skia.Color(TIE));
  for (let k = 0; k < lut.xs.length; k += 3) {
    canvas.save();
    canvas.translate(lut.xs[k], lut.ys[k]);
    canvas.rotate((lut.angles[k] * 180) / Math.PI, 0, 0);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-2.5, -8, 5, 16), 2.5, 2.5), fill);
    canvas.restore();
  }
  // Two-tone rail tube: darker-shade outline, red fill, one white top gloss
  paint.setStrokeWidth(12); paint.setColor(Skia.Color(RAIL_INK)); canvas.drawPath(rail, paint);
  paint.setStrokeWidth(7); paint.setColor(Skia.Color(RAIL)); canvas.drawPath(rail, paint);
  const gloss = rail.copy(); gloss.offset(0, -1.8);
  paint.setStrokeWidth(1.6); paint.setColor(Skia.Color('rgba(255,255,255,0.45)')); canvas.drawPath(gloss, paint);
  if (sky === 'night') {
    const bulb = Skia.Paint(); bulb.setAntiAlias(true);
    for (let k = 4; k < lut.xs.length; k += 8) {
      bulb.setColor(Skia.Color('rgba(255,214,90,0.35)')); canvas.drawCircle(lut.xs[k], lut.ys[k] - 9, 6, bulb);
      bulb.setColor(Skia.Color('#ffe58a')); canvas.drawCircle(lut.xs[k], lut.ys[k] - 9, 2.6, bulb);
    }
  }
}

const SKY: Record<Sky, [string, string]> = {
  day: ['#58b6f5', '#bfe6ff'], sunset: ['#7aa6f0', '#ffd0b0'], night: ['#0d1b3d', '#33507f'],
};

/** A 4-point star path centred on 0,0. */
function starPath(r: number) {
  const path = Skia.Path.Make();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2, rad = i % 2 === 0 ? r : r * 0.32;
    if (i === 0) path.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else path.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  path.close();
  return path;
}

function RideScene({ width, height, lut, art, rails, u, approach, ready, flash, dim, lit, ghostU, ghost, riderIn, rock, carVis,
  golden = false, sky = 'day', dark = false, staticOnly = false }: {
  readonly width: number;
  readonly height: number;
  readonly lut: TrackLut;
  readonly art: SceneImages;
  /** The static track Picture (built once, shared with the photo render). */
  readonly rails: SkPicture;
  /** 0..1 along the track. */
  readonly u: SharedValue<number>;
  /** 0 far away, 1 at the frame: the brackets close in from 1.30x to 1.00x over the last 600 ms. */
  readonly approach: SharedValue<number>;
  /** 0 off, 1 red, 2 yellow, 3 green. */
  readonly ready: SharedValue<number>;
  readonly flash: SharedValue<number>;
  readonly dim: SharedValue<number>;
  /** Dark ride: 0 dark, 1 the flash frame is lit (only briefly). */
  readonly lit: SharedValue<number>;
  readonly ghostU: SharedValue<number>;
  readonly ghost: SharedValue<number>;
  readonly riderIn: SharedValue<number>;
  readonly rock: SharedValue<number>;
  readonly carVis: SharedValue<number>;
  readonly golden?: boolean;
  readonly sky?: Sky;
  readonly dark?: boolean;
  readonly staticOnly?: boolean;
}) {
  const car = carSize(width);
  const box = frameBox(lut, width);
  const cam = cameraBox(lut, width, height);

  const farH = height * 0.92, farW = Math.max(width * 1.25, farH * 1.5);
  const nearH = Math.min(height * 0.2, width * 0.36), nearW = nearH * 5;
  const farShift = useDerivedValue(() => [{ translateX: -(farW - width) * u.value }]);
  const nearShift = useDerivedValue(() => [{ translateX: -Math.min(nearW * 2 - width, width * 0.5) * u.value }]);

  // One sample per frame, shared by the car and the rider (no per-frame object churn beyond this array).
  const pose = useDerivedValue(() => {
    const p = sampleTrack(lut, u.value);
    return [p.x, p.y, p.angle];
  });
  const carTransform = useDerivedValue(() => [{ translateX: pose.value[0] }, { translateY: pose.value[1] },
    { rotate: pose.value[2] + rock.value * 0.055 }]);
  const riderPose = useDerivedValue(() => [{ translateX: car.w * SEAT.x }, { translateY: car.h * SEAT.y },
    { rotate: -pose.value[2] * 0.3 }, { scaleY: 0.9 + 0.1 * Math.min(1, riderIn.value) }]);
  const riderOpacity = useDerivedValue(() => (riderIn.value > 0 ? 1 : 0));
  const carOpacity = useDerivedValue(() => carVis.value);
  const ghostTransform = useDerivedValue(() => {
    if (ghost.value <= 0) return [{ translateX: -1000 }];
    const p = sampleTrack(lut, ghostU.value);
    return [{ translateX: p.x }, { translateY: p.y }, { rotate: p.angle }];
  });
  const ghostOpacity = useDerivedValue(() => 0.45 * ghost.value);

  // The target: brackets close in like a shrinking ring, gold, then green on the window.
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const bracketScale = useDerivedValue(() => {
    const s = 1.3 - 0.3 * approach.value;
    return [{ translateX: cx }, { translateY: cy }, { scale: s }, { translateX: -cx }, { translateY: -cy }];
  });
  const bracketColor = useDerivedValue(() => (ready.value === 3 ? '#3ee07a' : '#ffc21a'));
  const bracketOpacity = useDerivedValue(() => 0.65 + 0.35 * approach.value);
  const windowOpacity = useDerivedValue(() => 0.12 + 0.3 * approach.value);
  const coneOpacity = useDerivedValue(() => (dark ? lit.value : 0.2 + 0.35 * approach.value));
  const starScale = useDerivedValue(() => {
    const s = ready.value === 3 ? 1.35 : 1;
    return [{ translateX: lut.frameX }, { translateY: lut.frameY + 15 }, { scale: s }];
  });
  const red = useDerivedValue(() => (ready.value === 1 ? 1 : 0.18));
  const yellow = useDerivedValue(() => (ready.value === 2 ? 1 : 0.18));
  const green = useDerivedValue(() => (ready.value === 3 ? 1 : 0.18));
  const flashOpacity = useDerivedValue(() => flash.value);
  const dimOpacity = useDerivedValue(() => 0.6 * dim.value);
  const darkOpacity = useDerivedValue(() => (dark ? 0.72 * (1 - lit.value) : 0));

  const cone = useMemo(() => {
    const path = Skia.Path.Make();
    path.moveTo(cam.lens.x, cam.lens.y - 6);
    path.lineTo(box.x + 6, box.y + 4);
    path.lineTo(box.x + box.w * 0.2, box.y + box.h);
    path.lineTo(cam.lens.x, cam.lens.y + 6);
    path.close();
    return path;
  }, [cam.lens.x, cam.lens.y, box.x, box.y, box.w, box.h]);
  const brackets = useMemo(() => {
    const path = Skia.Path.Make();
    const l = box.x, r = box.x + box.w, t = box.y, b = box.y + box.h, k = Math.min(26, box.w * 0.25);
    path.moveTo(l, t + k); path.lineTo(l, t); path.lineTo(l + k, t);
    path.moveTo(r - k, t); path.lineTo(r, t); path.lineTo(r, t + k);
    path.moveTo(l, b - k); path.lineTo(l, b); path.lineTo(l + k, b);
    path.moveTo(r - k, b); path.lineTo(r, b); path.lineTo(r, b - k);
    return path;
  }, [box.x, box.y, box.w, box.h]);
  const star = useMemo(() => starPath(9), []);

  const drawCar = (rider: boolean) => (
    <Group transform={[{ translateX: -car.w / 2 }, { translateY: -car.h * RAIL_AT }]}>
      {art.carBack && <SkImage image={art.carBack} x={0} y={0} width={car.w} height={car.h} fit="contain" />}
      {rider && art.rider && <Group transform={riderPose} opacity={riderOpacity}>
        <SkImage image={art.rider} x={-car.rider / 2} y={-car.rider * 0.92} width={car.rider} height={car.rider} fit="contain" />
      </Group>}
      {art.carFront && <SkImage image={art.carFront} x={0} y={0} width={car.w} height={car.h} fit="contain" />}
    </Group>
  );

  return (
    <Group>
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={golden ? ['#ffb54d', '#ffe3a1'] : SKY[sky]} />
      </Rect>
      {art.far && <Group transform={farShift} opacity={sky === 'night' ? 0.45 : 1}>
        <SkImage image={art.far} x={0} y={height - farH} width={farW} height={farH} fit="cover" />
      </Group>}
      {golden && <Rect x={0} y={0} width={width} height={height} color="rgba(255,170,60,0.2)" />}
      {sky === 'sunset' && <Rect x={0} y={0} width={width} height={height} color="rgba(255,140,110,0.12)" />}
      {art.near && <Group transform={nearShift} opacity={sky === 'night' ? 0.7 : 1}>
        <SkImage image={art.near} x={0} y={height - nearH} width={nearW} height={nearH} fit="fill" />
        <SkImage image={art.near} x={nearW - 2} y={height - nearH} width={nearW} height={nearH} fit="fill" />
      </Group>}

      <Picture picture={rails} />

      {!staticOnly && <>
        <Path path={cone} opacity={coneOpacity}>
          <LinearGradient start={vec(cam.lens.x, cam.lens.y)} end={vec(box.x, box.y + box.h)}
            colors={['rgba(255,247,200,0.95)', 'rgba(255,240,170,0.12)']} />
        </Path>
        <RoundedRect x={box.x} y={box.y} width={box.w} height={box.h} r={14} color="rgba(255,244,190,0.6)" opacity={windowOpacity} />
        <Group transform={bracketScale}>
          <Path path={brackets} style="stroke" strokeWidth={10} color="#ffffff" strokeCap="round" strokeJoin="round" opacity={bracketOpacity} />
          <Path path={brackets} style="stroke" strokeWidth={5.5} color={bracketColor} strokeCap="round" strokeJoin="round" />
        </Group>
        {/* Sweet spot: a 14 pt white star with a gold outline on the rail at the frame's centre */}
        <Group transform={starScale}>
          <Path path={star} style="stroke" strokeWidth={3} color="#c98a00" strokeJoin="round" />
          <Path path={star} color="#ffffff" />
        </Group>
        {/* Camera on its pole, and its red, yellow, green ready light (18 pt lamps) beside the lens */}
        {art.cameraPole && <SkImage image={art.cameraPole} x={cam.pole.x} y={cam.pole.y} width={cam.pole.w} height={cam.pole.h} fit="fill" />}
        {art.camera && <SkImage image={art.camera} x={cam.x} y={cam.y} width={cam.w} height={cam.h} fit="contain" />}
        <RoundedRect x={cam.leds.x} y={cam.leds.y} width={cam.leds.w} height={cam.leds.h} r={13} color="#0f2747" />
        <RoundedRect x={cam.leds.x} y={cam.leds.y} width={cam.leds.w} height={cam.leds.h} r={13} color="#ffffff" style="stroke" strokeWidth={2} />
        <Circle cx={cam.leds.x + 15} cy={cam.leds.y + 15} r={10} color="#ff4d4d" opacity={red} />
        <Circle cx={cam.leds.x + 15} cy={cam.leds.y + 39} r={10} color="#ffd23f" opacity={yellow} />
        <Circle cx={cam.leds.x + 15} cy={cam.leds.y + 63} r={10} color="#3ee07a" opacity={green} />
        <Group transform={ghostTransform} opacity={ghostOpacity}>{drawCar(false)}</Group>
      </>}

      {/* The car: contact shadow on the rail, seat back, rider, body, lap bar and bogie */}
      <Group transform={carTransform} opacity={carOpacity}>
        <RoundedRect x={-car.w * 0.42} y={-2} width={car.w * 0.84} height={6} r={3} color="rgba(22,58,102,0.22)" />
        {drawCar(true)}
      </Group>

      {!staticOnly && <>
        {dark && <Rect x={0} y={0} width={width} height={height} color="#050b1a" opacity={darkOpacity} />}
        <Rect x={0} y={0} width={width} height={height} color="#05213f" opacity={dimOpacity} />
        <Rect x={0} y={0} width={width} height={height} color="#ffffff" opacity={flashOpacity} />
        <Circle cx={cam.lens.x} cy={cam.lens.y} r={140} opacity={flashOpacity}>
          <RadialGradient c={vec(cam.lens.x, cam.lens.y)} r={140} colors={['#ffffff', 'rgba(255,248,214,0)']} />
        </Circle>
      </>}
    </Group>
  );
}

export default memo(RideScene);

/**
 * The photo, drawn by hand on an offscreen surface (no reconciler, no re-parse):
 * only the crop, at `scale` pixels per point, reusing the static track Picture.
 */
export function drawPhoto(opts: {
  width: number; height: number; lut: TrackLut; art: SceneImages; rails: SkPicture; u: number; golden: boolean; sky: Sky;
  crop: { x: number; y: number; w: number; h: number }; scale: number;
}): SkImageType | null {
  const { width, height, lut, art, rails, u, golden, sky, crop, scale } = opts;
  const pw = Math.max(1, Math.round(crop.w * scale)), ph = Math.max(1, Math.round(crop.h * scale));
  const surface = Skia.Surface.MakeOffscreen(pw, ph) ?? Skia.Surface.Make(pw, ph);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(scale, scale);
  canvas.translate(-crop.x, -crop.y);
  const paint = Skia.Paint(); paint.setAntiAlias(true);
  const colors = golden ? ['#ffb54d', '#ffe3a1'] : SKY[sky];
  paint.setShader(Skia.Shader.MakeLinearGradient(vec(0, 0), vec(0, height), colors.map(c => Skia.Color(c)), null, 0));
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
  const img = (image: SkImageType | null, x: number, y: number, w: number, h: number, alpha = 1) => {
    if (!image) return;
    const p = Skia.Paint(); p.setAlphaf(alpha);
    canvas.drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(x, y, w, h), p);
  };
  const farH = height * 0.92, farW = Math.max(width * 1.25, farH * 1.5);
  const nearH = Math.min(height * 0.2, width * 0.36), nearW = nearH * 5;
  // fit="cover" for the far art: crop its source to the destination aspect.
  if (art.far) {
    const sw = art.far.width(), sh = art.far.height(), k = Math.max(farW / sw, farH / sh);
    const cw = farW / k, ch = farH / k;
    const p = Skia.Paint(); p.setAlphaf(sky === 'night' ? 0.45 : 1);
    canvas.drawImageRect(art.far, Skia.XYWHRect((sw - cw) / 2, (sh - ch) / 2, cw, ch),
      Skia.XYWHRect(-(farW - width) * u, height - farH, farW, farH), p);
  }
  const nx = -Math.min(nearW * 2 - width, width * 0.5) * u;
  img(art.near, nx, height - nearH, nearW, nearH, sky === 'night' ? 0.7 : 1);
  img(art.near, nx + nearW - 2, height - nearH, nearW, nearH, sky === 'night' ? 0.7 : 1);
  canvas.drawPicture(rails);
  const car = carSize(width);
  const p = sampleTrack(lut, u);
  canvas.save();
  canvas.translate(p.x, p.y);
  canvas.rotate((p.angle * 180) / Math.PI, 0, 0);
  canvas.translate(-car.w / 2, -car.h * RAIL_AT);
  img(art.carBack, 0, 0, car.w, car.h);
  if (art.rider) {
    canvas.save();
    canvas.translate(car.w * SEAT.x, car.h * SEAT.y);
    canvas.rotate((-p.angle * 0.3 * 180) / Math.PI, 0, 0);
    img(art.rider, -car.rider / 2, -car.rider * 0.92, car.rider, car.rider);
    canvas.restore();
  }
  img(art.carFront, 0, 0, car.w, car.h);
  canvas.restore();
  surface.flush();
  const shot = surface.makeImageSnapshot();
  return shot.makeNonTextureImage?.() ?? shot;
}
