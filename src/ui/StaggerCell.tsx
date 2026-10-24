/**
 * <StaggerCell>: a list or grid cell that rises into place on its first mount, one after another.
 *
 *   renderItem={({ item, index }) => <StaggerCell index={index}><Item item={item} /></StaggerCell>}
 *
 * For recycling lists (FlashList), where Reanimated layout animations do not belong: the cell runs
 * its own one-shot rise (STAGGER.risePt, DURATION.base, EASE.out) only when it first mounts, and only
 * for the first STAGGER.maxItems cells (staggerDelay). A recycled cell keeps its finished state, so
 * rows scrolled into view later and refreshed data never re-animate. Reduce Motion: simply there.
 * Transforms and opacity only, on the UI thread.
 */
import { memo, useEffect, useState, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { DURATION, EASE, SPRING, STAGGER, staggerDelay } from './motionEasing';
import { GRID_STAGGER, gridDelay } from './stagger';
import useUiReducedMotion from './useUiReducedMotion';

function StaggerCell({ index, children, style, grid = false }: { readonly index: number; readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  /** A grid of prizes: each cell drops in further and pops past full size (GRID_STAGGER), like a vending machine. */
  readonly grid?: boolean }) {
  const reduced = useUiReducedMotion();
  // Decided once, on the cell's first mount.
  const [delay] = useState(() => (reduced ? null : grid ? gridDelay(index) : staggerDelay(index)));
  const p = useSharedValue(delay == null ? 1 : 0);
  const pop = useSharedValue(delay == null || !grid ? 1 : GRID_STAGGER.fromScale);
  useEffect(() => {
    if (delay == null) return;
    if (grid) {
      p.value = withDelay(delay, withSpring(1, SPRING.pop));
      pop.value = withDelay(delay, withSpring(1, SPRING.pop));
    } else p.value = withDelay(delay, withTiming(1, { duration: DURATION.base, easing: EASE.out }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rise = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, p.value * 2)),
    transform: [{ translateY: (1 - p.value) * (grid ? GRID_STAGGER.risePt : STAGGER.risePt) }, { scale: pop.value }] }));
  return <Animated.View style={[style, rise]}>{children}</Animated.View>;
}

export default memo(StaggerCell);
