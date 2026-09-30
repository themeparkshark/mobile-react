/**
 * BoardFx.tsx: the one Skia canvas over the felt (design 6.6, 6.4).
 *
 *   rim rope   5px gold rope around the felt, draining clockwise from top
 *              centre; sunny orange with a white stroke in Overtime; 60% in the
 *              Time Attack look-away freeze; a gold notch at the 3-star time
 *   link arc   gold arc from the card you saw earlier to the one you flipped
 *              (3px core, soft halo, 1px ink edge), trims in 140ms, fades 200ms
 *
 * Every value is a shared value, so nothing re-renders React while it animates.
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { BlurMask, Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { MM } from './theme';

export interface ArcState {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 0..1 trim progress */
  p: number;
  /** 0..1 alpha */
  a: number;
}

function perimeterPoint(x: number, y: number, w: number, h: number, t: number): { px: number; py: number } {
  'worklet';
  // Clockwise from top centre around the rect (corners treated square).
  const per = 2 * (w + h);
  let d = (((t % 1) + 1) % 1) * per;
  const segs = [w / 2, h, w, h, w / 2];
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ];
  let px = x + w / 2;
  let py = y;
  for (let i = 0; i < segs.length; i++) {
    const s = Math.min(d, segs[i]);
    px += dirs[i][0] * s;
    py += dirs[i][1] * s;
    d -= s;
    if (d <= 0) break;
  }
  return { px, py };
}

export const BoardFx = React.memo(function BoardFx({ width, height, inset, radius, rimFrac, rimUrgent, rimDim, notchFrac, arc, showRim }: {
  width: number;
  height: number;
  inset: number;
  radius: number;
  rimFrac: SharedValue<number>;
  rimUrgent: SharedValue<number>;
  rimDim: SharedValue<number>;
  /** Remaining-fraction where the 3-star notch sits (-1 = none). */
  notchFrac: number;
  arc: SharedValue<ArcState>;
  showRim: boolean;
}) {
  const x = inset;
  const y = inset;
  const w = width - inset * 2;
  const h = height - inset * 2;

  const rimPath = useMemo(() => {
    // Start at top centre, clockwise.
    const p = Skia.Path.Make();
    const r = radius;
    p.moveTo(x + w / 2, y);
    p.lineTo(x + w - r, y);
    p.quadTo(x + w, y, x + w, y + r);
    p.lineTo(x + w, y + h - r);
    p.quadTo(x + w, y + h, x + w - r, y + h);
    p.lineTo(x + r, y + h);
    p.quadTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r);
    p.quadTo(x, y, x + r, y);
    p.lineTo(x + w / 2, y);
    return p;
  }, [x, y, w, h, radius]);

  const end = useDerivedValue(() => Math.max(0, Math.min(1, rimFrac.value)));
  const coreColor = useDerivedValue(() => (rimUrgent.value > 0.5 ? MM.urgent : MM.gold));
  const edgeColor = useDerivedValue(() => (rimUrgent.value > 0.5 ? '#ffffff' : MM.ink));
  const rimOpacity = useDerivedValue(() => 1 - rimDim.value * 0.4);
  const spark = useDerivedValue(() => perimeterPoint(x, y, w, h, end.value));
  const sparkX = useDerivedValue(() => spark.value.px);
  const sparkY = useDerivedValue(() => spark.value.py);
  const sparkR = useDerivedValue(() => (rimUrgent.value > 0.5 && rimDim.value < 0.5 ? 6 : 0));
  const notch = useMemo(() => (notchFrac > 0 ? perimeterPoint(x, y, w, h, notchFrac) : null), [notchFrac, x, y, w, h]);

  const arcPath = useDerivedValue(() => {
    const a = arc.value;
    const p = Skia.Path.Make();
    if (a.a <= 0) return p;
    const mx = (a.x1 + a.x2) / 2;
    const my = (a.y1 + a.y2) / 2 - Math.max(30, Math.abs(a.x2 - a.x1) * 0.25 + Math.abs(a.y2 - a.y1) * 0.15);
    p.moveTo(a.x1, a.y1);
    p.quadTo(mx, my, a.x2, a.y2);
    return p;
  });
  const arcEnd = useDerivedValue(() => arc.value.p);
  const arcAlpha = useDerivedValue(() => arc.value.a);

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      {showRim ? (
        <Group opacity={rimOpacity}>
          <Path path={rimPath} style="stroke" strokeWidth={8} strokeCap="round" color={edgeColor} start={0} end={end} />
          <Path path={rimPath} style="stroke" strokeWidth={5} strokeCap="round" color={coreColor} start={0} end={end} />
          {notch ? <Circle cx={notch.px} cy={notch.py} r={5} color={MM.gold} /> : null}
          {notch ? <Circle cx={notch.px} cy={notch.py} r={5} color={MM.ink} style="stroke" strokeWidth={1.5} /> : null}
          <Circle cx={sparkX} cy={sparkY} r={sparkR} color="#fff3b0">
            <BlurMask blur={4} style="solid" />
          </Circle>
        </Group>
      ) : null}
      <Group opacity={arcAlpha}>
        <Path path={arcPath} style="stroke" strokeWidth={10} strokeCap="round" color="rgba(254,201,14,0.45)" start={0} end={arcEnd}>
          <BlurMask blur={6} style="normal" />
        </Path>
        <Path path={arcPath} style="stroke" strokeWidth={5} strokeCap="round" color={MM.ink} start={0} end={arcEnd} />
        <Path path={arcPath} style="stroke" strokeWidth={3} strokeCap="round" color={MM.gold} start={0} end={arcEnd} />
      </Group>
    </Canvas>
  );
});
