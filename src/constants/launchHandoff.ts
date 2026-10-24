/**
 * One loading bar from launch to the map. The splash fills its bar to this share,
 * then the map's sky cover shows the same bar and fills the rest while the park
 * tiles draw, so a kid sees one bar finish, never a second, frozen loading screen.
 */
export const LAUNCH_HANDOFF_SHARE = 0.7;
/**
 * The Splash route (waiting on sign-in and the game's words) shows the same bar from its first
 * frame and creeps it to this share, so the launch shows progress from its first second. The
 * Loading screen's bar starts here, so the bar only ever moves forward.
 */
export const SPLASH_ROUTE_SHARE = 0.15;
/** How long the Splash route's bar takes to creep to SPLASH_ROUTE_SHARE. */
export const SPLASH_CREEP_MS = 2400;
/** A cover that starts later (walking into a park mid-session) starts its bar here. */
export const LATER_COVER_SHARE = 0.2;
/**
 * Once the map has drawn, the cover waits at most this long (from its first frame) for the screen
 * to finish picking the home map or the park map, then lifts onto whichever map drew.
 */
export const COVER_MAX_MS = 1500;
/** How long the bar takes to finish once the map has drawn, before the cover fades. */
export const COVER_FINISH_MS = 200;
/** The cover's fade (the map and its buttons arrive together under it). */
export const COVER_FADE_MS = 380;
/**
 * Never longer than this from the cover's first frame, even if the map never reports its tiles
 * drawn (a phone too busy, or no network): a kid is never stuck on a loading screen.
 */
export const COVER_HARD_MAX_MS = 4000;

/**
 * When the cover lifts, from what is true now. It never lifts onto a map with no tiles:
 * - the map has drawn and the screen knows which map it shows: lift now;
 * - the map has drawn but the screen is still picking home or park: wait for that until
 *   COVER_MAX_MS from the cover's first frame, then lift onto the map that drew;
 * - the map has not drawn yet: wait for its tiles (the hard cap is only a safety);
 * - the header and HUD icons (coin, key, ticket, chest, the player's shark) have not drawn yet: wait
 *   for them too, so the first frame after the lift never shows a numbers-only pill or an empty circle.
 */
export function coverLiftAt(state: {
  readonly now: number; readonly startedAt: number; readonly drawn: boolean; readonly held: boolean;
  readonly artPending?: boolean;
}): number {
  const hard = state.startedAt + COVER_HARD_MAX_MS;
  if (!state.drawn || state.artPending) return hard;
  if (!state.held) return state.now;
  return Math.min(hard, Math.max(state.now, state.startedAt + COVER_MAX_MS));
}

/**
 * Honest progress: how far the bar may get before the next real step. The screen is up (the
 * splash's share and a bit), a map has mounted, the screen has picked its map; the last part
 * only fills when the tiles have drawn.
 */
export const COVER_STEPS = { armed: 0.8, mapMounted: 0.86, mapChosen: 0.93 } as const;
export function coverCeiling(mapMounted: boolean, held: boolean): number {
  if (!mapMounted) return COVER_STEPS.armed;
  return held ? COVER_STEPS.mapMounted : COVER_STEPS.mapChosen;
}
