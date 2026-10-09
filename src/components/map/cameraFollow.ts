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
}
export function newChaser(at: GlidePoint, tMs: number): Chaser {
  return { p: at, ve: 0, vn: 0, t: tMs, fix: at, fixT: tMs, re: 0, rn: 0, leadS: 0, walking: null, lastFix: at, lastFixT: tMs, walkSince: 0, offStep: null, hx: null, hy: null, carried: false };
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
  } else if (headingDeg !== null && Math.hypot(c.re, c.rn) < 0.3 && c.lastFix) {
    // Starting off: the phone points the way you walk, so the shark sets off at once at a stroll,
    // and the next fixes correct the direction and pace.
    const h = headingDeg * Math.PI / 180;
    c.fix = c.lastFix; c.fixT = tMs; c.re = FOLLOW_START_MPS * Math.sin(h); c.rn = FOLLOW_START_MPS * Math.cos(h);
    c.leadS = FOLLOW_START_LEAD_M / FOLLOW_START_MPS;
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
 * The run-on's velocity. Walking (step sensor) with the phone pointed well away from the pace (over 50
 * degrees): you turned a corner, and the phone turned with you, so the run-on follows the phone at the
 * same pace instead of carrying on into a building until the GPS notices.
 */
function runDirection(c: Chaser): [number, number] {
  const sp = Math.hypot(c.re, c.rn);
  if (c.walking !== true || c.hx === null || c.hy === null || sp < 0.2) return [c.re, c.rn];
  const cos = (c.re * c.hx + c.rn * c.hy) / sp;
  if (cos > Math.cos(50 * Math.PI / 180)) return [c.re, c.rn];
  return [c.hx * sp, c.hy * sp];
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
/**
 * A new fix. The target restarts from the fix itself (the position filter has already smoothed it, and the
 * game's coin ranges use the same point, so the drawn shark never disagrees with the game for long) and runs on
 * at the walking velocity for about one expected gap, at most FOLLOW_MAX_LEAD_M: you are somewhere between
 * this fix and the next. The velocity comes from the last few fixes; when the newest fix turns away from it
 * (a corner, a turn back) only the last two count, so the run-on never carries on into a building.
 * `jump` re-seats at once.
 */
export function chaseFix(c: Chaser, fix: GlidePoint, tMs: number, rate: readonly [number, number], gapS: number, jump: boolean): void {
  chaseAdvance(c, tMs);
  const prevFix = c.lastFix, prevT = c.lastFixT;
  c.lastFix = fix; c.lastFixT = tMs;
  if (jump || !prevFix) {
    if (jump) { c.p = fix; c.ve = 0; c.vn = 0; }
    c.fix = fix; c.fixT = tMs; c.re = 0; c.rn = 0; c.leadS = 0;
    return;
  }
  let [re, rn] = rate;
  // The newest step, from the last fix: if it turns away from the measured velocity, it wins.
  const dt = Math.max(0.3, (tMs - prevT) / 1000);
  const [se, sn] = enM(prevFix, fix);
  const stepV: [number, number] = [se / dt, sn / dt];
  const sp = Math.hypot(re, rn), ssp = Math.hypot(stepV[0], stepV[1]);
  // A corner needs two steps in a row that agree with each other and not with the current pace
  // (one scattered fix looks like a turn too often).
  let turned = false;
  const off = sp > 0.2 && ssp > 0.2 && Math.hypot(se, sn) >= FOLLOW_TURN_STEP_M
    && (re * stepV[0] + rn * stepV[1]) / (sp * ssp) < Math.cos(35 * Math.PI / 180);
  // A sharp one (over 60 degrees on a full step) is a corner at once; a gentle one needs the next step to agree.
  const sharp = off && Math.hypot(se, sn) >= 2.5 && (re * stepV[0] + rn * stepV[1]) / (sp * ssp) < Math.cos(60 * Math.PI / 180);
  if (sharp) { turned = true; re = stepV[0] * 0.85; rn = stepV[1] * 0.85; }
  else if (off && c.offStep) {
    const [pe2, pn2] = c.offStep;
    const agree = (pe2 * stepV[0] + pn2 * stepV[1]) / (Math.hypot(pe2, pn2) * ssp) > Math.cos(30 * Math.PI / 180);
    if (agree) { turned = true; re = stepV[0] * 0.85; rn = stepV[1] * 0.85; }
  }
  c.offStep = off && !turned ? stepV : null;
  // Where the estimate predicts you are now, and how far the fix lands from it. A small miss is GPS
  // scatter: it nudges the position and the pace (alpha-beta). A corner, a long miss or steady movement
  // while "standing" (a ride vehicle) is real: take the fix and the newest step's velocity.
  const [rde, rdn] = runDirection(c);
  const pred = move(c.fix, rde * Math.min(dt, Math.max(c.leadS, 0)), rdn * Math.min(dt, Math.max(c.leadS, 0)));
  const [rx, ry] = enM(pred, fix);
  const miss = Math.hypot(rx, ry);
  // "Standing" but the fixes keep moving the same way (a ride vehicle, a stroller, a scooter): believe the GPS.
  const movingWhileStill = c.walking === false && ssp > 0.6 && Math.hypot(rate[0], rate[1]) > 0.6;
  let est: GlidePoint;
  c.carried = movingWhileStill;
  if (turned || miss > FOLLOW_SNAP_M || movingWhileStill) {
    est = fix;
    if (!turned) { re = stepV[0] * 0.8; rn = stepV[1] * 0.8; }
  } else {
    const alpha = c.walking === false ? FOLLOW_STILL_ALPHA : FOLLOW_ALPHA;
    est = move(pred, rx * alpha, ry * alpha);
    if (c.walking !== false || movingWhileStill) {
      // The pace: the previous estimate's velocity, corrected by the miss (no running on into a stop).
      re = c.re + (FOLLOW_BETA * rx) / dt; rn = c.rn + (FOLLOW_BETA * ry) / dt;
      if (Math.hypot(c.re, c.rn) < 0.2) { re = rate[0]; rn = rate[1]; }
    } else { re = 0; rn = 0; }
  }
  const cap = Math.hypot(re, rn);
  if (cap > GLIDE_MAX_CARRY_MPS) { re *= GLIDE_MAX_CARRY_MPS / cap; rn *= GLIDE_MAX_CARRY_MPS / cap; }
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
