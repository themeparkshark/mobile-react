/**
 * trail.ts: ribbon trails, ink brush strokes and afterimages.
 *
 * - Ribbon trail (Current Quest Riptide ribbon, Sharky bubble streaks, Line
 *   Party attack bubbles): a ring of recent points that becomes a tapering
 *   triangle strip, fading with age.
 * - Brush stroke (Current Quest ink FX rule: "every procedural ring, trail,
 *   wave line, recap line and X is a tapering brush stroke over a 2 px INK
 *   outline"): the same strip builder over a fixed polyline, with a taper-in
 *   at the start and a taper-out at the end. Draw it twice (outline pass
 *   widened by `outline`, then the fill) and it reads as Alex's ink.
 * - Afterimages (Sharky Dash: 4 afterimages every 30 ms; boss lunges): a
 *   small ring of past poses with fading alpha.
 *
 * Output is flat numbers so the builders run in worklets with no allocation
 * per frame beyond the caller's reusable arrays. `fx/RibbonTrail.tsx` turns
 * the strip into one Skia `<Vertices mode="triangleStrip">` per pass.
 */

export interface Trail {
  cap: number;
  xs: number[];
  ys: number[];
  ts: number[];
  head: number;
  size: number;
  lifeMs: number;
  minDist: number;
}

export function createTrail(cap = 16, lifeMs = 300, minDist = 3): Trail {
  'worklet';
  const z: number[] = [];
  for (let i = 0; i < cap; i++) z.push(0);
  return { cap, xs: z.slice(), ys: z.slice(), ts: z.slice(), head: 0, size: 0, lifeMs, minDist };
}

export function clearTrail(t: Trail): void {
  'worklet';
  t.size = 0;
  t.head = 0;
}

/** Add a point (skipped when closer than minDist to the newest, but its time refreshes). */
export function trailPush(t: Trail, x: number, y: number, nowMs: number): void {
  'worklet';
  if (t.size > 0) {
    const last = (t.head - 1 + t.cap) % t.cap;
    const dx = x - t.xs[last];
    const dy = y - t.ys[last];
    if (dx * dx + dy * dy < t.minDist * t.minDist) {
      t.ts[last] = nowMs;
      return;
    }
  }
  t.xs[t.head] = x;
  t.ys[t.head] = y;
  t.ts[t.head] = nowMs;
  t.head = (t.head + 1) % t.cap;
  if (t.size < t.cap) t.size += 1;
}

/** Live points newest-first into out arrays; returns the count (aged-out points are skipped). */
export function trailPoints(t: Trail, nowMs: number, outX: number[], outY: number[], outAge: number[]): number {
  'worklet';
  let n = 0;
  for (let k = 0; k < t.size; k++) {
    const i = (t.head - 1 - k + t.cap * 2) % t.cap;
    const age = (nowMs - t.ts[i]) / t.lifeMs;
    if (age >= 1) break;
    outX[n] = t.xs[i];
    outY[n] = t.ys[i];
    outAge[n] = Math.max(0, age);
    n += 1;
  }
  return n;
}

export interface StripStyle {
  /** Width at the head (u = 0). */
  head: number;
  /** Width at the tail (u = 1). */
  tail: number;
  /** Fraction of the length that tapers in from 0 at the head (brush start). */
  taperIn: number;
  /** Extra half-width added on every side (outline pass). */
  grow: number;
}

/**
 * Build a triangle strip over a polyline. Writes 2 vertices per point into
 * out (x0,y0,x1,y1,...) and a per-vertex alpha factor into outA. `age`
 * (optional, per point 0..1) fades and thins old points. Returns the vertex count.
 */
