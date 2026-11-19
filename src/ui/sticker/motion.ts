/**
 * Peel, stick, squish: the look's motion, on the UI thread, transform and opacity only.
 * Springs come from src/ui/motion.ts. Reduce Motion swaps movement for a 150 ms fade.
 */
import { useEffect } from 'react';
import { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING } from '../motion';
import useUiReducedMotion from '../useUiReducedMotion';
import { STICK } from './tokens';

/**
 * A part arriving by being stuck on: it starts 8 percent big with its drop further away (held
 * above the page) and is pressed flat, the drop closing under it (about 260 ms, SPRING.settle).
 * `arrive` false: it is simply there.
 */
export function useStickOn(arrive: boolean) {
  const reduced = useUiReducedMotion();
  const t = useSharedValue(arrive ? 0 : 1);
  const seen = useSharedValue(arrive ? 0 : 1);
  useEffect(() => {
    if (!arrive) return;
    if (reduced) {
      t.value = 1;
      seen.value = withTiming(1, { duration: STICK.reducedFadeMs, easing: Easing.out(Easing.quad) });
    } else {
      seen.value = withTiming(1, { duration: STICK.fadeInMs, easing: Easing.out(Easing.quad) });
      t.value = withSpring(1, SPRING.settle);
    }
  }, [arrive, reduced, seen, t]);
  const body = useAnimatedStyle(() => ({
    opacity: seen.value,
    transform: [{ scale: STICK.fromScale + (1 - STICK.fromScale) * t.value }],
  }));
  const drop = useAnimatedStyle(() => ({
    transform: [{ translateY: STICK.liftDrop * (1 - t.value) }],
  }));
  return { body, drop };
}

/** Press progress 0 (rest) to 1 (pressed by its lip). Fast in, spring back out. */
export function usePress() {
  const reduced = useUiReducedMotion();
  const p = useSharedValue(0);
  const pressIn = () => {
    // Reduce Motion: the pressed state swaps in, nothing travels.
    p.value = reduced ? 1 : withTiming(1, { duration: 60, easing: Easing.out(Easing.quad) });
  };
  const pressOut = () => {
    p.value = reduced ? 0 : withSpring(0, SPRING.stamp);
  };
  return { p, pressIn, pressOut, reduced };
}
