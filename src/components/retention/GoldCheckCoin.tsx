import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { BRAND } from '../../ui';

/**
 * The one Daily 3 done mark, everywhere (map stamp, sheet rows, the full set):
 * a gold coin with a white rim and a navy-edged white tick, code-drawn in Skia.
 * `draw` (0..1) draws the tick as a stroke; without it the tick is whole.
 */
export default function GoldCheckCoin({ size, draw }: { readonly size: number; readonly draw?: SharedValue<number> }) {
  const tick = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(size * 0.25, size * 0.53);
    p.lineTo(size * 0.43, size * 0.7);
    p.lineTo(size * 0.76, size * 0.32);
    return p;
  }, [size]);
  const r = size / 2 - 1.5;
  const w = Math.max(2, size * 0.07);
  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={size / 2} cy={size / 2} r={r} color={BRAND.gold} />
      <Circle cx={size / 2} cy={size / 2} r={r} color={BRAND.white} style="stroke" strokeWidth={w} />
      <Path path={tick} style="stroke" strokeWidth={size * 0.2} color={BRAND.navy} strokeCap="round" strokeJoin="round" end={draw ?? 1} />
      <Path path={tick} style="stroke" strokeWidth={size * 0.115} color={BRAND.white} strokeCap="round" strokeJoin="round" end={draw ?? 1} />
    </Canvas>
  );
}
