/**
 * How the follow camera moves. Pure, unit tested (tools/tests/map-motion.test.cjs)
 * and modelled frame by frame in motion/bin/model.cjs.
 *
 * MapLibre's camera lives on the native side; JS can only send it a target and
 * a duration. The old follow sent an ease-in-out camera move on every GPS fix
 * and every compass tick: each new move cut the last one off at its slowest
 * point, so walking pulsed (stop, go, stop) and turning juddered.
 *
 * Now one small loop drives the camera while something moves: about ten
 * times a second it sends a short LINEAR move toward where the shark will be
 * one segment from now (the pace chaser below) and toward the cleaned
 * compass heading. Each move starts from wherever the last one had
 * got to, so the camera keeps an even speed across segments. When nothing is
 * moving it sends nothing at all (battery).
 */
import type { GlidePoint } from './glide';
import { angleDelta, normDeg } from './headingFilter';

/** The follow loop's tick while something moves (ms). */
export const CAM_TICK_MS = 100;
/** Each camera move lasts this long (longer than a tick, so a late tick never lets the camera stop). */
export const CAM_SEGMENT_MS = 170;
/** Running estimate of the real gap between loop ticks (ms); a busy JS thread runs them late. */
export function segmentGap(previous: number, observedMs: number): number {
  return 0.7 * previous + 0.3 * Math.max(CAM_TICK_MS, observedMs);
}
/** A camera move lasts past the next tick (1.5x the real gap), so the camera never stops between moves. */
export function segmentMs(gapMs: number): number {
  return Math.round(Math.min(480, Math.max(CAM_SEGMENT_MS, gapMs * 1.5)));
}
/** Part of the turn speed added ahead of the heading, so the linear chase does not trail the turn. */
export const CAM_HEADING_LEAD = 0.3;
/** Changes smaller than these are not worth a camera move. */
export const CAM_EPS_DEG = 0.08;
export const CAM_EPS_M = 0.03;
/** Mode changes and recenters: one eased move this long, then the loop takes over again. */
export const CAM_MODE_SPIN_MS = 650;
export const CAM_RECENTER_MS = 450;

/** Which way is up while following: the way you face, or north. */
export type FollowMode = 'heading' | 'north';

/** Faster than this (m/s) between fixes is not a walk. */
export const GLIDE_MAX_CARRY_MPS = 3.5;

/**
 * Walking pace (m/s) from the last few fixes: straight-line distance over time across up to
 * four fixes (10 s at most), so GPS scatter between neighbouring fixes does not inflate it.
 */
export class WalkPace {
  private fixes: { p: GlidePoint; t: number }[] = [];
  push(p: GlidePoint, tMs: number): number {
    this.fixes.push({ p, t: tMs });
    while (this.fixes.length > 4 || (this.fixes.length > 1 && tMs - this.fixes[0].t > 10_000)) this.fixes.shift();
    return this.speed();
  }
  speed(): number {
    if (this.fixes.length < 2) return 0;
    const a = this.fixes[0], b = this.fixes[this.fixes.length - 1];
    const s = (b.t - a.t) / 1000;
    if (s <= 0) return 0;
    const dy = (b.p.latitude - a.p.latitude) * 111_320;
    const dx = (b.p.longitude - a.p.longitude) * 111_320 * Math.cos(b.p.latitude * Math.PI / 180);
    return Math.min(GLIDE_MAX_CARRY_MPS, Math.hypot(dx, dy) / s);
  }
  /** Walking velocity (m/s east, north) over the same fixes; zero with fewer than two. */
  velocity(): [number, number] {
    if (this.fixes.length < 2) return [0, 0];
    const a = this.fixes[0], b = this.fixes[this.fixes.length - 1];
    const s = (b.t - a.t) / 1000;
    if (s <= 0) return [0, 0];
    const vn = (b.p.latitude - a.p.latitude) * 111_320 / s;
    const ve = (b.p.longitude - a.p.longitude) * 111_320 * Math.cos(b.p.latitude * Math.PI / 180) / s;
    const sp = Math.hypot(ve, vn);
    return sp > GLIDE_MAX_CARRY_MPS ? [0, 0] : [ve, vn];
  }
  /** Typical gap between fixes (s) over the same fixes. */
  gap(): number {
    if (this.fixes.length < 2) return 0;
    return (this.fixes[this.fixes.length - 1].t - this.fixes[0].t) / 1000 / (this.fixes.length - 1);
  }
  reset(): void { this.fixes = []; }
}

