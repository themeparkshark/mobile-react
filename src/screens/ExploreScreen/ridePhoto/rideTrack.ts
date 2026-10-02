import type { RideTrack } from '../ridePhoto';

/**
 * Track geometry for the Ride Photo scene, in scene points. Pure: a smooth
 * Catmull-Rom spline through a few control points per ride, resampled by arc
 * length into a lookup table the UI-thread worklets read (no Skia calls on
 * the UI thread, no allocation per frame).
 */

export interface TrackLut {
  /** x, y, angle (radians) for each sample, evenly spaced by arc length. */
  readonly xs: number[];
  readonly ys: number[];
  readonly angles: number[];
  /** SVG path of the rail centre line. */
  readonly path: string;
  /** Where the flash frame sits (scene points) and the track height there. */
  readonly frameX: number;
  readonly frameY: number;
  /** Support posts: x, top y. */
  readonly posts: { x: number; y: number }[];
}

export const LUT_SAMPLES = 160;

/** Control points in 0..1 scene space. The car enters off the left edge and exits off the right. */
const SHAPES: Readonly<Record<RideTrack, readonly (readonly [number, number])[]>> = {
  family: [[-0.2, 0.7], [0.1, 0.68], [0.3, 0.6], [0.5, 0.66], [0.66, 0.66], [0.85, 0.62], [1.2, 0.64]],
  hill: [[-0.2, 0.72], [0.02, 0.7], [0.2, 0.34], [0.27, 0.3], [0.38, 0.52], [0.48, 0.7], [0.66, 0.66], [0.84, 0.6], [1.2, 0.62]],
  dark: [[-0.2, 0.72], [0.02, 0.7], [0.2, 0.36], [0.27, 0.32], [0.38, 0.54], [0.48, 0.7], [0.66, 0.66], [0.84, 0.6], [1.2, 0.62]],
  launch: [[-0.2, 0.68], [0.1, 0.68], [0.3, 0.68], [0.45, 0.5], [0.55, 0.42], [0.66, 0.6], [0.84, 0.64], [1.2, 0.6]],
};
export const FRAME_AT = 0.66;

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function buildTrack(track: RideTrack, width: number, height: number, samples = LUT_SAMPLES): TrackLut {
  const pts = SHAPES[track].map(([x, y]) => [x * width, y * height] as const);
  // Dense polyline along the spline.
  const dense: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < 24; s++) {
      const t = s / 24;
      dense.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  dense.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  const lengths = [0];
  for (let i = 1; i < dense.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const total = lengths[lengths.length - 1];
  const xs: number[] = [], ys: number[] = [], angles: number[] = [];
  let j = 1;
  for (let k = 0; k < samples; k++) {
    const target = (k / (samples - 1)) * total;
    while (j < lengths.length - 1 && lengths[j] < target) j++;
    const span = lengths[j] - lengths[j - 1] || 1;
    const f = Math.max(0, Math.min(1, (target - lengths[j - 1]) / span));
    const x = dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * f;
    const y = dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * f;
    xs.push(x); ys.push(y);
    angles.push(Math.atan2(dense[j][1] - dense[j - 1][1], dense[j][0] - dense[j - 1][0]));
  }
  const path = `M ${dense.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}`;
  const frameX = FRAME_AT * width;
  let nearest = 0;
  for (let k = 1; k < samples; k++) if (Math.abs(xs[k] - frameX) < Math.abs(xs[nearest] - frameX)) nearest = k;
  const frameY = ys[nearest];
  const posts: { x: number; y: number }[] = [];
  for (let x = width * 0.05; x < width * 0.98; x += width / 9) {
    let best = 0;
    for (let k = 1; k < samples; k++) if (Math.abs(xs[k] - x) < Math.abs(xs[best] - x)) best = k;
    posts.push({ x: xs[best], y: ys[best] });
  }
  return { xs, ys, angles, path, frameX, frameY, posts };
}

/** Sample the lookup table at u (0..1 of the track). Worklet-safe. */
export function sampleTrack(lut: { xs: number[]; ys: number[]; angles: number[] }, u: number): { x: number; y: number; angle: number } {
  'worklet';
  const n = lut.xs.length;
  const f = Math.max(0, Math.min(1, u)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const r = f - i;
  return {
    x: lut.xs[i] + (lut.xs[i + 1] - lut.xs[i]) * r,
    y: lut.ys[i] + (lut.ys[i + 1] - lut.ys[i]) * r,
    angle: lut.angles[i] + (lut.angles[i + 1] - lut.angles[i]) * r,
  };
}
