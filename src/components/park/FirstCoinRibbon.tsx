/**
 * "First coin today!": one continuous throw. The coin you just collected
 * leaves the map on an arc with a gold comet trail while the ribbon is already
 * sliding down below the HUD rows (never over Ride Control or the Adventure
 * chip). On the frame the coin drops into the ribbon's slot the crown slams
 * onto it: a held squash of the coin and the ribbon, the golden buzz and the
 * new record sting, a gold ray fan behind the coin and two gold-and-white
 * sparkle rings. A warm sunrise band crosses the map and Finn pumps his fist.
 * When the ribbon slides up (faster than it came) the crowned coin hops out
 * and flies home to the shelf button, which pops as it lands. Gone by 2.3 s.
 * No words needed: the sun-gold sweep and the crowned coin say "this one is
 * special", and the coin still goes where it lives. Reduce Motion: the ribbon
 * fades in and out, the haptic and the sound stay. UI thread only; one-shot.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, ReduceMotion, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, type SharedValue,
} from 'react-native-reanimated';
import { withDelay, withSequence, withSpring, withTiming, momentMs } from './momentTime';
import { playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playMoment } from '../../gamekit/audio/playMoment';
import { useReduceMotionPreference } from '../../hooks/useReducedGameMotion';
import { usePowerBudget } from '../../power';
import { GoldBurst } from '../../ui/GoldBurst';
import GameIcon from '../../ui/GameIcon';
import { SLAM_SQUASH } from '../../ui/motion';
import { DURATION, EASE, SPRING, momentParticles } from '../../ui/motionEasing';
import { BRAND } from '../../ui/tokens';
import { HUD_TOP } from '../map/statusStack';
import { ARRIVAL_ART, FINN_ART } from './arrivalArt';
import BurstCanvas from './BurstCanvas';
import { FIRST_COIN, firstCoinImpactAt } from './firstCoinToday';
import { perfMark } from './momentPerf';

type Point = { readonly x: number; readonly y: number };

export type FirstCoinThrow = {
  /** Where the collected coin sits on the map (layer points). */
  readonly from: Point;
  /** Where it lives: the shelf button (layer points). */
  readonly to: Point;
  readonly coinUrl?: string | null;
  /** The shelf button pops on the coin's landing frame. */
  readonly onLand?: () => void;
  /** Where the map's HUD layer starts in this layer (the ribbon keeps its place under the HUD rows). */
  readonly hudTop?: number;
};

export default function FirstCoinRibbon({ onDone, toss }: { readonly onDone: () => void; readonly toss?: FirstCoinThrow }) {
  const preference = useReduceMotionPreference();
  if (preference === null) return null;
  return <Ribbon onDone={onDone} reduced={preference} toss={toss} />;
}

const COIN = 54;
/** The crowned coin's round badge overhangs the ribbon's left end, so the burst never sits on the words. */
const BADGE = 64;
/** How far behind the coin each trail dot rides (fraction of the flight). */
const TRAIL = [0.07, 0.14, 0.21] as const;

