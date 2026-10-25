/**
 * A glance toward tomorrow's goal: when coins land in the wallet or a prize lands on the shelf, the Daily 3
 * button on the map gives one small pop a beat later, so the moment points at the next goal without a word,
 * without a count and without any hurry. It never says or shows progress (nothing about the goal changes).
 *
 *   glanceGoal();                                  // after coins or a prize land
 *   const glance = goalGlanceValue();              // in the goal's component
 *   const pop = useAnimatedStyle(() => ({ transform: [{ scale: 1 + GOAL_GLANCE.scale * glance.value }] }));
 *
 * UI thread only (one shared value); Reduce Motion callers simply skip it.
 */
import { makeMutable, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { SPRING } from './motion';

export const GOAL_GLANCE = { afterMs: 260, scale: 0.14, upMs: 110,
  /** A gold ring that rings out off the goal and a white glint across its face, so the eye goes from the reward to it. */
  glintMs: 560, ringTo: 1.7 } as const;

let glance: SharedValue<number> | null = null;
/** 0 at rest, up to 1 for a moment on each glance (made on first use). */
export function goalGlanceValue(): SharedValue<number> {
  if (!glance) glance = makeMutable(0);
  return glance;
}

let glint: SharedValue<number> | null = null;
/** 0 to 1 once per glance: the gold ring and the glint (made on first use). */
export function goalGlintValue(): SharedValue<number> {
  if (!glint) glint = makeMutable(0);
  return glint;
}

/** The ring and glint at glint progress g (0 to 1): ring scale and opacity, glint offset (-1 to 1). Pure worklet. */
export function goalGlint(g: number): { ringScale: number; ringOpacity: number; glintX: number; glintOpacity: number } {
  'worklet';
  if (g <= 0 || g >= 1) return { ringScale: 1, ringOpacity: 0, glintX: -1, glintOpacity: 0 };
  const out = 1 - (1 - g) * (1 - g);
  return { ringScale: 1 + (GOAL_GLANCE.ringTo - 1) * out, ringOpacity: g < 0.12 ? g / 0.12 : Math.max(0, 1 - (g - 0.12) / 0.88),
    glintX: -1 + 2 * Math.min(1, g / 0.6), glintOpacity: g < 0.6 ? 0.9 : 0 };
}

export function glanceGoal(): void {
  const g = goalGlintValue();
  g.value = 0;
  g.value = withDelay(GOAL_GLANCE.afterMs, withTiming(1, { duration: GOAL_GLANCE.glintMs }));
  goalGlanceValue().value = withDelay(GOAL_GLANCE.afterMs, withSequence(
    withTiming(1, { duration: GOAL_GLANCE.upMs }), withSpring(0, SPRING.pop)));
}