/** A path at walking pace: about as long as the next fix should take, a touch longer so it is still moving when that fix lands. */
export function walkGlideMs(meters: number, walkSpeedMps: number): number {
  if (!(meters > 0)) return 0;
  return Math.round(Math.min(4000, Math.max(450, (meters / Math.max(0.6, walkSpeedMps)) * 1000 * 1.12)));
}

/** The bearing the camera aims for: north, or the heading plus a little of the turn speed. */
export function targetBearing(mode: FollowMode, heading: number | null, speedDps: number, segmentMs = CAM_SEGMENT_MS): number | null {
  if (mode === 'north') return 0;
  if (heading === null) return null;
  const lead = Math.max(-120, Math.min(120, speedDps)) * (segmentMs / 1000) * CAM_HEADING_LEAD;
  return normDeg(heading + lead);
}

export interface CamStop { readonly bearing: number | null; readonly latitude: number; readonly longitude: number }

/** True when `next` differs enough from the last command to send it. */
export function camChanged(prev: CamStop | null, next: CamStop): boolean {
  if (!prev) return true;
  if (next.bearing !== null && (prev.bearing === null || Math.abs(angleDelta(prev.bearing, next.bearing)) >= CAM_EPS_DEG)) return true;
  const dy = (next.latitude - prev.latitude) * 111_320;
  const dx = (next.longitude - prev.longitude) * 111_320 * Math.cos(next.latitude * Math.PI / 180);
  return Math.hypot(dx, dy) >= CAM_EPS_M;
}

/** The compass needle on the follow button points at north on screen: opposite the map's bearing. */
export function needleDeg(mapBearing: number): number {
  return normDeg(-mapBearing);
}

/**
 * The shark's swim (the "follower"). GPS gives a fix only every 3 m or so (about every 2 s at a
 * walk), each a metre or two off. The follower:
 *  - runs the target on from the newest fix at the walking velocity (measured over the last few
 *    fixes, so it is steady) for about as long as the next fix should take, at most 1.6 m: you are
 *    somewhere between your last fix and the next one, and this is the best guess of where;
 *  - swims toward that moving target with a critically damped spring plus the target's own
 *    velocity, so on a steady walk it rides right on it (no trailing) at an even speed, and a new
 *    fix only nudges it;
 *  - stops when the target stops: no fix when one was due means you stopped, and the shark
 *    settles within about a second, never sliding on.
 * Cheap: a few multiplies per 16 ms step, and it skips straight to rest after a long gap.
 */
