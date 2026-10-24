import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { playHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { usePowerBudget } from '../../power';
import { LOOP_CUES, nextFlameLine } from '../../services/retention/loopMotion';
import { BRAND } from '../../ui';
import { SparkleBurst } from '../../ui/GoldBurst';
import { DURATION, SPRING, momentParticles } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import FlameArt, { NextFlameGoal } from './FlameArt';

/**
 * The daily +1, inside the chest card (no extra card on a normal day): the
 * ember glows, the flame whooshes up past full size and settles, the number
 * rolls N-1 to N, three sparks fly, then "N days in a row!" (only once the
 * roll has landed) and the next flame size to grow toward.
 * `grow` false shows today's flame at rest (already celebrated on this phone).
 */
export default function FlameUpRow({ from, to, grow, reducedMotion }: {
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
  const sparks = play ? momentParticles(3, budget, false) : 0;
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
    const t = setTimeout(() => { playHaptic('tierUp'); playSfx(LOOP_CUES.flameUp.fallback, 0.8); }, at);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: whoosh.value }] }));
  const oldStyle = useAnimatedStyle(() => ({ opacity: 1 - roll.value, transform: [{ translateY: -20 * roll.value }] }));
  const newStyle = useAnimatedStyle(() => ({ opacity: roll.value, transform: [{ translateY: 20 * (1 - roll.value) }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, text.value * 1.5), transform: [{ scale: 1.25 - 0.25 * text.value }] }));
  const line = nextFlameLine(to);
  return (
    <View style={styles.row} accessible accessibilityLabel={`${to} days in a row`}>
      <View style={styles.flameBox}>
        <Animated.View style={flameStyle}><FlameArt days={to} size={64} reducedMotion={reducedMotion} boost={boost} /></Animated.View>
        <View style={styles.center} pointerEvents="none"><SparkleBurst progress={sparkle} count={sparks} radius={44} /></View>
        <View style={styles.num}>
          {play && <Animated.Text style={[styles.numText, oldStyle]} allowFontScaling={false}>{from}</Animated.Text>}
          <Animated.Text style={[styles.numText, play && styles.abs, newStyle]} allowFontScaling={false}>{to}</Animated.Text>
        </View>
      </View>
      <Animated.View style={[styles.words, textStyle]}>
        <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>{to === 1 ? 'Your flame is lit!' : `${to} days in a row!`}</Text>
        {line ? <NextFlameGoal days={to} size={20} textStyle={styles.small} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16,
    paddingHorizontal: 8, paddingVertical: 4 },
  flameBox: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  num: { position: 'absolute', bottom: -2, right: -4, minWidth: 30, height: 28, borderRadius: 14, paddingHorizontal: 6,
    backgroundColor: BRAND.white, borderWidth: 2.5, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  numText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, marginTop: 1 },
  abs: { position: 'absolute' },
  words: { flex: 1, gap: 1 },
  big: { fontFamily: 'Shark', fontSize: 22, color: BRAND.gold },
  small: { fontFamily: 'Shark', fontSize: 14, color: '#e4f7ff' },
});
