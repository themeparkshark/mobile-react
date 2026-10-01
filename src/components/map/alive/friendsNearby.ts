/**
 * Friends nearby as ghost sharks. Pure, unit tested.
 *
 * Shows only what the server chooses to share (friends who are in the same
 * park and opted in); positions older than a few minutes fade, then drop, and
 * only the closest few are drawn.
 */

export interface FriendPresence {
  readonly id: number;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  /** ISO time the friend was last seen at this spot. */
  readonly seen_at: string;
  /** The friend's shark skin (no eyes layer), when shared. */
  readonly skin_url?: string | null;
}

export interface GhostShark extends FriendPresence {
  /** 1 fresh .. 0.35 about to drop. */
  readonly fade: number;
  readonly meters: number;
}

export const GHOST_FRESH_MS = 3 * 60_000;
export const GHOST_DROP_MS = 10 * 60_000;
export const GHOST_RANGE_M = 600;

export function ghostSharks(friends: readonly FriendPresence[] | null | undefined, me: { latitude: number; longitude: number } | null,
  now: number, cap: number): GhostShark[] {
  if (!friends?.length || cap <= 0) return [];
  const out: GhostShark[] = [];
  for (const friend of friends) {
    const seen = Date.parse(friend.seen_at);
    if (!Number.isFinite(seen) || !Number.isFinite(friend.latitude) || !Number.isFinite(friend.longitude)) continue;
    const age = Math.max(0, now - seen);
    if (age >= GHOST_DROP_MS) continue;
    const meters = me ? Math.hypot((friend.latitude - me.latitude) * 111320,
      (friend.longitude - me.longitude) * 111320 * Math.cos((me.latitude * Math.PI) / 180)) : 0;
    if (meters > GHOST_RANGE_M) continue;
    const fade = age <= GHOST_FRESH_MS ? 1 : 1 - 0.65 * ((age - GHOST_FRESH_MS) / (GHOST_DROP_MS - GHOST_FRESH_MS));
    out.push({ ...friend, fade: Math.round(fade * 100) / 100, meters: Math.round(meters) });
  }
  return out.sort((a, b) => a.meters - b.meters).slice(0, cap);
}
