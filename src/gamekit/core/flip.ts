/**
 * flip.ts: the card / tile flip pose, shared by Memory Match cards and Trivia
 * face-down tiles.
 *
 * One pure function turns flip progress into every layer a premium flip
 * needs (Memory 3.x: rotateY with the face swapping at exactly 90 deg, a 2 px
 * thickness strip between 70 and 110 deg, side darkening, a specular band
 * that tracks the angle, a contact shadow that stretches with the angle, and
 * a landing squash 0.97 over 90 ms). The network hold pose (server-revealed
 * modes) rotates to 60 deg with a 2 deg 6 Hz wobble only after 180 ms, so a
 * fast network never shows a wobble.
 *
 * Pure and worklet-safe. Drive `t` from a shared value on the fx clock.
 */

import { ease } from './ease';

export interface FlipPose {
  /** Degrees 0..180 (0 = back up, 180 = face up). */
  angle: number;
  /** True once past 90 deg: draw the face (mirrored back to readable). */
  faceUp: boolean;
  /** Horizontal foreshortening |cos| for a 2D fallback. */
  scaleX: number;
  /** 0..1 opacity of the edge thickness strip (only 70..110 deg). */
  edge: number;
  /** 0..1 side darkening (max at 90 deg); apply as a light navy overlay, never black. */
  shade: number;
  /** Specular band x position across the card, 0..1. */
  specularX: number;
  /** 0..1 specular strength. */
  specular: number;
  /** Contact shadow stretch (1 = resting). */
  shadowStretch: number;
  /** Landing squash scale (1 = resting). */
  squash: number;
}

export interface FlipTiming {
  flipMs: number;
  squashMs: number;
  squashTo: number;
}

export const FLIP_DEFAULT: FlipTiming = { flipMs: 220, squashMs: 90, squashTo: 0.97 };

/** Pose at `elapsedMs` since the flip began (toward face-up; reverse by passing reverse=true). */
export function flipPose(elapsedMs: number, timingIn?: FlipTiming, reverse = false): FlipPose {
  'worklet';
  // No module-object default parameter: worklets do not capture those.
  const timing = timingIn ?? { flipMs: 220, squashMs: 90, squashTo: 0.97 };
  const u = Math.max(0, Math.min(1, elapsedMs / timing.flipMs));
  const e = ease('inOutCubic', u);
  const angle = (reverse ? 1 - e : e) * 180;
  const rad = (angle * Math.PI) / 180;
  const edge = angle > 70 && angle < 110 ? 1 - Math.abs(angle - 90) / 20 : 0;
  const side = Math.abs(Math.sin(rad));
  // Landing squash after the rotation ends.
  const after = elapsedMs - timing.flipMs;
  let squash = 1;
  if (after >= 0 && after < timing.squashMs) {
    const s = after / timing.squashMs;
    squash = 1 - (1 - timing.squashTo) * Math.sin(Math.PI * s);
  }
  return {
    angle,
    faceUp: angle >= 90,
    scaleX: Math.max(0.02, Math.abs(Math.cos(rad))),
    edge,
    shade: side * 0.35,
    specularX: angle / 180,
    specular: side * 0.6,
    shadowStretch: 1 + side * 0.35,
    squash,
  };
}

/**
 * Network hold: the card leans to 60 deg in 110 ms and waits for the server.
 * The 2 deg 6 Hz wobble only starts after `wobbleAfterMs` (180 ms).
 */
export function holdPose(elapsedMs: number, holdAngle = 60, riseMs = 110, wobbleAfterMs = 180): number {
  'worklet';
  const u = Math.max(0, Math.min(1, elapsedMs / riseMs));
  let a = holdAngle * (1 - (1 - u) * (1 - u));
  if (elapsedMs > wobbleAfterMs) a += 2 * Math.sin(((elapsedMs - wobbleAfterMs) / 1000) * Math.PI * 2 * 6);
  return a;
}

/** Deal-in pose (Memory: 38 ms stagger, 260 ms, rotateZ -12 to 0, scale 0.6 to 1, out-back overshoot). */
export function dealPose(elapsedMs: number, index: number, staggerMs = 38, durMs = 260): { scale: number; rot: number; alpha: number } {
  'worklet';
  const t = (elapsedMs - index * staggerMs) / durMs;
  if (t <= 0) return { scale: 0.6, rot: -12, alpha: 0 };
  const u = Math.min(1, t);
  const c1 = 1.2;
  const c3 = c1 + 1;
  const back = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
  return { scale: 0.6 + 0.4 * back, rot: -12 * (1 - back), alpha: Math.min(1, u * 3) };
}
