/**
 * The shelf around a coin that just landed: its neighbours jiggle outward like
 * dominoes, and a full row gets one white shine sweeping across it. One-shot
 * UI-thread animations keyed to the landing (nothing loops, nothing runs at
 * rest). Reduce Motion: neither plays.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { queueHaptic } from '../gamekit/Haptics';
import { playMoment } from '../gamekit/audio/playMoment';
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

/** The row is full: a tier-up chime and the win buzz on the frame the shine starts (from the UI clock). */
function rowCompleteCue() {
  queueHaptic('success');
  playMoment('reward.levelUp');
}

/** One bright white-and-gold shine across a just-completed row, over the coins (the whole row gleams once). */
export function RowShine({ landingKey, width }: { readonly landingKey?: string | null; readonly width: number }) {
  const reduced = useReducedGameMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!landingKey) return undefined;
    if (reduced) { rowCompleteCue(); return undefined; }
    t.value = 0;
    t.value = withDelay(SHELF_LANDING.shineAfterMs, withTiming(1, { duration: SHELF_LANDING.shineMs, easing: EASE.inOut }));
    return () => cancelAnimation(t);
  }, [landingKey, reduced, t]);
  // The cue rides the same UI clock as the band: it fires when the band first moves.
  const started = useSharedValue(0);
  useEffect(() => {
    if (!landingKey || reduced) return undefined;
    started.value = 0;
    started.value = withDelay(SHELF_LANDING.shineAfterMs, withTiming(1, { duration: 16 }, ok => { if (ok) runOnJS(rowCompleteCue)(); }));
    return () => cancelAnimation(started);
  }, [landingKey, reduced, started]);
  const band = Math.max(70, width * 0.3);
  const style = useAnimatedStyle(() => ({
    opacity: t.value <= 0 || t.value >= 1 ? 0 : 1,
    transform: [{ translateX: -band + (width + band) * t.value }, { skewX: '-18deg' }],
  }));
  if (!landingKey || reduced) return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
    <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: band }, style]}>
      <LinearGradient colors={['rgba(255,236,150,0)', 'rgba(255,236,150,0.55)', 'rgba(255,255,255,0.95)', 'rgba(255,236,150,0.55)', 'rgba(255,236,150,0)']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden', borderRadius: 14 } });
