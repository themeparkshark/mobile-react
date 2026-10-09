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
export const FOLLOW_OMEGA = 1.2;
export const FOLLOW_STOP_OMEGA = 3.2;
/** The target never runs on more than this past the newest fix (m). */
export const FOLLOW_MAX_LEAD_M = 2.5;
/** The target runs on for this many expected fix gaps at most. */
export const FOLLOW_LEAD_GAPS = 1.1;
export const FOLLOW_SURE_LEAD_GAPS = 3;
export const FOLLOW_SURE_MAX_LEAD_M = 4.2;
/** Below this walking speed (m/s) nothing is run on: standing still, GPS scatter. */
export const FOLLOW_MIN_SPEED = 0.5;
/** A gap this long with nothing to do: jump to rest instead of stepping through it (ms). */
export const FOLLOW_CATCHUP_MS = 3000;
export interface Chaser {
  p: GlidePoint; ve: number; vn: number; t: number;
  fix: GlidePoint; fixT: number; re: number; rn: number; leadS: number;
  /** The phone's step sensor: true walking, false standing, null unknown (no sensor). */
  walking: boolean | null;
  /** The newest real fix (the run-on and a false start return to it). */
  lastFix: GlidePoint | null; lastFixT: number;
  /** When the step sensor last said walking. */
  walkSince: number;
  /** A step that turned away from the pace, waiting for the next to confirm a corner. */
  offStep: [number, number] | null;
  /** Where the phone points (unit vector east, north), smoothed; null unknown. */
  hx: number | null; hy: number | null;
  /** Standing but carried (the GPS keeps moving steadily): the run-on comes back. */
  carried: boolean;
  fastPrev: boolean;
  /** Kalman estimate: position, its time, and the shared 2x2 covariance (null before the first fix). */
  kX: GlidePoint; kT: number; kP: [number, number, number, number] | null;
}
export function newChaser(at: GlidePoint, tMs: number): Chaser {
  return { p: at, ve: 0, vn: 0, t: tMs, fix: at, fixT: tMs, re: 0, rn: 0, leadS: 0, walking: null, lastFix: at, lastFixT: tMs, walkSince: 0, offStep: null, hx: null, hy: null, carried: false, fastPrev: false, kX: at, kT: tMs, kP: null };
}
const leadFor = (c: Chaser, v: number, gapS: number) => {
  // Standing (step sensor): no run-on, but every fix still moves the shark (a ride vehicle, a stroller).
  if (v <= FOLLOW_MIN_SPEED) return 0;
  if (c.walking === false) return c.carried ? Math.min(Math.max(0.5, gapS), FOLLOW_MAX_LEAD_M / v) : 0;
  // The step sensor says you are still walking: run on through a late fix (GPS gaps vary 1 to 4 s), still capped.
  const sure = c.walking === true;
  return Math.min(Math.max(0.5, gapS) * (sure ? FOLLOW_SURE_LEAD_GAPS : FOLLOW_LEAD_GAPS), (sure ? FOLLOW_SURE_MAX_LEAD_M : FOLLOW_MAX_LEAD_M) / v);
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
    // Stopped: hold where the run-on got to, unless no fix has come since setting off (a false start or a
    // fidget): then back to the last real fix, so jiggling the phone never walks the shark away.
    const confirmed = c.lastFixT >= c.walkSince;
    c.fix = confirmed ? tp : (c.lastFix ?? tp); c.fixT = tMs; c.re = 0; c.rn = 0; c.leadS = 0;
    // Zero-velocity update: standing is a measurement too (the estimate stops where the shark stops).
    c.kX = c.fix; c.kT = tMs;
    if (c.kP) c.kP = [c.kP[0], 0, 0, 0.05];
  } else if (headingDeg !== null && Math.hypot(c.re, c.rn) < 0.3 && c.lastFix) {
    // Starting off: the phone points the way you walk, so the shark sets off at once at a stroll,
    // and the next fixes correct the direction and pace.
    const h = headingDeg * Math.PI / 180;
    c.fix = c.lastFix; c.fixT = tMs; c.re = FOLLOW_START_MPS * Math.sin(h); c.rn = FOLLOW_START_MPS * Math.cos(h);
    c.leadS = FOLLOW_START_LEAD_M / FOLLOW_START_MPS;
    c.kX = c.lastFix; c.kT = tMs;
    if (c.kP) c.kP = [c.kP[0], 0, 0, 1];
  }
  if (walking) c.walkSince = tMs;
  c.walking = walking;
}
/** Setting off (step sensor, compass known): an assumed stroll this fast (m/s), for at most this far (m). */
export const FOLLOW_START_MPS = 1.1;
export const FOLLOW_START_LEAD_M = 1.2;
const enM = (a: GlidePoint, b: GlidePoint): [number, number] => [
  (b.longitude - a.longitude) * 111_320 * Math.cos(a.latitude * Math.PI / 180), (b.latitude - a.latitude) * 111_320];
