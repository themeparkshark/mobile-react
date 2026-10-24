/**
 * The shelf around a coin that just landed: its neighbours jiggle outward like
 * dominoes, and a full row celebrates: a gold-and-white light bar sweeps
 * across it, each coin hops as the bar reaches it with a tick that climbs the
 * coin ladder, the plank glows gold for a beat, and a five-pip "row done"
 * badge pops on the plank's end (pictures only). One-shot UI-thread animations
 * keyed to the landing (nothing loops, nothing runs at rest). Reduce Motion:
 * no travel; the badge simply shows and the chime and buzz stay.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import { withDelay, withSequence, withSpring, withTiming } from './park/momentTime';
import { queueHaptic } from '../gamekit/Haptics';
import { playMoment } from '../gamekit/audio/playMoment';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { EASE, SPRING } from '../ui/motionEasing';
import { SHELF_LANDING, jiggleAmount, jiggleDelay, jiggleDirection, rowHopDelay } from './shelfLanding';

/** One rung of the row's tick ladder: the sound climbs one step per coin, a light tick in the hand. */
function rowTick(step: number) {
  playMoment('ui.counterTick', { step });
  queueHaptic('tickSelection');
}

/**
 * Wraps one shelf slot. `landingKey` changes when a coin lands in this row; `distance` is slots from it.
 * `rowWaveKey` (a completed row) makes every coin hop in turn as the light bar passes, `index` left to right.
 */
export function ShelfJiggle({ landingKey, distance, rowWaveKey, index = 0, children }: {
  readonly landingKey?: string | null; readonly distance: number; readonly rowWaveKey?: string | null; readonly index?: number;
  readonly children: ReactNode;
}) {
  const reduced = useReducedGameMotion();
  const tip = useSharedValue(0);
  const hop = useSharedValue(0);
  const wave = useSharedValue(0);
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
  useEffect(() => {
    if (!rowWaveKey || reduced) return undefined;
    // The hop and its tick start on the same UI frame (the tick rides the hop's first step).
    wave.value = withDelay(rowHopDelay(index), withSequence(
      withTiming(1, { duration: 110, easing: EASE.out }, ok => { if (ok) runOnJS(rowTick)(index); }),
      withSpring(0, SPRING.land)));
    return () => cancelAnimation(wave);
  }, [rowWaveKey, index, reduced, wave]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -hop.value - SHELF_LANDING.rowHopPt * wave.value },
      { rotate: `${tip.value}deg` },
      { scale: 1 + 0.12 * wave.value },
    ],
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

/**
 * A just-completed row celebrates, over the coins: one bright gold-and-white light bar sweeps across it,
 * the plank glows gold for a beat, and a five-pip "row done" badge pops on the plank's end.
 */
export function RowShine({ landingKey, width, slots = 5 }: { readonly landingKey?: string | null; readonly width: number; readonly slots?: number }) {
  const reduced = useReducedGameMotion();
  const t = useSharedValue(0);
  const glow = useSharedValue(0);
  const badge = useSharedValue(0);
  useEffect(() => {
    if (!landingKey) return undefined;
    if (reduced) { rowCompleteCue(); badge.value = 1; return undefined; }
    t.value = 0;
    t.value = withDelay(SHELF_LANDING.shineAfterMs, withTiming(1, { duration: SHELF_LANDING.shineMs, easing: EASE.inOut }));
    glow.value = withDelay(SHELF_LANDING.shineAfterMs, withSequence(withTiming(1, { duration: 200, easing: EASE.out }),
      withDelay(SHELF_LANDING.plankGlowMs - 400, withTiming(0, { duration: 400, easing: EASE.in }))));
    badge.value = withDelay(SHELF_LANDING.badgeAt, withSpring(1, SPRING.pop));
    return () => { cancelAnimation(t); cancelAnimation(glow); cancelAnimation(badge); };
  }, [landingKey, reduced, t, glow, badge]);
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
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.85 * glow.value }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, badge.value * 2),
    transform: [{ scale: reduced ? 1 : 1.7 - 0.7 * badge.value }],
  }));
  if (!landingKey) return null;
  return <>
    {!reduced && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
      {/* The plank glows gold under the coins for a beat. */}
      <Animated.View style={[styles.plankGlow, glowStyle]}>
        <LinearGradient colors={['rgba(255,207,59,0)', 'rgba(255,207,59,0.9)', 'rgba(255,246,207,0.95)']}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: band }, style]}>
        <LinearGradient colors={['rgba(255,236,150,0)', 'rgba(255,236,150,0.65)', 'rgba(255,255,255,1)', 'rgba(255,236,150,0.65)', 'rgba(255,236,150,0)']}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>}
    {/* "Row done" with zero words: five gold pips on a little plaque at the plank's end. */}
    <Animated.View pointerEvents="none" style={[styles.badge, badgeStyle]} accessible accessibilityLabel={`Row complete, ${slots} of ${slots}`}>
      {Array.from({ length: slots }, (_, i) => <View key={i} style={styles.pip} />)}
    </Animated.View>
  </>;
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', borderRadius: 14 },
  plankGlow: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 34 },
  badge: { position: 'absolute', right: -4, bottom: -6, flexDirection: 'row', gap: 3, paddingHorizontal: 6, paddingVertical: 4,
    borderRadius: 10, backgroundColor: '#05346e', borderWidth: 2, borderColor: '#ffffff' },
  pip: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#ffcf3b', borderWidth: 1, borderColor: '#fff6cf' },
});
