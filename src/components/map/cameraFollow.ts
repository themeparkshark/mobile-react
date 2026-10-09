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
 * one segment from now (the same glide the marker uses) and toward the
 * cleaned compass heading. Each move starts from wherever the last one had
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
export const CAM_HEADING_LEAD = 0.8;
/** Changes smaller than these are not worth a camera move. */
export const CAM_EPS_DEG = 0.08;
export const CAM_EPS_M = 0.03;
/** Mode changes and recenters: one eased move this long, then the loop takes over again. */
export const CAM_MODE_SPIN_MS = 650;
export const CAM_RECENTER_MS = 450;

/** Which way is up while following: the way you face, or north. */
export type FollowMode = 'heading' | 'north';

/** Degrees per second of latitude and longitude (a velocity on the map). */
export interface LatLngRate { readonly latitude: number; readonly longitude: number }
const STILL: LatLngRate = { latitude: 0, longitude: 0 };

/**
 * The shark's path between filtered fixes. A cubic (Hermite) curve from where
 * the shark is, moving the way it is moving, to the new fix, arriving at the
 * walking speed: speed and direction carry across fixes, so a walk reads as
 * one smooth swim instead of a glide, a stop and a glide. Past the end it
 * coasts on and eases to a stop within GLIDE_COAST_S (half a metre at a walk),
 * so a fix that comes a little late never leaves the shark standing.
 */
export interface CamGlide {
  readonly from: GlidePoint;
  readonly fromRate: LatLngRate;
  readonly to: GlidePoint;
  readonly toRate: LatLngRate;
  readonly start: number;
  readonly ms: number;
}
/** How long the shark coasts past a fix before it settles (seconds, the coast's time constant). */
export const GLIDE_COAST_S = 0.45;
/** The arrival speed is this share of the walking speed between the last two fixes. */
export const GLIDE_ARRIVE_SHARE = 0.85;
/** Faster than this (m/s) between fixes is not a walk: no carried speed. */
export const GLIDE_MAX_CARRY_MPS = 3.5;

/** Where the shark is along its path at `tMs`. */
export function glideAt(g: CamGlide, tMs: number): GlidePoint {
  if (g.ms <= 0) return g.to;
  const T = g.ms / 1000;
  const el = (tMs - g.start) / 1000;
  if (el >= T) {
    const k = GLIDE_COAST_S * (1 - Math.exp(-(el - T) / GLIDE_COAST_S));
    return { latitude: g.to.latitude + g.toRate.latitude * k, longitude: g.to.longitude + g.toRate.longitude * k };
  }
  const s = Math.max(0, el / T), s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return {
    latitude: h00 * g.from.latitude + h10 * T * g.fromRate.latitude + h01 * g.to.latitude + h11 * T * g.toRate.latitude,
    longitude: h00 * g.from.longitude + h10 * T * g.fromRate.longitude + h01 * g.to.longitude + h11 * T * g.toRate.longitude,
  };
}

/** How fast the shark is moving along its path at `tMs` (degrees a second). */
export function glideRate(g: CamGlide, tMs: number): LatLngRate {
  if (g.ms <= 0) return STILL;
  const T = g.ms / 1000;
  const el = (tMs - g.start) / 1000;
  if (el >= T) {
    const k = Math.exp(-(el - T) / GLIDE_COAST_S);
    return { latitude: g.toRate.latitude * k, longitude: g.toRate.longitude * k };
  }
  const s = Math.max(0, el / T), s2 = s * s;
  const d00 = 6 * s2 - 6 * s, d10 = 3 * s2 - 4 * s + 1, d01 = -6 * s2 + 6 * s, d11 = 3 * s2 - 2 * s;
  return {
    latitude: (d00 * g.from.latitude + d01 * g.to.latitude) / T + d10 * g.fromRate.latitude + d11 * g.toRate.latitude,
    longitude: (d00 * g.from.longitude + d01 * g.to.longitude) / T + d10 * g.fromRate.longitude + d11 * g.toRate.longitude,
  };
}

/**
 * The next path: from wherever (and however fast) the shark is at `tMs` to the new fix
 * over `ms`, arriving at the walk speed measured from `prevFix` (`sinceLastS` ago).
 * `ms` 0 is a jump (a re-seat, Reduce Motion, the first fix).
 */