/** Spring stiffness (rad/s): higher follows fixes faster, lower is smoother. */
export const FOLLOW_OMEGA = 1.6;
export const FOLLOW_STOP_OMEGA = 3.2;
/** The target never runs on more than this past the newest fix (m). */
export const FOLLOW_MAX_LEAD_M = 3;
/** The target runs on for this many expected fix gaps at most. */
export const FOLLOW_LEAD_GAPS = 1.6;
/** Below this walking speed (m/s) nothing is run on: standing still, GPS scatter. */
export const FOLLOW_MIN_SPEED = 0.5;
/** A gap this long with nothing to do: jump to rest instead of stepping through it (ms). */
export const FOLLOW_CATCHUP_MS = 3000;
export interface Chaser {
  p: GlidePoint; ve: number; vn: number; t: number;
  fix: GlidePoint; fixT: number; re: number; rn: number; leadS: number;
  /** The phone's step sensor: true walking, false standing, null unknown (no sensor). */
  walking: boolean | null;
}
export function newChaser(at: GlidePoint, tMs: number): Chaser {
  return { p: at, ve: 0, vn: 0, t: tMs, fix: at, fixT: tMs, re: 0, rn: 0, leadS: 0, walking: null };
}
/** With the step sensor saying you walk, the target may run on this many expected gaps (and this far). */
export const FOLLOW_WALK_LEAD_GAPS = 3;
export const FOLLOW_WALK_MAX_LEAD_M = 6;
/** Standing (step sensor): a fix moves the estimate only this much (GPS scatter while you stand). */
export const FOLLOW_STILL_ALPHA = 0.2;
const leadFor = (c: Chaser, v: number, gapS: number) => {
  if (c.walking === false || v <= FOLLOW_MIN_SPEED) return 0;
  const sure = c.walking === true;
  return Math.min(Math.max(0.5, gapS) * (sure ? FOLLOW_WALK_LEAD_GAPS : FOLLOW_LEAD_GAPS), (sure ? FOLLOW_WALK_MAX_LEAD_M : FOLLOW_MAX_LEAD_M) / v);
};
/**
 * The step sensor changed (useWalkSense). Stopping freezes the target where it is right now, so the shark
 * settles in about a second instead of running on to the next fix that will never come.
 */
export function chaseWalk(c: Chaser, walking: boolean, tMs: number, headingDeg: number | null = null): void {
  if (c.walking === walking) return;
  chaseAdvance(c, tMs);
  const [tp] = followTarget(c, tMs);
  if (!walking) {
    c.fix = tp; c.fixT = tMs; c.re = 0; c.rn = 0; c.leadS = 0;
  } else if (headingDeg !== null && Math.hypot(c.re, c.rn) < 0.3) {
    // Starting off: the phone points the way you walk, so the shark sets off at once at a stroll,
    // and the next fixes correct the direction and pace.
    const h = headingDeg * Math.PI / 180;
    c.fix = tp; c.fixT = tMs; c.re = FOLLOW_START_MPS * Math.sin(h); c.rn = FOLLOW_START_MPS * Math.cos(h);
    c.leadS = FOLLOW_START_LEAD_M / FOLLOW_START_MPS;
  }
  c.walking = walking;
}
/** Setting off (step sensor, compass known): an assumed stroll this fast (m/s), for at most this far (m). */
export const FOLLOW_START_MPS = 1.1;
export const FOLLOW_START_LEAD_M = 2.5;
const enM = (a: GlidePoint, b: GlidePoint): [number, number] => [
  (b.longitude - a.longitude) * 111_320 * Math.cos(a.latitude * Math.PI / 180), (b.latitude - a.latitude) * 111_320];
const move = (p: GlidePoint, e: number, n: number): GlidePoint => ({
  latitude: p.latitude + n / 111_320, longitude: p.longitude + e / (111_320 * Math.cos(p.latitude * Math.PI / 180)) });
