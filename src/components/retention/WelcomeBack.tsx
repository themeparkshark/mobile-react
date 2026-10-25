import { Image } from 'expo-image';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import useAmbientLoop from '../../power/useAmbientLoop';
import { playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { usePowerBudget } from '../../power';
import { LOOP_CUES, PRESS, WELCOME_FX, welcomeTileLabel, type WelcomeCard } from '../../services/retention/loopMotion';
import { BRAND, GameIcon, ICON_SOURCES } from '../../ui';
import { GoldBurst, SparkleBurst } from '../../ui/GoldBurst';
import { AMBIENT, DURATION, PARTICLES, SPRING, momentParticles } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import CardSurface, { CARD_FRAME } from './CardSurface';
import FlameArt, { TomorrowGoal } from './FlameArt';
import GoldCheckCoin from './GoldCheckCoin';
import { useArtGate } from './artGate';

const FINN = require('../../assets/games/banana-basket/v2/shark_cheer.png');
const FREEZE = require('../../../assets/images/retention/freeze.png');
const DAILY_CHEST = require('../../../assets/images/daily/chest-closed.png');
const SOFT = require('../../../assets/images/reveal/soft-spot.webp');

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/**
 * A warm welcome after three or more days away (once), built to be a store-listing frame:
 * Finn is there on the first frame, bursting up out of a splash ring on a pool of warm light with
 * gold rays turning behind him; then up to three picture tiles drop in 90 ms apart (today's Daily 3,
 * the flame and its day, a chest waiting), all from real data. The flame tile is the welcome gift:
 * its number counts up on the UI thread and lands with a gold ring, a spark wave and a pop; the
 * waiting chest wiggles. When the flame is the only tile, tomorrow's prize sits under it as a
 * picture. One big gold LET'S PLAY! button (or a tap anywhere) is gone in 200 ms.
 * Never a guilt trip: no missed-day counts, no loss words, no timers.
 */
export default function WelcomeBack({ cards: cardsIn, reducedMotion, onDone }: {
  /** Null while today's goals are still being read: Finn says hello at once and one soft plate waits, bobbing. */
  readonly cards: readonly WelcomeCard[] | null;
  readonly reducedMotion: boolean;
  readonly onDone: () => void;
}) {
  const budget = usePowerBudget();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const splash = useSharedValue(reducedMotion ? 1 : 0);
  // Frame 1 already shows Finn rising out of the splash on lit gold (never an empty card).
  const finn = useSharedValue(reducedMotion ? 1 : 0.45);
  const gold = useSharedValue(reducedMotion ? 0.7 : 0.5);
  const out = useSharedValue(0);
  const gift = useSharedValue(0);
  /** The flame tile's number: counts from 0 up to the flame's day (UI thread, no render per step). */
  const count = useSharedValue(0);
  /** The count's landing: a gold ring and a spark wave out of the flame tile. */
  const land = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const press = useSharedValue(1);
  const drops = [useSharedValue(reducedMotion ? 1 : 0), useSharedValue(reducedMotion ? 1 : 0), useSharedValue(reducedMotion ? 1 : 0)];
  const tomorrowIn = useSharedValue(reducedMotion ? 1 : 0);
  const sparks = useMemo(() => momentParticles(PARTICLES.sparkles, budget, reducedMotion), [budget, reducedMotion]);
  const landSparks = useMemo(() => momentParticles(8, budget, reducedMotion), [budget, reducedMotion]);
  const cards = cardsIn ?? [];
  const shown = cards.slice(0, 3);
  // One tile fills the stage at hero size (never one small tile on an empty card); two or three share the row.
  const hero = shown.length === 1;
  const giftIndex = shown.findIndex(c => c.kind === 'flame' || c.kind === 'saved');
  const giftCard = giftIndex >= 0 ? shown[giftIndex] : null;
  const flameDays = giftCard && (giftCard.kind === 'flame' || giftCard.kind === 'saved') ? giftCard.n : 0;
  const mountedAt = useRef(Date.now());
  // The card shows once Finn is on screen (never an empty blue card for a frame).
  const gate = useArtGate(1);
  useEffect(() => {
    playHaptic('win');
    playSfx(WELCOME_FX.cue, 0.8);
    if (reducedMotion) { count.value = flameDays; return; }
    splash.value = withTiming(1, { duration: 700, easing: EASE.out });
    finn.value = withSpring(1, SPRING.pop);
    gold.value = withSequence(withTiming(1, { duration: 260, easing: EASE.out }), withTiming(0.78, { duration: 900 }));
    sparkle.value = withDelay(120, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The tiles drop in once today's goals are known (on their beat when they were known at once).
  const ready = cardsIn !== null;
  useEffect(() => {
    if (!ready) return;
    if (reducedMotion) { count.value = flameDays; return; }
    const base = Math.max(0, WELCOME_FX.cardsAt - (Date.now() - mountedAt.current));
    drops.forEach((d, i) => { d.value = withDelay(base + i * WELCOME_FX.cardStep, withSpring(1, SPRING.land)); });
    const timers = shown.map((_, i) => setTimeout(() => queueHaptic('tickSelection'), base + i * WELCOME_FX.cardStep + 120));
    if (giftIndex >= 0) {
      const dropAt = base + giftIndex * WELCOME_FX.cardStep;
      const at = dropAt + WELCOME_FX.giftAt;
      // The number counts up from 0 to the flame's day, then lands: the tile pops, a gold ring and sparks fly out.
      count.value = withDelay(dropAt + WELCOME_FX.countAt, withTiming(flameDays, { duration: WELCOME_FX.giftAt - WELCOME_FX.countAt, easing: Easing.out(Easing.cubic) }));
      gift.value = withDelay(at, withSequence(withTiming(1, { duration: 120, easing: EASE.out }), withSpring(0, SPRING.pop)));
      land.value = withDelay(at, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
      gold.value = withDelay(at, withSequence(withTiming(1, { duration: 90, easing: EASE.out }), withTiming(0.78, { duration: 700 })));
      timers.push(setTimeout(() => { queueHaptic('hitMedium'); playSfx(LOOP_CUES.flameUp.fallback, 0.7); }, at));
      if (hero) tomorrowIn.value = withDelay(at + 220, withSpring(1, SPRING.stamp));
    } else if (hero) tomorrowIn.value = withDelay(base + 400, withSpring(1, SPRING.stamp));
    return () => timers.forEach(clearTimeout);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const dismiss = () => {
    if (reducedMotion) { onDone(); return; }
    out.value = withTiming(1, { duration: DURATION.exit, easing: EASE.in });
    setTimeout(onDone, DURATION.exit);
  };
  // After the hello, Finn keeps breathing and bobbing on the water and the waiting chest wiggles (ambient budget:
  // rests when idle, in the background, in Battery Saver idle and with Reduce Motion), so the card never sits still.
  const bob = useSharedValue(0);
  const wiggle = useSharedValue(0);
  useAmbientLoop(() => {
    bob.value = withDelay(900, withRepeat(withTiming(1, { duration: AMBIENT.breathMs / 2, easing: Easing.inOut(Easing.sin) }), -1, true));
    wiggle.value = withDelay(1400, withRepeat(withSequence(
      withTiming(1, { duration: 110 }), withTiming(-1, { duration: 140 }), withTiming(1, { duration: 140 }), withTiming(0, { duration: 110 }),
      withDelay(2400, withTiming(0, { duration: 1 })),
    ), -1));
  }, () => { cancelAnimation(bob); cancelAnimation(wiggle); bob.value = withTiming(0, { duration: DURATION.quick }); wiggle.value = 0; }, !reducedMotion);
  const splashStyle = useAnimatedStyle(() => ({ opacity: splash.value >= 1 ? 0 : 0.85 * (1 - splash.value),
    transform: [{ scale: 0.5 + 1.2 * splash.value }] }));
  const finnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 46 * (1 - finn.value) - 5 * bob.value }, { scale: (0.7 + 0.3 * finn.value) * (1 + 0.025 * bob.value) },
      { rotate: `${-10 * (1 - finn.value) + 3 * (bob.value - 0.5)}deg` }],
  }));
  const poolStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, 0.5 + 0.5 * gold.value), transform: [{ scale: 0.9 + 0.12 * gold.value }] }));
  const outStyle = useAnimatedStyle(() => ({ opacity: (1 - out.value) * gate.shown.value, transform: [{ scale: 1 - 0.06 * out.value }] }));
  const tomorrowStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, tomorrowIn.value * 2), transform: [{ scale: 0.7 + 0.3 * tomorrowIn.value }] }));
  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const finnSize = compact ? 132 : 168;
  return (
    <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel={`Welcome back. ${shown.map(c => c.text).join(' ')} Tap to play.`}
      style={{ width: '94%' }}>
      <Animated.View style={[styles.card, outStyle]}>
        <CardSurface />
        <View style={[styles.stage, compact && styles.stageCompact]}>
          {/* A pool of warm light and turning gold rays behind Finn: the hello is a little burst, never a still card. */}
          <Animated.View pointerEvents="none" style={[styles.pool, poolStyle]}>
            <Image cachePolicy="memory-disk" source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor="#FFE7A0" transition={0} />
          </Animated.View>
          <GoldBurst size={compact ? 300 : 380} amount={gold} reduced={reducedMotion} spin={budget.level === 'full'} style={styles.abs} />
          <Animated.View pointerEvents="none" style={[styles.splash, splashStyle]} />
          <Animated.View style={finnStyle}><Image cachePolicy="memory-disk" source={FINN} style={{ width: finnSize, height: finnSize }} contentFit="contain" transition={0} onDisplay={gate.onDisplay} /></Animated.View>
          <View style={styles.center} pointerEvents="none"><SparkleBurst progress={sparkle} count={sparks} radius={120} /></View>
        </View>
        <View style={styles.tiles}>
          {ready ? shown.map((c, i) => (
            <Drop key={c.kind} v={drops[i]} hero={hero}>
              <Tile card={c} gift={i === giftIndex ? gift : null} count={i === giftIndex ? count : null} land={i === giftIndex ? land : null}
                landSparks={i === giftIndex ? landSparks : 0} wiggle={c.kind === 'chest' || c.kind === 'levelChest' || c.kind === 'goals' ? wiggle : null}
                reducedMotion={reducedMotion} hero={hero} compact={compact} />
            </Drop>
          )) : <WaitingTile index={0} reducedMotion={reducedMotion} compact={compact} />}
        </View>
        {/* The flame alone (today's goals are done): tomorrow's prize waits under it as a picture (flame + 1 and the chest). */}
        {ready && hero && (giftCard || shown[0]?.kind === 'ember') && (
          <Animated.View style={[styles.tomorrow, tomorrowStyle]}>
            <TomorrowGoal days={flameDays} prize="chest" size={compact ? 40 : 48} reducedMotion={reducedMotion} textStyle={styles.tomorrowText} />
          </Animated.View>
        )}
        <Animated.View style={[styles.buttonWrap, buttonStyle]}>
          <Pressable onPress={dismiss} accessibilityRole="button" style={styles.button}
            onPressIn={() => { press.value = withTiming(PRESS.scale, { duration: PRESS.inMs }); }}
            onPressOut={() => { press.value = withSpring(1, PRESS.spring); }}>
            <Text style={styles.buttonText} allowFontScaling={false}>LET'S PLAY!</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** A soft plate waiting for today's goals: it bobs on the ambient budget (never a frozen empty card). */
function WaitingTile({ index, reducedMotion, compact }: { readonly index: number; readonly reducedMotion: boolean; readonly compact: boolean }) {
  const b = useSharedValue(0);
  useAmbientLoop(() => {
    b.value = withDelay(index * 140, withRepeat(withTiming(1, { duration: 520, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, () => { cancelAnimation(b); b.value = 0; }, !reducedMotion);
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + 0.25 * b.value, transform: [{ translateY: -6 * b.value }] }));
  return <Animated.View style={[styles.tile, styles.waiting, compact && { height: 160 }, style]} />;
}

function Drop({ v, children, hero = false }: { readonly v: SharedValue<number>; readonly children: React.ReactNode; readonly hero?: boolean }) {
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, v.value * 2), transform: [{ translateY: -44 * (1 - v.value) }, { scale: 0.85 + 0.15 * v.value }] }));
  return <Animated.View style={[{ flex: 1, maxWidth: hero ? 250 : 150 }, style]}>{children}</Animated.View>;
}

