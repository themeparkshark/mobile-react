import { rideProgress, type RideTrack } from '../ridePhoto';

/**
 * Track geometry for the Ride Photo scene, in scene points. Pure: a smooth
 * Catmull-Rom spline through a few control points per ride, resampled by arc
 * length into a lookup table the UI-thread worklets read (no Skia calls on
 * the UI thread, no allocation per frame).
 */

export interface TrackLut {
  /** x, y, angle (radians, smoothed and clamped) for each sample, evenly spaced by arc length. */
  readonly xs: number[];
  readonly ys: number[];
  readonly angles: number[];
  /** SVG path of the rail centre line. */
  readonly path: string;
  /** The flash frame's centre (scene points) and the track height there. */
  readonly frameX: number;
  readonly frameY: number;
  /** Support posts: x, top y. */
  readonly posts: { x: number; y: number }[];
  /** The largest gap between the real (smoothed) slope and the clamped pitch, radians. Kept under 6 deg. */
  readonly clampError: number;
}

/** The worklet-safe part of the LUT (no strings, no posts), so gestures and reactions capture less. */
export type TrackSamples = Pick<TrackLut, 'xs' | 'ys' | 'angles'>;

export const LUT_SAMPLES = 160;
/** The car never pitches more than this, so it never looks derailed. */
export const MAX_PITCH = (28 * Math.PI) / 180;

/** Control points in 0..1 of the track band. The car enters off the left edge and exits off the right. */
const SHAPES: Readonly<Record<RideTrack, readonly (readonly [number, number])[]>> = {
  family: [[-0.25, 0.75], [0.1, 0.72], [0.3, 0.6], [0.5, 0.68], [0.66, 0.7], [0.85, 0.66], [1.25, 0.68]],
  hill: [[-0.25, 0.78], [0.04, 0.78], [0.22, 0.2], [0.3, 0.16], [0.42, 0.5], [0.52, 0.8], [0.7, 0.74], [0.86, 0.72], [1.25, 0.72]],
  dark: [[-0.25, 0.78], [0.04, 0.78], [0.22, 0.24], [0.3, 0.2], [0.42, 0.54], [0.52, 0.8], [0.7, 0.74], [0.86, 0.72], [1.25, 0.72]],
  launch: [[-0.25, 0.72], [0.1, 0.72], [0.3, 0.72], [0.45, 0.45], [0.55, 0.36], [0.68, 0.66], [0.86, 0.7], [1.25, 0.66]],
};
/**
 * Where the flash frame sits across the scene. Rare's frame is on the slow
 * run-out after the drop, never on the fastest part of the track.
 */
export const FRAME_AT: Readonly<Record<RideTrack, number>> = { family: 0.62, hill: 0.74, dark: 0.72, launch: 0.76 };
/** Back-compat for callers that read one value. */
export const FRAME_AT_DEFAULT = 0.66;

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * The track runs inside a band of the scene (`bandTop` to `bandTop + bandHeight`),
 * so a tall viewfinder keeps its sky.
 */
export function buildTrack(track: RideTrack, width: number, height: number, samples = LUT_SAMPLES,
  band: { top: number; height: number } = { top: 0, height }, frameShift = 0): TrackLut {
  return buildLut(SHAPES[track], width, band, (FRAME_AT[track] + frameShift) * width, samples);
}

/**
 * Any ride path: a Catmull-Rom spline through control points (0..1 of the width
 * and of the band), resampled by arc length. `frameX` is the camera moment's x.
 */
export function buildLut(shape: readonly (readonly [number, number])[], width: number,
  band: { top: number; height: number }, frameX: number, samples = LUT_SAMPLES, maxPitch = MAX_PITCH): TrackLut {
  const pts = shape.map(([x, y]) => [x * width, band.top + y * band.height] as const);
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
  const xs: number[] = [], ys: number[] = [], raw: number[] = [];
  let j = 1;
  for (let k = 0; k < samples; k++) {
    const target = (k / (samples - 1)) * total;
    while (j < lengths.length - 1 && lengths[j] < target) j++;
    const span = lengths[j] - lengths[j - 1] || 1;
    const f = Math.max(0, Math.min(1, (target - lengths[j - 1]) / span));
    xs.push(dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * f);
    ys.push(dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * f);
    raw.push(Math.atan2(dense[j][1] - dense[j - 1][1], dense[j][0] - dense[j - 1][0]));
  }
  // Smooth the pitch over 5 samples (no LUT stepping) and clamp it.
  let clampError = 0;
  const angles = raw.map((_, k) => {
    let sum = 0, n = 0;
    for (let d = -2; d <= 2; d++) { const i = k + d; if (i >= 0 && i < raw.length) { sum += raw[i]; n++; } }
    const smooth = sum / n;
    const clamped = Math.max(-maxPitch, Math.min(maxPitch, smooth));
    clampError = Math.max(clampError, Math.abs(smooth - clamped));
    return clamped;
  });
  const path = `M ${dense.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}`;
  let nearest = 0;
  for (let k = 1; k < samples; k++) if (Math.abs(xs[k] - frameX) < Math.abs(xs[nearest] - frameX)) nearest = k;
  const frameY = ys[nearest];
  const posts: { x: number; y: number }[] = [];
  for (let x = width * 0.05; x < width * 0.98; x += width / 8) {
    let best = 0;
    for (let k = 1; k < samples; k++) if (Math.abs(xs[k] - x) < Math.abs(xs[best] - x)) best = k;
    posts.push({ x: xs[best], y: ys[best] });
  }
  return { xs, ys, angles, path, frameX: xs[nearest], frameY, posts, clampError };
}

/** Time fraction (0..1) at which a monotonic progress curve reaches u. */
export function tAtProgress(progress: (t: number) => number, u: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (progress(mid) < u) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** u (0..1 of the track) where the car's centre is at scene x. */
export function uAtX(lut: TrackSamples, x: number): number {
  let best = 0;
  for (let k = 1; k < lut.xs.length; k++) if (Math.abs(lut.xs[k] - x) < Math.abs(lut.xs[best] - x)) best = k;
  return best / (lut.xs.length - 1);
}

/** Time fraction of a pass (0..1) at which the car reaches track position u. */
export function tAtU(track: RideTrack, u: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (rideProgress(track, mid) < u) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Sample the lookup table at u (0..1 of the track). Worklet-safe. */
export function sampleTrack(lut: TrackSamples, u: number): { x: number; y: number; angle: number } {
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

/** Only x, with no allocation (per-frame use). Worklet-safe. */
export function sampleTrackX(lut: TrackSamples, u: number): number {
  'worklet';
  const n = lut.xs.length;
  const f = Math.max(0, Math.min(1, u)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  return lut.xs[i] + (lut.xs[i + 1] - lut.xs[i]) * (f - i);
}

/**
 * Per-ride variety, seeded by the find so the same find always rides the same
 * way: the flash frame sits in one of three slots on the run-out, and the sky
 * is day or sunset.
 */
export function rideVariant(seed: number): { frameShift: number; sky: 'day' | 'sunset' | 'night' } {
  const n = Math.abs(Math.round(seed)) || 0;
  return { frameShift: [0, -0.06, 0.05][n % 3], sky: n % 4 === 3 ? 'sunset' : n % 4 === 2 ? 'night' : 'day' };
}