function Ribbon({ onDone, reduced, toss }: { readonly onDone: () => void; readonly reduced: boolean; readonly toss?: FirstCoinThrow }) {
  const { width, height } = useWindowDimensions();
  const budget = usePowerBudget();
  const sparkles = momentParticles(FIRST_COIN.sparkles, budget, reduced);
  const sweep = useSharedValue(0);
  const drop = useSharedValue(0);
  const out = useSharedValue(0);
  const fly = useSharedValue(0);
  const home = useSharedValue(0);
  const rings = useSharedValue(0);
  const finn = useSharedValue(0);
  const crown = useSharedValue(0);
  const punch = useSharedValue(0);
  const gold = useSharedValue(0);
  const shine = useSharedValue(0);
  const pump = useSharedValue(0);
  const doneRef = useRef(onDone); doneRef.current = onDone;
  const landRef = useRef(toss?.onLand); landRef.current = toss?.onLand;
  const finish = () => { perfMark('firstCoin.done'); doneRef.current(); };
  const impact = () => { perfMark('firstCoin.impact'); playHaptic('golden'); playMoment('game.newRecord'); };
  const landHome = () => { queueHaptic('tapLight'); landRef.current?.(); };
  const top = (toss?.hudTop ?? 0) + HUD_TOP + FIRST_COIN.topOffset;
  // The ribbon's coin slot (layer points) and where the coin starts (its spot on the map, or the map's middle).
  const slot = { x: 12 + BADGE / 2 - 8, y: top + 33 };
  const from = toss?.from ?? { x: width / 2, y: height * 0.42 };
  const to = toss?.to ?? null;
  const coinSource = toss?.coinUrl ? { uri: toss.coinUrl } : ARRIVAL_ART.goldCoin;

  useEffect(() => {
    perfMark('firstCoin.start');
    if (reduced) {
      // A real 160 ms fade in and out (Reanimated would skip a plain timing under the system Reduce Motion).
      const fade = { duration: DURATION.quick, reduceMotion: ReduceMotion.Never };
      fly.value = 1; crown.value = 1;
      drop.value = withSequence(ReduceMotion.Never, withTiming(1, fade, ok => { if (ok) runOnJS(impact)(); }),
        withDelay(FIRST_COIN.exitAt - DURATION.quick, withTiming(0, fade, ok => {
          if (ok) { runOnJS(landHome)(); runOnJS(finish)(); }
        }), ReduceMotion.Never));
      return () => cancelAnimation(drop);
    }
    const hit = firstCoinImpactAt();
    sweep.value = withTiming(1, { duration: FIRST_COIN.sweepMs, easing: EASE.inOut });
    // The ribbon is on its way down while the coin is still in the air.
    drop.value = withDelay(FIRST_COIN.ribbonAt, withSpring(1, SPRING.settle));
    out.value = withDelay(FIRST_COIN.exitAt, withTiming(1, { duration: FIRST_COIN.exitMs, easing: EASE.in }));
    // The throw: up off the map on an arc (EASE.out, so it leaves fast and settles into the slot).
    fly.value = withDelay(FIRST_COIN.coinFlyAt, withTiming(1, { duration: FIRST_COIN.coinFlyMs, easing: EASE.out }));
    // The crown drops like a stamp and hits on the landing frame: the buzz and the sting fire there.
    crown.value = withDelay(FIRST_COIN.crownAt, withTiming(1, { duration: DURATION.slam, easing: EASE.in }, ok => {
      if (ok) runOnJS(impact)();
    }));
    // A held squash of the coin and the ribbon (hit-stop), then a springy release.
    punch.value = withDelay(hit, withSequence(withTiming(1, { duration: 1 }), withDelay(DURATION.hitStop, withSpring(0, SPRING.pop))));
    gold.value = withDelay(hit, withSequence(
      withTiming(1, { duration: 140, easing: EASE.out }), withDelay(800, withTiming(0, { duration: 400, easing: EASE.in }))));
    rings.value = withDelay(FIRST_COIN.sparkleAt, withTiming(1, { duration: DURATION.sparkle + FIRST_COIN.sparkleWaveMs, easing: Easing.linear }));
    finn.value = withDelay(hit, withSequence(withSpring(1, SPRING.pop),
      withDelay(FIRST_COIN.exitAt - hit - 300, withTiming(0, { duration: FIRST_COIN.exitMs, easing: EASE.in }))));
    // The beat between the burst and the flight home is never still: a shine runs across the ribbon and
    // Finn pumps his fist again.
    shine.value = withDelay(FIRST_COIN.shineAt, withTiming(1, { duration: FIRST_COIN.shineMs, easing: EASE.inOut }));
    pump.value = withDelay(FIRST_COIN.pumpAt, withSequence(withTiming(1, { duration: DURATION.quick, easing: EASE.out }),
      withSpring(0, SPRING.land)));
    // Home: the coin hops out of the slot and flies to the shelf button as the ribbon leaves.
    if (to) {
      home.value = withDelay(FIRST_COIN.homeAt, withTiming(1, { duration: FIRST_COIN.homeMs, easing: EASE.inOut }, ok => {
        if (ok) runOnJS(landHome)();
      }));
    }
    const endAt = Math.max(FIRST_COIN.exitAt + FIRST_COIN.exitMs, to ? FIRST_COIN.homeAt + FIRST_COIN.homeMs : 0);
    const done = setTimeout(finish, momentMs(endAt + 60));
    return () => { clearTimeout(done); [sweep, drop, out, fly, home, rings, finn, crown, punch, gold, shine, pump].forEach(v => cancelAnimation(v)); };
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
    : {
      opacity: Math.min(1, drop.value * 1.6) * (1 - out.value),
      transform: [{ translateY: -40 * (1 - drop.value) - 70 * out.value },
        { scaleX: 1 + 0.03 * punch.value }, { scaleY: 1 - 0.05 * punch.value }],
    }));
  // The slot coin shows once the flyer lands, squashes on the hit, and leaves when it hops out for home.
  const coinStyle = useAnimatedStyle(() => ({
    opacity: reduced || (fly.value >= 1 && home.value <= 0) ? 1 : 0,
    transform: [{ scaleX: 1 + SLAM_SQUASH * 2 * punch.value }, { scaleY: 1 - SLAM_SQUASH * 2 * punch.value }],
  }));
  const crownStyle = useAnimatedStyle(() => {
    const c = crown.value;
    return {
      opacity: Math.min(1, c * 3),
      transform: [{ translateY: -38 * (1 - c) }, { scale: (1.8 - 0.8 * c) }, { scaleX: 1 + SLAM_SQUASH * 1.5 * punch.value }, { scaleY: 1 - SLAM_SQUASH * 1.5 * punch.value }],
    };
  });
  const finnStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, finn.value * 2),
    transform: [{ translateY: 30 * (1 - finn.value) - 8 * Math.max(0, Math.sin(Math.min(1, finn.value) * Math.PI)) - 12 * pump.value },
      { rotate: `${-10 + 10 * finn.value - 8 * pump.value}deg` }, { scale: (0.5 + 0.5 * finn.value) * (1 + 0.08 * pump.value) }],
  }));
  const ribbonWidth = width - 12 - FIRST_COIN.railClear;
  const shineStyle = useAnimatedStyle(() => ({
    opacity: shine.value > 0 && shine.value < 1 ? 1 : 0,
    transform: [{ translateX: -60 + (ribbonWidth + 60) * shine.value }, { skewX: '-20deg' }],
  }));

  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite">
    {!reduced && <Animated.View style={[styles.sweep, { width: band }, sweepStyle]}>
      <LinearGradient colors={['rgba(255,214,90,0)', 'rgba(255,214,90,1)', 'rgba(255,246,200,1)', 'rgba(255,214,90,1)', 'rgba(255,214,90,0)']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>}
    {/* Two clear sparkle rings around the crowned coin, drawn UNDER the ribbon: they halo its edges and never
        sit on the words. */}
    {!reduced && <BurstCanvas progress={rings} count={sparkles} radius={62} ring={34} starSize={12} x={slot.x} y={slot.y} />}
    {!reduced && <BurstCanvas progress={rings} count={sparkles} radius={96} ring={0} starSize={10} x={slot.x} y={slot.y} delayed={0.16} />}
    <Animated.View style={[styles.ribbonWrap, { top, right: FIRST_COIN.railClear }, ribbonStyle]}>
      {/* One gold ray fan behind the coin only. */}
      {!reduced && <GoldBurst size={200} amount={gold} spin={false} style={styles.rays} />}
      <View style={styles.ribbon} accessible accessibilityLabel="First coin today!">
        <View style={styles.ribbonTop} />
        {!reduced && <Animated.View style={[styles.shine, shineStyle]} />}
        <Text style={styles.text} allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit>First coin today!</Text>
        <GameIcon name="sparkle" size={24} />
      </View>
      {/* The crowned coin in its own round badge, overhanging the ribbon's left end. */}
      <View style={styles.badge}>
        <Animated.View style={[styles.coin, coinStyle]}>
          <Image source={coinSource} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
        </Animated.View>
        <Animated.View style={[styles.crown, crownStyle]}><GameIcon name="crown" size={32} /></Animated.View>
      </View>
      {!reduced && <Animated.View style={[styles.finn, finnStyle]}>
        <Image source={FINN_ART[1]} style={{ width: 78, height: 98 }} contentFit="contain" transition={0} />
      </Animated.View>}
    </Animated.View>
    {/* The throw: the coin and its gold comet trail, up from the map into the slot. */}
    {!reduced && TRAIL.map((lag, i) => <Flyer key={`t${i}`} t={fly} lag={lag} from={from} to={slot} lift={-90} dot={i} />)}
    {!reduced && <Flyer t={fly} lag={0} from={from} to={slot} lift={-90} source={coinSource} />}
    {/* Home: out of the slot and down to the shelf button. */}
    {!reduced && to && TRAIL.map((lag, i) => <Flyer key={`h${i}`} t={home} lag={lag} from={slot} to={to} lift={-70} dot={i} home />)}
    {!reduced && to && <Flyer t={home} lag={0} from={slot} to={to} lift={-70} source={coinSource} home />}
  </View>;
}

