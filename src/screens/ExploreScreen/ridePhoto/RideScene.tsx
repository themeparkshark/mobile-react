import { memo, useMemo } from 'react';
import {
  Circle, ColorMatrix, Group, Image as SkImage, LinearGradient, Path, Picture, RadialGradient, Rect, RoundedRect, Skia,
  createPicture, vec, type SkPicture,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { gradeMatrix } from './rides/stage';
import type { RideStage, SceneArt } from './rides';

/**
 * Any ride inside the viewfinder, drawn in Skia inside a parent <Canvas>.
 * Every node is always mounted (no conditional Skia nodes bound to shared
 * values). Static scenery is one Picture; the moving ride is a Picture recorded
 * on the UI thread each frame by the ride's own paint worklet, the same paint
 * the photo uses. The camera rig, its lamps and the telegraph sit on top.
 */

const EMPTY: SkPicture = createPicture(() => undefined, { width: 1, height: 1 });

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

const LAMP_COLORS = ['#ff4d4d', '#ffd23f', '#3ee07a'] as const;

function RideScene({ stage, art, t, clock, approach, ready, flash, dim, lit, ghostT, ghost, riderIn, rock, carVis, nudgeBlink,
  golden = false, staticOnly = false }: {
  readonly stage: RideStage;
  readonly art: SceneArt;
  /** 0..1 of the pass. */
  readonly t: SharedValue<number>;
  /** Scene seconds, for loops (bulbs, bob, spray). */
  readonly clock: SharedValue<number>;
  /** 0 far away, 1 at the frame: the brackets close in from 1.30x to 1.00x over the last 600 ms. */
  readonly approach: SharedValue<number>;
  /** 0 off, 1 red, 2 yellow, 3 green. */
  readonly ready: SharedValue<number>;
  readonly flash: SharedValue<number>;
  readonly dim: SharedValue<number>;
  /** Spotlight beat: 0 dark, 1 the window is lit. */
  readonly lit: SharedValue<number>;
  readonly ghostT: SharedValue<number>;
  readonly ghost: SharedValue<number>;
  readonly riderIn: SharedValue<number>;
  readonly rock: SharedValue<number>;
  readonly carVis: SharedValue<number>;
  /** "Not yet" and "no tap": the red lamp blinks. */
  readonly nudgeBlink: SharedValue<number>;
  readonly golden?: boolean;
  readonly staticOnly?: boolean;
}) {
  const { width, height, box, cam, data, paint, emissive } = stage;
  const grade = useMemo(() => gradeMatrix(stage.sky, golden), [stage.sky, golden]);

  // The ride itself, recorded on the UI thread every frame by the ride's paint (plus the miss replay).
  const dynamic = useDerivedValue(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    if (ghost.value > 0) {
      paint(canvas, { t: ghostT.value, clock: clock.value, rock: 0, riderIn: 1, alpha: ghost.value, ghost: true, photo: false }, data, art);
    }
    paint(canvas, { t: t.value, clock: clock.value, rock: rock.value, riderIn: riderIn.value, alpha: carVis.value,
      ghost: false, photo: false }, data, art);
    return recorder.finishRecordingAsPicture();
  }, [stage, art]);
  const { front } = stage;
  const over = useDerivedValue(() => {
    if (!front) return EMPTY;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    front(canvas, { t: t.value, clock: clock.value, rock: 0, riderIn: 1, alpha: carVis.value, ghost: false, photo: false }, data, art);
    return recorder.finishRecordingAsPicture();
  }, [stage, art]);
  const glow = useDerivedValue(() => {
    if (!emissive) return EMPTY;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    emissive(canvas, { t: t.value, clock: clock.value, rock: 0, riderIn: 1, alpha: 1, ghost: false, photo: false }, data, art);
    return recorder.finishRecordingAsPicture();
  }, [stage, art]);

  // The target: brackets close in like a shrinking ring, gold, then green on the window.
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const bracketScale = useDerivedValue(() => {
    const s = 1.3 - 0.3 * approach.value;
    return [{ translateX: cx }, { translateY: cy }, { scale: s }, { translateX: -cx }, { translateY: -cy }];
  });
  const bracketColor = useDerivedValue(() => (ready.value === 3 ? '#3ee07a' : '#ffc21a'));
  const bracketOpacity = useDerivedValue(() => 0.65 + 0.35 * approach.value);
  const windowOpacity = useDerivedValue(() => (stage.spotlight ? 0 : 0.1 + 0.26 * approach.value));
  const coneOpacity = useDerivedValue(() => (stage.spotlight ? 0.15 + 0.75 * lit.value : 0.2 + 0.35 * approach.value));
  const starScale = useDerivedValue(() => {
    const s = ready.value === 3 ? 1.35 : 1;
    return [{ translateX: cx }, { translateY: box.y + box.h - 6 }, { scale: s }];
  });
  // The camera's own three lamps: off is a dark lens, on is the colour with a warm glow. Red also blinks on a nudge.
  const lampOn = [
    useDerivedValue(() => Math.max(ready.value === 1 ? 1 : 0, nudgeBlink.value)),
    useDerivedValue(() => (ready.value === 2 ? 1 : 0)),
    useDerivedValue(() => (ready.value === 3 ? 1 : 0)),
  ];
  const lampOff = [
    useDerivedValue(() => 0.62 * (1 - lampOn[0].value)),
    useDerivedValue(() => 0.62 * (1 - lampOn[1].value)),
    useDerivedValue(() => 0.62 * (1 - lampOn[2].value)),
  ];
  const flashOpacity = useDerivedValue(() => flash.value);
  const dimOpacity = useDerivedValue(() => dim.value);
  // Spotlight (Epic): outside the window sits at about 35%; the window lights fully only as the car arrives.
  // Spotlight (Epic): a soft light pool, not a box. The scene sits dark; a warm pool opens on the window as
  // the car arrives (radius and warmth follow `lit`), shaped by the camera's beam cone.
  const spot = stage.spotlight ? 1 : 0;
  const poolR = Math.hypot(box.w, box.h) * 0.62;
  const poolRadius = useDerivedValue(() => poolR * (0.55 + 0.65 * lit.value));
  const poolDark = useDerivedValue(() => spot * 0.64);
  const warmth = useDerivedValue(() => spot * 0.6 * lit.value);

  const cone = useMemo(() => {
    const path = Skia.Path.Make();
    const edge = cam.facing === 'left' ? box.x + box.w - 6 : box.x + 6;
    path.moveTo(cam.lens.x, cam.lens.y - 7);
    path.lineTo(edge, box.y + 4);
    path.lineTo(edge, box.y + box.h);
    path.lineTo(cam.lens.x, cam.lens.y + 7);
    path.close();
    return path;
  }, [cam, box]);
  const brackets = useMemo(() => {
    const path = Skia.Path.Make();
    const l = box.x, r = box.x + box.w, tp = box.y, b = box.y + box.h, k = Math.min(26, box.w * 0.25);
    path.moveTo(l, tp + k); path.lineTo(l, tp); path.lineTo(l + k, tp);
    path.moveTo(r - k, tp); path.lineTo(r, tp); path.lineTo(r, tp + k);
    path.moveTo(l, b - k); path.lineTo(l, b); path.lineTo(l + k, b);
    path.moveTo(r - k, b); path.lineTo(r, b); path.lineTo(r, b - k);
    return path;
  }, [box]);

  const star = useMemo(() => starPath(9), []);
  const show = staticOnly ? 0 : 1;

  return (
    <Group>
      <Picture picture={stage.backdrop} />
      <Picture picture={dynamic} />
      <Picture picture={stage.foreground ?? EMPTY} />
      <Picture picture={over} />

      <Group opacity={show}>
        <Path path={cone} opacity={coneOpacity}>
          <LinearGradient start={vec(cam.lens.x, cam.lens.y)} end={vec(cx, cy)}
            colors={['rgba(255,247,200,0.95)', 'rgba(255,240,170,0.12)']} />
        </Path>
        <RoundedRect x={box.x} y={box.y} width={box.w} height={box.h} r={14} color="rgba(255,244,190,0.6)" opacity={windowOpacity} />
        {/* The camera on its pole, under the sky's grade like every sprite */}
        {/* A hung camera's gantry beam (static per stage, never bound to a shared value) */}
        <RoundedRect x={cam.beam?.x ?? 0} y={cam.beam?.y ?? 0} width={cam.beam?.w ?? 0} height={cam.beam?.h ?? 0} r={4} color="#fff5e1" />
        <RoundedRect x={cam.beam?.x ?? 0} y={cam.beam?.y ?? 0} width={cam.beam?.w ?? 0} height={cam.beam?.h ?? 0} r={4} color="#b98a58" style="stroke" strokeWidth={3} />
        <SkImage image={art.cameraPole ?? null} x={cam.pole.x} y={cam.pole.y} width={cam.pole.w} height={cam.pole.h} fit="fill">
          <ColorMatrix matrix={grade} />
        </SkImage>
        <Group transform={cam.facing === 'right' ? [{ translateX: cam.x * 2 + cam.w }, { scaleX: -1 }] : []}>
          <SkImage image={art.camera ?? null} x={cam.x} y={cam.y} width={cam.w} height={cam.h} fit="contain">
            <ColorMatrix matrix={grade} />
          </SkImage>
        </Group>
      </Group>

      <Picture picture={glow} />
      <Rect x={0} y={0} width={width} height={height} opacity={poolDark}>
        <RadialGradient c={vec(cx, cy)} r={poolRadius} positions={[0, 0.55, 1]}
          colors={['rgba(4,10,28,0)', 'rgba(4,10,28,0.35)', 'rgba(4,10,28,1)']} />
      </Rect>
      <Circle cx={cx} cy={cy} r={poolR * 0.75} opacity={warmth} blendMode="plus">
        <RadialGradient c={vec(cx, cy)} r={poolR * 0.75} colors={['rgba(255,236,190,0.6)', 'rgba(255,236,190,0)']} />
      </Circle>

      <Group opacity={show}>
        {cam.lamps.map((lamp, i) => (
          <Group key={i}>
            <Circle cx={lamp.x} cy={lamp.y} r={cam.lampR * 2.3} opacity={lampOn[i]}>
              <RadialGradient c={vec(lamp.x, lamp.y)} r={cam.lampR * 2.3} colors={[`${LAMP_COLORS[i]}cc`, `${LAMP_COLORS[i]}00`]} />
            </Circle>
            <Circle cx={lamp.x} cy={lamp.y} r={cam.lampR} color={LAMP_COLORS[i]} />
            <Circle cx={lamp.x} cy={lamp.y} r={cam.lampR} color="#0b1730" opacity={lampOff[i]} />
            <Circle cx={lamp.x} cy={lamp.y} r={cam.lampR} color="#0f2747" style="stroke" strokeWidth={2.5} />
            <Circle cx={lamp.x - cam.lampR * 0.3} cy={lamp.y - cam.lampR * 0.35} r={cam.lampR * 0.28} color="rgba(255,255,255,0.75)" opacity={lampOn[i]} />
          </Group>
        ))}
        <Group transform={bracketScale}>
          <Path path={brackets} style="stroke" strokeWidth={10} color="#ffffff" strokeCap="round" strokeJoin="round" opacity={bracketOpacity} />
          <Path path={brackets} style="stroke" strokeWidth={5.5} color={bracketColor} strokeCap="round" strokeJoin="round" />
        </Group>
        {/* Sweet spot: a 14 pt white star with a gold outline at the bottom centre of the window */}
        <Group transform={starScale}>
          <Path path={star} style="stroke" strokeWidth={3} color="#c98a00" strokeJoin="round" />
          <Path path={star} color="#ffffff" />
        </Group>
        {/* The hold: a deep navy vignette (55% centre, 80% edges), never a grey wash */}
        <Rect x={0} y={0} width={width} height={height} opacity={dimOpacity}>
          <RadialGradient c={vec(width / 2, height * 0.45)} r={Math.max(width, height) * 0.75}
            colors={['rgba(3,18,48,0.55)', 'rgba(3,18,48,0.8)']} />
        </Rect>
        <Rect x={0} y={0} width={width} height={height} color="#ffffff" opacity={flashOpacity} />
        <Circle cx={cam.lens.x} cy={cam.lens.y} r={140} opacity={flashOpacity}>
          <RadialGradient c={vec(cam.lens.x, cam.lens.y)} r={140} colors={['#ffffff', 'rgba(255,248,214,0)']} />
        </Circle>
      </Group>
    </Group>
  );
}

export default memo(RideScene);
