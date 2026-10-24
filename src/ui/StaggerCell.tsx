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
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { DURATION, EASE, STAGGER, staggerDelay } from './motionEasing';
import useUiReducedMotion from './useUiReducedMotion';

function StaggerCell({ index, children, style }: { readonly index: number; readonly children: ReactNode; readonly style?: StyleProp<ViewStyle> }) {
  const reduced = useUiReducedMotion();
  // Decided once, on the cell's first mount.
  const [delay] = useState(() => (reduced ? null : staggerDelay(index)));
  const p = useSharedValue(delay == null ? 1 : 0);
  useEffect(() => {
    if (delay != null) p.value = withDelay(delay, withTiming(1, { duration: DURATION.base, easing: EASE.out }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rise = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * STAGGER.risePt }] }));
  return <Animated.View style={[style, rise]}>{children}</Animated.View>;
}

export default memo(StaggerCell);