/**
 * One flying coin (or one dot of its trail) on a quadratic arc from `from` to
 * `to`, lifted by `lift` at its peak. The coin spins on its edge as it goes and
 * lands face-on. Hidden before it starts and after it lands (the slot coin or
 * the shelf button takes over on that frame).
 */
function Flyer({ t, lag, from, to, lift, source, dot, home }: {
  readonly t: SharedValue<number>; readonly lag: number; readonly from: Point; readonly to: Point; readonly lift: number;
  readonly source?: object; readonly dot?: number;
  /** The flight home: the coin swells to FIRST_COIN.homePeak at the top of its arc, then shrinks into its home. */
  readonly home?: boolean;
}) {
  const peak = FIRST_COIN.homePeak;
  const style = useAnimatedStyle(() => {
    const raw = t.value;
    const k = raw - lag;
    if (raw <= 0 || raw >= 1 || k <= 0) return { opacity: 0 };
    const u = 1 - k;
    const cx = (from.x + to.x) / 2 - 30, cy = Math.min(from.y, to.y) + lift;
    const x = u * u * from.x + 2 * u * k * cx + k * k * to.x;
    const y = u * u * from.y + 2 * u * k * cy + k * k * to.y;
    // Big off the map and coin-sized in the slot; on the way home it swells to 2.5x, then shrinks into its home.
    const scale = home ? (k < 0.3 ? 1 + (peak - 1) * (k / 0.3) : peak - (peak - 0.6) * ((k - 0.3) / 0.7)) : 1.8 - 0.8 * k;
    if (dot != null) {
      const fade = [0.55, 0.35, 0.2][dot] ?? 0.2;
      return { opacity: fade, transform: [{ translateX: x - 9 }, { translateY: y - 9 }, { scale: scale * (1 - dot * 0.18) }] };
    }
    // Edge spin that ends face-on: two full turns, cos(...) reaches 1 at the end.
    const spin = Math.cos(u * Math.PI * 4);
    return { opacity: 1, transform: [{ translateX: x - COIN / 2 }, { translateY: y - COIN / 2 },
      { scaleX: scale * (0.25 + 0.75 * Math.abs(spin)) }, { scaleY: scale }] };
  });
  if (dot != null) return <Animated.View style={[styles.dot, style]} />;
  return <Animated.View style={[styles.flyer, style]}>
    <Image source={source as never} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  ribbonWrap: { position: 'absolute', left: 12, alignItems: 'center' },
  rays: { position: 'absolute', left: BADGE / 2 - 8 - 100, top: 33 - 100 },
  ribbon: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 66, paddingLeft: BADGE - 2, paddingRight: 12,
    borderRadius: 18, borderWidth: 3, borderColor: BRAND.white, backgroundColor: BRAND.gold, alignSelf: 'stretch',
    borderBottomWidth: 6, borderBottomColor: '#d99a00', overflow: 'hidden' },
  ribbonTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 20, backgroundColor: 'rgba(255,246,200,0.55)' },
  shine: { position: 'absolute', top: -10, bottom: -10, left: 0, width: 26, backgroundColor: 'rgba(255,255,255,0.8)' },
  badge: { position: 'absolute', left: -8, top: 33 - BADGE / 2, width: BADGE, height: BADGE, borderRadius: BADGE / 2,
    borderWidth: 3, borderColor: BRAND.white, backgroundColor: '#ffe9a3', alignItems: 'center', justifyContent: 'center',
    shadowColor: BRAND.navy, shadowOpacity: 0.35, shadowOffset: { width: 0, height: 3 }, shadowRadius: 0 },
  coin: { width: COIN, height: COIN },
  crown: { position: 'absolute', top: -26, alignSelf: 'center' },
  text: { flex: 1, fontFamily: 'Shark', fontSize: 23, color: BRAND.navy, letterSpacing: 0.5 },
  // Finn cheers under the ribbon's right end, clear of the map's right rail.
  finn: { position: 'absolute', right: 4, top: 52 },
  flyer: { position: 'absolute', left: 0, top: 0, width: COIN, height: COIN },
  dot: { position: 'absolute', left: 0, top: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffd65a',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
});
