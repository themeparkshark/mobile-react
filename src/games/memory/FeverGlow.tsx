/**
 * FeverGlow.tsx — Skia board-edge glow that pulses when combo fever is active.
 *
 * A single Skia canvas draws a blurred rounded-rect stroke hugging the board.
 * Intensity is a Reanimated SharedValue so the pulse runs entirely on the UI
 * thread (no JS re-renders per frame). When `active` flips on, the stroke
 * ramps up and breathes; off, it fades out.
 */

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import {
  Canvas,
  RoundedRect,
  Blur,
  Group,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { GAME_COLORS } from '../../gamekit';

interface FeverGlowProps {
  width: number;
  height: number;
  active: boolean;
  color?: string;
}

const INSET = 6;

export function FeverGlow({ width, height, active, color = GAME_COLORS.gold }: FeverGlowProps) {
  const intensity = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(intensity);
    if (active) {
      intensity.value = withSequence(
        withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
        withRepeat(
          withSequence(
            withTiming(0.65, { duration: 620, easing: Easing.inOut(Easing.quad) }),
            withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
          true,
        ),
      );
    } else {
      intensity.value = withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) });
    }
  }, [active, intensity]);

  const opacity = useDerivedValue(() => intensity.value);
  const strokeW = useDerivedValue(() => 4 + intensity.value * 8);

  if (width <= 0 || height <= 0) return null;

  return (
    <Canvas style={[styles.canvas, { width, height }]} pointerEvents="none">
      <Group opacity={opacity}>
        <RoundedRect
          x={INSET}
          y={INSET}
          width={width - INSET * 2}
          height={height - INSET * 2}
          r={22}
          color={color}
          style="stroke"
          strokeWidth={strokeW}
        >
          <Blur blur={10} />
        </RoundedRect>
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { position: 'absolute', top: 0, left: 0 },
});