/** The flame tile's number counting up on the UI thread (a text prop, no React render per step). */
function CountNumber({ v, target, style }: { readonly v: SharedValue<number>; readonly target: number; readonly style: object }) {
  const props = useAnimatedProps(() => {
    const text = `${Math.round(v.value)}`;
    return { text, defaultValue: text } as never;
  });
  return (
    <AnimatedInput editable={false} caretHidden underlineColorAndroid="transparent" pointerEvents="none" allowFontScaling={false}
      defaultValue="0" animatedProps={props} style={[style, styles.countInput, { width: 18 * String(target).length + 6 }]} />
  );
}

/** One picture tile: a big picture, then one number or short word. The sentence is for screen readers. */
function Tile({ card, gift, count, land, landSparks, wiggle, reducedMotion, hero = false, compact }: {
  readonly card: WelcomeCard; readonly gift: SharedValue<number> | null; readonly count: SharedValue<number> | null;
  readonly land: SharedValue<number> | null; readonly landSparks: number; readonly wiggle: SharedValue<number> | null;
  readonly reducedMotion: boolean; readonly hero?: boolean; readonly compact: boolean;
}) {
  const giftStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.28 * (gift ? gift.value : 0) },
    { rotate: `${(wiggle ? wiggle.value : 0) * 6}deg` }] }));
  const ringStyle = useAnimatedStyle(() => {
    const t = land ? land.value : 0;
    return { opacity: t <= 0 || t >= 1 ? 0 : 0.95 * (1 - t), transform: [{ scale: 0.55 + 1.0 * t }] };
  });
  const label = welcomeTileLabel(card);
  const flame = card.kind === 'flame' || card.kind === 'saved';
  const big = hero && !compact;
  return (
    <View style={[styles.tile, hero && styles.tileHero, flame && styles.tileGift]} accessible accessibilityLabel={card.text}>
      <View style={[styles.pic, hero && (big ? styles.picHero : styles.picHeroCompact)]}>
        {land && !reducedMotion && <View style={styles.ringBox} pointerEvents="none"><Animated.View style={[styles.landRing, ringStyle]} /></View>}
        <Animated.View style={giftStyle}>
          <TilePicture card={card} reducedMotion={reducedMotion} scale={hero ? (big ? 1.5 : 1.2) : 1} />
        </Animated.View>
        {land && landSparks > 0 && <View style={styles.center} pointerEvents="none"><SparkleBurst progress={land} count={landSparks} radius={hero ? 92 : 64} /></View>}
      </View>
      <View style={[styles.chip, flame && styles.chipGold]}>
        {/* The flame's number always sits beside a little flame, so it reads as days of flame (never freezes). */}
        {flame && <GameIcon name="streak" size={hero ? 26 : 18} />}
        {flame && count && !reducedMotion
          ? <CountNumber v={count} target={card.n} style={[styles.chipText, hero && styles.chipTextHero, styles.chipTextGold]} />
          : (
            <Text style={[styles.chipText, hero && styles.chipTextHero, flame && styles.chipTextGold]} numberOfLines={1}
              adjustsFontSizeToFit allowFontScaling={false}>{label}</Text>
          )}
      </View>
    </View>
  );
}

