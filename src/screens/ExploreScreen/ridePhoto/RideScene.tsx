import { memo, useMemo } from 'react';
import {
  Circle, Group, Image as SkImage, LinearGradient, Path, Picture, RadialGradient, Rect, RoundedRect, Skia, createPicture,
  vec, StrokeCap, StrokeJoin, PaintStyle, type SkImage as SkImageType,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { sampleTrack, type TrackLut } from './rideTrack';

/**
 * The coaster vignette inside the viewfinder, drawn in Skia inside a parent
 * <Canvas>. Moving parts read SharedValues; everything static (posts, ties,
 * rails and their shadow) is recorded once into a Picture. No saveLayers, no
 * image filters, no blur masks per frame: shadows are baked or drawn as shapes.
 */

export const CAR_SCALE = 0.21; // car width as a fraction of the scene width
const CAR_ASPECT = 186 / 300;
/** The find sits in the seat: bottom centre of the seat as a fraction of the car box. */
const SEAT = { x: 0.43, y: 0.5 };
const INK = '#163a66';

export interface SceneImages {
  readonly far: SkImageType | null;
  readonly near: SkImageType | null;
  readonly carBack: SkImageType | null;
  readonly carFront: SkImageType | null;
  readonly camera: SkImageType | null;
  readonly sparkle: SkImageType | null;
  readonly rider: SkImageType | null;
}

export function carSize(width: number) {
  const w = Math.round(width * CAR_SCALE);
  return { w, h: Math.round(w * CAR_ASPECT), rider: Math.round(w * 0.62) };
}

/** The lit frame box: the whole car with its rider fits inside. */
export function frameBox(lut: TrackLut, width: number) {
  const car = carSize(width);
  const w = car.w * 1.5, h = car.h + car.rider * 0.9;
  return { x: lut.frameX - w / 2, y: lut.frameY - h + 10, w, h };
}

function RideScene({ width, height, lut, art, u, frameGlow, ready, flash, dim, ghostU, ghost, riderIn, rock, carVis, golden = false, sunset = false, staticOnly = false, staticU }: {
  readonly width: number;
  readonly height: number;
  readonly lut: TrackLut;
  readonly art: SceneImages;
  /** 0..1 along the track. */
  readonly u: SharedValue<number>;
  /** 0..1: the frame lights up as the car arrives. */
  readonly frameGlow: SharedValue<number>;
  /** 0 off, 1 red, 2 yellow, 3 green: the camera's ready light. */
  readonly ready: SharedValue<number>;
  /** 0..1 white flash over the scene. */
  readonly flash: SharedValue<number>;
  /** 0..1 dims the scene behind the print during the reveal. */
  readonly dim: SharedValue<number>;
  /** The "too soon / too late" replay car. */
  readonly ghostU: SharedValue<number>;
  readonly ghost: SharedValue<number>;
  /** 0..1: the rider is in the seat (after the hop from the map). */
  readonly riderIn: SharedValue<number>;
  /** -1..1: the "ready" rock before the car rolls. */
  readonly rock: SharedValue<number>;
  /** 0..1: the car fades out when it whooshes off after a miss. */
  readonly carVis: SharedValue<number>;
  readonly golden?: boolean;
  /** Per-ride variety: a soft sunset sky. */
  readonly sunset?: boolean;
  /** Offscreen photo render: draw the car at this track position with plain values (no SharedValue bindings). */
  readonly staticU?: number;
  /** The print's photo: no frame UI, no flash, no ghost. */
  readonly staticOnly?: boolean;
}) {
  const car = carSize(width);
  const box = frameBox(lut, width);

  // Everything static, recorded once.
  const rails = useMemo(() => createPicture(canvas => {
    const rail = Skia.Path.MakeFromSVGString(lut.path) ?? Skia.Path.Make();
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeCap(StrokeCap.Round);
    paint.setStrokeJoin(StrokeJoin.Round);
    // Posts
    const posts = Skia.Path.Make();
    for (const post of lut.posts) {
      if (post.y > height * 0.94) continue;
      posts.moveTo(post.x, post.y + 6);
      posts.lineTo(post.x, height);
    }
    paint.setStrokeWidth(6); paint.setColor(Skia.Color('#7a4a24')); canvas.drawPath(posts, paint);
    paint.setStrokeWidth(3); paint.setColor(Skia.Color('#b97a45')); canvas.drawPath(posts, paint);
    // Soft rail shadow (two offset strokes, no blur filter)
    const shadow = rail.copy(); shadow.offset(0, 9);
    paint.setStrokeWidth(18); paint.setColor(Skia.Color('rgba(22,58,102,0.10)')); canvas.drawPath(shadow, paint);
    paint.setStrokeWidth(10); paint.setColor(Skia.Color('rgba(22,58,102,0.12)')); canvas.drawPath(shadow, paint);
    // Ties
    const ties = Skia.Path.Make();
    for (let k = 0; k < lut.xs.length; k += 3) {
      const a = lut.angles[k] + Math.PI / 2;
      const dx = Math.cos(a) * 8, dy = Math.sin(a) * 8;
      ties.moveTo(lut.xs[k] - dx, lut.ys[k] - dy);
      ties.lineTo(lut.xs[k] + dx, lut.ys[k] + dy);
    }
    paint.setStrokeWidth(5); paint.setColor(Skia.Color('#6b3f1d')); canvas.drawPath(ties, paint);
    // Rails: darker-shade outline, red fill, one gloss line
    paint.setStrokeWidth(11); paint.setColor(Skia.Color('#8f1d16')); canvas.drawPath(rail, paint);
    paint.setStrokeWidth(7); paint.setColor(Skia.Color('#ef4a3c')); canvas.drawPath(rail, paint);
    const gloss = rail.copy(); gloss.offset(0, -1.6);
    paint.setStrokeWidth(2); paint.setColor(Skia.Color('rgba(255,255,255,0.7)')); canvas.drawPath(gloss, paint);
  }, { width, height }), [lut, width, height]);

  // Parallax: the far park drifts, the hedges slide faster. Covered by height in a tall viewfinder.
  const farH = height * 0.92, farW = Math.max(width * 1.25, farH * 1.5);
  const nearH = Math.min(height * 0.22, width * 0.38), nearW = nearH * 5;
  const farShift = useDerivedValue(() => [{ translateX: -(farW - width) * u.value }]);
  const nearShift = useDerivedValue(() => [{ translateX: -Math.min(nearW * 2 - width, width * 0.5) * u.value }]);

  const carTransform = useDerivedValue(() => {
    const p = sampleTrack(lut, u.value);
    return [{ translateX: p.x }, { translateY: p.y }, { rotate: p.angle + rock.value * 0.055 }];
  });
  const carOpacity = useDerivedValue(() => carVis.value);
  const ghostTransform = useDerivedValue(() => {
    const p = sampleTrack(lut, ghostU.value);
    return [{ translateX: p.x }, { translateY: p.y }, { rotate: p.angle }];
  });
  // The rider leans back on drops and settles in on the hop.
  const riderPose = useDerivedValue(() => {
    const p = sampleTrack(lut, u.value);
    const land = riderIn.value;
    return [{ translateX: car.w * SEAT.x }, { translateY: car.h * SEAT.y }, { rotate: -p.angle * 0.3 },
      { scaleY: 0.9 + 0.1 * Math.min(1, land) }];
  });
  const riderOpacity = useDerivedValue(() => (riderIn.value > 0 ? 1 : 0));
  const still = staticU != null ? (() => {
    const p = sampleTrack(lut, staticU);
    return {
      far: [{ translateX: -(farW - width) * staticU }],
      near: [{ translateX: -Math.min(nearW * 2 - width, width * 0.5) * staticU }],
      car: [{ translateX: p.x }, { translateY: p.y }, { rotate: p.angle }],
      rider: [{ translateX: car.w * SEAT.x }, { translateY: car.h * SEAT.y }, { rotate: -p.angle * 0.3 }],
    };
  })() : null;

  const glowOpacity = useDerivedValue(() => 0.25 + 0.3 * frameGlow.value);
  const bracketOpacity = useDerivedValue(() => 0.75 + 0.25 * frameGlow.value);
  const pulse = useDerivedValue(() => {
    const s = 1 + 0.05 * frameGlow.value;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    return [{ translateX: cx }, { translateY: cy }, { scale: s }, { translateX: -cx }, { translateY: -cy }];
  });
  const sweetOpacity = useDerivedValue(() => 0.5 + 0.5 * frameGlow.value);
  const red = useDerivedValue(() => (ready.value === 1 ? 1 : 0.22));
  const yellow = useDerivedValue(() => (ready.value === 2 ? 1 : 0.22));
  const green = useDerivedValue(() => (ready.value === 3 ? 1 : 0.22));
  const flashOpacity = useDerivedValue(() => flash.value);
  const dimOpacity = useDerivedValue(() => 0.6 * dim.value);
  const ghostOpacity = useDerivedValue(() => 0.45 * ghost.value);

  // Camera sits up and right of the frame, lens facing the window, on a short bracket.
  const camW = car.w * 0.95, camH = camW * (136 / 190);
  // Above the frame's top-right corner, always inside the viewfinder.
  const camX = Math.min(box.x + box.w - camW * 0.3, width - camW - 10), camY = Math.max(8, box.y - camH - 10);
  const lensX = camX + camW * 0.12, lensY = camY + camH * 0.55;
  const cone = useMemo(() => {
    const path = Skia.Path.Make();
    path.moveTo(lensX, lensY - 6);
    path.lineTo(box.x + 6, box.y + 4);
    path.lineTo(box.x + box.w * 0.15, box.y + box.h);
    path.lineTo(lensX, lensY + 6);
    path.close();
    return path;
  }, [lensX, lensY, box.x, box.y, box.w, box.h]);
  const brackets = useMemo(() => {
    const path = Skia.Path.Make();
    const l = box.x, r = box.x + box.w, t = box.y, b = box.y + box.h, k = Math.min(26, box.w * 0.25);
    path.moveTo(l, t + k); path.lineTo(l, t); path.lineTo(l + k, t);
    path.moveTo(r - k, t); path.lineTo(r, t); path.lineTo(r, t + k);
    path.moveTo(l, b - k); path.lineTo(l, b); path.lineTo(l + k, b);
    path.moveTo(r - k, b); path.lineTo(r, b); path.lineTo(r, b - k);
    return path;
  }, [box.x, box.y, box.w, box.h]);
  const sweet = { x: lut.frameX, y: lut.frameY + 14 };

  const drawCar = (rider: boolean) => (
    <Group transform={[{ translateX: -car.w / 2 }, { translateY: -car.h * 0.96 }]}>
      {art.carBack && <SkImage image={art.carBack} x={0} y={0} width={car.w} height={car.h} fit="contain" />}
      {rider && art.rider && <Group transform={still ? still.rider : riderPose} opacity={still ? 1 : riderOpacity}>
        <SkImage image={art.rider} x={-car.rider / 2} y={-car.rider * 0.95} width={car.rider} height={car.rider} fit="contain" />
      </Group>}
      {art.carFront && <SkImage image={art.carFront} x={0} y={0} width={car.w} height={car.h} fit="contain" />}
    </Group>
  );

  return (
    <Group>
      {/* Sky and the far park */}
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient start={vec(0, 0)} end={vec(0, height)}
          colors={golden ? ['#ffb54d', '#ffe3a1'] : sunset ? ['#7aa6f0', '#ffd0b0'] : ['#58b6f5', '#bfe6ff']} />
      </Rect>
      {art.far && <Group transform={still ? still.far : farShift}>
        <SkImage image={art.far} x={0} y={height - farH} width={farW} height={farH} fit="cover" />
      </Group>}
      {golden && <Rect x={0} y={0} width={width} height={height} color="rgba(255,170,60,0.2)" />}
      {sunset && <Rect x={0} y={0} width={width} height={height} color="rgba(255,140,110,0.12)" />}
      {art.near && <Group transform={still ? still.near : nearShift}>
        <SkImage image={art.near} x={0} y={height - nearH} width={nearW} height={nearH} fit="fill" />
        <SkImage image={art.near} x={nearW - 2} y={height - nearH} width={nearW} height={nearH} fit="fill" />
      </Group>}

      <Picture picture={rails} />

      {!staticOnly && <>
        {/* The flash's light falls on the frame */}
        <Path path={cone} opacity={glowOpacity}>
          <LinearGradient start={vec(lensX, lensY)} end={vec(box.x, box.y + box.h)}
            colors={['rgba(255,247,200,0.95)', 'rgba(255,240,170,0.15)']} />
        </Path>
        <Group transform={pulse}>
          <RoundedRect x={box.x} y={box.y} width={box.w} height={box.h} r={14} color="rgba(255,244,190,0.22)" opacity={glowOpacity} />
          <Path path={brackets} style="stroke" strokeWidth={9} color="#ffffff" strokeCap="round" strokeJoin="round" opacity={bracketOpacity} />
          <Path path={brackets} style="stroke" strokeWidth={5} color="#ffc21a" strokeCap="round" strokeJoin="round" />
        </Group>
        {/* Sweet spot: a star on the rail at the frame's centre */}
        {art.sparkle && <SkImage image={art.sparkle} x={sweet.x - 9} y={sweet.y - 9} width={18} height={18} opacity={sweetOpacity} />}

        {/* Camera, with its red, yellow, green ready light */}
        {art.camera && <SkImage image={art.camera} x={camX} y={camY} width={camW} height={camH} fit="contain" />}
        <RoundedRect x={camX + camW * 0.3} y={camY + camH + 2} width={46} height={18} r={9} color="#0f2747" />
        <Circle cx={camX + camW * 0.3 + 10} cy={camY + camH + 11} r={5.5} color="#ff4d4d" opacity={red} />
        <Circle cx={camX + camW * 0.3 + 23} cy={camY + camH + 11} r={5.5} color="#ffd23f" opacity={yellow} />
        <Circle cx={camX + camW * 0.3 + 36} cy={camY + camH + 11} r={5.5} color="#3ee07a" opacity={green} />
      </>}

      {/* Ghost replay for a miss */}
      {!staticOnly && <Group transform={ghostTransform} opacity={ghostOpacity}>{drawCar(false)}</Group>}

      {/* The car: contact shadow on the rail, seat back, rider, body and lap bar */}
      <Group transform={still ? still.car : carTransform} opacity={still ? 1 : carOpacity}>
        <RoundedRect x={-car.w * 0.42} y={-3} width={car.w * 0.84} height={7} r={3.5} color="rgba(22,58,102,0.28)" />
        {drawCar(true)}
      </Group>

      {!staticOnly && <>
        <Rect x={0} y={0} width={width} height={height} color="#05213f" opacity={dimOpacity} />
        <Rect x={0} y={0} width={width} height={height} color="#ffffff" opacity={flashOpacity} />
        <Circle cx={lensX} cy={lensY} r={140} opacity={flashOpacity}>
          <RadialGradient c={vec(lensX, lensY)} r={140} colors={['#ffffff', 'rgba(255,248,214,0)']} />
        </Circle>
      </>}
    </Group>
  );
}

export default memo(RideScene);
export { INK as RIDE_INK };
