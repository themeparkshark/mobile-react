/**
 * Arrive (internal): wraps a part that is stuck on when it mounts. Only parts asked to arrive
 * mount this, so a static card or page carries no animated wrapper, shared values or Reduce
 * Motion subscription.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { useStickOn } from './motion';

export default function Arrive({ delay = 0, style, children }: {
  readonly delay?: number;
  readonly style?: StyleProp<ViewStyle>;
  /** Gets the drop's animated style (the drop closes under the sticker as it is pressed on). */
  readonly children: (drop: AnimatedStyle<ViewStyle>) => ReactNode;
}) {
  const stick = useStickOn(delay);
  return <Animated.View style={[style, stick.body]}>{children(stick.drop)}</Animated.View>;
}
