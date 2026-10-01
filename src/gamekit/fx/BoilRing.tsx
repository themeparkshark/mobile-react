/**
 * BoilRing.tsx: procedural strokes that look hand-drawn (line boil on twos).
 *
 *   <BoilRing cx={x} cy={y} r={radiusSv} fxMs={fxMs} color="#ffcf3b" amp={1.5} />
 *   <BoilPolyline xs={xs} ys={ys} fxMs={fxMs} amp={0.75} />   // reading surface: 0.75 pt
 *
 * Two passes like every studio FX stroke: a navy INK pass widened by 2 px per
 * side, then the colour. The outline re-picks one of 3 precomputed offset sets
 * every 83 ms (Hi-Fi Rush / Parade Beat), on the fx clock, so a hit-stop
 * freezes the boil. Reduced motion: amp 0 (a still, clean line).
 */

import React, { useMemo } from 'react';
import { Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { applyBoil, boilSetAt, circlePoints, createBoilSets } from '../core/twos';

const INK = '#23384f';

type Num = number | SharedValue<number>;
function val(v: Num): number {
  'worklet';
  return typeof v === 'number' ? v : v.value;
}

export interface BoilRingProps {
  cx: Num;
  cy: Num;
  r: Num;
  fxMs: SharedValue<number>;
  color?: string;
  strokeWidth?: number;
  /** Boil amplitude (px): 1.5 on the world, 0.75 on reading surfaces. */
  amp?: number;
  segments?: number;
  opacity?: Num;
  seed?: number;
  /** Draw the navy ink pass under the colour (default true). */
  ink?: boolean;
}

export const BoilRing = React.memo(function BoilRing({
  cx, cy, r, fxMs, color = '#ffffff', strokeWidth = 4, amp = 1.5, segments = 36, opacity = 1, seed = 5, ink = true,
}: BoilRingProps) {
  const sets = useMemo(() => createBoilSets(segments, amp, 3, seed), [segments, amp, seed]);
  const path = useDerivedValue<SkPath>(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < segments; i++) {
      xs.push(0);
      ys.push(0);
    }
    circlePoints(val(cx), val(cy), Math.max(0.5, val(r)), segments, xs, ys);
    const ox = xs.slice();
    const oy = ys.slice();
    applyBoil(sets, boilSetAt(sets, fxMs.value), xs, ys, ox, oy, 1);
    const p = Skia.Path.Make();
    p.moveTo(ox[0], oy[0]);
    for (let i = 1; i < segments; i++) p.lineTo(ox[i], oy[i]);
    p.close();
    return p;
  });
  const op = useDerivedValue(() => val(opacity));
  return (
    <Group opacity={op}>
      {ink ? <Path path={path} style="stroke" strokeWidth={strokeWidth + 4} color={INK} strokeJoin="round" /> : null}
      <Path path={path} style="stroke" strokeWidth={strokeWidth} color={color} strokeJoin="round" />
    </Group>
  );
});

export interface BoilPolylineProps {
  xs: number[];
  ys: number[];
  fxMs: SharedValue<number>;
  color?: string;
  strokeWidth?: number;
  amp?: number;
  closed?: boolean;
  seed?: number;
  ink?: boolean;
}

export const BoilPolyline = React.memo(function BoilPolyline({
  xs, ys, fxMs, color = '#ffffff', strokeWidth = 4, amp = 0.75, closed = false, seed = 9, ink = true,
}: BoilPolylineProps) {
  const sets = useMemo(() => createBoilSets(xs.length, amp, 3, seed), [xs.length, amp, seed]);
  const path = useDerivedValue<SkPath>(() => {
    const ox = xs.slice();
    const oy = ys.slice();
    applyBoil(sets, boilSetAt(sets, fxMs.value), xs, ys, ox, oy, 1);
    const p = Skia.Path.Make();
    if (ox.length === 0) return p;
    p.moveTo(ox[0], oy[0]);
    for (let i = 1; i < ox.length; i++) p.lineTo(ox[i], oy[i]);
    if (closed) p.close();
    return p;
  });
  return (
    <Group>
      {ink ? <Path path={path} style="stroke" strokeWidth={strokeWidth + 4} color={INK} strokeJoin="round" strokeCap="round" /> : null}
      <Path path={path} style="stroke" strokeWidth={strokeWidth} color={color} strokeJoin="round" strokeCap="round" />
    </Group>
  );
});
