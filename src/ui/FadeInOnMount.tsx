import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { EASE } from './motionEasing';

/**
 * A view that fades in on the UI thread when it mounts. Use it instead of `entering={FadeIn...}`: on this app's
 * Fabric build a layout-animation `entering` can show the view at full opacity on its first frame (the queued
 * Set Complete card snapped in with no fade in release JS), while a shared value always plays.
 * `instant` (Reduce Motion, or a layer that must show at once) mounts it fully shown.
 */
export default function FadeInOnMount({ duration, instant = false, style, children, ...rest }: ViewProps & {
  readonly duration: number;
  readonly instant?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}) {
  const shown = useSharedValue(instant ? 1 : 0);
  useEffect(() => {
    if (instant) { shown.value = 1; return; }
    shown.value = withTiming(1, { duration, easing: EASE.out });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  return <Animated.View {...rest} style={[style, fade]}>{children}</Animated.View>;
}
