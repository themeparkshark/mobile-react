/**
 * projection: true 1/z perspective for the parade highway (design 3.1, 6.2).
 *
 *   u = timeToHit / approachMs     1 at spawn, 0 on the judgment line
 *   z = u * Z                      depth, linear in time (evenly spaced)
 *   s = f / (f + z)                scale, 0.35 at spawn, 1 on the line
 *   y = yHorizon + (yLine - yHorizon) * s
 *
 * With Z = 1.857 f the spawn scale is 0.35. Bar and beat lines use the same
 * function, so a steady rhythm looks steady and accelerates toward the drum
 * like a street parade. Pure and worklet-safe.
 */

export const Z_OVER_F = 1.857;

export interface Lane {
  /** Judgment line y (60% of the play height). */
  yLine: number;
  /** Vanishing y (hidden behind the header). */
  yHorizon: number;
  /** Lane centre x. */
  cx: number;
  /** Lane half-width on the judgment line. */
  halfW: number;
}

export function scaleAt(u: number): number {
  'worklet';
  const z = (u < 0 ? u * 0.25 : u) * Z_OVER_F;
  return 1 / (1 + z);
}

export function yAt(lane: Lane, u: number): number {
  'worklet';
  return lane.yHorizon + (lane.yLine - lane.yHorizon) * scaleAt(u);
}

/** u for a note at time tNote seen at clock `now`. */
export function uOf(tNote: number, now: number, approachMs: number): number {
  'worklet';
  return (tNote - now) / approachMs;
}

/** Note alpha: fades in over the first 8% of the approach. */
export function fadeIn(u: number): number {
  'worklet';
  if (u >= 1) return 0;
  if (u <= 0.92) return 1;
  return (1 - u) / 0.08;
}

/** Design reference: the layout for a 390 x 844 pt screen. */
export function laneFor(width: number, height: number, marchWide = 0): Lane {
  'worklet';
  const yLine = Math.round(height * 0.6);
  return { yLine, yHorizon: Math.round(height * 0.047), cx: width / 2, halfW: (75 + 13 * marchWide) * (width / 390) };
}
