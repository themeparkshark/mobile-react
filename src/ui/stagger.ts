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
  /**
   * A shelf on a screen that slides in (a stack push, DURATION.enter) starts its fill this late, so the drop-in plays on
   * the settled screen instead of hiding inside the slide (the panel slides in empty, then fills).
   */
  pushLeadMs: 180,
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
export function gridRiseIn(index: number, options: { readonly reduced?: boolean; readonly leadMs?: number; readonly afterMs?: number } = {}) {
  if (options.reduced) return undefined;
  const delay = gridDelay(index, options.leadMs ?? 0);
  if (delay === null) return undefined;
  return riseIn((options.afterMs ?? 0) + delay, GRID_STAGGER.risePt, GRID_STAGGER.fromScale);
}

/** The hero cell (the Shop Pick): in right after the header, from further down, with a bigger pop. */
export function heroRiseIn(options: { readonly reduced?: boolean; readonly afterMs?: number } = {}) {
  if (options.reduced) return undefined;
  return riseIn((options.afterMs ?? 0) + GRID_STAGGER.headerLeadMs, GRID_STAGGER.heroRisePt, GRID_STAGGER.heroFromScale);
}

/**
 * The stage's header art (the shop's coin pile) bounces in first: it drops from above, lands with a squash
 * (SPRING.land) and pops (SPRING.pop), before the hero and the grid.
 */
export function headerDropIn(options: { readonly reduced?: boolean; readonly afterMs?: number } = {}) {
  if (options.reduced) return undefined;
  const after = options.afterMs ?? 0;
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: -GRID_STAGGER.heroRisePt }, { scaleX: 0.84 }, { scaleY: 0.84 }] },
      animations: {
        opacity: withDelay(after, withTiming(1, { duration: GRID_STAGGER.fadeMs })),
        transform: [{ translateY: withDelay(after, withSpring(0, SPRING.land)) },
          { scaleX: withDelay(after, withSequence(withTiming(1.12, { duration: 150 }), withSpring(1, SPRING.pop))) },
          { scaleY: withDelay(after, withSequence(withTiming(0.92, { duration: 150 }), withSpring(1, SPRING.pop))) }],
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

/** One grid cell's drop-in, driven by a shared fill clock (ms since the fill started) instead of a layout animation. */
export const GRID_FILL = {
  /** Each cell's drop takes this long. */
  cellMs: 380,
  /** The fill clock runs this long (every cell has landed), then the cells say their final look again. */
  endMs: GRID_STAGGER.pushLeadMs + GRID_STAGGER.capMs + 380 + 120,
} as const;

/**
 * Cell at fill time `clock` (ms) that starts `delay` ms in: rises from `rise` pt below and `from` scale with one small
 * overshoot (ease out back), solid quickly. Past the end it says its final look again (a value one part in ten
 * thousand off), so a view drawn late can never be left at an earlier frame. Pure worklet (unit tested).
 */
export function gridFillStyle(clock: number, delay: number, rise: number, from: number) {
  'worklet';
  const t = Math.min(1, Math.max(0, (clock - delay) / GRID_FILL.cellMs));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  const e = t <= 0 ? 0 : 1 + c3 * u * u * u + c1 * u * u;
  const settle = clock >= GRID_FILL.endMs ? 0.9999 : 1;
  return {
    opacity: Math.min(1, t * 3) * settle,
    transform: [{ translateY: (1 - e) * rise }, { scale: (from + (1 - from) * e) * settle }],
  };
}
