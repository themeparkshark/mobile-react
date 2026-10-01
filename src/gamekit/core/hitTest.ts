/**
 * hitTest.ts: walk-safe tap resolution.
 *
 * QUEUE REALITY: players tap one-handed while shuffling forward, so a tap
 * resolves to the NEAREST live target within a forgiving radius instead of
 * demanding a pixel-exact hit (Memory: "one-gesture nearest-card tap";
 * Whack: hitboxes follow the art plus forgiveness; Boss: per-target taps).
 *
 *   const i = nearestTarget(xs, ys, rs, live, n, tapX, tapY, { forgiveness: walkForgiveness(walk) });
 *
 * - Distance is normalized by each target's radius, so a big target near the
 *   finger does not steal from a small target under it.
 * - `forgiveness` multiplies radii (1.15 walking, more on jostle).
 * - `ambiguityPx`: when the two best candidates are this close in scaled
 *   distance the tap goes to the one that is actually under the finger, and if
 *   neither is (a bump between two cards) it is ignored (`AMBIGUOUS`), so a
 *   bump never flips the wrong card.
 * - `swipeKind` classifies a touch stroke (tap vs swipe vs drag) with
 *   thresholds that tolerate a step.
 *
 * Pure and worklet-safe; flat arrays, no allocation.
 */

export const MISS = -1;
export const AMBIGUOUS = -2;

export interface HitOptions {
  /** Radius multiplier (walkForgiveness). */
  forgiveness?: number;
  /** Extra absolute px for the outer catch ring. */
  slopPx?: number;
  /** Scaled-distance gap under which two candidates are ambiguous. */
  ambiguity?: number;
}

export function nearestTarget(
  xs: ArrayLike<number>, ys: ArrayLike<number>, rs: ArrayLike<number>, live: ArrayLike<number> | null,
  n: number, x: number, y: number, opts: HitOptions = {},
): number {
  'worklet';
  const f = opts.forgiveness ?? 1;
  const slop = opts.slopPx ?? 0;
  const amb = opts.ambiguity ?? 0.12;
  let best = MISS;
  let bestD = Infinity;
  let second = Infinity;
  let bestRaw = Infinity;
  let secondIdx = MISS;
  let secondRaw = Infinity;
  for (let i = 0; i < n; i++) {
    if (live && !live[i]) continue;
    const r = rs[i] * f + slop;
    if (r <= 0) continue;
    const raw = Math.hypot(x - xs[i], y - ys[i]);
    const d = raw / r;
    if (d > 1) continue;
    if (d < bestD) {
      second = bestD;
      secondIdx = best;
      secondRaw = bestRaw;
      bestD = d;
      best = i;
      bestRaw = raw;
    } else if (d < second) {
      second = d;
      secondIdx = i;
      secondRaw = raw;
    }
  }
  if (best === MISS) return MISS;
  if (secondIdx !== MISS && second - bestD < amb) {
    // Ambiguous: only accept a candidate the finger is truly inside (unforgiven radius).
    const inBest = bestRaw <= rs[best];
    const inSecond = secondRaw <= rs[secondIdx];
    if (inBest && !inSecond) return best;
    if (inSecond && !inBest) return secondIdx;
    if (!inBest && !inSecond) return AMBIGUOUS;
  }
  return best;
}

/** Point-in-rect with forgiveness (cards, tiles, buttons). Grows from the centre. */
export function inRectForgiving(
  x: number, y: number, rx: number, ry: number, rw: number, rh: number, forgiveness = 1,
): boolean {
  'worklet';
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  return Math.abs(x - cx) <= (rw * forgiveness) / 2 && Math.abs(y - cy) <= (rh * forgiveness) / 2;
}

export const STROKE_TAP = 0;
export const STROKE_SWIPE = 1;
export const STROKE_DRAG = 2;

/**
 * Classify a finished touch. A walking tap can drift ~10-20 px; a swipe is
 * fast and long; anything slow and long is a drag.
 */
export function swipeKind(dx: number, dy: number, durMs: number, tapSlopPx = 22, swipeMinPx = 36, swipeMaxMs = 350): number {
  'worklet';
  const d = Math.hypot(dx, dy);
  if (d <= tapSlopPx) return STROKE_TAP;
  if (d >= swipeMinPx && durMs <= swipeMaxMs) return STROKE_SWIPE;
  return STROKE_DRAG;
}

/** Four-way direction of a swipe: 0 up, 1 right, 2 down, 3 left. */
export function swipeDir(dx: number, dy: number): number {
  'worklet';
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}
