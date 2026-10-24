/**
 * FinalSeconds: the last 5 seconds of a timed mini-game (wow-games lane).
 *
 * Tension without fear: a soft gold edge breathes once a second (never red),
 * each second stamps in from 1.4 near the top of the play field, and at 0 a
 * gold TIME! slams down with a squash. The shell plays the tick, the haptic
 * and the whistle (core/gameMoments finalSecondsBeat); this layer only draws,
 * on the UI thread, from one clock that restarts each second.
 *
 * Reduced motion: no breathing and no stamp travel; the number and TIME!
 * simply appear, the colour shift and the sound stay.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Group, Rect, RadialGradient, Text as SkText, vec } from '@shopify/react-native-skia';
import { useDisplayFont } from './displayFont';
import { cancelAnimation, Easing, ReduceMotion, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { FINAL_COLOR, FINAL_SECONDS, clamp01, finalVignette, springAt } from '../core/gameMoments';
import { GOLD_FX, SLAM_SQUASH, SPRING } from '../../ui/motion';

const NUM_PX = 72;
const TIME_PX = 96;

export interface FinalSecondsProps {
  secondsLeft: number | null | undefined;
  width: number;
  height: number;
  /** Where the second stamps (pt from the top). */
  stampY: number;
  reduced: boolean;
  /** Hide everything (paused, results). */
  active: boolean;
}

export const FinalSeconds = React.memo(function FinalSeconds({ secondsLeft, width, height, stampY, reduced, active }: FinalSecondsProps) {
  const font = useDisplayFont(NUM_PX);
  const timeFont = useDisplayFont(TIME_PX);
  const ms = useSharedValue(-1);
  const s = secondsLeft == null ? null : Math.floor(secondsLeft);
  const inWindow = active && s != null && s >= 0 && s <= FINAL_SECONDS;
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!inWindow || s == null) {
      cancelAnimation(ms);
      ms.value = -1;
      return;
    }
    setLabel(s === 0 ? 'TIME!' : `${s}`);
    cancelAnimation(ms);
    ms.value = 0;
    // Always run the clock: Reduce Motion is handled in the drawing (no breathing, no stamp travel).
    ms.value = withTiming(s === 0 ? 1400 : 1000, { duration: s === 0 ? 1400 : 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
  }, [inWindow, s, ms]);
  useEffect(() => () => cancelAnimation(ms), [ms]);

  const isTime = s === 0;
  const f = isTime ? timeFont : font;
  const px = isTime ? TIME_PX : NUM_PX;
  const w = useMemo(() => {
    if (!f || !label) return 0;
    try { return f.measureText(label).width; } catch { return label.length * px * 0.6; }
  }, [f, label, px]);

  const edge = useDerivedValue(() => {
    if (ms.value < 0 || isTime) return 0;
    return reduced ? 0.08 : finalVignette(ms.value, 0.12) / 0.12;
  });
  const stampOpacity = useDerivedValue(() => {
    const t = ms.value;
    if (t < 0) return 0;
    if (isTime) return t > 1100 ? 1 - clamp01((t - 1100) / 300) : 1;
    return reduced ? (t < 800 ? 0.9 : 0.9 * (1 - clamp01((t - 800) / 160))) : 0.92 * (1 - clamp01((t - 620) / 260));
  });
  const transform = useDerivedValue(() => {
    const t = ms.value;
    let sc = 1;
    let sx = 1;
    let sy = 1;
    if (!reduced && t >= 0) {
      if (isTime) {
        sc = t < 120 ? 1.8 - 0.8 * (t / 120) * (t / 120) * (t / 120) : springAt(t - 120, SPRING.stamp, 1, 1);
        if (t >= 120 && t < 170) { sx = 1 + SLAM_SQUASH; sy = 1 - SLAM_SQUASH; }
      } else {
        sc = springAt(t, SPRING.stamp, 1.4, 1);
      }
    }
    return [
      { translateX: width / 2 }, { translateY: stampY },
      { scaleX: sc * sx }, { scaleY: sc * sy },
      { translateX: -w / 2 }, { translateY: px * 0.36 },
    ];
  });
  if (!inWindow) return null;
  const r = Math.hypot(width, height) * 0.62;
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Group opacity={edge}>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient c={vec(width / 2, height / 2)} r={r}
            colors={['rgba(255,213,74,0)', 'rgba(255,213,74,0)', 'rgba(255,201,60,0.12)', 'rgba(255,201,60,0.34)']}
            positions={[0, 0.55, 0.8, 1]} />
        </Rect>
      </Group>
      {f && label ? (
        <Group transform={transform} opacity={stampOpacity}>
          <SkText x={0} y={5} text={label} font={f} color="#05346e" style="stroke" strokeWidth={11} strokeJoin="round" opacity={0.5} />
          <SkText x={0} y={0} text={label} font={f} color={isTime ? '#7a4300' : '#05346e'} style="stroke" strokeWidth={11} strokeJoin="round" />
          <SkText x={0} y={0} text={label} font={f} color={isTime ? GOLD_FX.rays : FINAL_COLOR.hot} />
        </Group>
      ) : null}
    </Canvas>
  );
});