export function buildStrip(
  px: number[], py: number[], n: number, style: StripStyle,
  out: number[], outA: number[], age?: number[],
): number {
  'worklet';
  if (n < 2) return 0;
  // Arc length for u.
  let total = 0;
  for (let i = 1; i < n; i++) total += Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
  if (total <= 0) return 0;
  let run = 0;
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) run += Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
    const u = run / total;
    // Direction from neighbours (central difference).
    const a = i > 0 ? i - 1 : i;
    const b = i < n - 1 ? i + 1 : i;
    let dx = px[b] - px[a];
    let dy = py[b] - py[a];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    let w = style.head + (style.tail - style.head) * u;
    if (style.taperIn > 0 && u < style.taperIn) w *= u / style.taperIn;
    const ag = age ? age[i] : 0;
    w = w * (1 - ag * 0.6);
    const half = Math.max(0, w * 0.5) + style.grow;
    const nx = -dy * half;
    const ny = dx * half;
    out[v * 2] = px[i] + nx;
    out[v * 2 + 1] = py[i] + ny;
    out[v * 2 + 2] = px[i] - nx;
    out[v * 2 + 3] = py[i] - ny;
    const alpha = (1 - ag) * (1 - ag);
    outA[v] = alpha;
    outA[v + 1] = alpha;
    v += 2;
  }
  return v;
}

/** Sample a quadratic curve into a polyline (brush arcs, recap lines). */
export function quadPolyline(
  x0: number, y0: number, cx: number, cy: number, x1: number, y1: number,
  steps: number, outX: number[], outY: number[],
): number {
  'worklet';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const m = 1 - t;
    outX[i] = m * m * x0 + 2 * m * t * cx + t * t * x1;
    outY[i] = m * m * y0 + 2 * m * t * cy + t * t * y1;
  }
  return steps + 1;
}

/** Sample a circle into a polyline (brush rings; the gap keeps it hand-drawn). */
export function ringPolyline(
  cx: number, cy: number, r: number, steps: number, outX: number[], outY: number[], startRad = -Math.PI / 2, sweep = Math.PI * 1.92,
): number {
  'worklet';
  for (let i = 0; i <= steps; i++) {
    const a = startRad + (sweep * i) / steps;
    outX[i] = cx + Math.cos(a) * r;
    outY[i] = cy + Math.sin(a) * r;
  }
  return steps + 1;
}

// -----------------------------------------------------------------------------
// Afterimages
// -----------------------------------------------------------------------------

export interface Afterimages {
  cap: number;
  x: number[];
  y: number[];
  rot: number[];
  frame: number[];
  t: number[];
  head: number;
  size: number;
  everyMs: number;
  lifeMs: number;
  lastAt: number;
}

export function createAfterimages(cap = 4, everyMs = 30, lifeMs = 160): Afterimages {
  'worklet';
  const z: number[] = [];
  for (let i = 0; i < cap; i++) z.push(0);
  return { cap, x: z.slice(), y: z.slice(), rot: z.slice(), frame: z.slice(), t: z.slice(), head: 0, size: 0, everyMs, lifeMs, lastAt: -1e9 };
}

/** Record a pose if `everyMs` passed. Returns true when a ghost was stored. */
export function afterimagePush(a: Afterimages, nowMs: number, x: number, y: number, rot = 0, frame = 0): boolean {
  'worklet';
  if (nowMs - a.lastAt < a.everyMs) return false;
  a.lastAt = nowMs;
  a.x[a.head] = x;
  a.y[a.head] = y;
  a.rot[a.head] = rot;
  a.frame[a.head] = frame;
  a.t[a.head] = nowMs;
  a.head = (a.head + 1) % a.cap;
  if (a.size < a.cap) a.size += 1;
  return true;
}

/** Alpha of ghost slot i at now (0 when expired). Newest ghosts are strongest. */
export function afterimageAlpha(a: Afterimages, i: number, nowMs: number, peak = 0.45): number {
  'worklet';
  if (i >= a.size) return 0;
  const u = (nowMs - a.t[i]) / a.lifeMs;
  if (u < 0 || u >= 1) return 0;
  return peak * (1 - u) * (1 - u);
}
