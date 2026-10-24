/**
 * One loading bar from launch to the map. The splash fills its bar to this share,
 * then the map's sky cover shows the same bar and fills the rest while the park
 * tiles draw, so a kid sees one bar finish, never a second, frozen loading screen.
 */
export const LAUNCH_HANDOFF_SHARE = 0.7;
/** A cover that starts later (walking into a park mid-session) starts its bar here. */
export const LATER_COVER_SHARE = 0.2;
/** The cover never stays up longer than this from its first frame, whatever the map is doing. */
export const COVER_MAX_MS = 3200;
/** How long the bar takes to finish once the map has drawn, before the cover fades. */
export const COVER_FINISH_MS = 200;
/** The cover's fade (the map and its buttons arrive together under it). */
export const COVER_FADE_MS = 380;

/** A map that mounts under the cover always gets at least this long to draw. */
export const COVER_MAP_MIN_MS = 1200;
/** Never longer than this from the cover's first frame (a phone too busy to mount the map in time). */
export const COVER_HARD_MAX_MS = 5000;

/**
 * When the cover lifts.
 * - The map screen raises the cover on its first frame, before any map has mounted: it waits up
 *   to COVER_HARD_MAX_MS (a safety, in case no map ever mounts).
 * - A map mounting under that cover lifts it COVER_MAX_MS after the cover's first frame (or
 *   earlier, once it has drawn), but always gives the map COVER_MAP_MIN_MS and never passes the
 *   hard cap. On a phone the map mounts within a few frames, so the cover is up at most COVER_MAX_MS.
 * - A map that replaces another under the cover keeps the same deadline: the bar never restarts.
 * - A cover that starts with no cover up (walking into a park later) gets COVER_MAX_MS.
 */
export function coverDeadline(now: number, current: {
  readonly up: boolean; readonly deadline: number; readonly startedAt: number; readonly mapMounted: boolean;
} | null, mapMounting: boolean): number {
  if (!current?.up || current.deadline <= now) return now + (mapMounting ? COVER_MAX_MS : COVER_HARD_MAX_MS);
  if (!mapMounting || current.mapMounted) return current.deadline;
  return Math.min(current.startedAt + COVER_HARD_MAX_MS, Math.max(current.startedAt + COVER_MAX_MS, now + COVER_MAP_MIN_MS));
}

/**
 * The screen holds the cover while it still picks the home map or the park map at launch: the one
 * cover (one bar, never restarted) may then wait up to the hard cap. Once the choice is made, the
 * normal deadline is back, and the map still gets COVER_MAP_MIN_MS to draw.
 */
export function coverHoldDeadline(held: boolean, now: number, current: { readonly startedAt: number; readonly deadline: number }): number {
  const hard = current.startedAt + COVER_HARD_MAX_MS;
  if (held) return Math.max(current.deadline, hard);
  return Math.min(hard, Math.max(current.startedAt + COVER_MAX_MS, now + COVER_MAP_MIN_MS));
}

/** Where the bar starts: the splash's share at launch, a short head start for a later cover. */
export function coverStartShare(firstCover: boolean, continuing: boolean, currentShare: number): number {
  if (continuing) return currentShare;
  return firstCover ? LAUNCH_HANDOFF_SHARE : LATER_COVER_SHARE;
}

/**
 * Whether the cover may lift early: the current map has drawn and the screen is not holding it
 * (the park check is still deciding between the home map and the park map).
 */
export function coverCanLift(drawn: boolean, held: boolean): boolean {
  return drawn && !held;
}
