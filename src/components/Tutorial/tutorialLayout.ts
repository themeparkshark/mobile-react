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
