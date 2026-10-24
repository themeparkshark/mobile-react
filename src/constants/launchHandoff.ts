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
/** The cover's fade (the map and its buttons arrive together under it): one quick, clean lift. */
export const COVER_FADE_MS = 240;
/**
 * Once the map has drawn, the lift waits for the phone to draw a few smooth frames in a row (the
 * map's first tiles and pins can keep the UI thread busy for a moment), so the fade itself never
 * stutters into a half-faded double picture. Never longer than this.
 */
export const COVER_SMOOTH_WAIT_MS = 600;
/** Smooth frames in a row (each under 34 ms) before the lift starts. */
export const COVER_SMOOTH_FRAMES = 3;
/**
 * Never longer than this from the cover's first frame, even if the map never reports its tiles
 * drawn (a phone too busy, or no network): a kid is never stuck on a loading screen.
 */
export const COVER_HARD_MAX_MS = 4000;
/**
 * The launch cover's own cap: while the screen is still picking the home map or the park map (and
 * no map has drawn), the launch splash stays up, its bar creeping, up to this long from its first
 * frame, instead of lifting onto a bare map and showing a second loading screen after it.
 */
export const COVER_LAUNCH_MAX_MS = 9000;

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
  /** The app's first cover (the launch scene). */
  readonly launch?: boolean;
  /** When the newest map mounted under this cover. */
  readonly mountedAt?: number;
}): number {
  const launch = state.launch === true;
  const launchCap = state.startedAt + COVER_LAUNCH_MAX_MS;
  // The launch cover gives each map that mounts under it (the park map replacing the home map) its
  // own 4 s to draw, inside the launch cap, so a slow park pick never lifts the splash onto a bare
  // map and then shows a second, sky loading screen.
  const from = Math.max(state.startedAt, state.mountedAt ?? state.startedAt);
  const hard = launch ? Math.min(launchCap, from + COVER_HARD_MAX_MS) : state.startedAt + COVER_HARD_MAX_MS;
  if (!state.drawn || state.artPending) return launch && state.held ? launchCap : hard;
  if (!state.held) return state.now;
  return Math.min(hard, Math.max(state.now, state.startedAt + COVER_MAX_MS));
}

/**
 * Honest progress: how far the bar may get before the next real step. The screen is up (the
 * splash's share and a bit), a map has mounted, the screen has picked its map. The bar stays in
 * the 70s while the tiles load, always creeping (linear, never parked near full), and the last
 * fifth fills only as the map arrives, so a full bar always means the game is here.
 */
export const COVER_STEPS = { armed: 0.74, mapMounted: 0.77, mapChosen: 0.8 } as const;
export function coverCeiling(mapMounted: boolean, held: boolean): number {
  if (!mapMounted) return COVER_STEPS.armed;
  return held ? COVER_STEPS.mapMounted : COVER_STEPS.mapChosen;
}
