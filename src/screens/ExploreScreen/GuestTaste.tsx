/**
 * Play before sign-in. A guest gets a real taste in about 30 seconds:
 *   1. find:  Finn drops a churro next to them. Tap it: it flies into the treat
 *             badge (count 1) with a sparkle, and Finn says "Yum!".
 *   2. play:  Finn's four-pair warm-up (the same game the park guide uses).
 *   3. coin:  a coin arcs onto a real-looking park shelf with a clink, showing how a shelf fills up.
 *   4. save:  "Make your own shark" with Sign in with Apple (ask a grown-up), or play more games.
 * Progress is saved on the phone (services/guestTaste), so a guest who leaves
 * comes back to the save card, and the account that signs in next skips the
 * warm-up it already played. Nothing here calls the server.
 *
 * Motion is cheap: transforms and opacity on the UI thread, one-shot bursts,
 * a few loops that stop when their step ends, and reduced motion holds everything still.
 */
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming
} from 'react-native-reanimated';
import HomeArcade from '../../components/HomeArcade';
import Map from '../../components/Map';
import MysteryCoinArtwork from '../../components/MysteryCoinArtwork';
import ParkShelfArtwork from '../../components/ParkShelfArtwork';
import Ribbon from '../../components/Ribbon';
import SignInButtons from '../../components/SignInButtons';
import SparkleBurst from '../../components/SparkleBurst';
import TapHint from '../../components/TapHint';
import TeacherShark from '../../components/Tutorial/TeacherShark';
import { playSfx } from '../../gamekit/SFX';
import MemoryGame from '../../games/memory/MemoryGame';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import {
  EMPTY_GUEST_TASTE, GUEST_TASTE_COPY as COPY, guestStep, readGuestTaste, saveGuestTaste, type GuestTasteProgress,
} from '../../services/guestTaste';
import { BRAND, GameButton, GameIcon, SHADOW } from '../../ui';

const CHURRO = require('../../../assets/images/prep-items/churros/churro_01.png');
const COIN = require('../../../assets/images/coingold.png');
const FINN = require('../../../assets/images/tutorial/teacher-shark.png');
const UNDERWATER = require('../../../assets/images/screens/park/background-new.png');

/** Steps in Finn's progress dots. */
const STEP_INDEX = { find: 0, play: 1, coin: 2, save: 3 } as const;
/** The treat badge in the top left corner (clear of the map buttons), where caught treats go. */
const BADGE = 64, BADGE_INSET = 14;
/** The churro waits above Finn: the find area leaves this much room at the bottom (more on short phones like SE). */
const findRoom = (height: number) => (height < 600 ? 270 : 220);

