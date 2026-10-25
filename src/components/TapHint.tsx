/**
 * A pointing hand that shows a kid where to tap, with zero reading. It waits
 * (so a quick kid never sees it), fades in, then taps down and up in place.
 * Transforms and opacity only, on the UI thread; it stops when unmounted and
 * stands still with reduced motion. Reuses the map's own finger art.
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import useReducedGameMotion from '../hooks/useReducedGameMotion';

const HAND = require('../../assets/images/ride-photo/tap-hand.webp');

/** The art points straight down; the fingertip sits at the bottom centre of the box. */
export const TAP_HINT_SIZE = { width: 44, height: 56 } as const;

export default function TapHint({ delay = 2000, style }: { delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedGameMotion();
  const show = useSharedValue(0);
  const tap = useSharedValue(0);
  useEffect(() => {
    show.value = withDelay(delay, withTiming(1, { duration: 220 }));
    if (!reduced) {
      tap.value = withDelay(delay, withRepeat(withSequence(
        withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 320, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 420 })), -1, false));
    }
    return () => { cancelAnimation(show); cancelAnimation(tap); };
  }, [delay, reduced, show, tap]);
  const st = useAnimatedStyle(() => ({
    opacity: show.value,
    transform: [{ translateY: tap.value * 12 }, { scale: 1 - tap.value * 0.08 }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.hand, style, st]}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Image source={HAND} style={styles.img} contentFit="contain" />
  </Animated.View>;
}

const styles = StyleSheet.create({
  hand: { position: 'absolute', ...TAP_HINT_SIZE, zIndex: 5 },
  img: { ...TAP_HINT_SIZE },
});
