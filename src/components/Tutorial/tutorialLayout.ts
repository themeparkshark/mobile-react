/**
 * Pure tutorial layout and timing rules (WS8), unit tested in
 * tools/tests/tutorial-flow.test.cjs.
 */
import type { SpotlightTarget, TutorialStep } from './types';

/** Space kept between the spotlit element and Finn. */
export const ABOVE_SPOTLIGHT_GAP = 14;
/** Finn plus a two-line bubble needs about this much room above the target. */
export const TEACHER_MIN_HEIGHT = 300;

/**
 * Where Finn's container sits (distance from the bottom of the screen).
 * 'above-spotlight' steps put him just above the spotlit card when there is
 * room, so the bubble never covers what it is pointing at. Everything else
 * keeps the screen's default offset.
 */
export function teacherBottomOffset(
  step: Pick<TutorialStep, 'placement'> | null | undefined,
  target: SpotlightTarget | null | undefined,
  screenHeight: number,
  fallback: number,
): number {
  if (step?.placement !== 'above-spotlight' || !target) return fallback;
  const padding = target.padding ?? 8;
  const offset = screenHeight - (target.y - padding) + ABOVE_SPOTLIGHT_GAP;
  if (screenHeight - offset < TEACHER_MIN_HEIGHT) return fallback;
  return Math.max(fallback, Math.round(offset));
}

/**
 * Whether a screen tutorial may start: progress has loaded, it has not been
 * seen, nothing else is showing, and the screen says its content is on screen
 * (never over a spinner).
 */
export function canStartTutorial(state: {
  readonly loaded: boolean;
  readonly completed: boolean;
  readonly active: boolean;
  readonly contentReady: boolean;
}): boolean {
  return state.loaded && !state.completed && !state.active && state.contentReady;
}

/** Settle time after content is ready, so the first frame of real content paints before Finn arrives. */
export const TUTORIAL_SETTLE_MS = 250;

/** The map's route: guides that run over the map show only there. */
export const MAP_ROUTE = 'Explore';

/** Guides that run over the map (Finn's home hello, the first find, the park arrival). */
export const MAP_GUIDES: readonly string[] = ['onboarding', 'home_first_find', 'park_arrival'];

/** Each screen's first-visit guide and the route it belongs to. */
export const GUIDE_ROUTES: Readonly<Record<string, string>> = {
  // vocab-allow: route names, never shown
  store: 'Store', park: 'Park', gym: 'GymBattle', community_center: 'CommunityCenter', friends: 'Friends', pins: 'PinCollections',
};

/**
 * Whether the current guide may draw (fix w4 N05). A guide draws only over its own screen: a map
 * guide waits while another screen is on top (the Shark Shop, the Shark Pass) and comes back on the
 * map; a screen's first-visit tip (the Shark Shop's) never follows the player to the next screen.
 */
export function guideShowsOn(sequence: string | null | undefined, routeName: string | undefined): boolean {
  if (!sequence || routeName === undefined) return true;
  if (MAP_GUIDES.includes(sequence)) return routeName === MAP_ROUTE;
  const home = GUIDE_ROUTES[sequence];
  return !home || routeName === home;
}

/**
 * A screen's first-visit tip whose screen was left (the player tapped back while Finn talked): it ends
 * without counting as seen, so it greets the next visit instead of blocking the screen underneath.
 * Map guides only pause (onboarding resumes on the map).
 */
export function guideLeftItsScreen(sequence: string | null | undefined, routeName: string | undefined): boolean {
  return !!sequence && routeName !== undefined && !MAP_GUIDES.includes(sequence) && !!GUIDE_ROUTES[sequence]
    && routeName !== GUIDE_ROUTES[sequence];
}
