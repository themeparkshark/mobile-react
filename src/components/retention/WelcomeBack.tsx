import { Image } from 'expo-image';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import useAmbientLoop from '../../power/useAmbientLoop';
import { playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { usePowerBudget } from '../../power';
import { LOOP_CUES, WELCOME_FX, welcomeTileLabel, type WelcomeCard } from '../../services/retention/loopMotion';
import { BRAND, GameIcon, ICON_SOURCES } from '../../ui';
import { GoldBurst, SparkleBurst } from '../../ui/GoldBurst';
import { AMBIENT, DURATION, SPRING, momentParticles } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import CardSurface from './CardSurface';
import FlameArt from './FlameArt';
import GoldCheckCoin from './GoldCheckCoin';

const FINN = require('../../assets/games/banana-basket/v2/shark_cheer.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');
const DAILY_CHEST = require('../../../assets/images/daily/chest-closed.png');

/**
 * A warm welcome after three or more days away (once). Finn is there on the
 * first frame, bursting up out of a splash ring with gold behind him, then up
 * to three picture tiles drop in 90 ms apart, each a big picture with one
 * number or short word under it (today's Daily 3, the flame and its day, a
 * chest waiting), all from real data. The flame tile is the little welcome
 * gift: it flares and its number pops. Tap anywhere and it is gone in 200 ms.
 * Never a guilt trip: no missed-day counts, no loss words, no timers.
 */
export default function WelcomeBack({ cards: cardsIn, reducedMotion, onDone }: {
  /** Null while today's goals are still being read: Finn says hello at once and three soft tiles wait, bobbing. */
  readonly cards: readonly WelcomeCard[] | null;
  readonly reducedMotion: boolean;
  readonly onDone: () => void;
}) {
  const budget = usePowerBudget();
  const splash = useSharedValue(reducedMotion ? 1 : 0);
  // Frame 1 already shows Finn rising out of the splash (never an empty card).
  const finn = useSharedValue(reducedMotion ? 1 : 0.45);
  const gold = useSharedValue(reducedMotion ? 0.4 : 0.25);
  const out = useSharedValue(0);
  const gift = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const drops = [useSharedValue(reducedMotion ? 1 : 0), useSharedValue(reducedMotion ? 1 : 0), useSharedValue(reducedMotion ? 1 : 0)];
  const sparks = useMemo(() => momentParticles(8, budget, reducedMotion), [budget, reducedMotion]);
  const cards = cardsIn ?? [];
  const shown = cards.slice(0, 3);
  // One tile fills the stage at hero size (never one small tile on an empty card); two or three share the row.
  const hero = shown.length === 1;
  const giftIndex = shown.findIndex(c => c.kind === 'flame' || c.kind === 'saved');
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    playHaptic('win');
    playSfx(WELCOME_FX.cue, 0.8);
    if (reducedMotion) return;
    splash.value = withTiming(1, { duration: 700, easing: EASE.out });
    finn.value = withSpring(1, SPRING.pop);
    gold.value = withSequence(withTiming(0.7, { duration: 260, easing: EASE.out }), withTiming(0.45, { duration: 700 }));
    sparkle.value = withDelay(120, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The tiles drop in once today's goals are known (on their beat when they were known at once).
  const ready = cardsIn !== null;
  useEffect(() => {
    if (!ready || reducedMotion) return;
    const base = Math.max(0, WELCOME_FX.cardsAt - (Date.now() - mountedAt.current));
    drops.forEach((d, i) => { d.value = withDelay(base + i * WELCOME_FX.cardStep, withSpring(1, SPRING.land)); });
    const timers = shown.map((_, i) => setTimeout(() => queueHaptic('tickSelection'), base + i * WELCOME_FX.cardStep + 120));
    if (giftIndex >= 0) {
      const at = base + giftIndex * WELCOME_FX.cardStep + WELCOME_FX.giftAt;
      gift.value = withDelay(at, withSequence(withTiming(1, { duration: 140, easing: EASE.out }), withSpring(0, SPRING.pop)));
      timers.push(setTimeout(() => { queueHaptic('hitMedium'); playSfx(LOOP_CUES.flameUp.fallback, 0.7); }, at));
    }
    return () => timers.forEach(clearTimeout);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const dismiss = () => {
    if (reducedMotion) { onDone(); return; }
    out.value = withTiming(1, { duration: DURATION.exit, easing: EASE.in });
    setTimeout(onDone, DURATION.exit);
  };
  // After the hello, Finn keeps breathing and bobbing on the water (ambient budget: rests when idle, in the
  // background, in Battery Saver idle and with Reduce Motion), so the card never sits still.
  const bob = useSharedValue(0);
  useAmbientLoop(() => {
    bob.value = withDelay(900, withRepeat(withTiming(1, { duration: AMBIENT.breathMs / 2, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, () => { cancelAnimation(bob); bob.value = withTiming(0, { duration: DURATION.quick }); }, !reducedMotion);
  const splashStyle = useAnimatedStyle(() => ({ opacity: splash.value >= 1 ? 0 : 0.85 * (1 - splash.value),
    transform: [{ scale: 0.5 + 1.2 * splash.value }] }));
  const finnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 46 * (1 - finn.value) - 5 * bob.value }, { scale: (0.7 + 0.3 * finn.value) * (1 + 0.025 * bob.value) },
      { rotate: `${-10 * (1 - finn.value) + 3 * (bob.value - 0.5)}deg` }],
  }));
  const outStyle = useAnimatedStyle(() => ({ opacity: 1 - out.value, transform: [{ scale: 1 - 0.06 * out.value }] }));
  return (
    <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel={`Welcome back. ${shown.map(c => c.text).join(' ')} Tap to play.`}
      style={{ width: '94%' }}>
      <Animated.View style={[styles.card, outStyle]}>
        <CardSurface />
        <View style={styles.stage}>
          <GoldBurst size={340} amount={gold} reduced={reducedMotion} style={styles.abs} />
          <Animated.View pointerEvents="none" style={[styles.splash, splashStyle]} />
          <Animated.View style={finnStyle}><Image cachePolicy="memory-disk" source={FINN} style={{ width: 176, height: 176 }} contentFit="contain" transition={0} /></Animated.View>
          <View style={styles.center} pointerEvents="none"><SparkleBurst progress={sparkle} count={sparks} radius={110} /></View>
        </View>
        <View style={styles.tiles}>
          {ready ? shown.map((c, i) => (
            <Drop key={c.kind} v={drops[i]} hero={hero}>
              <Tile card={c} gift={i === giftIndex ? gift : null} reducedMotion={reducedMotion} hero={hero} />
            </Drop>
          )) : <WaitingTile index={0} reducedMotion={reducedMotion} />}
        </View>
        <Text style={styles.tap}>Tap to play!</Text>
      </Animated.View>
    </Pressable>
  );
}

/** A soft tile waiting for today's goals: it bobs on the ambient budget (never a frozen empty card). */
function WaitingTile({ index, reducedMotion }: { readonly index: number; readonly reducedMotion: boolean }) {
  const b = useSharedValue(0);
  useAmbientLoop(() => {
    b.value = withDelay(index * 140, withRepeat(withTiming(1, { duration: 520, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, () => { cancelAnimation(b); b.value = 0; }, !reducedMotion);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + 0.25 * b.value, transform: [{ translateY: -6 * b.value }] }));
  return <Animated.View style={[styles.tile, styles.waiting, style]} />;
}

function Drop({ v, children, hero = false }: { readonly v: SharedValue<number>; readonly children: React.ReactNode; readonly hero?: boolean }) {
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 2), transform: [{ translateY: -44 * (1 - v.value) }, { scale: 0.85 + 0.15 * v.value }] }));
  return <Animated.View style={[{ flex: 1, maxWidth: hero ? 250 : 150 }, style]}>{children}</Animated.View>;
}

/** One picture tile: a big picture, then one number or short word. The sentence is for screen readers. */
function Tile({ card, gift, reducedMotion, hero = false }: {
  readonly card: WelcomeCard; readonly gift: SharedValue<number> | null; readonly reducedMotion: boolean; readonly hero?: boolean;
}) {
  const giftStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.28 * (gift ? gift.value : 0) }] }));
  const label = welcomeTileLabel(card);
  return (
    <View style={[styles.tile, hero && styles.tileHero]} accessible accessibilityLabel={card.text}>
      <Animated.View style={[styles.pic, hero && styles.picHero, giftStyle]}>
        <TilePicture card={card} reducedMotion={reducedMotion} scale={hero ? 1.5 : 1} />
      </Animated.View>
      <View style={[styles.chip, (card.kind === 'flame' || card.kind === 'saved') && styles.chipGold]}>
        {/* The flame's number always sits beside a little flame, so it reads as days of flame (never freezes). */}
        {(card.kind === 'flame' || card.kind === 'saved') && <GameIcon name="streak" size={hero ? 26 : 18} />}
        <Text style={[styles.chipText, hero && styles.chipTextHero, (card.kind === 'flame' || card.kind === 'saved') && styles.chipTextGold]} numberOfLines={1}
          adjustsFontSizeToFit allowFontScaling={false}>{label}</Text>
      </View>
    </View>
  );
}

