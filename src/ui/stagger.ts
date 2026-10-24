/**
 * List rows that arrive one after another, only the first time a list paints.
 *
 *   <Animated.View entering={firstPaint && staggerIn(index)}>{row}</Animated.View>
 *
 * Each row rises STAGGER.risePt and fades in over DURATION.base on EASE.out, STAGGER.stepMs apart;
 * only the first STAGGER.maxItems rows animate and the whole list lands inside STAGGER.capMs.
 * Rows scrolled into view later, refreshed data and Reduce Motion get no entrance (undefined).
 * Reanimated layout animations run on the UI thread.
 */
import { Easing, FadeInDown, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { BEZIER, DURATION, SPRING, staggerDelay } from './motion';

/**
 * Grids of prizes (the closet, the shop shelves) fill like a vending machine dropping prizes: each
 * cell, row by row, drops in from GRID_STAGGER.risePt below, pops a little past full size on SPRING.pop
 * and settles, GRID_STAGGER.stepMs after the one before. Only the first screenful does it, all starting
 * inside STAGGER.capMs; later cells, refreshes and Reduce Motion are simply there.
 */
export const GRID_STAGGER = {
  stepMs: 45,
  maxItems: 9,
  risePt: 20,
  fromScale: 0.86,
  fadeMs: DURATION.quick,
} as const;

/** When grid cell `index` starts, or null when it does not animate. Pure (unit tested). */
export function gridDelay(index: number): number | null {
  if (!(index >= 0) || index >= GRID_STAGGER.maxItems) return null;
  return Math.min(index * GRID_STAGGER.stepMs, 400 - GRID_STAGGER.stepMs);
}

/** The grid cell rise as a Reanimated entering animation (UI thread), or undefined when it should not animate. */
export function gridRiseIn(index: number, options: { readonly reduced?: boolean } = {}) {
  if (options.reduced) return undefined;
  const delay = gridDelay(index);
  if (delay === null) return undefined;
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: GRID_STAGGER.risePt }, { scale: GRID_STAGGER.fromScale }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: GRID_STAGGER.fadeMs })),
        transform: [{ translateY: withDelay(delay, withSpring(0, SPRING.pop)) }, { scale: withDelay(delay, withSpring(1, SPRING.pop)) }],
      },
    };
  };
}

const OUT = Easing.bezierFn(BEZIER.out[0], BEZIER.out[1], BEZIER.out[2], BEZIER.out[3]);

export function staggerIn(index: number, options: { readonly count?: number; readonly reduced?: boolean } = {}) {
  if (options.reduced) return undefined;
  const delay = staggerDelay(index, options.count);
  if (delay === null) return undefined;
  return FadeInDown.delay(delay).duration(DURATION.base).easing(OUT);
}
