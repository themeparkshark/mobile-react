/**
 * CountdownRing.tsx — per-question timer as a sweeping Skia arc.
 *
 * A ring drains clockwise as the question's time runs out. The stroke color
 * shifts from calm blue → warn amber → danger coral as it crosses the urgency
 * threshold, so the player feels the pressure without reading a number.
 *
 * Purely visual + on the UI thread: the fraction is a Reanimated shared value
 * and the arc path is rebuilt via useDerivedValue (Skia 1.5 pattern). The
 * ticking HAPTIC in the last seconds is fired by the game orchestrator on the
 * JS thread (haptics can't run in a worklet), keeping this component pure.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  type SkPath,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  interpolateColor,
  type SharedValue,
} from 'react-native-reanimated';
import { GAME_COLORS } from '../../gamekit';
import { URGENCY_SECONDS } from './config';

interface CountdownRingProps {
  /** 1 → 0 remaining fraction (1 = full time left). UI-thread shared value. */
  fraction: SharedValue<number>;
  /** Seconds remaining, mirrored to JS for the center label. */
  secondsLeft: number;
  /** Total question seconds (to know where "urgent" begins). */
  totalSeconds: number;
  size?: number;
  strokeWidth?: number;
}

export function CountdownRing({
  fraction,
  secondsLeft,
  totalSeconds,
  size = 74,
  strokeWidth = 7,
}: CountdownRingProps) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Fraction of the whole timer at which "urgency" begins.
  const urgentAt = totalSeconds > 0 ? URGENCY_SECONDS / totalSeconds : 0.2;

  // The drained arc, rebuilt on the UI thread as `fraction` changes.
  const path = useDerivedValue<SkPath>(() => {
    'worklet';
    const p = Skia.Path.Make();
    const f = Math.max(0, Math.min(1, fraction.value));
    // Full-time = full ring; drain clockwise from 12 o'clock.
    const sweep = 360 * f;
    const oval = Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2);
    p.addArc(oval, -90, sweep);
    return p;
  }, [fraction, cx, cy, r]);

  // Color shift: blue (calm) → amber (warn) → coral (danger).
  const color = useDerivedValue<string>(() => {
    'worklet';
    const f = Math.max(0, Math.min(1, fraction.value));
    return interpolateColor(
      f,
      [0, urgentAt, urgentAt * 2, 1],
      [GAME_COLORS.coral, GAME_COLORS.warn, GAME_COLORS.blue, GAME_COLORS.blue],
    );
  }, [fraction, urgentAt]);

  const trackPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, r);
    return p;
  }, [cx, cy, r]);

  const urgent = secondsLeft <= URGENCY_SECONDS;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Canvas style={{ width: size, height: size }}>
        {/* Track */}
        <Path
          path={trackPath}
          style="stroke"
          strokeWidth={strokeWidth}
          color={GAME_COLORS.bgElevated}
          strokeCap="round"
        />
        {/* Draining arc */}
        <Path
          path={path}
          style="stroke"
          strokeWidth={strokeWidth}
          color={color}
          strokeCap="round"
        />
      </Canvas>
      <View style={styles.center} pointerEvents="none">
        <Text
          style={[styles.num, urgent && styles.numUrgent]}
          numberOfLines={1}
        >
          {Math.max(0, Math.ceil(secondsLeft))}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  num: { color: GAME_COLORS.text, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  numUrgent: { color: GAME_COLORS.coral },
});
