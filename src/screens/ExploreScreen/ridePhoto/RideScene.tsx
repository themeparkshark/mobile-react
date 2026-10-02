import { memo, useMemo } from 'react';
import {
  BlurMask, Circle, Group, Image as SkImage, LinearGradient, Path, RadialGradient, Rect, RoundedRect, Shadow,
  Skia, vec, type SkImage as SkImageType,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { sampleTrack, type TrackLut } from './rideTrack';

/**
 * The coaster vignette, drawn in Skia inside a parent <Canvas>: a far park
 * backdrop and a near hedge row that slide at different speeds (parallax), the
 * rails, the on-ride camera and its flash frame, and the car with the find
 * riding in it. Every moving part reads SharedValues, so nothing re-renders
 * React while the car runs.
 */

export const CAR_W = 110;
export const CAR_H = CAR_W * (251 / 420);
/** Where the find sits in the car sprite (bottom centre of the seat), as a fraction of the car box. */
const SEAT = { x: 0.47, y: 0.5 };
export const RIDER_SIZE = 54;
const CAM_W = 46, CAM_H = CAM_W * (302 / 240);

export interface SceneArt {
  readonly far: SkImageType | null;
  readonly near: SkImageType | null;
  readonly car: SkImageType | null;
  readonly camera: SkImageType | null;
  readonly rider: SkImageType | null;
}

const INK = '#0b2f5c';

function RideScene({ width, height, lut, art, u, frameHalfPx, frameGlow, flash, golden = false }: {
  readonly width: number;
  readonly height: number;
  readonly lut: TrackLut;
  readonly art: SceneArt;
  /** 0..1 along the track. */
  readonly u: SharedValue<number>;
  /** Half the grading window, scene points: the bracket corners show exactly this. */
  readonly frameHalfPx: number;
  /** 0..1: the frame brackets brighten as the car arrives. */
  readonly frameGlow: SharedValue<number>;
  /** 0..1 flash bloom at the camera. */
  readonly flash: SharedValue<number>;
  readonly golden?: boolean;
}) {
  const rail = useMemo(() => Skia.Path.MakeFromSVGString(lut.path) ?? Skia.Path.Make(), [lut.path]);
  // Cross ties every few points along the rail.
  const ties = useMemo(() => {
    const path = Skia.Path.Make();
    for (let k = 0; k < lut.xs.length; k += 3) {
      const a = lut.angles[k] + Math.PI / 2;
      const dx = Math.cos(a) * 7, dy = Math.sin(a) * 7;
      path.moveTo(lut.xs[k] - dx, lut.ys[k] - dy);
      path.lineTo(lut.xs[k] + dx, lut.ys[k] + dy);
    }
    return path;
  }, [lut]);
  const posts = useMemo(() => {
    const path = Skia.Path.Make();
    for (const post of lut.posts) {
      if (post.y > height * 0.9) continue;
      path.moveTo(post.x, post.y + 6);
      path.lineTo(post.x, height);
    }
    return path;
  }, [lut, height]);

  const farW = width * 1.18, farH = (farW * 2) / 3;
  // Midground hedge and fence row, tiled twice so it can slide farther (parallax).
  const nearH = height * 0.4, nearW = nearH * (1200 / 384);
  const farShift = useDerivedValue(() => [{ translateX: -(farW - width) * u.value }]);
  const nearShift = useDerivedValue(() => [{ translateX: -Math.min(nearW * 2 - width, width * 0.45) * u.value }]);

  const carTransform = useDerivedValue(() => {
    const p = sampleTrack(lut, u.value);
    return [{ translateX: p.x }, { translateY: p.y }, { rotate: p.angle }];
  });
  // A gentle rattle on the rails, faster when the car is quick.
  const riderBob = useDerivedValue(() => [{ translateY: Math.sin(u.value * 90) * 1.2 }]);

  const fx = lut.frameX, fy = lut.frameY;
  const bracketTop = fy - CAR_H - 26, bracketBottom = fy + 10;
  const brackets = useMemo(() => {
    const path = Skia.Path.Make();
    const l = fx - frameHalfPx, r = fx + frameHalfPx, t = bracketTop, b = bracketBottom, k = 14;
    path.moveTo(l, t + k); path.lineTo(l, t); path.lineTo(l + k, t);
    path.moveTo(r - k, t); path.lineTo(r, t); path.lineTo(r, t + k);
    path.moveTo(l, b - k); path.lineTo(l, b); path.lineTo(l + k, b);
    path.moveTo(r - k, b); path.lineTo(r, b); path.lineTo(r, b - k);
    return path;
  }, [fx, frameHalfPx, bracketTop, bracketBottom]);
  const bracketOpacity = useDerivedValue(() => 0.55 + 0.45 * frameGlow.value);
  const zoneOpacity = useDerivedValue(() => 0.1 + 0.22 * frameGlow.value);
  const bloomOpacity = useDerivedValue(() => flash.value);
  const bloomR = useDerivedValue(() => 30 + 120 * flash.value);
  const camX = fx + frameHalfPx + 18, camY = bracketTop - 4;
  const flashX = camX - CAM_W * 0.1, flashY = camY - CAM_H * 0.32;

  return (
    <Group>
      {/* Sky and park, far layer */}
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={golden ? ['#ffb54d', '#ffe3a1'] : ['#4fb6ff', '#bfe8ff']} />
      </Rect>
      {art.far && <Group transform={farShift}>
        <SkImage image={art.far} x={0} y={height - farH * 0.86} width={farW} height={farH} fit="cover" />
      </Group>}
      {golden && <Rect x={0} y={0} width={width} height={height} color="rgba(255,170,60,0.22)" />}

      {/* Midground hedges and fence, faster parallax */}
      {art.near && <Group transform={nearShift}>
        <SkImage image={art.near} x={0} y={height - nearH} width={nearW} height={nearH} fit="fill" />
        <SkImage image={art.near} x={nearW - 1} y={height - nearH} width={nearW} height={nearH} fit="fill" />
      </Group>}

      {/* Supports and rails, with a soft shadow for depth */}
      <Path path={posts} style="stroke" strokeWidth={4} color="#8a5a2b" strokeCap="round" />
      <Path path={posts} style="stroke" strokeWidth={1.5} color="rgba(255,255,255,0.35)" strokeCap="round" />
      <Group>
        <Path path={rail} style="stroke" strokeWidth={16} color="rgba(11,47,92,0.25)" strokeCap="round" strokeJoin="round">
          <BlurMask blur={6} style="normal" />
        </Path>
      </Group>
      <Path path={ties} style="stroke" strokeWidth={4} color="#6b3f1d" strokeCap="round" />
      <Path path={rail} style="stroke" strokeWidth={10} color={INK} strokeCap="round" strokeJoin="round" />
      <Path path={rail} style="stroke" strokeWidth={6} color="#ef4a3c" strokeCap="round" strokeJoin="round" />
      <Path path={rail} style="stroke" strokeWidth={1.6} color="rgba(255,255,255,0.75)" strokeCap="round" strokeJoin="round"
        transform={[{ translateY: -1.5 }]} />

      {/* Flash frame: the grading window, honest to the pixel */}
      <RoundedRect x={fx - frameHalfPx} y={bracketTop} width={frameHalfPx * 2} height={bracketBottom - bracketTop} r={10}
        color="#fff6c4" opacity={zoneOpacity} />
      <Path path={brackets} style="stroke" strokeWidth={5} color={INK} strokeCap="round" strokeJoin="round" />
      <Path path={brackets} style="stroke" strokeWidth={3} color="#ffcf3b" strokeCap="round" strokeJoin="round" opacity={bracketOpacity} />

      {/* The on-ride camera on its post */}
      <Path path={`M ${camX} ${camY + CAM_H * 0.45} L ${camX} ${fy + 4}`} style="stroke" strokeWidth={4} color="#64748b" strokeCap="round" />
      {art.camera && <SkImage image={art.camera} x={camX - CAM_W / 2} y={camY - CAM_H * 0.5} width={CAM_W} height={CAM_H} fit="contain">
        <Shadow dx={0} dy={2} blur={2} color="rgba(11,47,92,0.35)" />
      </SkImage>}

      {/* The car, with the find riding in it */}
      <Group transform={carTransform}>
        <Group transform={[{ translateX: -CAR_W / 2 }, { translateY: -CAR_H + 6 }]}>
          <Group transform={riderBob}>
            {art.rider && <SkImage image={art.rider} x={CAR_W * SEAT.x - RIDER_SIZE / 2} y={CAR_H * SEAT.y - RIDER_SIZE * 0.92}
              width={RIDER_SIZE} height={RIDER_SIZE} fit="contain" />}
          </Group>
          {art.car && <SkImage image={art.car} x={0} y={0} width={CAR_W} height={CAR_H} fit="contain">
            <Shadow dx={0} dy={3} blur={3} color="rgba(11,47,92,0.35)" />
          </SkImage>}
        </Group>
      </Group>


      {/* Flash bloom from the camera */}
      <Circle cx={flashX} cy={flashY} r={bloomR} opacity={bloomOpacity}>
        <RadialGradient c={vec(flashX, flashY)} r={150} colors={['#ffffff', 'rgba(255,248,214,0.85)', 'rgba(255,248,214,0)']} />
      </Circle>
    </Group>
  );
}

export default memo(RideScene);
