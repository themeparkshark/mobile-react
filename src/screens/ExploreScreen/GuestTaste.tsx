/**
 * Play before sign-in. A guest gets a real taste in about 30 seconds:
 *   1. find:  Finn drops a churro next to them. Tap it.
 *   2. play:  Finn's four-pair warm-up (the same game the park guide uses).
 *   3. coin:  a coin arcs onto a shelf with a clink, showing where wins go.
 *   4. save:  "Save your shark" with Sign in with Apple, or play more games.
 * Progress is saved on the phone (services/guestTaste), so a guest who leaves
 * comes back to the save card, and a guest who signs in skips the warm-up
 * they already played. Nothing here calls the server.
 *
 * Motion is cheap: transforms and opacity on the UI thread, a few loops that
 * stop when their step ends, and reduced motion holds everything still.
 */
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withTiming,
} from 'react-native-reanimated';
import HomeArcade from '../../components/HomeArcade';
import Map from '../../components/Map';
import SignInButtons from '../../components/SignInButtons';
import TeacherShark from '../../components/Tutorial/TeacherShark';
import { playSfx } from '../../gamekit/SFX';
import MemoryGame from '../../games/memory/MemoryGame';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import {
  EMPTY_GUEST_TASTE, GUEST_TASTE_COPY as COPY, guestStep, readGuestTaste, saveGuestTaste, type GuestTasteProgress,
} from '../../services/guestTaste';
import { BRAND, GameButton, SHADOW } from '../../ui';

const CHURRO = require('../../../assets/images/prep-items/churros/churro_01.png');
const COIN = require('../../../assets/images/share/props/gold-fin-coin.webp');
const SHELF = require('../../../assets/images/screens/park/shelf-polished-v2.png');
const FINN = require('../../../assets/images/tutorial/teacher-shark.png');

/** Steps in Finn's progress dots. */
const STEP_INDEX = { find: 0, play: 1, coin: 2, save: 3 } as const;

export default function GuestTaste() {
  const reduced = useReducedGameMotion();
  const [progress, setProgress] = useState<GuestTasteProgress | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
  const [gameRun, setGameRun] = useState(0);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void readGuestTaste().then(saved => { if (alive.current) setProgress(saved); });
    return () => { alive.current = false; };
  }, []);
  const advance = useCallback((next: GuestTasteProgress) => {
    if (!alive.current) return;
    setProgress(next);
    void saveGuestTaste(next);
  }, []);

  const step = progress ? guestStep(progress) : null;
  const current = progress ?? EMPTY_GUEST_TASTE;

  return <View style={styles.fill}>
    <View style={StyleSheet.absoluteFill} pointerEvents="none"><Map>{null}</Map></View>
    <BlurView intensity={step === 'find' ? 6 : 14} tint="light" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />

    {step === 'find' && <ChurroFind reduced={reduced} onCaught={() => advance({ ...current, caught: true })} />}
    {step === 'coin' && <ShelfCoinLanding reduced={reduced} onDone={() => advance({ ...current, shelved: true })} />}
    {step === 'save' && <SaveCard onPlayMore={() => setArcadeOpen(true)} />}

    {(step === 'find' || step === 'play') && !gameOpen &&
      <TeacherShark title={step === 'find' ? COPY.find.title : COPY.play.title}
        text={step === 'find' ? COPY.find.body : COPY.play.body}
        mood={step === 'find' ? 'waving' : 'excited'} position="bottom-center"
        showNext={step === 'play'} nextText={COPY.play.button}
        stepIndex={STEP_INDEX[step]} totalSteps={4} bottomOffset={48}
        onNext={() => { setGameRun(run => run + 1); setGameOpen(true); }} />}

    {gameOpen && <MemoryGame key={gameRun} visible difficulty={0} deckId="park" taskName="Finn’s free warm-up"
      onClose={() => setGameOpen(false)}
      onComplete={() => { setGameOpen(false); advance({ ...current, caught: true, won: true }); }} />}
    <HomeArcade visible={arcadeOpen} onClose={() => setArcadeOpen(false)} />
  </View>;
}

