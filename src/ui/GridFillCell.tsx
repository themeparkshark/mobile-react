/**
 * A grid cell that drops in on a shared fill clock (src/ui/stagger.ts gridFillStyle). Used for the shop's first
 * screenful: Reanimated entering animations on cells mounted with their screen did not run in release (the shelf
 * landed all at once), so the drop is plain UI-thread transforms from one clock the shelf starts once it has laid out.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { gridFillStyle } from './stagger';

export default function GridFillCell({ fill, delay, rise, from, style, children }: {
  readonly fill: SharedValue<number>;
  /** When this cell starts (ms into the fill), or null to simply be there. */
  readonly delay: number | null;
  readonly rise: number;
  readonly from: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const anim = useAnimatedStyle(() => (delay === null ? {} : gridFillStyle(fill.value, delay, rise, from)));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