export default function GuestTaste() {
  const reduced = useReducedGameMotion();
  const [progress, setProgress] = useState<GuestTasteProgress | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
  const [gameRun, setGameRun] = useState(0);
  const [arcadeOpen, setArcadeOpen] = useState(false);
  /** Tapped the churro this visit: Finn's bubble changes the same instant. */
  const [yum, setYum] = useState(false);
  /** The churro reached the badge: the count pops to 1. */
  const [bagged, setBagged] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
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
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(prev => prev && prev.w === width && prev.h === height ? prev : { w: width, h: height });
  }, []);

  const step = progress ? guestStep(progress) : null;
  /** Short phones (iPhone SE): the shelf sits higher and smaller so Finn's line never covers it. */
  const short = !!size && size.h < 600;
  const current = progress ?? EMPTY_GUEST_TASTE;
  const treats = current.caught || bagged ? 1 : 0;
  // From the churro (centre of the find area) to the badge in the top corner.
  const toBadge = size ? {
    x: BADGE_INSET + BADGE / 2 - size.w / 2,
    y: BADGE_INSET + BADGE / 2 - (size.h - findRoom(size.h)) / 2,
  } : null;

  // The live map (under a light blur) is the backdrop only while the churro
  // sits on it. From the game on, a still underwater scene takes over, so a
  // guest left on the save card is not re-blurring a live map every frame.
  const liveMap = step === 'find';
  return <View style={styles.fill} onLayout={onLayout}>
    {liveMap ? <>
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><Map>{null}</Map></View>
      <BlurView intensity={6} tint="light" style={StyleSheet.absoluteFill} />
    </> : step && <Animated.View entering={reduced ? undefined : FadeIn.duration(320)} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={UNDERWATER} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>}
    <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />

    {step === 'find' && size && toBadge && <ChurroFind reduced={reduced} toBadge={toBadge} room={findRoom(size.h)}
      onCatch={() => setYum(true)} onBagged={() => setBagged(true)}
      onDone={() => advance({ ...current, caught: true })} />}
    {step === 'coin' && <ShelfCoinLanding reduced={reduced} compact={short} onDone={() => advance({ ...current, shelved: true })} />}
    {step === 'save' && <SaveCard onPlayMore={() => setArcadeOpen(true)} />}

    {/* Finn walks the whole taste with the same four dots: find, play, coin, save. */}
    {step === 'coin' && <TeacherShark title={COPY.coin.title} text={COPY.coin.body} mood="celebrating" position="bottom-center"
      showNext={false} onNext={() => undefined} stepIndex={STEP_INDEX.coin} totalSteps={4} bottomOffset={short ? 26 : 48} />}

    {(step === 'find' || step === 'play') && !gameOpen && <TreatBadge count={treats} reduced={reduced} />}

    {(step === 'find' || step === 'play') && !gameOpen &&
      <TeacherShark title={step === 'find' ? (yum ? COPY.yum.title : COPY.find.title) : COPY.play.title}
        text={step === 'find' ? (yum ? COPY.yum.body : COPY.find.body) : COPY.play.body}
        mood={step === 'find' ? (yum ? 'celebrating' : 'waving') : 'excited'} position="bottom-center"
        showNext={step === 'play'} nextText={COPY.play.button} pointAtNext={step === 'play'}
        stepIndex={STEP_INDEX[step]} totalSteps={4} bottomOffset={48}
        onNext={() => { setGameRun(run => run + 1); setGameOpen(true); }} />}

    {gameOpen && <MemoryGame key={gameRun} visible difficulty={0} deckId="park" taskName="Finn’s free warm-up"
      onClose={() => setGameOpen(false)}
      onComplete={() => { setGameOpen(false); advance({ ...current, caught: true, won: true }); }} />}
    <HomeArcade visible={arcadeOpen} onClose={() => setArcadeOpen(false)} />
  </View>;
}

/** Where caught treats go: a cream badge with the churro and a count that pops. */
function TreatBadge({ count, reduced }: { count: number; reduced: boolean }) {
  const pop = useSharedValue(1);
  const seen = useRef(count);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (count <= seen.current) { seen.current = count; return; }
    seen.current = count;
    if (reduced) return;
    pop.value = withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 260 }));
    setBurst(b => b + 1);
  }, [count, reduced, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return <View pointerEvents="none" style={styles.badgeWrap}
    accessible accessibilityLabel={count > 0 ? `Treats: ${count}` : 'Treats: none yet'}>
    {burst > 0 && <View style={styles.badgeBurst}><SparkleBurst key={burst} size={120} /></View>}
    <Animated.View style={[styles.badge, count === 0 && styles.badgeEmpty, style]}>
      <Image source={CHURRO} style={styles.badgeImg} contentFit="contain" />
      {count > 0 && <View style={styles.count}><Text style={styles.countText}>{count}</Text></View>}
    </Animated.View>
  </View>;
}

