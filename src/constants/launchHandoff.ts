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

/**
 * When the cover lifts. A new cover gets COVER_MAX_MS. A map that replaces another while the
 * cover is still up (home map, then the park map a moment later at launch) keeps the same
 * cover and the same deadline: the bar never restarts and the cover never outlives its cap.
 */
export function coverDeadline(now: number, current: { readonly up: boolean; readonly deadline: number } | null): number {
  if (current?.up && current.deadline > now) return current.deadline;
  return now + COVER_MAX_MS;
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
