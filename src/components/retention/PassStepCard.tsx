import { useEffect, useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { isDimFlashingLightsEnabled } from '../../../modules/flash-safety';
import { playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { usePowerBudget } from '../../power';
import { BRAND } from '../../ui';
import { GoldBurst, RadialFlash, SparkleBurst } from '../../ui/GoldBurst';
import { DURATION, PARTICLES, SPRING, flashPeak, momentParticles } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import RewardBurst from '../RewardBurst';
import CardSurface, { CARD_FRAME } from './CardSurface';
import StampRibbon from './StampRibbon';

/** Beats for the Shark Pass step card (ms after it opens). */
export const PASS_STEP = {
  /** The steps climbed light up one by one (at most five pips). */
  pipsAt: 160,
  pipStep: 90,
  maxPips: 5,
  /** The prizes waiting drop in one after another. */
  prizesAt: 420,
  prizeStep: 110,
  maxPrizes: 4,
  /** The button fades up after the last prize. */
  buttonAfter: 260,
} as const;

/**
 * "Step N!" after climbing the Shark Pass, on the same hand-drawn card as the
 * other daily-loop moments (never a dark wash with text floating over the page):
 * bright gold rays behind, a gold step badge that slams in, the steps climbed as
 * gold pips that light one by one, then the prizes now waiting as pictures (zero
 * reading) and one big button: GET THEM! claims them all, or YAY! when nothing is
 * waiting. No price, no timer. All motion on the UI thread; Reduce Motion shows
 * the end state with a short fade and keeps the haptic.
 */
export default function PassStepCard({ step, climbed, prizes, onGet, onDone, reducedMotion }: {
  readonly step: number;
  /** How many steps were climbed since the last look. */
  readonly climbed: number;
  /** Pictures of the prizes now waiting (already sized), in track order. */
  readonly prizes: readonly React.ReactNode[];
  /** Claim everything waiting (only when there are prizes). */
  readonly onGet?: () => void;
  readonly onDone: () => void;
  readonly reducedMotion: boolean;
}) {
  const { width } = useWindowDimensions();
  const budget = usePowerBudget();
  const card = useSharedValue(reducedMotion ? 1 : 0);
  const gold = useSharedValue(reducedMotion ? 0.7 : 0.35);
  const bloom = useSharedValue(0);
  const flash = useSharedValue(0);
  const badge = useSharedValue(reducedMotion ? 1 : 0);
  const sparkle = useSharedValue(0);
  const burst = useSharedValue(0);
  const button = useSharedValue(reducedMotion ? 1 : 0);
  const pips = Math.max(1, Math.min(PASS_STEP.maxPips, climbed));
  const shown = prizes.slice(0, PASS_STEP.maxPrizes);
  const more = prizes.length - shown.length;
  const sparks = useMemo(() => momentParticles(PARTICLES.sparkles, budget, reducedMotion), [budget, reducedMotion]);
  const lastPrize = PASS_STEP.prizesAt + Math.max(0, shown.length - 1) * PASS_STEP.prizeStep;
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reducedMotion) {
      playHaptic('golden'); playSfx('fx.reveal');
      return undefined;
    }
    // Gather (the card lands on the settle spring while the rays charge), hold, burst, settle.
    card.value = withSpring(1, SPRING.settle);
    gold.value = withSequence(withTiming(0.55, { duration: 120, easing: EASE.charge }), withTiming(1, { duration: 160, easing: EASE.out }),
      withDelay(700, withTiming(0.8, { duration: 500 })));
    flash.value = withDelay(120, withSequence(withTiming(flashPeak(isDimFlashingLightsEnabled(), false), { duration: 50 }), withTiming(0, { duration: DURATION.flash })));
    bloom.value = withDelay(120, withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 360 })));
    // The badge slams in from 1.8 on the hit-stop, then springs to rest.
    badge.value = withDelay(120 + DURATION.hitStop, withSequence(withTiming(1.18, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.pop)));
    sparkle.value = withDelay(190, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
    burst.value = withDelay(190, withTiming(1, { duration: 1100 }));
    button.value = withDelay(lastPrize + PASS_STEP.buttonAfter, withTiming(1, { duration: 200, easing: EASE.out }));
    timers.push(setTimeout(() => { playHaptic('golden'); playSfx('fx.reveal'); }, 190));
    for (let i = 0; i < pips; i++) {
      timers.push(setTimeout(() => { queueHaptic('tickSelection'); playSfx('fx.coinTick', 0.5 + i * 0.08); }, PASS_STEP.pipsAt + i * PASS_STEP.pipStep));
    }
    shown.forEach((_, i) => timers.push(setTimeout(() => { queueHaptic('tapLight'); playSfx('fx.coin', 0.6 + i * 0.06); },
      PASS_STEP.prizesAt + i * PASS_STEP.prizeStep)));
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cardStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, card.value * 1.6), transform: [{ scale: 0.86 + 0.14 * card.value }] }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badge.value <= 0 ? 0 : 1, transform: [{ scale: badge.value <= 0 ? 1.8 : badge.value }] }));
  const buttonStyle = useAnimatedStyle(() => ({ opacity: button.value, transform: [{ translateY: (1 - button.value) * 8 }] }));
  const has = shown.length > 0;
  const go = () => { if (has && onGet) onGet(); else onDone(); };
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onDone}>
      <View style={styles.dim}>
        <Animated.View style={[styles.wrap, { width: Math.min(width * 0.9, 380) }, cardStyle]}>
          <StampRibbon text={`Step ${step}!`} reducedMotion={reducedMotion} />
          <View style={styles.card}>
            <CardSurface />
            <View style={styles.stage}>
              <GoldBurst size={260} amount={gold} bloom={bloom} reduced={reducedMotion} style={styles.abs} />
              <RadialFlash flash={flash} size={200} />
              {/* The scale lives on a plain wrapper: iOS draws a scaled bordered background at its first scale. */}
              <Animated.View style={badgeStyle} accessibilityLabel={`Step ${step}`}>
                <View style={styles.badge}>
                  <Text style={styles.badgeSmall} allowFontScaling={false}>STEP</Text>
                  <Text style={styles.badgeNum} allowFontScaling={false}>{step}</Text>
                </View>
              </Animated.View>
              <View style={styles.center} pointerEvents="none"><SparkleBurst progress={sparkle} count={sparks} radius={120} /></View>
            </View>
            {/* The steps climbed, as gold pips lighting one by one (a picture of "you went up"). */}
            <View style={styles.pips} accessibilityLabel={`${climbed} ${climbed === 1 ? 'step' : 'steps'} up`}>
              {Array.from({ length: pips }, (_, i) => (
                <Pip key={i} at={PASS_STEP.pipsAt + i * PASS_STEP.pipStep} reducedMotion={reducedMotion} />
              ))}
              {climbed > pips && <Text style={styles.pipMore}>{`+${climbed - pips}`}</Text>}
            </View>
            {has ? (
              <View style={styles.prizes} accessibilityLabel={`${prizes.length} ${prizes.length === 1 ? 'prize' : 'prizes'} waiting`}>
                {shown.map((p, i) => (
                  <PrizeDrop key={i} at={PASS_STEP.prizesAt + i * PASS_STEP.prizeStep} reducedMotion={reducedMotion}>{p}</PrizeDrop>
                ))}
                {more > 0 && <View style={styles.more}><Text style={styles.moreText}>{`+${more}`}</Text></View>}
              </View>
            ) : (
              <Text style={styles.keep}>Keep playing to climb!</Text>
            )}
            <Animated.View style={[styles.buttonWrap, buttonStyle]}>
              <Pressable onPress={go} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <Text style={styles.buttonText}>{has ? (prizes.length === 1 ? 'GET IT!' : 'GET THEM!') : 'YAY!'}</Text>
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>
        {!reducedMotion && budget.animate && budget.particleScale >= 0.5 && <RewardBurst progress={burst} x={width / 2} y={300} />}
      </View>
    </Modal>
  );
}

