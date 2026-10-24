/**
 * The shelf around a coin that just landed: its neighbours jiggle outward like
 * dominoes, and a full row gets one white shine sweeping across it. One-shot
 * UI-thread animations keyed to the landing (nothing loops, nothing runs at
 * rest). Reduce Motion: neither plays.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { EASE, SPRING } from '../ui/motionEasing';
import { SHELF_LANDING, jiggleAmount, jiggleDelay, jiggleDirection } from './shelfLanding';

/** Wraps one shelf slot. `landingKey` changes when a coin lands in this row; `distance` is slots from it. */
export function ShelfJiggle({ landingKey, distance, children }: {
  readonly landingKey?: string | null; readonly distance: number; readonly children: ReactNode;
}) {
  const reduced = useReducedGameMotion();
  const tip = useSharedValue(0);
  const hop = useSharedValue(0);
  const delay = jiggleDelay(distance);
  useEffect(() => {
    if (!landingKey || delay === null || reduced) return undefined;
    const dir = jiggleDirection(distance);
    const { deg, hop: lift } = jiggleAmount(distance);
    tip.value = withDelay(delay, withSequence(
      withTiming(dir * deg, { duration: 90, easing: EASE.out }),
      withSpring(0, SPRING.stamp)));
    hop.value = withDelay(delay, withSequence(withTiming(lift, { duration: 90, easing: EASE.out }), withSpring(0, SPRING.land)));
    return () => { cancelAnimation(tip); cancelAnimation(hop); };
  }, [landingKey, delay, distance, reduced, tip, hop]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -hop.value }, { rotate: `${tip.value}deg` }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** The shelf plank under a landing coin kicks down a couple of points and springs back (the weight of the coin). */
export function ShelfKick({ landingKey, children }: { readonly landingKey?: string | null; readonly children: ReactNode }) {
  const reduced = useReducedGameMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!landingKey || reduced) return undefined;
    y.value = withSequence(withTiming(SHELF_LANDING.kickPt, { duration: 50, easing: EASE.out }), withSpring(0, SPRING.stamp));
    return () => cancelAnimation(y);
  }, [landingKey, reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** One white shine across a just-completed row. */
export function RowShine({ landingKey, width }: { readonly landingKey?: string | null; readonly width: number }) {
  const reduced = useReducedGameMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!landingKey || reduced) return undefined;
    t.value = 0;
    t.value = withDelay(SHELF_LANDING.shineAfterMs, withTiming(1, { duration: SHELF_LANDING.shineMs, easing: EASE.inOut }));
    return () => cancelAnimation(t);
  }, [landingKey, reduced, t]);
  const band = Math.max(60, width * 0.28);
  const style = useAnimatedStyle(() => ({
    opacity: t.value <= 0 || t.value >= 1 ? 0 : 1,
    transform: [{ translateX: -band + (width + band) * t.value }, { skewX: '-18deg' }],
  }));
  if (!landingKey || reduced) return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
    <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: band }, style]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden', borderRadius: 14 } });