/** Finn's treat, bobbing in a glowing ring. One tap catches it and it flies into the badge. */
function ChurroFind({ reduced, toBadge, room, onCatch, onBagged, onDone }: {
  reduced: boolean; toBadge: { x: number; y: number }; room: number;
  onCatch: () => void; onBagged: () => void; onDone: () => void;
}) {
  const bob = useSharedValue(0), ring = useSharedValue(0), pop = useSharedValue(0), fly = useSharedValue(0);
  const [caught, setCaught] = useState(false);
  const done = useRef(false), bagged = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (reduced) return;
    bob.value = withRepeat(withSequence(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.sin) }),
      withTiming(0, { duration: 800, easing: Easing.inOut(Easing.sin) })), -1, false);
    ring.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
    return () => { cancelAnimation(bob); cancelAnimation(ring); };
  }, [reduced, bob, ring]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const finish = useCallback(() => { if (!done.current) { done.current = true; onDone(); } }, [onDone]);
  const land = useCallback(() => {
    if (bagged.current) return;
    bagged.current = true;
    playSfx('ui.confirm', 0.7);
    onBagged();
    // A beat to see the count pop, then on to Finn's game.
    timers.current.push(setTimeout(finish, 650));
  }, [onBagged, finish]);
  const catchIt = () => {
    if (caught) return;
    setCaught(true);
    onCatch();
    cancelAnimation(bob); cancelAnimation(ring); ring.value = 0; bob.value = 0;
    playSfx('coin', 0.8);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    if (reduced) { fly.value = 1; timers.current.push(setTimeout(land, 500)); return; }
    // A quick happy squash, then an arc up into the treat badge.
    pop.value = withSequence(withTiming(1, { duration: 200, easing: Easing.out(Easing.back(3)) }), withTiming(0, { duration: 180 }));
    fly.value = withDelay(380, withTiming(1, { duration: 560, easing: Easing.inOut(Easing.cubic) }, ok => { if (ok) runOnJS(land)(); }));
    timers.current.push(setTimeout(land, 1300)); // never stuck if the animation is interrupted
  };
  const churroStyle = useAnimatedStyle(() => {
    const t = fly.value;
    return { opacity: t >= 1 ? 0 : 1, transform: [
      { translateX: toBadge.x * t }, { translateY: -bob.value * 10 + toBadge.y * t - Math.sin(t * Math.PI) * 80 },
      { scale: (1 + pop.value * 0.35) * (1 - t * 0.6) }, { rotate: `${(1 - bob.value) * -8 + bob.value * 8 + t * 300}deg` }] };
  });
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.7 * (1 - ring.value), transform: [{ scale: 0.8 + ring.value * 0.7 }] }));
  // The white disc fades as the churro leaves, so no empty plate is left behind.
  const discStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, fly.value * 2.5), transform: [{ scale: 1 - fly.value * 0.4 }] }));
  return <View style={[styles.findWrap, { paddingBottom: room }]} pointerEvents="box-none">
    <View style={styles.findHit}>
      {caught && !reduced && <SparkleBurst size={170} />}
      <Pressable onPress={catchIt} accessibilityRole="button" accessibilityLabel="Catch the churro" hitSlop={30}
        style={styles.findHit}>
        {!caught && <Animated.View style={[styles.findRing, ringStyle]} />}
        <Animated.View style={[styles.findDisc, discStyle]} />
        <Animated.View style={churroStyle}><Image source={CHURRO} style={styles.churro} contentFit="contain" /></Animated.View>
      </Pressable>
      {/* After two quiet seconds a hand taps the churro: no reading needed. */}
      {!caught && <TapHint delay={2000} style={styles.churroHand} />}
    </View>
    {caught && <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} style={styles.caughtPill}>
      <Text style={styles.caught}>{COPY.caught}</Text>
    </Animated.View>}
  </View>;
}

/**
 * The won coin arcs onto the first socket of a park shelf (the same ribbon,
 * plank and empty sockets as a real park shelf) and clinks into place with a
 * gold burst. It moves on by itself about a second later, or on a tap.
 */
