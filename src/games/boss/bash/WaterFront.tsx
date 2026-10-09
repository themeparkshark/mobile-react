/**
 * The lagoon water in front of the boss: a cartoon wave edge (white foam on a
 * navy ink line) that rolls slowly, drawn with one Skia path on the UI thread.
 * Reduced motion: a still wave.
 */
import { Canvas, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { cancelAnimation, Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const INK = '#1d6f9f';

export default function WaterFront({ width, height, top, reduced, running }: {
  width: number; height: number; top: number; reduced: boolean; running: boolean;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced || !running) { cancelAnimation(t); return; }
    t.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [reduced, running, t]);
  const wave = (close: boolean) => {
    'worklet';
    const p = Skia.Path.Make();
    const amp = 5, len = 64, phase = t.value * len, y0 = top;
    for (let x = -12; x <= width + 12; x += 6) {
      const y = y0 + amp * Math.sin(((x + phase) / len) * Math.PI * 2);
      if (x === -12) p.moveTo(x, y); else p.lineTo(x, y);
    }
    if (close) { p.lineTo(width + 12, height + 10); p.lineTo(-10, height + 10); p.close(); }
    return p;
  };
  const body = useDerivedValue<SkPath>(() => wave(true));
  const edge = useDerivedValue<SkPath>(() => wave(false));
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group>
        <Path path={body} color="rgba(28,205,236,0.86)" />
        <Path path={edge} style="stroke" strokeWidth={11} color={INK} strokeJoin="round" strokeCap="round" opacity={0.55} />
        <Path path={edge} style="stroke" strokeWidth={6} color="#ffffff" strokeJoin="round" strokeCap="round" />
      </Group>
    </Canvas>
  );
}
