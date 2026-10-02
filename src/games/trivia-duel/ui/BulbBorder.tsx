/**
 * BulbBorder (design 11.4): the 24-bulb speed ticker on the question board.
 *
 * One Skia canvas, every value on the UI thread. 7 bulbs top, 7 bottom, 5 per
 * side, radius 5pt in 3pt-outlined cream sockets. lit = ceil(24 x speed / 100),
 * counted clockwise from the top-left, so the ring burns out anticlockwise
 * from the left side. A bulb that goes out pops (1.2 to 0.8 over 60ms) and
 * leaves its cream socket.
 *
 * Colour means speed tier ONLY (rev 7 H5): >= 70 gold, 35-69 blue, < 35
 * white. At 95+ the lit bulbs get white-hot cores and a shimmer sweep every
 * 8th; crossing 95 downward flashes the whole ring for one frame; crossing 70
 * and 35 blips the ring 1.08 for 60ms. Lit bulbs chase clockwise one bulb per
 * 8th (per 16th during Hot Streak). Hot Streak never recolours a bulb: it
 * adds the gold SweepGradient rim on the frame (3pt, 5pt Blazing).
 *
 * After the horizon every bulb is out and a coral fuse burns along the
 * bottom edge for the rest of the window; in the last 3 seconds it sparks.
 */
