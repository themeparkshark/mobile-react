/**
 * timeline: fx-clock animation helpers and cue sequencing.
 *
 * Every FX tween should read the FX clock (clock.fxMs), not wall time, so a
 * hit-stop freezes it and slow-mo slows it. These helpers are closed-form
 * functions of elapsed fx time: no per-frame state, deterministic, and they
 * resume exactly after a pause or a snapshot restore.
 *
 * - springAt: analytic damped spring (the same damping/stiffness/mass numbers
 *   the designs quote, e.g. {10, 380, 0.5}).
 * - Timeline: a sorted list of named cues (ms offsets). `timelineDue` returns
 *   the cues crossed between two fx times, so a results sequence, a boss KO or
 *   a Current Quest carry fires each beat exactly once, even across a freeze.
 * - fitView: a fixed logical view (Sharky's 960x1000 units) fitted to any
 *   screen, with the transform for input.
 *
 * Pure and worklet-safe.
 */

export interface SpringParams {
  damping: number;
  stiffness: number;
  mass: number;
}

/**
 * Position of a spring released at `from` toward `to` with initial velocity
 * `v0` (units/s), `elapsedMs` later. Handles under, critical and over damping.
 */
export function springAt(elapsedMs: number, from: number, to: number, p: SpringParams, v0 = 0): number {
  'worklet';
  if (elapsedMs <= 0) return from;
  const t = elapsedMs / 1000;
  const m = Math.max(1e-4, p.mass);
  const w0 = Math.sqrt(p.stiffness / m);
  const zeta = p.damping / (2 * Math.sqrt(p.stiffness * m));
  const x0 = from - to;
  let x: number;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-zeta * w0 * t);
    x = e * (x0 * Math.cos(wd * t) + ((v0 + zeta * w0 * x0) / wd) * Math.sin(wd * t));
  } else if (zeta === 1) {
    x = Math.exp(-w0 * t) * (x0 + (v0 + w0 * x0) * t);
  } else {
    const s = Math.sqrt(zeta * zeta - 1);
    const r1 = -w0 * (zeta - s);
    const r2 = -w0 * (zeta + s);
    const c2 = (v0 - r1 * x0) / (r2 - r1);
    const c1 = x0 - c2;
    x = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
  }
  return to + x;
}

/** Rough settle time (ms) of a spring, for scheduling what comes after it. */
export function springSettleMs(p: SpringParams, eps = 0.01): number {
  'worklet';
  const m = Math.max(1e-4, p.mass);
  const w0 = Math.sqrt(p.stiffness / m);
  const zeta = p.damping / (2 * Math.sqrt(p.stiffness * m));
  const rate = zeta < 1 ? zeta * w0 : w0 * (zeta - Math.sqrt(Math.max(0, zeta * zeta - 1)));
  return Math.round((Math.log(1 / eps) / Math.max(1e-3, rate)) * 1000);
}

// -----------------------------------------------------------------------------
// Cue timelines
// -----------------------------------------------------------------------------

export interface TimelineCue {
  at: number;
  id: number;
}

export interface Timeline {
  cues: TimelineCue[];
  /** fx time the timeline started at (-1 = not running). */
  startFx: number;
  /** Index of the next cue to fire. */
  next: number;
}

/** Build from { id: atMs } pairs (ids are numbers so it stays worklet-cheap). */
export function createTimeline(cues: ReadonlyArray<readonly [number, number]>): Timeline {
  'worklet';
  const list: TimelineCue[] = [];
  for (let i = 0; i < cues.length; i++) list.push({ id: cues[i][0], at: cues[i][1] });
  list.sort((a, b) => a.at - b.at);
  return { cues: list, startFx: -1, next: 0 };
}

export function startTimeline(tl: Timeline, fxNow: number): void {
  'worklet';
  tl.startFx = fxNow;
  tl.next = 0;
}

/**
 * Cue ids that became due by `fxNow` (each fires once, in order). Returns an
 * empty array when nothing is due or the timeline is not running.
 */
export function timelineDue(tl: Timeline, fxNow: number): number[] {
  'worklet';
  const out: number[] = [];
  if (tl.startFx < 0) return out;
  const t = fxNow - tl.startFx;
  while (tl.next < tl.cues.length && tl.cues[tl.next].at <= t) {
    out.push(tl.cues[tl.next].id);
    tl.next++;
  }
  return out;
}

export function timelineDone(tl: Timeline): boolean {
  'worklet';
  return tl.startFx >= 0 && tl.next >= tl.cues.length;
}

/** Elapsed fx ms since the timeline started (0 when idle). */
export function timelineElapsed(tl: Timeline, fxNow: number): number {
  'worklet';
  return tl.startFx < 0 ? 0 : fxNow - tl.startFx;
}

/**
 * Stretch a cue list to land on a beat grid: each offset is snapped to the
 * nearest multiple of `gridMs` (Results stars on the stinger's half-beats).
 */
export function snapCues(cues: ReadonlyArray<readonly [number, number]>, gridMs: number): Array<[number, number]> {
  return cues.map(([id, at]) => [id, Math.round(at / gridMs) * gridMs] as [number, number]);
}

// -----------------------------------------------------------------------------
// Fixed logical view
// -----------------------------------------------------------------------------

export interface ViewFit {
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Visible logical rect (cover mode can crop). */
  visibleW: number;
  visibleH: number;
}

/**
 * Fit a logical view (viewW x viewH units) into a layout box. 'contain' shows
 * everything (letterbox), 'cover' fills the box (crops), 'width' fits width.
 */
export function fitView(layoutW: number, layoutH: number, viewW: number, viewH: number, mode: 'contain' | 'cover' | 'width' = 'contain'): ViewFit {
  'worklet';
  const sx = layoutW / viewW;
  const sy = layoutH / viewH;
  const scale = mode === 'cover' ? Math.max(sx, sy) : mode === 'width' ? sx : Math.min(sx, sy);
  return {
    scale,
    offsetX: (layoutW - viewW * scale) / 2,
    offsetY: (layoutH - viewH * scale) / 2,
    visibleW: Math.min(viewW, layoutW / scale),
    visibleH: Math.min(viewH, layoutH / scale),
  };
}

/** Screen point to logical units (for input). */
export function screenToView(fit: ViewFit, x: number, y: number): { x: number; y: number } {
  'worklet';
  return { x: (x - fit.offsetX) / fit.scale, y: (y - fit.offsetY) / fit.scale };
}
