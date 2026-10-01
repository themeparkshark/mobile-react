/**
 * InkStrip: a tapering brush stroke over a 2 px INK outline (design 9.13, the
 * ink FX rule), driven entirely from shared values so the route recap, the
 * wrong-turn X, the tide wave line, the stall swirl and the Riptide ribbon
 * can change every frame without a React render. Built on the engine's
 * `buildStrip` (src/gamekit/core/trail.ts).
 */

import React, { useMemo } from 'react';
import { Group, Vertices, vec, type SkPoint } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { buildStrip } from '../../gamekit/core/trail';
import { hexToRgb } from '../../gamekit/core/color';
import { CQ } from './theme';

const EMPTY_PTS: SkPoint[] = [vec(0, 0), vec(0, 0), vec(0, 0)];
const EMPTY_COLS: string[] = ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)'];

function rgba(rgb: [number, number, number], a: number): string {
  'worklet';
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

export interface InkStripProps {
  /** Polyline as x,y pairs (board-local px). Several strokes: separate them with NaN,NaN. */
  pts: SharedValue<number[]>;
  /** 0..1 draw-on (default fully drawn). */
  progress?: SharedValue<number>;
  /** Overall alpha (default 1). */
  alpha?: SharedValue<number>;
  color: string;
  head: number;
  tail: number;
  taperIn?: number;
  outline?: number;
  ink?: string;
}

/** Split an x,y,NaN-separated list into polylines. */
function strokesOf(pts: number[]): { xs: number[]; ys: number[] }[] {
  'worklet';
  const out: { xs: number[]; ys: number[] }[] = [];
  let xs: number[] = [];
  let ys: number[] = [];
  for (let k = 0; k + 1 < pts.length; k += 2) {
    const x = pts[k];
    const y = pts[k + 1];
    if (x !== x || y !== y) {
      if (xs.length > 1) out.push({ xs, ys });
      xs = [];
      ys = [];
      continue;
    }
    xs.push(x);
    ys.push(y);
  }
  if (xs.length > 1) out.push({ xs, ys });
  return out;
}

export function InkStrip({ pts, progress, alpha, color, head, tail, taperIn = 0.1, outline = 2, ink = CQ.ink }: InkStripProps) {
  const rgb = useMemo(() => hexToRgb(color), [color]);
  const inkRgb = useMemo(() => hexToRgb(ink), [ink]);
  const geo = useDerivedValue(() => {
    const a = alpha ? alpha.value : 1;
    if (a <= 0.003) return null;
    const p = progress ? Math.max(0, Math.min(1, progress.value)) : 1;
    const list = strokesOf(pts.value);
    if (!list.length) return null;
    const op: SkPoint[] = [];
    const oc: string[] = [];
    const fp: SkPoint[] = [];
    const fc: string[] = [];
    const out: number[] = [];
    const al: number[] = [];
    for (let s = 0; s < list.length; s++) {
      const { xs, ys } = list[s];
      const n = Math.max(0, Math.min(xs.length, Math.ceil(xs.length * p)));
      if (n < 2) continue;
      // Each stroke is its own strip; a degenerate join keeps one Vertices call per pass.
      const vo = buildStrip(xs, ys, n, { head, tail, taperIn, grow: outline }, out, al);
      const startO = op.length;
      for (let i = 0; i < vo; i++) { op.push(vec(out[i * 2], out[i * 2 + 1])); oc.push(rgba(inkRgb, al[i] * a)); }
      const vf = buildStrip(xs, ys, n, { head, tail, taperIn, grow: 0 }, out, al);
      const startF = fp.length;
      for (let i = 0; i < vf; i++) { fp.push(vec(out[i * 2], out[i * 2 + 1])); fc.push(rgba(rgb, al[i] * a)); }
      if (s > 0 && startO > 0) {
        // Degenerate bridge: repeat the last vertex of the previous strip and the first of this one.
        op.splice(startO, 0, op[startO - 1], op[startO]);
        oc.splice(startO, 0, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)');
        fp.splice(startF, 0, fp[startF - 1], fp[startF]);
        fc.splice(startF, 0, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)');
      }
    }
    if (op.length < 3 || fp.length < 3) return null;
    return { op, oc, fp, fc };
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

// ---------------------------------------------------------------------------
// Polyline builders (worklets) for the FX that need a shape.

/** Wrong-turn X: two strokes through (cx, cy), half-size r, scaled by k. */
export function xMarkPts(cx: number, cy: number, r: number, k: number): number[] {
  'worklet';
  const s = r * k;
  return [cx - s, cy - s, cx + s * 0.1, cy - s * 0.05, cx + s, cy + s, NaN, NaN, cx + s, cy - s, cx - s * 0.05, cy + s * 0.1, cx - s, cy + s];
}

/** A foam-capped wave line across the board at x (tide sweep), wobbling with t. */
export function waveLinePts(x: number, top: number, bottom: number, t: number, amp: number): number[] {
  'worklet';
  const out: number[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const y = top + ((bottom - top) * i) / steps;
    out.push(x + Math.sin(i * 0.9 + t * 0.012) * amp, y);
  }
  return out;
}

/** Spiral under the shark (stall swirl), `k` 0..1 grows it. */
export function spiralPts(cx: number, cy: number, k: number, rot: number, squash: number): number[] {
  'worklet';
  const out: number[] = [];
  for (let s = 0; s < 40; s++) {
    const a = rot + s * 0.32;
    const r = 3 + s * 0.8 * k;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r * squash);
  }
  return out;
}

/** An open brush ring (gap keeps it hand-drawn). */
export function ringPts(cx: number, cy: number, r: number, start: number): number[] {
  'worklet';
  const out: number[] = [];
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const a = start + (Math.PI * 1.85 * i) / steps;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8);
  }
  return out;
}
