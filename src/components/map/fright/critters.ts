/**
 * Fright Reef reactions to the player: who watches (within 60 m) and the
 * reef-entry pop (one scareactor jumps, a light haptic and a small sound),
 * at most once per reef every 10 minutes. Pure, unit tested. The scareactor
 * sheets, rows and facing rules live in scareactors.ts.
 */
import { distanceMeters, type LatLng } from './geo';

export const WATCH_RADIUS_M = 60;
export const POP_COOLDOWN_MS = 10 * 60_000;

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