/** Finn's treat, bobbing in a glowing ring. One tap catches it. */
function ChurroFind({ reduced, onCaught }: { reduced: boolean; onCaught: () => void }) {
  const bob = useSharedValue(0), ring = useSharedValue(0), pop = useSharedValue(0);
  const [caught, setCaught] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    if (reduced) return;
    bob.value = withRepeat(withSequence(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 800, easing: Easing.inOut(Easing.sin) })), -1, false);
    ring.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
    return () => { cancelAnimation(bob); cancelAnimation(ring); };
  }, [reduced, bob, ring]);
  const finish = useCallback(() => { if (!done.current) { done.current = true; onCaught(); } }, [onCaught]);
  const catchIt = () => {
    if (caught) return;
    setCaught(true);
    cancelAnimation(bob); cancelAnimation(ring); ring.value = 0;
    playSfx('coin', 0.8);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    if (reduced) { pop.value = 1; setTimeout(finish, 900); return; }
    // A quick squash (a spring would wobble for a second), a beat for "Nice catch!", then up and away.
    pop.value = withSequence(withTiming(0.6, { duration: 220, easing: Easing.out(Easing.back(3)) }),
      withDelay(450, withTiming(1, { duration: 320, easing: Easing.in(Easing.cubic) }, ok => { if (ok) runOnJS(finish)(); })));
    setTimeout(finish, 1500); // never stuck if the animation is interrupted
  };
  const churroStyle = useAnimatedStyle(() => {
    const p = pop.value;
    // Up to 0.6: a big happy squash. Past 0.6: it zips up and away.
    const lift = p > 0.6 ? (p - 0.6) / 0.4 : 0;
    return { opacity: 1 - lift, transform: [{ translateY: -bob.value * 10 - lift * 220 },
      { scale: 1 + Math.min(p, 0.6) * 0.75 - lift * 0.5 }, { rotate: `${(1 - bob.value) * -8 + bob.value * 8}deg` }] };
  });
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.7 * (1 - ring.value), transform: [{ scale: 0.8 + ring.value * 0.7 }] }));
  // The white disc leaves with the churro, so no empty plate is left behind.
  const discStyle = useAnimatedStyle(() => {
    const lift = pop.value > 0.6 ? (pop.value - 0.6) / 0.4 : 0;
    return { opacity: 1 - lift, transform: [{ scale: 1 - lift * 0.4 }] };
  });
  return <View style={styles.findWrap} pointerEvents="box-none">
    <Pressable onPress={catchIt} accessibilityRole="button" accessibilityLabel="Catch the churro" hitSlop={30}
      style={styles.findHit}>
      {!caught && <Animated.View style={[styles.findRing, ringStyle]} />}
      <Animated.View style={[styles.findDisc, discStyle]} />
      <Animated.View style={churroStyle}><Image source={CHURRO} style={styles.churro} contentFit="contain" /></Animated.View>
    </Pressable>
    {caught && <Animated.Text entering={reduced ? undefined : FadeIn.duration(160)} style={styles.caught}>{COPY.caught}</Animated.Text>}
  </View>;
}

/** The won coin arcs onto the first spot of a shelf and clinks into place. */
function ShelfCoinLanding({ reduced, onDone }: { reduced: boolean; onDone: () => void }) {
  const fly = useSharedValue(reduced ? 1 : 0), glow = useSharedValue(0);
  const [landed, setLanded] = useState(reduced);
  const done = useRef(false);
  const finish = useCallback(() => { if (!done.current) { done.current = true; onDone(); } }, [onDone]);
  const land = useCallback(() => {
    setLanded(true);
    playSfx('coin', 0.9);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (reduced) { land(); return; }
    fly.value = withDelay(250, withTiming(1, { duration: 820, easing: Easing.inOut(Easing.cubic) }, ok => {
      if (ok) runOnJS(land)();
    }));
    const fallback = setTimeout(land, 1400);
    return () => { clearTimeout(fallback); cancelAnimation(fly); };
  }, [reduced, fly, land]);
  useEffect(() => {
    if (!landed) return;
    if (!reduced) glow.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 700 }));
    const next = setTimeout(finish, 2600);
    return () => { clearTimeout(next); cancelAnimation(glow); };
  }, [landed, reduced, glow, finish]);
  // The coin starts big above the shelf and ends in slot 1 (left of centre).
  const coinStyle = useAnimatedStyle(() => {
    const t = fly.value;
    return { opacity: landed ? 0 : 1, transform: [
      { translateX: -SLOT_GAP * t }, { translateY: FLY_DY * t - Math.sin(t * Math.PI) * 70 },
      { rotate: `${(1 - t) * -20}deg` }, { scale: 1 - 0.55 * t }] };
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 1 + glow.value * 0.5 }] }));
  return <Pressable style={styles.shelfWrap} onPress={landed ? finish : undefined}
    accessibilityRole={landed ? 'button' : undefined} accessibilityLabel={landed ? `${COPY.coin.title} ${COPY.coin.body}` : undefined}>
    <View style={styles.shelfCard}>
      <Text style={styles.shelfTitle}>{COPY.coin.title}</Text>
      <View style={styles.shelfStage}>
        <Animated.View pointerEvents="none" style={[styles.flyCoin, coinStyle]}>
          <Image source={COIN} style={styles.flyCoinImg} contentFit="contain" />
        </Animated.View>
        <View style={styles.slots}>
          {[0, 1, 2].map(slot => <View key={slot} style={styles.slot}>
            {slot === 0 && <Animated.View style={[styles.slotGlow, glowStyle]} />}
            {slot === 0 && landed && <Image source={COIN} style={styles.slotCoin} contentFit="contain" />}
          </View>)}
        </View>
        <Image source={SHELF} style={styles.shelf} contentFit="contain" />
      </View>
      <Text style={[styles.shelfBody, !landed && styles.hidden]}>{COPY.coin.body}</Text>
    </View>
  </Pressable>;
}