function TilePicture({ card, reducedMotion, scale = 1 }: { readonly card: WelcomeCard; readonly reducedMotion: boolean; readonly scale?: number }) {
  switch (card.kind) {
    case 'goals': return <View style={{ transform: [{ scale }] }}><GoalsRing done={card.done} /></View>;
    case 'flame': return <FlameArt days={card.n} size={74 * scale} reducedMotion={reducedMotion} />;
    case 'ember': return <FlameArt days={0} size={74 * scale} reducedMotion={reducedMotion} />;
    case 'saved': return (
      // The flame, kept safe: one small ice shield per freeze that kept it, side by side under it (pictures, no number).
      <View style={{ width: 78 * scale, height: 78 * scale, alignItems: 'center' }}>
        <FlameArt days={card.n} size={60 * scale} reducedMotion={reducedMotion} />
        <View style={styles.shields}>
          {Array.from({ length: Math.max(1, card.freezes) }, (_, k) => (
            <Image cachePolicy="memory-disk" key={k} source={FREEZE} style={{ width: 24 * scale, height: 24 * scale }} contentFit="contain" />
          ))}
        </View>
      </View>
    );
    case 'chest': return <Image cachePolicy="memory-disk" source={DAILY_CHEST} style={{ width: 68 * scale, height: 68 * scale }} contentFit="contain" />;
    case 'levelChest': return <Image cachePolicy="memory-disk" source={ICON_SOURCES.chest} style={{ width: 68 * scale, height: 68 * scale }} contentFit="contain" />;
  }
}

