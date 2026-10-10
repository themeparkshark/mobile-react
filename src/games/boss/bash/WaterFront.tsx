/**
 * The lagoon water in front of the boss: a cartoon wave edge (white foam on a
 * navy ink line) that rolls slowly, drawn with one Skia path on the UI thread.
 * Reduced motion: a still wave.
 */
import { Canvas, Group, Path, Rect, Skia, type SkPath } from '@shopify/react-native-skia';
import { useEffect } from 'react';
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
  // The canvas covers only the water (not the whole screen); the deep water is one static rect and only the
  // thin wave strip is rebuilt per frame (12 px steps).
  const pad = 16, y0 = pad, amp = 5, len = 64;
  const canvasH = Math.max(1, height - top + pad);
  const wave = (close: boolean) => {
    'worklet';
    const p = Skia.Path.Make();
    const phase = t.value * len;
    for (let x = -12; x <= width + 12; x += 12) {
      const y = y0 + amp * Math.sin(((x + phase) / len) * Math.PI * 2);
      if (x === -12) p.moveTo(x, y); else p.lineTo(x, y);
    }
    if (close) { p.lineTo(width + 12, y0 + amp + 1); p.lineTo(-12, y0 + amp + 1); p.close(); }
    return p;
  };
  const crest = useDerivedValue<SkPath>(() => wave(true));
  const edge = useDerivedValue<SkPath>(() => wave(false));
  return (
    <Canvas style={{ position: 'absolute', left: 0, right: 0, top: top - pad, height: canvasH }} pointerEvents="none">
      <Group>
        <Rect x={-2} y={y0 + amp} width={width + 4} height={canvasH} color="rgba(28,205,236,0.86)" />
        <Path path={crest} color="rgba(28,205,236,0.86)" />
        <Path path={edge} style="stroke" strokeWidth={11} color={INK} strokeJoin="round" strokeCap="round" opacity={0.55} />
        <Path path={edge} style="stroke" strokeWidth={6} color="#ffffff" strokeJoin="round" strokeCap="round" />
      </Group>
    </Canvas>
  );
}
