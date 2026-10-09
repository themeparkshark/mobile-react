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
 * Pace chaser: the shark swims toward the newest fix at the walking pace (measured over several
 * fixes, so it barely changes step to step), speeding up or easing off only gently with how far
 * behind it is. GPS scatter moves where it is heading, not how fast it goes: an even walk.
 * Steered with a capped turn rate, so a noisy fix bends the path instead of kinking it.
 */
export const CHASE_LAG_S = 2.4;
export const CHASE_GAIN = 0.08;
export const CHASE_TURN_DPS = 220;
export interface Chaser {
  p: GlidePoint; dir: number; speed: number; t: number;
  target: GlidePoint; pace: number;
}
export function newChaser(at: GlidePoint, tMs: number): Chaser {
  return { p: at, dir: 0, speed: 0, t: tMs, target: at, pace: 0 };
}
const enM = (a: GlidePoint, b: GlidePoint): [number, number] => [
  (b.longitude - a.longitude) * 111_320 * Math.cos(a.latitude * Math.PI / 180), (b.latitude - a.latitude) * 111_320];
/** Steps the chaser to `tMs` (mutates). */
export function chaseAdvance(c: Chaser, tMs: number): GlidePoint {
  while (c.t < tMs) {
    const dt = Math.min(0.016, (tMs - c.t) / 1000);
    const [e, n] = enM(c.p, c.target);
    const d = Math.hypot(e, n);
    // Wanted speed: the pace, nudged by how far behind it is; near the target it eases in.
    const lagM = Math.max(0.3, c.pace * CHASE_LAG_S);
    let want = c.pace > 0 ? c.pace + CHASE_GAIN * (d - lagM) : d / 0.6;
    want = Math.max(0, Math.min(Math.max(want, 0), d / 0.35, Math.max(3.5, c.pace * 2)));
    // Speed changes gently (no lurch on a fix).
    const acc = 0.5;
    c.speed += Math.max(-acc * dt * 2, Math.min(acc * dt, want - c.speed));
    if (d > 0.02) {
      const goal = Math.atan2(e, n);
      let turn = goal - c.dir;
      while (turn > Math.PI) turn -= 2 * Math.PI;
      while (turn < -Math.PI) turn += 2 * Math.PI;
      const maxTurn = (CHASE_TURN_DPS * Math.PI / 180) * dt;
      // Far off course (a reverse, a re-seat): turn at once rather than orbit.
      c.dir = Math.abs(turn) > 2.2 ? goal : c.dir + Math.max(-maxTurn, Math.min(maxTurn, turn));
    }
    const step = Math.min(c.speed * dt, d + 0.05);
    const k = Math.cos(c.p.latitude * Math.PI / 180);
    c.p = { latitude: c.p.latitude + (Math.cos(c.dir) * step) / 111_320, longitude: c.p.longitude + (Math.sin(c.dir) * step) / (111_320 * k) };
    c.t += dt * 1000;
  }
  return c.p;
}
export function chasePeek(c: Chaser, tMs: number): GlidePoint {
  return chaseAdvance({ ...c }, tMs);
}
/** A new fix (and the current pace); `jump` re-seats at once. */
export function chaseFix(c: Chaser, fix: GlidePoint, tMs: number, pace: number, jump: boolean): void {
  chaseAdvance(c, tMs);
  c.target = fix;
  c.pace = pace;
  if (jump) { c.p = fix; c.speed = 0; }
}
/** Still moving at `tMs` (not yet settled on its target). */
export function chaseActive(c: Chaser | null, tMs: number): boolean {
  if (!c) return false;
  const [e, n] = enM(chasePeek(c, tMs), c.target);
  return Math.hypot(e, n) > 0.03 || c.speed > 0.05;
}
