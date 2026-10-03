/**
 * Scare-critters at the Fright Reefs. Pure, unit tested; the pose function
 * runs on the UI thread every ambient clock step.
 *
 * Each critter loops idle (wandering inside the reef), lurk (sinks low so only
 * its eyes peek) and a little jump. Within 60 m of the player it stops,
 * turns toward them and watches. Stepping into the reef makes one critter
 * pop (a bigger jump, a light haptic and a small sound), at most once per reef
 * every 10 minutes. Spooky-silly: the pop ends in a wiggle, never a lunge.
 */
import { hash01 } from '../alive/ambientBudget';
import { distanceMeters, type LatLng } from './geo';

export const WATCH_RADIUS_M = 60;
export const POP_COOLDOWN_MS = 10 * 60_000;
/** Seconds a pop jump lasts on screen. */
export const POP_S = 1.1;

export type CritterMood = 0 | 1 | 2; // idle, lurk, jump
export const MOOD_IDLE = 0;
export const MOOD_LURK = 1;
export const MOOD_JUMP = 2;

export interface CritterPose {
  /** Offset from the reef center in points (east right, south down). */
  readonly x: number;
  readonly y: number;
  readonly mood: CritterMood;
  /** 0..1 progress inside the current mood. */
  readonly p: number;
  /** Vertical hop in points (negative is up). */
  readonly hop: number;
  /** Squash: 1 is normal, under 1 is low (lurking or landing). */
  readonly squash: number;
  /** Facing: 1 right, -1 left. */
  readonly face: number;
}

/**
 * Where a critter is at ambient time t (seconds). `seed` makes each critter
 * unique; `wander` is the reef radius in points; `watch` is 0 (no player
 * near) or +1/-1 (the side the player is on); `popAge` is seconds since the
 * reef popped (negative when no pop is playing).
 */
export function critterPose(seed: number, t: number, wander: number, watch: number, popAge: number): CritterPose {
  'worklet';
  const r = Math.max(0, wander) * (0.35 + 0.45 * hash01(seed * 3 + 1));
  const w = 0.05 + 0.06 * hash01(seed * 3 + 2); // slow orbit, radians per second
  const phase = hash01(seed * 3 + 3) * 6.283;
  const tt = watch !== 0 ? 0 : t; // a watching critter holds still
  const ang = tt * w + phase;
  const radial = 0.6 + 0.4 * Math.sin(tt * w * 1.7 + phase * 2);
  const x = Math.cos(ang) * r * radial;
  const y = Math.sin(ang) * r * radial * 0.7; // a flatter ellipse reads as ground
  const dx = -Math.sin(ang) * w; // heading along the orbit
  const face = watch !== 0 ? watch : (dx >= 0 ? 1 : -1);

  if (popAge >= 0 && popAge < POP_S) {
    const p = popAge / POP_S;
    const up = Math.sin(Math.min(1, p / 0.7) * Math.PI);
    const wiggle = p > 0.7 ? Math.sin((p - 0.7) * 30) * (1 - p) * 0.3 : 0;
    return { x, y, mood: MOOD_JUMP, p, hop: -34 * up, squash: 1.15 + wiggle, face };
  }

  // Mood cycle: 18 to 30 s, idle most of it, a lurk, then a hop.
  const period = 18 + 12 * hash01(seed * 5 + 4);
  const c = ((t + hash01(seed * 5 + 5) * period) % period) / period;
  if (watch !== 0) {
    // Watching: a slow curious bob, no hiding.
    return { x, y, mood: MOOD_IDLE, p: c, hop: -2 * Math.abs(Math.sin(t * 2.2 + phase)), squash: 1, face };
  }
  if (c < 0.62) {
    const p = c / 0.62;
    return { x, y, mood: MOOD_IDLE, p, hop: -2.5 * Math.abs(Math.sin(t * 3 + phase)), squash: 1, face };
  }
  if (c < 0.86) {
    const p = (c - 0.62) / 0.24;
    const sink = Math.sin(p * Math.PI); // down and back up
    return { x, y, mood: MOOD_LURK, p, hop: 4 * sink, squash: 1 - 0.45 * sink, face };
  }
  if (c < 0.93) {
    const p = (c - 0.86) / 0.07;
    return { x, y, mood: MOOD_JUMP, p, hop: -16 * Math.sin(p * Math.PI), squash: p < 0.15 ? 0.85 : 1.08, face };
  }
  return { x, y, mood: MOOD_IDLE, p: (c - 0.93) / 0.07, hop: 0, squash: 1, face };
}

/** How a reef reacts to the player at a distance from its center. */
export type ReefReaction = 'ignore' | 'watch' | 'inside';

export function reefReaction(distanceM: number, radiusM: number): ReefReaction {
  if (!Number.isFinite(distanceM)) return 'ignore';
  if (distanceM <= Math.max(1, radiusM)) return 'inside';
  return distanceM <= WATCH_RADIUS_M ? 'watch' : 'ignore';
}

/**
 * Which side the critters face to look at the player: +1 right, -1 left on
 * screen. `bearing` is reef to player (degrees from north); `mapHeading` is
 * the map's rotation (the map turns with the phone).
 */
export function faceToward(bearing: number, mapHeading: number | null | undefined): 1 | -1 {
  const rel = ((bearing - (mapHeading ?? 0)) % 360 + 360) % 360;
  return rel < 180 ? 1 : -1;
}

/* ── Reef-entry pops ──────────────────────────────────────────────────── */

export interface PopState {
  /** Reefs the player is inside right now. */
  readonly inside: readonly string[];
  /** When each reef last popped (ms). */
  readonly lastPop: Readonly<Record<string, number>>;
}

export const POP_START: PopState = { inside: [], lastPop: {} };

export interface ReefCircle extends LatLng { readonly key: string; readonly radius: number }

/**
 * Feed one player fix. A pop fires on entry (outside before, inside now) when
 * the reef has not popped in the last 10 minutes. `quiet` (phones-down,
 * Spooky effects off) tracks entries without popping, so turning it back on
 * inside a reef never pops late.
 */
export function stepPops(state: PopState, reefs: readonly ReefCircle[], player: LatLng | null, now: number,
  quiet: boolean): { state: PopState; pops: string[] } {
  if (!player) return { state: { ...state, inside: [] }, pops: [] };
  const inside: string[] = [];
  const pops: string[] = [];
  const lastPop: Record<string, number> = { ...state.lastPop };
  for (const reef of reefs) {
    if (reefReaction(distanceMeters(player, reef), reef.radius) !== 'inside') continue;
    inside.push(reef.key);
    if (state.inside.includes(reef.key) || quiet) continue;
    const last = lastPop[reef.key];
    if (last !== undefined && now - last < POP_COOLDOWN_MS) continue;
    lastPop[reef.key] = now;
    pops.push(reef.key);
  }
  return { state: { inside, lastPop }, pops };
}