export function nextGlide(current: CamGlide | null, to: GlidePoint, tMs: number, ms: number,
  prevFix?: GlidePoint | null, sinceLastS?: number): CamGlide {
  if (!current || ms <= 0) return { from: to, fromRate: STILL, to, toRate: STILL, start: tMs, ms: 0 };
  let toRate = STILL;
  if (prevFix && sinceLastS && sinceLastS > 0) {
    const dt = Math.max(0.5, sinceLastS);
    const dLat = (to.latitude - prevFix.latitude) / dt, dLng = (to.longitude - prevFix.longitude) / dt;
    const mps = Math.hypot(dLat * 111_320, dLng * 111_320 * Math.cos(to.latitude * Math.PI / 180));
    if (mps <= GLIDE_MAX_CARRY_MPS) toRate = { latitude: dLat * GLIDE_ARRIVE_SHARE, longitude: dLng * GLIDE_ARRIVE_SHARE };
  }
  return { from: glideAt(current, tMs), fromRate: glideRate(current, tMs), to, toRate, start: tMs, ms };
}

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

/** Still moving (gliding or coasting) at `tMs`. */
export function glideActive(g: CamGlide | null, tMs: number): boolean {
  if (!g || g.ms <= 0) return false;
  const end = g.start + g.ms;
  if (tMs < end) return true;
  const still = g.toRate.latitude === 0 && g.toRate.longitude === 0;
  return !still && tMs < end + GLIDE_COAST_S * 4000;
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
 * Dead-reckoning follower (alternative to the Hermite path): the target runs on from the last fix
 * at the walking velocity for up to TRACK_EXTRAP_S, and a critically damped spring chases it.
 */
export const TRACK_EXTRAP_S = 1.6;
export const TRACK_OMEGA = 2.6;
export interface Tracker {
  p: GlidePoint; v: LatLngRate; t: number;
  fix: GlidePoint; fixRate: LatLngRate; fixT: number;
}
export function newTracker(at: GlidePoint, tMs: number): Tracker {
  return { p: at, v: STILL, t: tMs, fix: at, fixRate: STILL, fixT: tMs };
}
function trackTarget(k: Tracker, tMs: number): GlidePoint {
  const el = Math.max(0, (tMs - k.fixT) / 1000);
  // Runs on at the walk velocity, easing off over the last part of the window.
  const s = el <= TRACK_EXTRAP_S ? el - (el * el) / (4 * TRACK_EXTRAP_S) : TRACK_EXTRAP_S * 0.75;
  return { latitude: k.fix.latitude + k.fixRate.latitude * s, longitude: k.fix.longitude + k.fixRate.longitude * s };
}
/** Steps the follower to `tMs` (mutates); returns its position. */
export function trackAdvance(k: Tracker, tMs: number): GlidePoint {
  const w = TRACK_OMEGA;
  while (k.t < tMs) {
    const dt = Math.min(0.016, (tMs - k.t) / 1000);
    const g = trackTarget(k, k.t + dt * 1000);
    const aLat = w * w * (g.latitude - k.p.latitude) - 2 * w * k.v.latitude;
    const aLng = w * w * (g.longitude - k.p.longitude) - 2 * w * k.v.longitude;
    k.v = { latitude: k.v.latitude + aLat * dt, longitude: k.v.longitude + aLng * dt };
    k.p = { latitude: k.p.latitude + k.v.latitude * dt, longitude: k.p.longitude + k.v.longitude * dt };
    k.t += dt * 1000;
  }
  return k.p;
}
/** Where the follower will be at `tMs` (no mutation). */
export function trackPeek(k: Tracker, tMs: number): GlidePoint {
  return trackAdvance({ ...k }, tMs);
}
/** A new fix: the target restarts from it at the walk velocity measured from the previous fix. */
export function trackFix(k: Tracker, fix: GlidePoint, tMs: number, prevFix: GlidePoint | null, sinceLastS: number, jump: boolean): void {
  trackAdvance(k, tMs);
  if (jump) { k.p = fix; k.v = STILL; k.fix = fix; k.fixRate = STILL; k.fixT = tMs; return; }
  let rate = STILL;
  if (prevFix && sinceLastS > 0) {
    const dt = Math.max(0.5, sinceLastS);
    const dLat = (fix.latitude - prevFix.latitude) / dt, dLng = (fix.longitude - prevFix.longitude) / dt;
    const mps = Math.hypot(dLat * 111_320, dLng * 111_320 * Math.cos(fix.latitude * Math.PI / 180));
    if (mps <= GLIDE_MAX_CARRY_MPS) rate = { latitude: 0.5 * (dLat + k.fixRate.latitude), longitude: 0.5 * (dLng + k.fixRate.longitude) };
  }
  k.fix = fix; k.fixRate = rate; k.fixT = tMs;
}
