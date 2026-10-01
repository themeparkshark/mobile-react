/**
 * RibbonTrail / BrushStroke: ink-outlined tapering strips in one Skia canvas.
 *
 *   const trail = useRibbonTrail({ cap: 14, lifeMs: 300 });
 *   // UI thread (gesture or sim worklet): trailPush(trail.state.value, x, y, fxMs); trail.bump();
 *   <RibbonTrail trail={trail} now={fxMsSv} color="#ffcf3b" head={16} tail={2} />
 *
 *   <BrushStroke points={recapPts} progress={drawOnSv} color="#ffffff" head={8} tail={3} />
 *
 * Each draws two `<Vertices mode="triangleStrip">` passes: the INK outline
 * (strip widened by `outline`, navy) and the fill. That is the Current Quest
 * ink rule (tapering brush over a 2 px INK edge) and it keeps procedural
 * shapes in Alex's outlined style. Vertex alpha fades old points.
 */

import React, { useMemo } from 'react';
import { Group, Vertices, vec, type SkPoint } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { buildStrip, createTrail, trailPoints, type Trail } from '../core/trail';
import { hexToRgb } from '../core/color';

export const INK = '#0b3a66';

export interface RibbonTrailHandle {
  state: SharedValue<Trail>;
  /** Bumped after each push so derived geometry recomputes. */
  version: SharedValue<number>;
}

export function useRibbonTrail(opts: { cap?: number; lifeMs?: number; minDist?: number } = {}): RibbonTrailHandle {
  const state = useSharedValue<Trail>(createTrail(opts.cap ?? 14, opts.lifeMs ?? 300, opts.minDist ?? 3));
  const version = useSharedValue(0);
  return useMemo(() => ({ state, version }), [state, version]);
}

function rgbaStr(rgb: [number, number, number], a: number): string {
  'worklet';
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

function toStrip(out: number[], outA: number[], count: number, rgb: [number, number, number], alphaMul: number) {
  'worklet';
  const pts: SkPoint[] = [];
  const cols: string[] = [];
  for (let i = 0; i < count; i++) {
    pts.push(vec(out[i * 2], out[i * 2 + 1]));
    cols.push(rgbaStr(rgb, outA[i] * alphaMul));
  }
  return { pts, cols };
}

// A degenerate, transparent triangle: never hand Skia an empty vertex list.
const EMPTY_PTS: SkPoint[] = [vec(0, 0), vec(0, 0), vec(0, 0)];
const EMPTY_COLS: string[] = ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)'];

export function RibbonTrail({
  trail, now, color = '#ffffff', head = 14, tail = 2, outline = 2, outlineColor = INK, opacity = 1,
}: {
  trail: RibbonTrailHandle;
  /** Clock in ms (fx clock, so a hit-stop freezes the fade). */
  now: SharedValue<number>;
  color?: string;
  head?: number;
  tail?: number;
  outline?: number;
  outlineColor?: string;
  opacity?: number;
}) {
  const rgb = useMemo(() => hexToRgb(color), [color]);
  const ink = useMemo(() => hexToRgb(outlineColor), [outlineColor]);
  const geo = useDerivedValue(() => {
    trail.version.value;
    const t = trail.state.value;
    const xs: number[] = [];
    const ys: number[] = [];
    const ag: number[] = [];
    const n = trailPoints(t, now.value, xs, ys, ag);
    if (n < 2) return null;
    const out: number[] = [];
    const a: number[] = [];
    const vIn = buildStrip(xs, ys, n, { head: head + outline * 2, tail: tail + outline * 2, taperIn: 0, grow: 0 }, out, a, ag);
    const o = toStrip(out, a, vIn, ink, opacity);
    const v = buildStrip(xs, ys, n, { head, tail, taperIn: 0, grow: 0 }, out, a, ag);
    const f = toStrip(out, a, v, rgb, opacity);
    return { op: o.pts, oc: o.cols, fp: f.pts, fc: f.cols };
  });
  const op = useDerivedValue(() => geo.value?.op ?? EMPTY_PTS);
  const oc = useDerivedValue(() => geo.value?.oc ?? EMPTY_COLS);
  const fp = useDerivedValue(() => geo.value?.fp ?? EMPTY_PTS);
  const fc = useDerivedValue(() => geo.value?.fc ?? EMPTY_COLS);
  return (
    <Group>
      <Vertices vertices={op} colors={oc} mode="triangleStrip" />
      <Vertices vertices={fp} colors={fc} mode="triangleStrip" />
    </Group>
  );
}

/**
 * A fixed polyline drawn as an ink brush stroke. `progress` (0..1) draws it on
 * from the start (route recaps, wave lines, X stamps).
 */
export function BrushStroke({
  xs, ys, progress, color = '#ffffff', head = 8, tail = 3, taperIn = 0.12, outline = 2, outlineColor = INK, opacity,
}: {
  xs: number[];
  ys: number[];
  progress?: SharedValue<number>;
  color?: string;
  head?: number;
  tail?: number;
  taperIn?: number;
  outline?: number;
  outlineColor?: string;
  opacity?: SharedValue<number>;
}) {
  const rgb = useMemo(() => hexToRgb(color), [color]);
  const ink = useMemo(() => hexToRgb(outlineColor), [outlineColor]);
  const geo = useDerivedValue(() => {
    const p = progress ? Math.max(0, Math.min(1, progress.value)) : 1;
    const n = Math.max(0, Math.min(xs.length, Math.ceil(xs.length * p)));
    if (n < 2) return null;
    const a = opacity ? opacity.value : 1;
    const out: number[] = [];
    const al: number[] = [];
    const vo = buildStrip(xs, ys, n, { head, tail, taperIn, grow: outline }, out, al);
    const o = toStrip(out, al, vo, ink, a);
    const vf = buildStrip(xs, ys, n, { head, tail, taperIn, grow: 0 }, out, al);
    const f = toStrip(out, al, vf, rgb, a);
    return { op: o.pts, oc: o.cols, fp: f.pts, fc: f.cols };
  });
  const op = useDerivedValue(() => geo.value?.op ?? EMPTY_PTS);
  const oc = useDerivedValue(() => geo.value?.oc ?? EMPTY_COLS);
  const fp = useDerivedValue(() => geo.value?.fp ?? EMPTY_PTS);
  const fc = useDerivedValue(() => geo.value?.fc ?? EMPTY_COLS);
  return (
    <Group>
      <Vertices vertices={op} colors={oc} mode="triangleStrip" />
      <Vertices vertices={fp} colors={fc} mode="triangleStrip" />
    </Group>
  );
}
