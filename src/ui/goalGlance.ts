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

export const GOAL_GLANCE = { afterMs: 260, scale: 0.14, upMs: 110 } as const;

let glance: SharedValue<number> | null = null;
/** 0 at rest, up to 1 for a moment on each glance (made on first use). */
export function goalGlanceValue(): SharedValue<number> {
  if (!glance) glance = makeMutable(0);
  return glance;
}

export function glanceGoal(): void {
  goalGlanceValue().value = withDelay(GOAL_GLANCE.afterMs, withSequence(
    withTiming(1, { duration: GOAL_GLANCE.upMs }), withSpring(0, SPRING.pop)));
}