import React, { useMemo } from 'react';
import {
  Canvas, Circle, Group, Line, Path, RoundedRect, Skia, SweepGradient, vec,
} from '@shopify/react-native-skia';
import { runOnJS, useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { C } from '../art';

import { BULB_COUNT, bulbColor, bulbPositions, litCount } from '../engine/bulbs';

export { BULB_COUNT, bulbColor, bulbPositions, litCount };

interface Props {
  width: number;
  height: number;
  /** 0-100 speed the drum is showing; -1 = ring off (read-lock / face-down). */
  speed: SharedValue<number>;
  /** Fractional beat of the music (8ths = beat x 2). */
  beat: SharedValue<number>;
  /** Presentation clock (ms): pops, shimmer, sparks. */
  fxMs: SharedValue<number>;
  /** 0 normal, 1 Hot Streak (16th chase + gold rim 3pt), 2 Blazing (rim 5pt). */
  hot: SharedValue<number>;
  /** fxMs of the lock: the remaining bulbs flash white for 2 frames. */
  lockFlashAt: SharedValue<number>;
  /** Fuse left (1 -> 0) after the horizon; < 0 hides it. */
  fuse: SharedValue<number>;
  /** 1 in the last 3 seconds (fuse sparks, frame pulse on beats). */
  urgent: SharedValue<number>;
  reducedMotion: boolean;
  /** JS callback when the ring crosses a tier edge (70 / 35): tickSelection. */
  onTierEdge?: () => void;
}

const SOCKET_R = 6.6;
const BULB_R = 5;

export const BulbBorder = React.memo(function BulbBorder({ width, height, speed, beat, fxMs, hot, lockFlashAt, fuse, urgent, reducedMotion, onTierEdge }: Props) {
  const pos = useMemo(() => bulbPositions(width, height, 9), [width, height]);
  // fxMs at which each bulb went out (-1 = lit or never lit this question).
  const outAt = useSharedValue<number[]>(new Array(BULB_COUNT).fill(-1));
  const lastLit = useSharedValue(BULB_COUNT);
  const edgeAt = useSharedValue(-1000);
  const hotFlashAt = useSharedValue(-1000);
  const lastSpeed = useSharedValue(-1);

  useAnimatedReaction(() => speed.value, (s) => {
    const lit = litCount(s);
    const prev = lastLit.value;
    const now = fxMs.value;
    if (lit < prev) {
      const arr = outAt.value.slice();
      for (let k = lit; k < prev; k++) arr[k] = now;
      outAt.value = arr;
    } else if (lit > prev) {
      const arr = outAt.value.slice();
      for (let k = prev; k < lit; k++) arr[k] = -1;
      outAt.value = arr;
    }
    lastLit.value = lit;
    const p = lastSpeed.value;
    if (p >= 0 && s >= 0) {
      if (p >= 95 && s < 95) hotFlashAt.value = now;
      if ((p >= 70 && s < 70) || (p >= 35 && s < 35)) {
        edgeAt.value = now;
        if (onTierEdge) runOnJS(onTierEdge)();
      }
    }
    lastSpeed.value = s;
  }, [onTierEdge]);

  // Whole-ring blip 1.08 for 60ms on tier edges; frame pulse 1.04 on beats in the last 3s.
  const ringTransform = useDerivedValue(() => {
    let k = 1;
    if (!reducedMotion) {
      const age = fxMs.value - edgeAt.value;
      if (age >= 0 && age < 60) k = 1.08;
      if (urgent.value > 0) {
        const ph = beat.value - Math.floor(beat.value);
        k *= 1 + 0.04 * Math.max(0, 1 - ph * 4);
      }
    }
    return [{ translateX: width / 2 }, { translateY: height / 2 }, { scale: k }, { translateX: -width / 2 }, { translateY: -height / 2 }];
  });

  const rimW = useDerivedValue(() => (hot.value >= 2 ? 5 : hot.value >= 1 ? 3 : 0));
  const rimOpacity = useDerivedValue(() => (hot.value >= 1 ? 1 : 0));
  const rimSpin = useDerivedValue(() => [{ rotate: reducedMotion ? 0 : (fxMs.value / 1000) * (hot.value >= 2 ? 1.6 : 1.0) }]);

  const fusePath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const f = fuse.value;
    if (f > 0) {
      const x0 = 14;
      const x1 = 14 + (width - 28) * f;
      p.moveTo(x0, height - 3);
      p.lineTo(x1, height - 3);
    }
    return p;
  });
  const fuseTipX = useDerivedValue(() => 14 + (width - 28) * Math.max(0, fuse.value));
  const fuseOn = useDerivedValue(() => (fuse.value > 0 ? 1 : 0));
  const sparkR = useDerivedValue(() => {
    if (fuse.value <= 0) return 0;
    const fr = Math.floor(fxMs.value / 83.33) % 3;
    return (urgent.value > 0 ? 6 : 3.5) + fr;
  });

  return (
    <Canvas style={{ width, height, position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Group transform={ringTransform}>
        {/* Hot Streak gold rim on the frame (never a bulb colour). */}
        <Group opacity={rimOpacity}>
          <RoundedRect x={2} y={2} width={width - 4} height={height - 4} r={18} style="stroke" strokeWidth={rimW}>
            <SweepGradient c={vec(width / 2, height / 2)} colors={['#fec90e', '#fff6c8', '#ffd84a', '#fec90e', '#fff6c8', '#fec90e']} transform={rimSpin} />
          </RoundedRect>
        </Group>
        {pos.map((p, k) => (
          <Bulb key={k} k={k} x={p.x} y={p.y} speed={speed} beat={beat} fxMs={fxMs} hot={hot} outAt={outAt} lockFlashAt={lockFlashAt} hotFlashAt={hotFlashAt} reducedMotion={reducedMotion} />
        ))}
        {/* Coral fuse after the horizon. */}
        <Group opacity={fuseOn}>
          <Line p1={vec(14, height - 3)} p2={vec(width - 14, height - 3)} color="#f3e3b8" strokeWidth={4} strokeCap="round" />
          <Path path={fusePath} color={C.coral} style="stroke" strokeWidth={4} strokeCap="round" />
          <Circle cx={fuseTipX} cy={height - 3} r={sparkR} color="#fff3b0" />
          <Circle cx={fuseTipX} cy={height - 3} r={sparkR} color={C.ink} style="stroke" strokeWidth={1.5} />
        </Group>
      </Group>
    </Canvas>
  );
});

function Bulb({ k, x, y, speed, beat, fxMs, hot, outAt, lockFlashAt, hotFlashAt, reducedMotion }: {
  k: number; x: number; y: number; speed: SharedValue<number>; beat: SharedValue<number>; fxMs: SharedValue<number>; hot: SharedValue<number>;
  outAt: SharedValue<number[]>; lockFlashAt: SharedValue<number>; hotFlashAt: SharedValue<number>; reducedMotion: boolean;
}) {
  const r = useDerivedValue(() => {
    const s = speed.value;
    const lit = litCount(s);
    if (k < lit) return BULB_R;
    const at = outAt.value[k];
    if (at < 0 || reducedMotion) return 0;
    const age = fxMs.value - at;
    if (age < 0 || age >= 60) return 0;
    return BULB_R * (1.2 - (0.4 * age) / 60);
  });
  const color = useDerivedValue(() => {
    const s = speed.value;
    const now = fxMs.value;
    const lit = litCount(s);
    if (k >= lit) return bulbColor(Math.max(0, s));
    // 2-frame white flash on lock, 1-frame full-ring shimmer crossing 95 downward.
    if (now - lockFlashAt.value >= 0 && now - lockFlashAt.value < 33) return '#ffffff';
    if (now - hotFlashAt.value >= 0 && now - hotFlashAt.value < 17) return '#ffffff';
    const base = bulbColor(s);
    if (reducedMotion) return base;
    // Lightning shimmer: a white sweep across the lit bulbs every 8th.
    if (s >= 95) {
      const eighth = beat.value * 2;
      const ph = eighth - Math.floor(eighth);
      if (Math.floor(ph * lit) === k) return '#ffffff';
    }
    return base;
  });
  // Chase: every 6th lit bulb brightens, one step per 8th (per 16th at Hot Streak).
  const halo = useDerivedValue(() => {
    const lit = litCount(speed.value);
    if (k >= lit || reducedMotion) return 0;
    const step = Math.floor(beat.value * (hot.value >= 1 ? 4 : 2));
    return ((k - step) % 6 + 6) % 6 === 0 ? 1 : 0;
  });
  const glowR = useDerivedValue(() => (k < litCount(speed.value) ? SOCKET_R + 4 : 0));
  const core = useDerivedValue(() => (k < litCount(speed.value) && speed.value >= 95 ? 2.4 : 0));
  return (
    <Group>
      <Circle cx={x} cy={y} r={glowR} color={color} opacity={0.4} />
      <Circle cx={x} cy={y} r={SOCKET_R} color={C.cream} />
      <Circle cx={x} cy={y} r={BULB_R - 1} color="#d8c49a" />
      <Circle cx={x} cy={y} r={r} color={color} />
      <Circle cx={x} cy={y} r={core} color="#ffffff" />
      <Circle cx={x} cy={y} r={SOCKET_R} color={C.ink} style="stroke" strokeWidth={3} />
      <Circle cx={x} cy={y} r={SOCKET_R + 3} color="#ffffff" opacity={halo} style="stroke" strokeWidth={1.6} />
    </Group>
  );
}