function TilePicture({ card, reducedMotion, scale = 1 }: { readonly card: WelcomeCard; readonly reducedMotion: boolean; readonly scale?: number }) {
  switch (card.kind) {
    // Today's prize as a picture: the Daily 3 chest, with today's three goals under it (gold checks for what is done).
    case 'goals': return (
      <View style={{ width: 78 * scale, height: 78 * scale, alignItems: 'center', justifyContent: 'center' }}>
        <Image cachePolicy="memory-disk" source={ICON_SOURCES.chest} style={{ width: 66 * scale, height: 66 * scale, marginTop: -10 * scale }} contentFit="contain" transition={0} />
        <View style={[styles.goalDots, { transform: [{ scale }] }]}><GoalsRing done={card.done} /></View>
      </View>
    );
    case 'flame': return <FlameArt days={card.n} size={74 * scale} reducedMotion={reducedMotion} />;
    case 'ember': return <FlameArt days={0} size={74 * scale} reducedMotion={reducedMotion} />;
    case 'saved': return (
      // The flame, kept safe: one small ice shield per freeze that kept it, side by side under it (pictures, no number).
      <View style={{ width: 78 * scale, height: 78 * scale, alignItems: 'center' }}>
        <FlameArt days={card.n} size={60 * scale} reducedMotion={reducedMotion} />
        <View style={styles.shields}>
          {Array.from({ length: Math.max(1, card.freezes) }, (_, k) => (
            <Image cachePolicy="memory-disk" key={k} source={FREEZE} style={{ width: 24 * scale, height: 24 * scale }} contentFit="contain" transition={0} />
          ))}
        </View>
      </View>
    );
    case 'chest': return <Image cachePolicy="memory-disk" source={DAILY_CHEST} style={{ width: 72 * scale, height: 72 * scale }} contentFit="contain" transition={0} />;
    case 'levelChest': return <Image cachePolicy="memory-disk" source={ICON_SOURCES.chest} style={{ width: 72 * scale, height: 72 * scale }} contentFit="contain" transition={0} />;
  }
}