/** Where the target is at `tMs` and how fast it moves (m/s east, north). */
function followTarget(c: Chaser, tMs: number): [GlidePoint, number, number] {
  const el = Math.max(0, (tMs - c.fixT) / 1000);
  const running = el < c.leadS;
  const s = Math.min(el, c.leadS);
  return [move(c.fix, c.re * s, c.rn * s), running ? c.re : 0, running ? c.rn : 0];
}
/** Steps the follower to `tMs` (mutates) and returns where the shark is. */
export function chaseAdvance(c: Chaser, tMs: number): GlidePoint {
  if (tMs - c.t > FOLLOW_CATCHUP_MS) {
    // Back after a long gap (a queue, the background): rest on the target at once.
    const [tp, te, tn] = followTarget(c, tMs);
    c.p = tp; c.ve = te; c.vn = tn; c.t = tMs;
    return c.p;
  }
  // Standing (step sensor): a stiffer spring, so the shark settles about a second after you stop.
  const w = c.walking === false ? FOLLOW_STOP_OMEGA : FOLLOW_OMEGA;
  while (c.t < tMs) {
    const dt = Math.min(0.016, (tMs - c.t) / 1000);
    const [tp, te, tn] = followTarget(c, c.t + dt * 1000);
    const [ex, ey] = enM(c.p, tp);
    // At rest on a still target: nothing left to step.
    if (te === 0 && tn === 0 && Math.abs(ex) < 0.005 && Math.abs(ey) < 0.005 && Math.abs(c.ve) < 0.01 && Math.abs(c.vn) < 0.01) {
      c.p = tp; c.ve = 0; c.vn = 0; c.t = tMs; break;
    }
    c.ve += (w * w * ex + 2 * w * (te - c.ve)) * dt;
    c.vn += (w * w * ey + 2 * w * (tn - c.vn)) * dt;
    c.p = move(c.p, c.ve * dt, c.vn * dt);
    c.t += dt * 1000;
  }
  return c.p;
}
export function chasePeek(c: Chaser, tMs: number): GlidePoint {
  return chaseAdvance({ ...c }, tMs);
}
/** The shark's speed now (m/s), for the swim cycle. */
export function chaseSpeed(c: Chaser | null): number {
  return c ? Math.hypot(c.ve, c.vn) : 0;
}
/** Alpha-beta smoothing of the fixes (constant-velocity model): how much one fix moves the estimate and its velocity. */
export const FOLLOW_ALPHA = 0.3;
export const FOLLOW_BETA = 0.06;
/**
 * A new fix. The estimate (where you are and how fast you walk) is corrected by it alpha-beta style, so one
 * scattered fix nudges rather than yanks; the target then runs on from the estimate at the estimated velocity
 * for about the expected gap to the next fix (`gapS`). `jump` re-seats at once.
 */
export function chaseFix(c: Chaser, fix: GlidePoint, tMs: number, _rate: readonly [number, number], gapS: number, jump: boolean): void {
  chaseAdvance(c, tMs);
  if (jump) {
    c.p = fix; c.ve = 0; c.vn = 0; c.fix = fix; c.fixT = tMs; c.re = 0; c.rn = 0; c.leadS = 0;
    return;
  }
  const dt = Math.max(0.2, (tMs - c.fixT) / 1000);
  // Predict the estimate to now with its velocity (a long silence: assume you stopped), then correct.
  const silent = dt > Math.max(4, gapS * 2.5);
  const pe = silent ? 0 : c.re, pn = silent ? 0 : c.rn;
  const pred = move(c.fix, pe * dt, pn * dt);
  const [rx, ry] = enM(pred, fix);
  const still = c.walking === false;
  const alpha = still ? FOLLOW_STILL_ALPHA : FOLLOW_ALPHA;
  const est = move(pred, alpha * rx, alpha * ry);
  let re = still ? 0 : pe + (FOLLOW_BETA * rx) / dt, rn = still ? 0 : pn + (FOLLOW_BETA * ry) / dt;
  const sp = Math.hypot(re, rn);
  if (sp > GLIDE_MAX_CARRY_MPS) { re *= GLIDE_MAX_CARRY_MPS / sp; rn *= GLIDE_MAX_CARRY_MPS / sp; }
  c.fix = est; c.fixT = tMs; c.re = re; c.rn = rn;
  const v = Math.hypot(re, rn);
  c.leadS = leadFor(c, v, gapS);
}
/** Still moving at `tMs` (not yet at rest on its target). */
export function chaseActive(c: Chaser | null, tMs: number): boolean {
  if (!c) return false;
  const q = { ...c };
  const p = chaseAdvance(q, tMs);
  const [tp, te, tn] = followTarget(q, tMs);
  const [ex, ey] = enM(p, tp);
  return te !== 0 || tn !== 0 || Math.hypot(ex, ey) > 0.03 || Math.hypot(q.ve, q.vn) > 0.05;
}
