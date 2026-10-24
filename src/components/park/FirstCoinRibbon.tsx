/**
 * "First coin today!": a warm gold sunrise band sweeps the map left to right,
 * a ribbon slides down below the HUD rows (never over Ride Control or the
 * Adventure chip), and the coin you just caught flies up from the map into the
 * ribbon's coin slot. It lands with a held frame and a gold ray fan behind it,
 * the crown drops onto it with a stamp squash, two gold-and-white sparkle
 * rings burst around it, and Finn pumps his fist beside it; the golden buzz
 * and the new record sting land with the crown. It stays, then slides up
 * (faster than it came), gone inside 2.4 s. No words needed: the sun-gold
 * sweep and the crowned coin say "this one is special". Reduce Motion: the
 * ribbon fades in and out, the haptic and the sound stay. UI thread only;
 * one-shot, nothing loops.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, ReduceMotion, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import { withDelay, withSequence, withSpring, withTiming, momentMs } from './momentTime';
import { playHaptic } from '../../gamekit/Haptics';
import { playMoment } from '../../gamekit/audio/playMoment';
import { useReduceMotionPreference } from '../../hooks/useReducedGameMotion';
import { usePowerBudget } from '../../power';
import { GoldBurst } from '../../ui/GoldBurst';
import GameIcon from '../../ui/GameIcon';
import { SLAM_SQUASH } from '../../ui/motion';
import { DURATION, EASE, GOLD_FX, SPRING, momentParticles } from '../../ui/motionEasing';
import { BRAND } from '../../ui/tokens';
import { HUD_TOP } from '../map/statusStack';
import { ARRIVAL_ART, FINN_ART } from './arrivalArt';
import BurstCanvas from './BurstCanvas';
import { FIRST_COIN } from './firstCoinToday';
import { perfMark } from './momentPerf';

export default function FirstCoinRibbon({ onDone }: { readonly onDone: () => void }) {
  const preference = useReduceMotionPreference();
  if (preference === null) return null;
  return <Ribbon onDone={onDone} reduced={preference} />;
}

const COIN = 46;

function Ribbon({ onDone, reduced }: { readonly onDone: () => void; readonly reduced: boolean }) {
  const { width, height } = useWindowDimensions();
  const budget = usePowerBudget();
  const sparkles = momentParticles(FIRST_COIN.sparkles, budget, reduced);
  const sweep = useSharedValue(0);
  const drop = useSharedValue(0);
  const fly = useSharedValue(0);
  const rings = useSharedValue(0);
  const finn = useSharedValue(0);
  const crown = useSharedValue(0);
  const punch = useSharedValue(0);
  const gold = useSharedValue(0);
  const doneRef = useRef(onDone); doneRef.current = onDone;
  const finish = () => { perfMark('firstCoin.done'); doneRef.current(); };
  const land = () => { playHaptic('golden'); playMoment('game.newRecord'); };
  const top = HUD_TOP + FIRST_COIN.topOffset;
  // Where the ribbon's coin slot is (window points inside this layer) and where the caught coin starts (the map's middle).
  const slot = { x: 12 + 10 + COIN / 2, y: top + 30 };
  const from = { x: width / 2, y: height * 0.42 };

  useEffect(() => {
    perfMark('firstCoin.start');
    const exitAt = FIRST_COIN.ribbonAt + 300 + FIRST_COIN.holdMs;
    if (reduced) {
      // A real 160 ms fade in and out (Reanimated would skip a plain timing under the system Reduce Motion).
      const fade = { duration: DURATION.quick, reduceMotion: ReduceMotion.Never };
      fly.value = 1; crown.value = 1;
      drop.value = withSequence(ReduceMotion.Never, withTiming(1, fade, ok => { if (ok) runOnJS(land)(); }),
        withDelay(FIRST_COIN.holdMs, withTiming(0, fade, ok => { if (ok) runOnJS(finish)(); }), ReduceMotion.Never));
      return () => cancelAnimation(drop);
    }
    sweep.value = withTiming(1, { duration: FIRST_COIN.sweepMs, easing: EASE.inOut });
    drop.value = withDelay(FIRST_COIN.ribbonAt, withSequence(
      withSpring(1, SPRING.settle),
      withDelay(FIRST_COIN.holdMs, withTiming(0, { duration: FIRST_COIN.exitMs, easing: EASE.in }, ok => { if (ok) runOnJS(finish)(); }))));
    // The caught coin flies up into the ribbon (EASE.inOut between two points) and lands with a held frame.
    fly.value = withDelay(FIRST_COIN.coinFlyAt, withTiming(1, { duration: FIRST_COIN.coinFlyMs, easing: EASE.inOut }));
    gold.value = withDelay(FIRST_COIN.coinFlyAt + FIRST_COIN.coinFlyMs, withSequence(
      withTiming(1, { duration: 160, easing: EASE.out }), withDelay(700, withTiming(0, { duration: 400, easing: EASE.in }))));
    // The crown drops onto the coin like a stamp: the buzz and the sting on its impact frame.
    crown.value = withDelay(FIRST_COIN.crownAt, withTiming(1, { duration: DURATION.slam, easing: EASE.in }, ok => {
      if (ok) runOnJS(land)();
    }));
    punch.value = withDelay(FIRST_COIN.crownAt + DURATION.slam, withSequence(
      withTiming(1, { duration: DURATION.hitStop }), withSpring(0, SPRING.pop)));
    rings.value = withDelay(FIRST_COIN.sparkleAt, withTiming(1, { duration: DURATION.sparkle + FIRST_COIN.sparkleWaveMs, easing: Easing.linear }));
    finn.value = withDelay(FIRST_COIN.ribbonAt + 160, withSequence(withSpring(1, SPRING.pop),
      withDelay(FIRST_COIN.holdMs - 300, withTiming(0, { duration: FIRST_COIN.exitMs, easing: EASE.in }))));
    const safety = setTimeout(finish, momentMs(exitAt + FIRST_COIN.exitMs + 600));
    return () => { clearTimeout(safety); [sweep, drop, fly, rings, finn, crown, punch, gold].forEach(v => cancelAnimation(v)); };
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
    : { opacity: Math.min(1, drop.value * 1.6), transform: [{ translateY: -40 * (1 - drop.value) }] }));
  // The flying coin: big off the map, an arc up into the slot, small and settled at the end.
  const flyStyle = useAnimatedStyle(() => {
    const t = fly.value;
    if (reduced || t >= 1 || t <= 0) return { opacity: 0 };
    const u = 1 - t;
    const cx = from.x - 40, cy = slot.y - 60;
    const x = u * u * from.x + 2 * u * t * cx + t * t * slot.x;
    const y = u * u * from.y + 2 * u * t * cy + t * t * slot.y;
    return { opacity: 1, transform: [{ translateX: x - COIN / 2 }, { translateY: y - COIN / 2 }, { scale: 1.8 - 0.8 * t }, { rotate: `${-200 * u}deg` }] };
  });
  const coinStyle = useAnimatedStyle(() => ({
    opacity: reduced || fly.value >= 1 ? 1 : 0,
    transform: [{ scaleX: 1 + SLAM_SQUASH * 1.5 * punch.value }, { scaleY: 1 - SLAM_SQUASH * 1.5 * punch.value }],
  }));
  const crownStyle = useAnimatedStyle(() => {
    const c = crown.value;
    return {
      opacity: Math.min(1, c * 3),
      transform: [{ translateY: -34 * (1 - c) }, { scale: (1.7 - 0.7 * c) }, { scaleX: 1 + SLAM_SQUASH * punch.value }, { scaleY: 1 - SLAM_SQUASH * punch.value }],
    };
  });
  const finnStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, finn.value * 2),
    transform: [{ translateY: 30 * (1 - finn.value) - 8 * Math.max(0, Math.sin(Math.min(1, finn.value) * Math.PI)) },
      { rotate: `${-10 + 10 * finn.value}deg` }, { scale: 0.5 + 0.5 * finn.value }],
  }));

  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite">
    {!reduced && <Animated.View style={[styles.sweep, { width: band }, sweepStyle]}>
      <LinearGradient colors={['rgba(255,214,90,0)', 'rgba(255,214,90,1)', 'rgba(255,246,200,1)', 'rgba(255,214,90,1)', 'rgba(255,214,90,0)']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>}
    <Animated.View style={[styles.ribbonWrap, { top }, ribbonStyle]}>
      {/* One gold ray fan behind the coin only. */}
      {!reduced && <GoldBurst size={170} amount={gold} spin={false} style={styles.rays} />}
      <View style={styles.ribbon} accessible accessibilityLabel="First coin today!">
        <View style={styles.coinSlot}>
          <Animated.View style={[styles.coin, coinStyle]}>
            <Image source={ARRIVAL_ART.goldCoin} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
          </Animated.View>
          <Animated.View style={[styles.crown, crownStyle]}><GameIcon name="crown" size={28} /></Animated.View>
        </View>
        <Text style={styles.text} allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit>First coin today!</Text>
        <GameIcon name="sparkle" size={24} />
      </View>
      {!reduced && <Animated.View style={[styles.finn, finnStyle]}>
        <Image source={FINN_ART[1]} style={{ width: 78, height: 98 }} contentFit="contain" transition={0} />
      </Animated.View>}
    </Animated.View>
    {/* Two clear sparkle rings around the crowned coin (one canvas, two waves). */}
    {!reduced && <BurstCanvas progress={rings} count={sparkles} radius={58} ring={30} starSize={11} x={slot.x} y={slot.y} />}
    {!reduced && <BurstCanvas progress={rings} count={sparkles} radius={92} ring={0} starSize={9} x={slot.x} y={slot.y} delayed={0.16} />}
    {/* The coin you just caught, flying up from the map. */}
    {!reduced && <Animated.View style={[styles.flyer, flyStyle]}>
      <Image source={ARRIVAL_ART.goldCoin} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  ribbonWrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  rays: { position: 'absolute', left: 10 + COIN / 2 - 85, top: 30 - 85 },
  ribbon: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingLeft: 10, paddingRight: 14,
    borderRadius: 18, borderWidth: 3, borderColor: BRAND.white, backgroundColor: BRAND.gold, alignSelf: 'stretch',
    borderBottomWidth: 6, borderBottomColor: '#d99a00' },
  coinSlot: { width: COIN, height: COIN, borderRadius: COIN / 2, backgroundColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center', justifyContent: 'center' },
  coin: { width: COIN, height: COIN },
  crown: { position: 'absolute', top: -20, alignSelf: 'center' },
  text: { flex: 1, fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, letterSpacing: 0.5 },
  finn: { position: 'absolute', right: -6, top: 44 },
  flyer: { position: 'absolute', left: 0, top: 0, width: COIN, height: COIN },
});
