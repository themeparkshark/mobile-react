import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, SHADOW } from '../../ui';

/**
 * A suggestion that is not leading right now folds into a 56pt stub in its own
 * slot (one suggestion leads at a time). Same blue and white border as the full
 * chip; it springs in from its side, and reduced motion holds still.
 */
export default function MapSuggestionStub({ side, top, label, badge, onPress, children, zIndex = 20 }: {
  readonly side: 'left' | 'right';
  readonly top: number;
  readonly label: string;
  /** Short count on a small white tag, for example "1/3". */
  readonly badge?: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
  /** Drawn outside the map container (the Park Story pill) it must sit above the map. */
  readonly zIndex?: number;
}) {
  const reduced = useReducedGameMotion();
  const enter = useSharedValue(reduced ? 1 : 0);
  useEffect(() => { enter.value = reduced ? 1 : withSpring(1, { damping: 13, stiffness: 190 }); }, [enter, reduced]);
  const direction = side === 'left' ? -1 : 1;
  const animated = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * 24 * direction }, { scale: 0.85 + enter.value * 0.15 }],
  }));
  return <Animated.View testID={`map-suggestion-stub-${side}`} style={[styles.slot, side === 'left' ? styles.left : styles.right, { top, zIndex }, animated]}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      onPress={() => { haptic('tapLight'); onPress(); }} style={styles.stub}>
      {children}
    </Pressable>
    {!!badge && <View style={styles.badge} pointerEvents="none"><Text style={styles.badgeText}>{badge}</Text></View>}
  </Animated.View>;
}

export const STUB_SIZE = 56;

const styles = StyleSheet.create({
  slot: { position: 'absolute', zIndex: 20 },
  left: { left: 12 },
  right: { right: 12 },
  stub: { width: STUB_SIZE, height: STUB_SIZE, borderRadius: STUB_SIZE / 2, backgroundColor: BRAND.blueBright,
    borderWidth: 3, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  badge: { position: 'absolute', bottom: -6, alignSelf: 'center', backgroundColor: BRAND.white, borderRadius: 8,
    borderWidth: 2, borderColor: BRAND.blueBright, paddingHorizontal: 5, minWidth: 28, alignItems: 'center' },
  badgeText: { color: '#0b3d70', fontFamily: 'Knockout', fontSize: 11 },
});
