/**
 * scoreFx.ts: score presentation curves (pure, worklet-safe, tested in node).
 *
 * Whack v5: fly-ups overshoot 1.3x with a +/-6 deg tilt, hold 250 ms, then
 * curve to the header score over 350 ms. On arrival the score digit-rolls over
 * 200 ms with a 1.12 squash. FxStage draws the fly-up (`flyUp(..., { to })`);
 * the header reads `digitRollAt` from its own shared values.
 */

/**
 * Fly-to pose at time t (ms since spawn): returns [x, y, scale, rot, alpha].
 * Pop 0.6 -> overshoot in 70 ms, settle to 1.0 by 140 ms, hold, then a
 * quadratic Bezier (control point above the start) eased inOut into the target
 * while shrinking to 0.55.
 */
export function flyToPose(
  t: number, x0: number, y0: number, tx: number, ty: number, holdMs: number, travelMs: number, tilt: number, over: number,
): [number, number, number, number, number] {
  'worklet';
  const popMs = 140;
  if (t < popMs) {
    const k = t < 70 ? 0.6 + (over - 0.6) * (t / 70) : over + (1 - over) * ((t - 70) / 70);
    return [x0, y0, k, tilt * Math.min(1, t / 70), 1];
  }
  if (t < popMs + holdMs) return [x0, y0, 1, tilt, 1];
  const u = Math.min(1, (t - popMs - holdMs) / Math.max(1, travelMs));
  const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const cx = x0 + (tx - x0) * 0.2;
  const cy = Math.min(y0, ty) - 60;
  const a = 1 - e;
  const px = a * a * x0 + 2 * a * e * cx + e * e * tx;
  const py = a * a * y0 + 2 * a * e * cy + e * e * ty;
  return [px, py, 1 - 0.45 * e, tilt * (1 - e), u >= 1 ? 0 : 1];
}

/** Total fly-to time (ms) for scheduling the digit roll. */
export function flyToDurationMs(holdMs = 250, travelMs = 350): number {
  'worklet';
  return 140 + holdMs + travelMs;
}

/**
 * Digit roll: the shown value rolls from `from` to `to` over `ms` (200) with
 * an outCubic count and a squash that peaks at `squash` (1.12) on arrival and
 * settles by the end. Returns [shownValue, scaleY]. scaleX is 2 - scaleY for
 * a volume-preserving squash.
 */
export function digitRollAt(from: number, to: number, t: number, ms = 200, squash = 1.12): [number, number] {
  'worklet';
  if (t <= 0) return [from, squash];
  if (t >= ms) return [to, 1];
  const u = t / ms;
  const e = 1 - Math.pow(1 - u, 3);
  const shown = Math.round(from + (to - from) * e);
  return [shown, 1 + (squash - 1) * (1 - u) * (1 - u)];
}
