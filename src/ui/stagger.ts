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
import { Easing, FadeInDown, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { BEZIER, DURATION, SPRING, staggerDelay } from './motion';

/**
 * Grids of prizes (the closet, the shop shelves) fill like a vending machine dropping prizes: the hero
 * (the Shop Pick) drops first with a bigger pop, then each cell, row by row and left to right, drops in
 * from GRID_STAGGER.risePt below, pops a little past full size on SPRING.pop and settles,
 * GRID_STAGGER.stepMs after the one before, so the fill reads over about half a second (never all at
 * once). Only the first screenful does it; cells past it wait for the fill to finish, then fade in
 * (never an orphan cell ahead of the stagger). Refreshes and Reduce Motion are simply there.
 */
export const GRID_STAGGER = {
  stepMs: 50,
  maxItems: 9,
  risePt: 20,
  fromScale: 0.86,
  fadeMs: DURATION.quick,
  /** The stage's header art (the shop's coin pile) bounces in first; the hero lands this long after it (ms). */
  headerLeadMs: 80,
  /** The hero cell lands next; the grid starts this long after it (ms). */
  heroLeadMs: 110,
  /** The hero drops from further and pops bigger. */
  heroRisePt: 28,
  heroFromScale: 0.72,
  /** Every grid start lands inside this (ms): the whole fill reads over about half a second. */
  capMs: 650,
} as const;

/** When the grid starts after the header and the hero (ms). */
export const GRID_AFTER_HERO_MS = GRID_STAGGER.headerLeadMs + GRID_STAGGER.heroLeadMs;

/** When grid cell `index` starts (after `leadMs`, e.g. a hero cell), or null when it does not animate. Pure (unit tested). */
export function gridDelay(index: number, leadMs = 0): number | null {
  if (!(index >= 0) || index >= GRID_STAGGER.maxItems) return null;
  return Math.min(leadMs + index * GRID_STAGGER.stepMs, GRID_STAGGER.capMs - GRID_STAGGER.stepMs);
}

function riseIn(delay: number, risePt: number, fromScale: number) {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: risePt }, { scale: fromScale }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: GRID_STAGGER.fadeMs })),
        transform: [{ translateY: withDelay(delay, withSpring(0, SPRING.pop)) }, { scale: withDelay(delay, withSpring(1, SPRING.pop)) }],
      },
    };
  };
}

/** The grid cell rise as a Reanimated entering animation (UI thread), or undefined when it should not animate. */
export function gridRiseIn(index: number, options: { readonly reduced?: boolean; readonly leadMs?: number } = {}) {
  if (options.reduced) return undefined;
  const delay = gridDelay(index, options.leadMs ?? 0);
  if (delay === null) return undefined;
  return riseIn(delay, GRID_STAGGER.risePt, GRID_STAGGER.fromScale);
}

/** The hero cell (the Shop Pick): in right after the header, from further down, with a bigger pop. */
export function heroRiseIn(options: { readonly reduced?: boolean } = {}) {
  if (options.reduced) return undefined;
  return riseIn(GRID_STAGGER.headerLeadMs, GRID_STAGGER.heroRisePt, GRID_STAGGER.heroFromScale);
}

/**
 * The stage's header art (the shop's coin pile) bounces in first: it drops from above, lands with a squash
 * (SPRING.land) and pops (SPRING.pop), before the hero and the grid.
 */
export function headerDropIn(options: { readonly reduced?: boolean } = {}) {
  if (options.reduced) return undefined;
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: -GRID_STAGGER.heroRisePt }, { scaleX: 0.84 }, { scaleY: 0.84 }] },
      animations: {
        opacity: withTiming(1, { duration: GRID_STAGGER.fadeMs }),
        transform: [{ translateY: withSpring(0, SPRING.land) },
          { scaleX: withSequence(withTiming(1.12, { duration: 150 }), withSpring(1, SPRING.pop)) },
          { scaleY: withSequence(withTiming(0.92, { duration: 150 }), withSpring(1, SPRING.pop)) }],
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
