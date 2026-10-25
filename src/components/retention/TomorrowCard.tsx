import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useAmbientLoop from '../../power/useAmbientLoop';
import { LOOP_CUES, PRESS, type TomorrowPrize } from '../../services/retention/loopMotion';
import { BRAND, GameIcon, ICON_SOURCES } from '../../ui';
import { GOLD_FX, SPRING } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import FlameArt from './FlameArt';
import CardSurface from './CardSurface';
import { useMarkTimers, withDelayAfter, withDelayUntil } from './delayUntil';

const FINN_WAVE = require('../../assets/games/banana-basket/v2/shark_cheer.png');
const SOFT = require('../../../assets/images/reveal/soft-spot.webp');

/**
 * Come back tomorrow: a picture of what is waiting, never a timer. A night
 * window where Alex's gold moon rises over the hills with twinkling stars,
 * tomorrow's real prize sitting under it (the Daily 3 chest, or a present only
 * when gear is really next), its real reward chips, tomorrow's flame as a white
 * silhouette with its number, and Finn waving goodbye.
 */
export default function TomorrowCard({ prize, reducedMotion, onDone, startAt, entered }: {
  /** The card enters at this time (epoch ms): its beats wait for it on the UI thread (mounted while prizes fly). */
  readonly startAt?: number;
  /** Mounted early and hidden: its beats wait for this UI-thread entrance mark. */
  readonly entered?: SharedValue<number>;
  readonly prize: TomorrowPrize;
  readonly reducedMotion: boolean;
  readonly onDone: () => void;
}) {
  const enter = useSharedValue(reducedMotion ? 1 : 0);
  const wiggle = useSharedValue(0);
  const moon = useSharedValue(reducedMotion ? 1 : 0);
  const wave = useSharedValue(0);
  const twinkle = useSharedValue(0);
  const press = useSharedValue(1);
  const afterMark = useMarkTimers(entered);
  useEffect(() => {
    const wait = Math.max(0, (startAt ?? 0) - Date.now());
    let t: ReturnType<typeof setTimeout> | undefined;
    if (entered) afterMark(0, () => { queueHaptic('tickSelection'); playSfx(LOOP_CUES.tomorrow.fallback, 0.8); });
    else t = setTimeout(() => { queueHaptic('tickSelection'); playSfx(LOOP_CUES.tomorrow.fallback, 0.8); }, wait);
    if (reducedMotion) return () => { if (t) clearTimeout(t); };
    const W = <T,>(x: T): T => (entered ? (withDelayAfter(entered, 0, x as never) as T) : startAt ? (withDelayUntil(startAt, x as never) as T) : x);
    enter.value = W(withSpring(1, SPRING.settle));
    moon.value = W(withDelay(180, withTiming(1, { duration: 900, easing: EASE.out })));
    wave.value = W(withDelay(350, withRepeat(withSequence(withTiming(1, { duration: 220 }), withTiming(-1, { duration: 220 })), 4, true)));
    return () => { if (t) clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The prize wiggles 6 degrees, twice, every 3 s and the stars twinkle (ambient: rests when idle or reduced).
  useAmbientLoop(() => {
    wiggle.value = withRepeat(withSequence(
      withDelay(2200, withTiming(1, { duration: 110 })), withTiming(-1, { duration: 140 }),
      withTiming(1, { duration: 140 }), withTiming(0, { duration: 110 }),
    ), -1);
    twinkle.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
  }, () => { cancelAnimation(wiggle); cancelAnimation(twinkle); wiggle.value = 0; twinkle.value = 0; }, !reducedMotion);

  const cardStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value * 2), transform: [{ translateY: (1 - enter.value) * 70 }] }));
  const giftStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wiggle.value * 6}deg` }, { scale: 1 + Math.abs(wiggle.value) * 0.04 }] }));
  const moonStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, moon.value * 1.6),
    transform: [{ translateY: 50 * (1 - moon.value) }, { rotate: `${-14 * (1 - moon.value)}deg` }] }));
  const moonGlow = useAnimatedStyle(() => ({ opacity: 0.6 * moon.value, transform: [{ translateY: 50 * (1 - moon.value) }] }));
  const star1 = useAnimatedStyle(() => ({ opacity: moon.value * (0.5 + 0.5 * twinkle.value), transform: [{ scale: 0.7 + 0.3 * twinkle.value }] }));
  const star2 = useAnimatedStyle(() => ({ opacity: moon.value * (1 - 0.5 * twinkle.value), transform: [{ scale: 1 - 0.3 * twinkle.value }] }));
  const finnStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wave.value * 8}deg` }] }));
  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const art = prize.kind === 'gear' ? ICON_SOURCES.gift : ICON_SOURCES.chest;

  return (
    <Animated.View style={[styles.card, cardStyle]}>
      <CardSurface />
      {/* The night window: friendly blue, a gold moon rising, the prize waiting under it. */}
      <View style={styles.night} accessibilityLabel="Tomorrow">
        <Animated.View style={[styles.moonGlow, moonGlow]}>
          <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor={GOLD_FX.glow} transition={0} />
        </Animated.View>
        <Animated.View style={[styles.moon, moonStyle]}><GameIcon name="moon" size={70} /></Animated.View>
        <Animated.View style={[styles.star, { left: 18, top: 16 }, star1]}><GameIcon name="sparkle" size={18} /></Animated.View>
        <Animated.View style={[styles.star, { left: 110, top: 70 }, star2]}><GameIcon name="sparkle" size={13} /></Animated.View>
        <Animated.View style={[styles.star, { right: 28, top: 22 }, star2]}><GameIcon name="sparkle" size={15} /></Animated.View>
        <Animated.View style={[styles.star, { right: 80, top: 54 }, star1]}><GameIcon name="sparkle" size={11} /></Animated.View>
        <View style={styles.hillBack} />
        <View style={styles.hill} />
        <View style={styles.stageRow}>
          <Animated.View style={[styles.prize, giftStyle]}>
            <Image source={art} style={{ width: 112, height: 112 }} contentFit="contain" />
            {prize.kind === 'gear' && <View style={styles.gearChip}><Text style={styles.gearText}>NEW GEAR</Text></View>}
          </Animated.View>
          <View style={styles.ghost} accessibilityLabel={`Tomorrow's flame: day ${prize.flameNext}`}>
            <View style={{ opacity: 0.85 }}><FlameArt days={prize.flameNext} size={60} reducedMotion still ghost /></View>
            <View style={styles.ghostNum}><Text style={styles.ghostNumText} allowFontScaling={false}>{prize.flameNext}</Text></View>
          </View>
        </View>
      </View>
      {prize.chips.length > 0 && (
        <View style={styles.chips}>
          {prize.chips.map(c => (
            <View key={c.icon} style={styles.chip}><GameIcon name={c.icon} size={20} /><Text style={styles.chipText}>{c.n}</Text></View>
          ))}
        </View>
      )}
      <Text style={styles.line}>{prize.line}</Text>
      <View style={styles.bottom}>
        <Animated.View style={[styles.finn, finnStyle]} pointerEvents="none">
          <Image source={FINN_WAVE} style={{ width: 70, height: 70 }} contentFit="contain" />
        </Animated.View>
        <Animated.View style={[{ flex: 1 }, buttonStyle]}>
          <Pressable onPress={onDone} accessibilityRole="button" style={styles.button}
            onPressIn={() => { press.value = withTiming(PRESS.scale, { duration: PRESS.inMs }); }}
            onPressOut={() => { press.value = withSpring(1, PRESS.spring); }}>
            <Text style={styles.buttonText}>SEE YOU TOMORROW!</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 22, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center', gap: 8 },
  // Friendly night blue (a touch deeper than the sky, never a navy or purple wash) with two soft hills.
  night: { alignSelf: 'stretch', height: 196, borderRadius: 18, backgroundColor: '#2a7fd0', overflow: 'hidden', borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)' },
  moonGlow: { position: 'absolute', left: 0, top: -16, width: 150, height: 150 },
  moon: { position: 'absolute', left: 40, top: 22 },
  star: { position: 'absolute' },
  // Two round hills (circles peeking up), so the night reads as a little landscape.
  hillBack: { position: 'absolute', right: -70, bottom: -190, width: 260, height: 260, borderRadius: 130, backgroundColor: '#4ea6e8' },
  hill: { position: 'absolute', left: -50, bottom: -230, width: 320, height: 320, borderRadius: 160, backgroundColor: '#6cc0f3' },
  stageRow: { position: 'absolute', left: 0, right: 0, bottom: 4, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end',
    gap: 14, paddingRight: 18 },
  prize: { width: 118, height: 118, alignItems: 'center', justifyContent: 'center' },
  gearChip: { position: 'absolute', bottom: 0, backgroundColor: BRAND.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: BRAND.white },
  gearText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, marginTop: 1 },
  ghost: { width: 64, alignItems: 'center', marginBottom: 10 },
  ghostNum: { marginTop: -10, minWidth: 30, height: 28, borderRadius: 14, paddingHorizontal: 6, backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 2.5, borderColor: BRAND.gold, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  ghostNumText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.navy, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white, marginTop: 1 },
  line: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, textAlign: 'center', marginTop: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 6, marginTop: 4 },
  finn: { width: 70, height: 70 },
  button: { backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 4,
    borderBottomColor: BRAND.goldLip },
  buttonText: { fontFamily: 'Shark', fontSize: 19, color: '#075083' },
});