function Pip({ at, reducedMotion }: { readonly at: number; readonly reducedMotion: boolean }) {
  const v = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (!reducedMotion) v.value = withDelay(at, withSequence(withTiming(1.35, { duration: 90, easing: EASE.out }), withSpring(1, SPRING.stamp)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lit = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value), transform: [{ scale: Math.max(0.4, v.value) }] }));
  return (
    <View style={styles.pip}>
      <Animated.View style={lit}><View style={styles.pipLit} /></Animated.View>
    </View>
  );
}

function PrizeDrop({ at, reducedMotion, children }: { readonly at: number; readonly reducedMotion: boolean; readonly children: React.ReactNode }) {
  const v = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (!reducedMotion) v.value = withDelay(at, withSpring(1, SPRING.land));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 2), transform: [{ translateY: (1 - v.value) * -26 }, { scale: 0.7 + 0.3 * v.value }] }));
  return <Animated.View style={[styles.prize, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  // The same dim as every loop card: the map or page shows through softly; the card itself is opaque.
  dim: { flex: 1, backgroundColor: 'rgba(5,52,110,0.55)', alignItems: 'center', justifyContent: 'center' },
  wrap: { alignItems: 'center' },
  card: { width: '94%', marginTop: -14, ...CARD_FRAME, backgroundColor: BRAND.blue,
    paddingTop: 22, paddingBottom: 16, paddingHorizontal: 14, alignItems: 'center', overflow: 'hidden', gap: 10 },
  stage: { height: 170, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  badge: { width: 128, height: 128, borderRadius: 64, backgroundColor: BRAND.gold, borderWidth: 5, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderBottomWidth: 9, borderBottomColor: BRAND.goldLip },
  badgeSmall: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, marginBottom: -8 },
  badgeNum: { fontFamily: 'Shark', fontSize: 64, color: BRAND.navy },
  pips: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  pip: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  pipLit: { width: 18, height: 18, borderRadius: 9, backgroundColor: BRAND.gold },
  pipMore: { fontFamily: 'Shark', fontSize: 18, color: BRAND.gold },
  prizes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center', minHeight: 86 },
  prize: { width: 78, height: 78, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center' },
  more: { width: 54, height: 54, borderRadius: 27, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  keep: { fontFamily: 'Shark', fontSize: 20, color: BRAND.white, textAlign: 'center' },
  buttonWrap: { alignSelf: 'stretch' },
  button: { alignSelf: 'stretch', backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  pressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  buttonText: { fontFamily: 'Shark', fontSize: 22, color: '#075083' },
});
