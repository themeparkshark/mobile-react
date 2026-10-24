/**
 * "First coin today!": a warm gold sunrise band sweeps the map left to right,
 * a ribbon slides down from under the HUD with a gold coin, two sparkle rings
 * pop around that coin, and Finn cheers beside it; the golden buzz and the new
 * record sting land with the ribbon. It stays 1.8 s, then slides up (faster
 * than it came). No words needed: the sun-gold sweep and the crowned coin say
 * "this one is special". Reduce Motion: the ribbon fades in and out, the
 * haptic and the sound stay. UI thread only; one-shot, nothing loops.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { playHaptic } from '../../gamekit/Haptics';
import { playMoment } from '../../gamekit/audio/playMoment';
import { useReduceMotionPreference } from '../../hooks/useReducedGameMotion';
import { usePowerBudget } from '../../power';
import { SparkleBurst } from '../../ui/GoldBurst';
import GameIcon from '../../ui/GameIcon';
import { DURATION, EASE, GOLD_FX, SPRING, momentParticles } from '../../ui/motionEasing';
import { BRAND } from '../../ui/tokens';
import { HUD_ROW_HEIGHT, HUD_TOP } from '../map/statusStack';
import { ARRIVAL_ART } from './arrivalArt';
import { FIRST_COIN } from './firstCoinToday';

export default function FirstCoinRibbon({ onDone }: { readonly onDone: () => void }) {
  const preference = useReduceMotionPreference();
  if (preference === null) return null;
  return <Ribbon onDone={onDone} reduced={preference} />;
}

function Ribbon({ onDone, reduced }: { readonly onDone: () => void; readonly reduced: boolean }) {
  const { width } = useWindowDimensions();
  const budget = usePowerBudget();
  const sparkles = momentParticles(FIRST_COIN.sparkles, budget, reduced);
  const sweep = useSharedValue(0);
  const drop = useSharedValue(0);
  const wave1 = useSharedValue(0);
  const wave2 = useSharedValue(0);
  const finn = useSharedValue(0);
  const coin = useSharedValue(0);
  const doneRef = useRef(onDone); doneRef.current = onDone;
  const finish = () => doneRef.current();
  const land = () => { playHaptic('golden'); playMoment('game.newRecord'); };

  useEffect(() => {
    const exitAt = FIRST_COIN.ribbonAt + 300 + FIRST_COIN.holdMs;
    if (reduced) {
      drop.value = withSequence(withTiming(1, { duration: DURATION.quick }, ok => { if (ok) runOnJS(land)(); }),
        withDelay(FIRST_COIN.holdMs, withTiming(0, { duration: DURATION.quick }, ok => { if (ok) runOnJS(finish)(); })));
      return () => cancelAnimation(drop);
    }
    sweep.value = withTiming(1, { duration: FIRST_COIN.sweepMs, easing: EASE.inOut });
    drop.value = withDelay(FIRST_COIN.ribbonAt, withSequence(
      withSpring(1, SPRING.settle, ok => { if (ok) runOnJS(land)(); }),
      withDelay(FIRST_COIN.holdMs, withTiming(0, { duration: FIRST_COIN.exitMs, easing: EASE.in }, ok => { if (ok) runOnJS(finish)(); }))));
    coin.value = withDelay(FIRST_COIN.ribbonAt + 120, withSpring(1, SPRING.pop));
    wave1.value = withDelay(FIRST_COIN.sparkleAt, withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear }));
    wave2.value = withDelay(FIRST_COIN.sparkleAt + FIRST_COIN.sparkleWaveMs, withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear }));
    finn.value = withDelay(FIRST_COIN.ribbonAt + 160, withSequence(withSpring(1, SPRING.pop),
      withDelay(FIRST_COIN.holdMs - 300, withTiming(0, { duration: FIRST_COIN.exitMs, easing: EASE.in }))));
    const safety = setTimeout(finish, exitAt + FIRST_COIN.exitMs + 600);
    return () => { clearTimeout(safety); [sweep, drop, wave1, wave2, finn, coin].forEach(v => cancelAnimation(v)); };
    // One-shot per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const band = Math.max(160, width * 0.55);
  const sweepStyle = useAnimatedStyle(() => {
    const t = sweep.value;
    return { opacity: t <= 0 || t >= 1 ? 0 : FIRST_COIN.sweepOpacity * Math.sin(t * Math.PI), transform: [{ translateX: -band + (width + band) * t }] };
  });
  const ribbonStyle = useAnimatedStyle(() => (reduced
    ? { opacity: drop.value }
    : { opacity: Math.min(1, drop.value * 1.6), transform: [{ translateY: -(HUD_ROW_HEIGHT + 20) * (1 - drop.value) }] }));
  const coinStyle = useAnimatedStyle(() => ({ transform: [{ scale: reduced ? 1 : 0.4 + 0.6 * coin.value }] }));
  const finnStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, finn.value * 2),
    transform: [{ translateY: 30 * (1 - finn.value) }, { rotate: `${-10 + 10 * finn.value}deg` }, { scale: 0.5 + 0.5 * finn.value }],
  }));

  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite">
    {!reduced && <Animated.View style={[styles.sweep, { width: band }, sweepStyle]}>
      <LinearGradient colors={['rgba(255,214,90,0)', 'rgba(255,214,90,1)', 'rgba(255,246,200,1)', 'rgba(255,214,90,1)', 'rgba(255,214,90,0)']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>}
    <Animated.View style={[styles.ribbonWrap, { top: HUD_TOP - 4 }, ribbonStyle]}>
      <View style={styles.ribbon} accessible accessibilityLabel="First coin today!">
        <Animated.View style={[styles.coin, coinStyle]}>
          <Image source={ARRIVAL_ART.goldCoin} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
          <View style={styles.crown}><GameIcon name="crown" size={22} /></View>
          <View style={styles.burstAt}>
            <SparkleBurst progress={wave1} count={sparkles} radius={46} />
            <SparkleBurst progress={wave2} count={sparkles} radius={74} />
          </View>
        </Animated.View>
        <Text style={styles.text} allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit>First coin today!</Text>
        <GameIcon name="sparkle" size={24} />
      </View>
      {!reduced && <Animated.View style={[styles.finn, finnStyle]}>
        <Image source={ARRIVAL_ART.finn} style={{ width: 64, height: 80 }} contentFit="contain" transition={0} />
      </Animated.View>}
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  ribbonWrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  ribbon: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: HUD_ROW_HEIGHT, paddingLeft: 8, paddingRight: 14,
    borderRadius: 18, borderWidth: 3, borderColor: BRAND.white, backgroundColor: BRAND.gold, alignSelf: 'stretch',
    shadowColor: GOLD_FX.glow, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  coin: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  crown: { position: 'absolute', top: -14, alignSelf: 'center' },
  burstAt: { position: 'absolute', left: 22, top: 22, width: 0, height: 0 },
  text: { flex: 1, fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, letterSpacing: 0.5 },
  finn: { position: 'absolute', right: -6, top: HUD_ROW_HEIGHT - 18 },
});