/** Today's Daily 3: three gold checks for what is done, open circles for what waits, on a little navy strip. */
function GoalsRing({ done }: { readonly done: number }) {
  return (
    <View style={styles.ring}>
      {[0, 1, 2].map(i => (
        <View key={i} style={styles.dot}>
          {i < done ? <GoldCheckCoin size={20} /> : <View style={styles.dotEmpty} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...CARD_FRAME, marginTop: -14,
    paddingTop: 16, paddingBottom: 14, paddingHorizontal: 12, alignItems: 'center', gap: 8, overflow: 'hidden' },
  stage: { height: 196, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  stageCompact: { height: 150 },
  pool: { position: 'absolute', width: 300, height: 230, top: -10 },
  abs: { position: 'absolute' },
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  splash: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 6, borderColor: BRAND.white },
  tiles: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  tile: { alignItems: 'center', gap: 6, backgroundColor: BRAND.white, borderRadius: 18, paddingTop: 10, paddingBottom: 10,
    borderWidth: 3, borderColor: BRAND.navy, borderBottomWidth: 6 },
  tileGift: { borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip },
  pic: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center' },
  picHero: { width: 120, height: 120 },
  picHeroCompact: { width: 96, height: 96 },
  tileHero: { paddingTop: 14, paddingBottom: 14, borderRadius: 22 },
  ringBox: { position: 'absolute', left: -40, right: -40, top: -40, bottom: -40, alignItems: 'center', justifyContent: 'center' },
  landRing: { width: 110, height: 110, borderRadius: 55, borderWidth: 6, borderColor: '#FFD23F' },
  chipTextHero: { fontSize: 28 },
  chip: { minWidth: 56, maxWidth: '90%', backgroundColor: BRAND.navy, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 3 },
  chipGold: { backgroundColor: BRAND.gold },
  chipText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.white, marginTop: 2 },
  chipTextGold: { color: BRAND.navy },
  countInput: { padding: 0, margin: 0, textAlign: 'center' },
  shields: { flexDirection: 'row', gap: 2, marginTop: -6 },
  // One soft filled plate the size of a hero tile while today's goals load (most returns show one tile, so the card
  // keeps its size when it drops in; never three empty boxes that become one).
  waiting: { flex: 1, maxWidth: 250, height: 200, backgroundColor: 'rgba(190,228,255,0.30)', borderColor: 'rgba(5,52,110,0.22)',
    borderBottomColor: 'rgba(255,255,255,0.55)', borderBottomWidth: 3 },
  goalDots: { position: 'absolute', bottom: -2 },
  ring: { flexDirection: 'row', gap: 2, backgroundColor: BRAND.navy, borderRadius: 14, paddingHorizontal: 5, paddingVertical: 3 },
  dot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  dotEmpty: { width: 16, height: 16, borderRadius: 8, borderWidth: 2.5, borderColor: BRAND.white },
  tomorrow: { backgroundColor: BRAND.navy, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  tomorrowText: { fontFamily: 'Shark', color: BRAND.gold },
  buttonWrap: { alignSelf: 'stretch', marginTop: 4 },
  button: { backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 5,
    borderBottomColor: BRAND.goldLip },
  buttonText: { fontFamily: 'Shark', fontSize: 26, color: '#075083', marginTop: 2 },
});