function ShelfCoinLanding({ reduced, compact, onDone }: { reduced: boolean; compact: boolean; onDone: () => void }) {
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
    fly.value = withDelay(200, withTiming(1, { duration: 760, easing: Easing.inOut(Easing.cubic) }, ok => {
      if (ok) runOnJS(land)();
    }));
    const fallback = setTimeout(land, 1300);
    return () => { clearTimeout(fallback); cancelAnimation(fly); };
  }, [reduced, fly, land]);
  useEffect(() => {
    if (!landed) return;
    if (!reduced) glow.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 600 }));
    // Long enough to see the coin sit in its socket and hear Finn; a tap goes on sooner.
    const next = setTimeout(finish, reduced ? 2600 : 2000);
    return () => { clearTimeout(next); cancelAnimation(glow); };
  }, [landed, reduced, glow, finish]);
  // The coin drops in big over the ribbon and ends in socket 1.
  const coinStyle = useAnimatedStyle(() => {
    const t = fly.value;
    return { opacity: landed ? 0 : 1, transform: [
      { translateX: SLOT_ONE_X * t }, { translateY: FLY_FROM_Y * (1 - t) - Math.sin(t * Math.PI) * 50 },
      { rotate: `${(1 - t) * -25}deg` }, { scale: 2.1 - 1.1 * t }] };
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 1 + glow.value * 0.5 }] }));
  return <Pressable style={[styles.shelfWrap, compact && styles.shelfWrapCompact]} onPress={finish} accessibilityRole="button"
    accessibilityLabel={`${COPY.coin.ribbon}. ${COPY.coin.title} ${COPY.coin.body}`} accessibilityHint={COPY.coin.tap}>
    <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} exiting={reduced ? undefined : FadeOut.duration(220)}
      style={[styles.shelfCard, compact && styles.shelfCardCompact]}>
      <Image source={UNDERWATER} style={[StyleSheet.absoluteFill, styles.shelfArt]} contentFit="cover" />
      <View style={styles.ribbonWrap}><Ribbon text={COPY.coin.ribbon} /></View>
      <View style={styles.shelfPanel}>
        <View style={styles.shelfRow}>
          <ParkShelfArtwork variant="normal" height={55} />
          <View style={styles.sockets}>
            {Array.from({ length: SOCKETS }, (_, slot) => <View key={slot} style={styles.socket}>
              {slot === 0 && <Animated.View style={[styles.slotGlow, glowStyle]} />}
              {slot === 0 && landed
                ? <View style={styles.ownedCoin}><Image source={COIN} style={styles.ownedCoinImg} contentFit="contain" /></View>
                : <MysteryCoinArtwork size={SOCKET} />}
              {slot === 0 && landed && !reduced && <View style={styles.socketBurst}><SparkleBurst size={150} /></View>}
            </View>)}
          </View>
          <Animated.View pointerEvents="none" style={[styles.flyCoin, coinStyle]}>
            <Image source={COIN} style={styles.flyCoinImg} contentFit="contain" />
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  </Pressable>;
}

/** The ask, after the fun: make your own shark (a grown-up signs in), or keep playing. */
function SaveCard({ onPlayMore }: { onPlayMore: () => void }) {
  return <View style={styles.center}>
    <Animated.View entering={FadeIn.duration(260)} style={styles.card}>
      <ProgressDots index={STEP_INDEX.save} total={4} />
      <View style={styles.finnWrap} accessible accessibilityLabel="Finn holding your churro">
        <Image source={FINN} style={styles.finn} contentFit="contain" />
        <Image source={CHURRO} style={styles.finnChurro} contentFit="contain" />
      </View>
      <Text style={styles.title} accessibilityRole="header">{COPY.save.title}</Text>
      <Text style={styles.body}>{COPY.save.body}</Text>
      {/* One grouped unit: the cue is a plain label (not a button) right on top of the Apple button it means. */}
      <View style={styles.grownUpGroup}>
        <View style={styles.grownUp} accessible accessibilityRole="text">
          <GameIcon name="heart" size={18} />
          <Text style={styles.grownUpText}>{COPY.save.grownUp}</Text>
        </View>
        <SignInButtons plain width={260} />
      </View>
      <View style={styles.more}>
        <GameButton variant="ghost" label={COPY.save.again} icon="play" onPress={onPlayMore}
          accessibilityHint="Opens games you can play without signing in" />
      </View>
    </Animated.View>
  </View>;
}

/** Finn's four progress dots (the same look as his speech bubble), for the save card. */
function ProgressDots({ index, total }: { index: number; total: number }) {
  return <View style={styles.dots} accessible accessibilityLabel={`Step ${index + 1} of ${total}`}>
    {Array.from({ length: total }, (_, i) => <View key={i}
      style={[styles.dot, i === index && styles.dotActive, i < index && styles.dotDone]} />)}
  </View>;
}

