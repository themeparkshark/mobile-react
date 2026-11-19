/**
 * Peel, stick, squish: the look's motion, on the UI thread, transform and opacity only.
 * Springs come from src/ui/motion.ts. Reduce Motion swaps movement for a 150 ms fade.
 */
import { useEffect } from 'react';
import { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { SPRING } from '../motion';
import useUiReducedMotion from '../useUiReducedMotion';
import { STICK } from './tokens';

/**
 * A part arriving by being stuck on: it starts 8 percent big with its drop further away (held
 * above the page) and is pressed flat, the drop closing under it (about 260 ms, SPRING.settle).
 * Only parts asked to arrive call this (static cards and pages carry no animated wrapper).
 */
export function useStickOn(delay: number = 0) {
  const reduced = useUiReducedMotion();
  const t = useSharedValue(0);
  const seen = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      t.value = 1;
      seen.value = withDelay(delay, withTiming(1, { duration: STICK.reducedFadeMs, easing: Easing.out(Easing.quad) }));
    } else {
      seen.value = withDelay(delay, withTiming(1, { duration: STICK.fadeInMs, easing: Easing.out(Easing.quad) }));
      t.value = withDelay(delay, withSpring(1, SPRING.settle));
    }
  }, [delay, reduced, seen, t]);
  const body = useAnimatedStyle(() => ({
    opacity: seen.value,
    transform: [{ scale: STICK.fromScale + (1 - STICK.fromScale) * t.value }],
  }));
  const drop = useAnimatedStyle(() => ({
    transform: [{ translateY: STICK.liftDrop * (1 - t.value) }],
  }));
  return { body, drop };
}

/**
 * The hero landing on its stage (the won coin): it falls from above the window, big, and lands
 * with a spring (SPRING.land), squashing a touch as it hits. Reduce Motion: a 150 ms fade.
 */
export function useLandOn(delay: number, fall: number) {
  const reduced = useUiReducedMotion();
  const t = useSharedValue(0);
  const seen = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      t.value = 1;
      seen.value = withDelay(delay, withTiming(1, { duration: STICK.reducedFadeMs, easing: Easing.out(Easing.quad) }));
    } else {
      seen.value = withDelay(delay, withTiming(1, { duration: STICK.fadeInMs, easing: Easing.out(Easing.quad) }));
      t.value = withDelay(delay, withSpring(1, SPRING.land));
    }
  }, [delay, reduced, seen, t]);
  return useAnimatedStyle(() => ({
    opacity: seen.value,
    transform: [{ translateY: -fall * (1 - t.value) }, { scale: 1 + 0.3 * (1 - t.value) }],
  }));
}

/**
 * Peeled off: `out` goes 0 to 1 when the part leaves. It lifts a little, turns at its corner and
 * fades (Reduce Motion: a 150 ms fade only). The caller starts it with `peelOut`.
 */
export function usePeelStyle(out: SharedValue<number>, reduced: boolean) {
  return useAnimatedStyle(() => (reduced
    ? { opacity: 1 - out.value }
    : {
      opacity: 1 - out.value,
      transform: [
        { translateY: -STICK.peelLift * out.value },
        { rotate: `${-STICK.peelTurn * out.value}deg` },
        { scale: 1 + 0.04 * out.value },
      ],
    }));
}

export function peelTiming(reduced: boolean) {
  return { duration: reduced ? STICK.reducedFadeMs : STICK.peelMs, easing: Easing.in(Easing.quad) };
}

/** Press progress 0 (rest) to 1 (pressed by its lip). Fast in, spring back out. `initial` 1 holds it pressed (the gallery's still sample). */
export function usePress(initial: number = 0) {
  const reduced = useUiReducedMotion();
  const p = useSharedValue(initial);
  const pressIn = () => {
    // Reduce Motion: the pressed state swaps in, nothing travels.
    p.value = reduced ? 1 : withTiming(1, { duration: 60, easing: Easing.out(Easing.quad) });
  };
  const pressOut = () => {
    p.value = reduced ? 0 : withSpring(0, SPRING.stamp);
  };
  return { p, pressIn, pressOut, reduced };
}