/** The ask, after the fun: sign in to save the shark, or keep playing. */
function SaveCard({ onPlayMore }: { onPlayMore: () => void }) {
  return <View style={styles.center}>
    <Animated.View entering={FadeIn.duration(260)} style={styles.card}>
      <Image source={FINN} style={styles.finn} contentFit="contain" accessibilityLabel="Finn the shark" />
      <Text style={styles.title} accessibilityRole="header">{COPY.save.title}</Text>
      <Text style={styles.body}>{COPY.save.body}</Text>
      <SignInButtons />
      <View style={styles.more}>
        <GameButton variant="ghost" label={COPY.save.again} icon="play" onPress={onPlayMore}
          accessibilityHint="Opens games you can play without signing in" />
      </View>
    </Animated.View>
  </View>;
}

/** Coin flight: from the top centre of the stage to slot 1 sitting on the plank. */
const SLOT = 62, SLOT_GAP = 82, FLY_DY = 79;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BRAND.sky },
  tint: { backgroundColor: 'rgba(7,104,185,0.12)' },
  hidden: { opacity: 0 },
  findWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingBottom: 220 },
  findHit: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  findRing: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 5, borderColor: BRAND.gold },
  findDisc: { position: 'absolute', width: 112, height: 112, borderRadius: 56, backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 4, borderColor: BRAND.white, ...SHADOW.card },
  churro: { width: 92, height: 92 },
  caught: { marginTop: 8, fontFamily: 'Shark', fontSize: 30, color: BRAND.gold, textAlign: 'center',
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  shelfWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  shelfCard: { width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: BRAND.blue, borderRadius: 26,
    borderWidth: 4, borderColor: BRAND.white, paddingVertical: 20, paddingHorizontal: 16, ...SHADOW.card },
  shelfTitle: { fontFamily: 'Shark', fontSize: 26, color: BRAND.gold, textAlign: 'center',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  shelfStage: { width: 300, height: 250, alignItems: 'center', justifyContent: 'flex-end' },
  flyCoin: { position: 'absolute', top: 0, left: 150 - 70, width: 140, height: 140 },
  flyCoinImg: { width: 140, height: 140 },
  slots: { flexDirection: 'row', gap: SLOT_GAP - SLOT, marginBottom: -30, zIndex: 1 },
  slot: { width: SLOT, height: SLOT, borderRadius: SLOT / 2, borderWidth: 3, borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  slotGlow: { position: 'absolute', width: SLOT + 24, height: SLOT + 24, borderRadius: (SLOT + 24) / 2,
    backgroundColor: 'rgba(255,224,110,0.55)' },
  slotCoin: { width: SLOT + 2, height: SLOT + 2 },
  shelf: { width: 300, height: 100 },
  shelfBody: { fontFamily: 'Knockout', fontSize: 19, lineHeight: 24, color: BRAND.white, textAlign: 'center', marginTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  card: { width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 26,
    borderWidth: 4, borderColor: BRAND.white, paddingTop: 64, paddingHorizontal: 20, paddingBottom: 14, ...SHADOW.lifted },
  finn: { position: 'absolute', top: -78, width: 132, height: 132 },
  title: { fontFamily: 'Shark', fontSize: 28, color: BRAND.navy, textAlign: 'center' },
  body: { fontFamily: 'Knockout', fontSize: 18, lineHeight: 23, color: BRAND.navySoft, textAlign: 'center', marginTop: 6, marginBottom: 14 },
  more: { marginTop: 8, alignSelf: 'stretch' },
});
