import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { playHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { usePowerBudget } from '../../power';
import { LOOP_CUES } from '../../services/retention/loopMotion';
import { BRAND } from '../../ui';
import { SparkleBurst } from '../../ui/GoldBurst';
import { DURATION, SPRING, momentParticles } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import FlameArt, { TomorrowGoal } from './FlameArt';

/**
 * The daily +1, inside the chest card (no extra card on a normal day): the
 * ember glows, the flame whooshes up past full size and settles, the number
 * rolls N-1 to N and lands with a squash, a gold ring pops and sparks fly,
 * then tomorrow stamps in beside it as one big picture on a navy pill
 * (tomorrow's flame with its number, plus the prize waiting, "Tomorrow!").
 * The number shows once (on the flame); the words are for screen readers.
 * `grow` false shows today's flame at rest (already celebrated on this phone).
 */
export default function FlameUpRow({ from, to, grow, reducedMotion, prize = 'chest' }: {
  /** Tomorrow's prize (the close goal shown under the words). */
  readonly prize?: 'chest' | 'gear' | 'flame';
  readonly from: number;
  readonly to: number;
  readonly grow: boolean;
  readonly reducedMotion: boolean;
}) {
  const budget = usePowerBudget();
  const play = grow && !reducedMotion;
  const boost = useSharedValue(play ? -0.3 : 0);
  const whoosh = useSharedValue(play ? 0.6 : 1);
  const roll = useSharedValue(play ? 0 : 1);
  const text = useSharedValue(play ? 0 : 1);
  const sparkle = useSharedValue(0);
  /** The new number lands with a squash (wide and short), then stamps back to round. */
  const pop = useSharedValue(1);
  /** The landing ring and the second spark wave on the number's squash. */
  const land = useSharedValue(0);
  const sparks = play ? momentParticles(3, budget, false) : 0;
  const landSparks = play ? momentParticles(6, budget, false) : 0;
  useEffect(() => {
    if (!grow) return;
    if (reducedMotion) { playHaptic('tierUp'); playSfx(LOOP_CUES.flameUp.fallback); return; }
    const at = 300;
    // Ember glow, then the whoosh on the pop spring; the number rolls with it; the words wait for the roll.
    boost.value = withSequence(withTiming(0.3, { duration: at, easing: EASE.charge }), withSpring(0, SPRING.pop));
    whoosh.value = withDelay(at, withSequence(withTiming(1.2, { duration: 140, easing: EASE.out }), withSpring(1, SPRING.pop)));
    roll.value = withDelay(at, withTiming(1, { duration: DURATION.base, easing: EASE.out }));
    sparkle.value = withDelay(at, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
    text.value = withDelay(at + DURATION.base, withSpring(1, SPRING.stamp));
    pop.value = withDelay(at + DURATION.base - 40, withSequence(withTiming(1.28, { duration: 70, easing: EASE.out }), withSpring(1, SPRING.stamp)));
    land.value = withDelay(at + DURATION.base - 40, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
    const t = setTimeout(() => { playHaptic('tierUp'); playSfx(LOOP_CUES.flameUp.fallback, 0.8); }, at);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: whoosh.value }] }));
  const oldStyle = useAnimatedStyle(() => ({ opacity: 1 - roll.value, transform: [{ translateY: -20 * roll.value }] }));
  const newStyle = useAnimatedStyle(() => ({ opacity: roll.value, transform: [{ translateY: 20 * (1 - roll.value) }, { scaleX: pop.value }, { scaleY: 2 - pop.value }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, text.value * 1.5), transform: [{ scale: 1.25 - 0.25 * text.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: land.value <= 0 || land.value >= 1 ? 0 : 0.9 * (1 - land.value),
    transform: [{ scale: 0.5 + 0.9 * land.value }] }));
  return (
    <View style={styles.row} accessible accessibilityLabel={`${to === 1 ? 'Your flame is lit' : `${to} days in a row`}. Tomorrow: day ${to + 1}`}>
      <View style={styles.flameBox}>
        <Animated.View style={flameStyle}><FlameArt days={to} size={66} reducedMotion={reducedMotion} boost={boost} /></Animated.View>
        <View style={styles.center} pointerEvents="none"><SparkleBurst progress={sparkle} count={sparks} radius={46} /></View>
        <View style={styles.num}>
          {play && <View style={styles.numRing} pointerEvents="none"><Animated.View style={[styles.ring, ringStyle]} /></View>}
          {play && <View style={styles.center} pointerEvents="none"><SparkleBurst progress={land} count={landSparks} radius={34} /></View>}
          {/* Wide enough for the new number too (9 to 10, 99 to 100: the rolling number is never clipped). */}
          <View style={[styles.numFace, { minWidth: Math.max(34, 14 + String(Math.max(from, to)).length * 11) }]}>
            {play && <Animated.Text style={[styles.numText, oldStyle]} allowFontScaling={false}>{from}</Animated.Text>}
            <Animated.Text style={[styles.numText, play && styles.abs, newStyle]} allowFontScaling={false}>{to}</Animated.Text>
          </View>
        </View>
      </View>
      {/* Tomorrow as one big picture on the navy pill the flame cards use: readable from arm's length. */}
      <Animated.View style={[styles.pill, textStyle]}>
        <TomorrowGoal days={to} prize={prize} size={42} reducedMotion={reducedMotion} stacked textStyle={styles.small} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16, paddingHorizontal: 8, paddingVertical: 5 },
  flameBox: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  // Today's number, once: a white chip on the flame (it rolls, squashes and stamps back).
  num: { position: 'absolute', bottom: -2, right: -6, minWidth: 34, height: 30 },
  numFace: { minWidth: 34, height: 30, borderRadius: 15, paddingHorizontal: 6, backgroundColor: BRAND.white, borderWidth: 2.5,
    borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  numRing: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 56, height: 56, borderRadius: 28, borderWidth: 4, borderColor: '#FFE07A' },
  numText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, marginTop: 1 },
  abs: { position: 'absolute' },
  pill: { backgroundColor: BRAND.navy, borderRadius: 18, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6, flexShrink: 1 },
  small: { fontFamily: 'Shark', color: BRAND.gold },
});