const move = (p: GlidePoint, e: number, n: number): GlidePoint => ({
  latitude: p.latitude + n / 111_320, longitude: p.longitude + e / (111_320 * Math.cos(p.latitude * Math.PI / 180)) });
/** Where the target is at `tMs` and how fast it moves (m/s east, north). */
function followTarget(c: Chaser, tMs: number): [GlidePoint, number, number] {
  const el = Math.max(0, (tMs - c.fixT) / 1000);
  const running = el < c.leadS;
  const s = Math.min(el, c.leadS);
  const [re, rn] = runDirection(c);
  return [move(c.fix, re * s, rn * s), running ? re : 0, running ? rn : 0];
}
/**
 * The run-on's velocity. The compass never steers it: people look around while they walk, and the round 4
 * frame model showed a compass-steered shark zigzagging on a walk where the phone pointed elsewhere.
 */
function runDirection(c: Chaser): [number, number] {
  return [c.re, c.rn];
}
/** The phone's heading (degrees), for the run-on at corners; smoothed here, cheap to call every tick. */
export function chaseHeading(c: Chaser, deg: number | null): void {
  if (deg === null || !Number.isFinite(deg)) { c.hx = null; c.hy = null; return; }
  const h = deg * Math.PI / 180, x = Math.sin(h), y = Math.cos(h);
  if (c.hx === null || c.hy === null) { c.hx = x; c.hy = y; return; }
  const k = 0.35;
  const nx = c.hx + (x - c.hx) * k, ny = c.hy + (y - c.hy) * k, n = Math.hypot(nx, ny) || 1;
  c.hx = nx / n; c.hy = ny / n;
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
/** How much of a small miss between the target and a new fix is taken in (the rest is GPS scatter). */
export const FOLLOW_ALPHA = 0.3;
/** Standing (step sensor): even less, so scatter does not walk a standing shark. */
export const FOLLOW_STILL_ALPHA = 0.2;
/** A fix this far (m) from the target is taken whole (a real move, not scatter). */
export const FOLLOW_SNAP_M = 5;
/** How much of a miss changes the pace (alpha-beta beta). */
export const FOLLOW_BETA = 0.08;
/** A step at least this long (m) that turns more than 35 degrees is a corner. */
export const FOLLOW_TURN_STEP_M = 2;
/** Kalman (constant velocity): how much a walker's velocity may change per second (m/s^2 noise density). */
export const FOLLOW_Q = 0.3;
/** Kalman: the spread of a filtered fix (m). */
export const FOLLOW_R_M = 1.6;
/**
 * A new fix, folded into a constant-velocity Kalman estimate of where you are and how you walk (each axis
 * the same way). A scattered fix nudges; a corner or a ride vehicle turns the velocity within a fix or two,
 * because the filter weighs how far the fix lands against how sure it was. The target then runs on from
 * the estimate at the estimated velocity for about the expected gap to the next fix (leadFor).
 * `jump` re-seats at once.
 */
export function chaseFix(c: Chaser, fix: GlidePoint, tMs: number, _rate: readonly [number, number], gapS: number, jump: boolean): void {
  chaseAdvance(c, tMs);
  const first = !c.lastFix || c.lastFix === c.fix && c.lastFixT === c.fixT && c.kP === null;
  const prevFix = c.lastFix, prevT = c.lastFixT;
  c.lastFix = fix; c.lastFixT = tMs;
  if (jump || first || c.kP === null) {
    if (jump) { c.p = fix; c.ve = 0; c.vn = 0; }
    c.fix = fix; c.fixT = tMs; c.re = 0; c.rn = 0; c.leadS = 0;
    c.kP = [FOLLOW_R_M * FOLLOW_R_M, 0, 0, 1];
    return;
  }
  const dt = Math.min(10, Math.max(0.2, (tMs - c.kT) / 1000));
  // Predict from the last update (position, not the run-on target: the filter owns the estimate).
  const [P00, P01, P10, P11] = c.kP;
  const q = FOLLOW_Q;
  const p00 = P00 + dt * (P10 + P01) + dt * dt * P11 + q * dt * dt * dt / 3;
  const p01 = P01 + dt * P11 + q * dt * dt / 2;
  const p10 = P10 + dt * P11 + q * dt * dt / 2;
  const p11 = P11 + q * dt;
  const pred = move(c.kX, c.re * dt, c.rn * dt);
  const [ye, yn] = enM(pred, fix);
  // Standing (step sensor): a fix is mostly scatter, so it counts for less (a ride vehicle still wins over a few fixes).
  const r = c.walking === false ? FOLLOW_R_M * 2 : FOLLOW_R_M;
  const S = p00 + r * r;
  const k0 = p00 / S, k1 = p10 / S;
  const est = move(pred, k0 * ye, k0 * yn);
  let re = c.re + k1 * ye, rn = c.rn + k1 * yn;
  c.kP = [(1 - k0) * p00, (1 - k0) * p01, p10 - k1 * p00, p11 - k1 * p01];
  const sp = Math.hypot(re, rn);
  if (sp > GLIDE_MAX_CARRY_MPS) { re *= GLIDE_MAX_CARRY_MPS / sp; rn *= GLIDE_MAX_CARRY_MPS / sp; }
  // A corner the phone confirms: the newest step turns away from the estimate (over 35 degrees) and the
  // phone points along that step (within 45). Take the step's direction now instead of a fix later. The
  // compass never steers on its own (people look around while walking); it only confirms what GPS shows.
  if (prevFix && c.walking === true && c.hx !== null && c.hy !== null) {
    const sdt = Math.max(0.3, (tMs - prevT) / 1000);
    const [se, sn] = enM(prevFix, fix);
    const sl = Math.hypot(se, sn), v = Math.hypot(re, rn);
    if (sl >= FOLLOW_TURN_STEP_M && v > 0.3) {
      const offPace = (re * se + rn * sn) / (v * sl) < Math.cos(35 * Math.PI / 180);
      const phoneAlong = (c.hx * se + c.hy * sn) / sl > Math.cos(45 * Math.PI / 180);
      if (offPace && phoneAlong) { const pace = Math.min(v, sl / sdt); re = (se / sl) * pace; rn = (sn / sl) * pace; }
    }
  }
  c.kX = est; c.kT = tMs;
  // Carried (standing, yet the estimate keeps moving for two fixes in a row): the run-on comes back.
  const fast = Math.hypot(re, rn) > 0.8;
  c.carried = c.walking === false && fast && c.fastPrev;
  c.fastPrev = fast;
  c.fix = est; c.fixT = tMs; c.re = re; c.rn = rn;
  c.leadS = leadFor(c, Math.hypot(re, rn), gapS);
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