/** Shelf sockets: the same size and spacing as a park shelf row. */
const SOCKETS = 4, SOCKET = 60, SOCKET_GAP = 7;
const ROW_W = SOCKETS * SOCKET + (SOCKETS - 1) * SOCKET_GAP;
/** Coin flight: from high over the ribbon (centre) down into socket 1. */
const SLOT_ONE_X = -(ROW_W / 2 - SOCKET / 2), FLY_FROM_Y = -170;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BRAND.sky },
  tint: { backgroundColor: 'rgba(7,104,185,0.12)' },
  hidden: { opacity: 0 },
  badgeWrap: { position: 'absolute', top: BADGE_INSET, left: BADGE_INSET, width: BADGE, height: BADGE },
  badgeBurst: { ...StyleSheet.absoluteFillObject },
  badge: { width: BADGE, height: BADGE, borderRadius: BADGE / 2, backgroundColor: BRAND.cream, borderWidth: 4,
    borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  badgeEmpty: { opacity: 0.75 },
  badgeImg: { width: 40, height: 40 },
  count: { position: 'absolute', right: -10, bottom: -6, minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 6,
    backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, marginTop: -1 },
  findWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  findHit: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  findRing: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 5, borderColor: BRAND.gold },
  findDisc: { position: 'absolute', width: 112, height: 112, borderRadius: 56, backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 4, borderColor: BRAND.white, ...SHADOW.card },
  churro: { width: 92, height: 92 },
  // Gold on a navy pill: readable on any map colour.
  caughtPill: { marginTop: 8, backgroundColor: BRAND.navy, borderRadius: 22, borderWidth: 3, borderColor: BRAND.white,
    paddingHorizontal: 18, paddingVertical: 4, ...SHADOW.card },
  caught: { fontFamily: 'Shark', fontSize: 28, color: BRAND.gold, textAlign: 'center' },
  // The shelf sits in the upper half; Finn and his line stand under it.
  shelfWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
    paddingBottom: 250 },
  shelfWrapCompact: { justifyContent: 'flex-start', paddingTop: 0, paddingBottom: 0 },
  shelfCardCompact: { transform: [{ scale: 0.86 }], marginTop: -14 },
  // No overflow clip: the coin drops in from above the card. The art carries the rounded corners.
  shelfArt: { borderRadius: 22 },
  shelfCard: { width: '100%', maxWidth: 360, alignItems: 'center', borderRadius: 26,
    borderWidth: 4, borderColor: BRAND.white, paddingTop: 14, paddingBottom: 18, paddingHorizontal: 14,
    backgroundColor: BRAND.sky, ...SHADOW.card },
  ribbonWrap: { alignSelf: 'stretch', marginHorizontal: 14, marginBottom: -26, zIndex: 2 },
  shelfPanel: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: BRAND.blue, borderWidth: 3, borderColor: BRAND.white,
    borderRadius: 20, paddingTop: 34, paddingHorizontal: 10, paddingBottom: 12 },
  shelfRow: { width: '100%', height: SOCKET + 43, alignItems: 'center' },
  sockets: { position: 'absolute', top: 4, width: ROW_W, flexDirection: 'row', gap: SOCKET_GAP },
  socket: { width: SOCKET, height: SOCKET, alignItems: 'center', justifyContent: 'center' },
  socketBurst: { position: 'absolute', width: SOCKET, height: SOCKET },
  slotGlow: { position: 'absolute', width: SOCKET + 26, height: SOCKET + 26, borderRadius: (SOCKET + 26) / 2,
    backgroundColor: 'rgba(255,224,110,0.6)' },
  ownedCoin: { width: SOCKET, height: SOCKET, borderRadius: SOCKET / 2, borderWidth: 3, borderColor: BRAND.gold,
    backgroundColor: BRAND.blueBright, alignItems: 'center', justifyContent: 'center' },
  ownedCoinImg: { width: SOCKET - 10, height: SOCKET - 10 },
  flyCoin: { position: 'absolute', top: 4, left: '50%', marginLeft: -SOCKET / 2, width: SOCKET, height: SOCKET, zIndex: 3 },
  flyCoinImg: { width: SOCKET, height: SOCKET },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  card: { width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 26,
    borderWidth: 4, borderColor: BRAND.white, paddingTop: 64, paddingHorizontal: 20, paddingBottom: 14, ...SHADOW.lifted },
  finnWrap: { position: 'absolute', top: -78, width: 132, height: 132 },
  finn: { width: 132, height: 132 },
  finnChurro: { position: 'absolute', right: -6, bottom: 26, width: 48, height: 48, transform: [{ rotate: '18deg' }] },
  title: { fontFamily: 'Shark', fontSize: 28, color: BRAND.navy, textAlign: 'center' },
  body: { fontFamily: 'Knockout', fontSize: 18, lineHeight: 23, color: BRAND.navySoft, textAlign: 'center', marginTop: 6 },
  grownUpGroup: { alignItems: 'center', marginTop: 14 },
  grownUp: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  grownUpText: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft },
  dots: { position: 'absolute', top: 12, right: 16, flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND.sky },
  dotActive: { width: 20, backgroundColor: BRAND.blueBright },
  dotDone: { backgroundColor: BRAND.gold },
  churroHand: { top: -6, right: 20 },
  more: { marginTop: 8, alignSelf: 'stretch' },
});