/** Today's Daily 3: three gold checks for what is done, dashed circles for what waits. */
function GoalsRing({ done }: { readonly done: number }) {
  return (
    <View style={styles.ring}>
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.dot, i === 1 && styles.dotMid]}>
          {i < done ? <GoldCheckCoin size={24} /> : <View style={styles.dotEmpty} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white, marginTop: -14,
    paddingTop: 16, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center', gap: 8, overflow: 'hidden' },
  stage: { height: 196, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  splash: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 6, borderColor: BRAND.white },
  tiles: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  tile: { alignItems: 'center', gap: 6, backgroundColor: BRAND.white, borderRadius: 18, paddingTop: 10, paddingBottom: 10,
    borderBottomWidth: 4, borderBottomColor: '#a9cdea' },
  pic: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center' },
  picHero: { width: 120, height: 120 },
  tileHero: { paddingTop: 14, paddingBottom: 14, borderRadius: 22, borderWidth: 3, borderColor: BRAND.gold, borderBottomWidth: 5 },
  chipTextHero: { fontSize: 28 },
  chip: { minWidth: 56, maxWidth: '90%', backgroundColor: BRAND.navy, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 3 },
  chipGold: { backgroundColor: BRAND.gold },
  chipText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.white, marginTop: 2 },
  chipTextGold: { color: BRAND.navy },
  shields: { flexDirection: 'row', gap: 2, marginTop: -6 },
  // One soft dashed plate the size of a hero tile while today's goals load (most returns show one tile, so the card
  // keeps its size when it drops in; never three empty boxes that become one).
  waiting: { flex: 1, maxWidth: 250, height: 200, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 2.5, borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.7)', borderBottomWidth: 2.5, borderBottomColor: 'rgba(255,255,255,0.7)' },
  ring: { width: 76, height: 76, borderRadius: 38, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 0 },
  dot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  dotMid: { marginTop: -14 },
  dotEmpty: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: BRAND.navy, borderStyle: 'dashed' },
  tap: { fontFamily: 'Shark', fontSize: 18, color: BRAND.gold, marginTop: 4 },
});
