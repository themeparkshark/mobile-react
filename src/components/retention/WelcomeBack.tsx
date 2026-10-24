import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { playHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { WELCOME_FX, type WelcomeCard } from '../../services/retention/loopMotion';
import { BRAND, GameIcon, ICON_SOURCES } from '../../ui';
import { SPRING } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import FlameArt from './FlameArt';

const FINN = require('../../assets/games/banana-basket/v2/shark_cheer.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');
const DAILY_CHEST = require('../../../assets/images/daily/chest-closed.png');

/**
 * A warm welcome after three or more days away (once): a soft splash ring,
 * Finn swims in, and up to three "new since you left" cards drop in 90 ms
 * apart, all from real data (today's Daily 3, the flame told kindly, the daily
 * chest waiting). Tap anywhere and it is gone in 200 ms. Never a guilt trip:
 * no counts of missed days, no loss words, no timers.
 */
export default function WelcomeBack({ cards, reducedMotion, onDone }: {
  readonly cards: readonly WelcomeCard[];
  readonly reducedMotion: boolean;
  readonly onDone: () => void;
}) {
  const splash = useSharedValue(reducedMotion ? 1 : 0);
  const finn = useSharedValue(reducedMotion ? 1 : 0);
  const out = useSharedValue(0);
  const drops = [useSharedValue(reducedMotion ? 1 : 0), useSharedValue(reducedMotion ? 1 : 0), useSharedValue(reducedMotion ? 1 : 0)];
  useEffect(() => {
    playHaptic('win');
    playSfx(WELCOME_FX.cue, 0.8);
    if (reducedMotion) return;
    splash.value = withTiming(1, { duration: 700, easing: EASE.out });
    finn.value = withDelay(WELCOME_FX.finnAt, withSpring(1, SPRING.land));
    drops.forEach((d, i) => { d.value = withDelay(WELCOME_FX.cardsAt + i * WELCOME_FX.cardStep, withSpring(1, SPRING.land)); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const dismiss = () => {
    if (reducedMotion) { onDone(); return; }
    out.value = withTiming(1, { duration: 200, easing: EASE.in });
    setTimeout(onDone, 200);
  };
  const splashStyle = useAnimatedStyle(() => ({ opacity: splash.value <= 0 || splash.value >= 1 ? 0 : 0.8 * (1 - splash.value),
    transform: [{ scale: 0.3 + 1.4 * splash.value }] }));
  const finnStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, finn.value * 2),
    transform: [{ translateX: -140 * (1 - finn.value) }, { rotate: `${-12 * (1 - finn.value)}deg` }] }));
  const outStyle = useAnimatedStyle(() => ({ opacity: 1 - out.value, transform: [{ scale: 1 - 0.06 * out.value }] }));
  return (
    <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Welcome back. Tap to play." style={{ width: '94%' }}>
      <Animated.View style={[styles.card, outStyle]}>
        <View style={styles.stage}>
          <Animated.View pointerEvents="none" style={[styles.splash, splashStyle]} />
          <Animated.View style={finnStyle}><Image source={FINN} style={{ width: 132, height: 132 }} contentFit="contain" /></Animated.View>
        </View>
        <View style={styles.cards}>
          {cards.slice(0, 3).map((c, i) => <Drop key={c.kind} v={drops[i]}><CardFace card={c} /></Drop>)}
        </View>
        <Text style={styles.tap}>Tap to play!</Text>
      </Animated.View>
    </Pressable>
  );
}

function Drop({ v, children }: { readonly v: SharedValue<number>; readonly children: React.ReactNode }) {
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 2), transform: [{ translateY: -40 * (1 - v.value) }, { scale: 0.9 + 0.1 * v.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function CardFace({ card }: { readonly card: WelcomeCard }) {
  const icon = card.kind === 'goals' ? <GameIcon name="star" size={34} />
    : card.kind === 'chest' ? <Image source={DAILY_CHEST} style={{ width: 40, height: 40 }} contentFit="contain" />
      : card.kind === 'saved' ? <Image source={FREEZE} style={{ width: 40, height: 40 }} contentFit="contain" />
        : card.kind === 'levelChest' ? <Image source={ICON_SOURCES.chest} style={{ width: 40, height: 40 }} contentFit="contain" />
          : <FlameArt days={card.kind === 'flame' ? card.n : 0} size={42} reducedMotion still />;
  return (
    <View style={styles.row}>
      <View style={styles.icon}>{icon}</View>
      <Text style={styles.rowText} numberOfLines={2}>{card.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white, marginTop: -14,
    paddingTop: 16, paddingBottom: 14, paddingHorizontal: 14, alignItems: 'center', gap: 8 },
  stage: { height: 140, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  splash: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 6, borderColor: BRAND.white },
  cards: { alignSelf: 'stretch', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BRAND.white, borderRadius: 16, padding: 8,
    borderBottomWidth: 4, borderBottomColor: '#a9cdea' },
  icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  tap: { fontFamily: 'Shark', fontSize: 18, color: BRAND.gold, marginTop: 4 },
});
