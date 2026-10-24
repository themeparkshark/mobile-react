/**
 * "Welcome to Magic Kingdom!": the moment you walk into a park.
 *
 * The map dims to a soft blue, the gold ribbon unfurls, the park name stamps
 * in letter by letter, gold rays bloom behind it with one confetti shower, Finn
 * pops up and waves, and three picture cards drop in with what today holds:
 * the limited coin (a gold coin turning slowly), the boss time and what is new.
 * Tap anywhere (or wait 3.5 s): each card flies to where it lives on the map
 * (the limited coin card to that coin), and the ribbon folds into the HUD's
 * stack button, which keeps a "Today" chip for the rest of the day.
 *
 * Four beats (src/ui/motion.ts): gather (scrim, ribbon), hold (one flash and
 * the haptic as the name lands), burst (rays, sparkles, confetti), settle
 * (cards on SPRING.land, Finn waves). Everything runs on the UI thread from
 * shared values; the rays turn and the coin spins only while ambient motion is
 * allowed (useAmbientLoop and GoldBurst's own budget). Reduce Motion: the
 * ribbon and cards fade in together, no travel, no confetti; haptic and sound
 * stay. Once per park per day (parkArrival.ts).
 */
import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  Easing, type SharedValue,
} from 'react-native-reanimated';
import { isDimFlashingLightsEnabled } from '../../../modules/flash-safety';
import { playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { useReduceMotionPreference } from '../../hooks/useReducedGameMotion';
import { useAmbientLoop, usePowerBudget } from '../../power';
import { GoldBurst, RadialFlash, SparkleBurst } from '../../ui/GoldBurst';
import { DURATION, EASE, GOLD_FX, SPRING, flashPeak, momentParticles } from '../../ui/motionEasing';
import { SLAM_SQUASH } from '../../ui/motion';
import { BRAND } from '../../ui/tokens';
import GameIcon from '../../ui/GameIcon';
import { HUD_ROW_HEIGHT, HUD_TOP } from '../map/statusStack';
import { ARRIVAL, arrivalEndsAt, arrivalTitle, arrivalTitleSize, letterDelays, type ArrivalCard } from './parkArrival';

const RIBBON = require('../../../assets/images/ribbon.png');
const FINN = require('../../assets/games/boss/shark_cheer.png');
const GOLD_COIN = require('../../../assets/images/coingold.png');
const MAP_COIN = require('../../../assets/images/map/ride-coin.png');
const BOSS = require('../../../assets/images/boss/kraken.png');

type Projector = (latitude: number, longitude: number) => Promise<{ x: number; y: number } | null>;

export interface ParkArrivalMomentProps {
  readonly parkName: string;
  readonly cards: readonly ArrivalCard[];
  /** Map coordinates to window points (the map's projector), so a card can fly to its coin. */
  readonly projector?: MutableRefObject<Projector | null>;
  /** A replay from the Today chip: no confetti, no first-time stamp sound. */
  readonly replay?: boolean;
  readonly onDone: () => void;
}

/** Waits the few ms until the OS says whether Reduce Motion is on, so the moment never starts in the wrong mode. */
function ParkArrivalMoment(props: ParkArrivalMomentProps) {
  const preference = useReduceMotionPreference();
  if (preference === null) return null;
  return <ArrivalStage {...props} reduced={preference} />;
}

function ArrivalStage({ parkName, cards, projector, replay = false, onDone, reduced }: ParkArrivalMomentProps & { readonly reduced: boolean }) {
  const { width, height } = useWindowDimensions();
  const budget = usePowerBudget();
  const rootRef = useRef<View>(null);
  const title = arrivalTitle(parkName, parkName);
  const ribbonWidth = Math.min(width - 32, 380);
  const titleSize = arrivalTitleSize(title, ribbonWidth * 0.74);
  const delays = useMemo(() => letterDelays(title.length), [title]);
  const sparkles = momentParticles(ARRIVAL.sparkles, budget, reduced);
  const confetti = replay ? 0 : momentParticles(ARRIVAL.confetti, budget, reduced);

  const scrim = useSharedValue(0);
  const ribbon = useSharedValue(0);
  const banner = useSharedValue(0);
  const gold = useSharedValue(0);
  const bloom = useSharedValue(0);
  const flash = useSharedValue(0);
  const burst = useSharedValue(0);
  const rain = useSharedValue(0);
  const finn = useSharedValue(0);
  const wave = useSharedValue(0);
  const leave = useSharedValue(0);
  const fly = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const drop = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const ping = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const [targets, setTargets] = useState<({ x: number; y: number } | null)[]>([null, null, null]);
  const [stamp, setStamp] = useState(0);
  const phase = useRef<'in' | 'out' | 'done'>('in');
  const doneRef = useRef(onDone); doneRef.current = onDone;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mountedAt = useRef(Date.now());

  // Where the ribbon sits and where it folds to (the HUD stack button, top right of the map).
  const stackX = width - 12 - 27;
  const stackY = HUD_TOP + HUD_ROW_HEIGHT / 2;
  const ribbonCenterY = Math.max(150, height * 0.24);

  useEffect(() => {
    const later = (ms: number, run: () => void) => { timers.current.push(setTimeout(run, ms)); };
    if (reduced) {
      scrim.value = withTiming(1, { duration: DURATION.quick });
      ribbon.value = withTiming(1, { duration: DURATION.quick });
      banner.value = withTiming(1, { duration: DURATION.quick });
      finn.value = withTiming(1, { duration: DURATION.quick });
      drop.forEach(v => { v.value = withTiming(1, { duration: DURATION.quick }); });
      setStamp(1);
      playHaptic('winRoll');
      playSfx('fx.reward', 0.9);
    } else {
      // 1. gather: the map dims, the ribbon unfurls from the centre.
      scrim.value = withTiming(1, { duration: ARRIVAL.scrimMs, easing: EASE.out });
      ribbon.value = withSequence(withTiming(1.05, { duration: ARRIVAL.ribbonMs * 0.7, easing: EASE.out }),
        withSpring(1, SPRING.settle));
      banner.value = withDelay(80, withSpring(1, SPRING.stamp));
      later(ARRIVAL.lettersAt - 20, () => setStamp(1));
      gold.value = withDelay(120, withTiming(0.28, { duration: 300, easing: EASE.charge }));
      // 2. hold + 3. burst: one capped flash and the haptic as the name lands, rays bloom, sparkles and confetti fly.
      later(ARRIVAL.burstAt - DURATION.hitStop, () => playHaptic('winRoll'));
      flash.value = withDelay(ARRIVAL.burstAt, withSequence(
        withTiming(flashPeak(isDimFlashingLightsEnabled(), false), { duration: 40 }),
        withTiming(0, { duration: DURATION.flash })));
      gold.value = withDelay(ARRIVAL.burstAt, withTiming(0.62, { duration: DURATION.bloom, easing: EASE.out }));
      bloom.value = withDelay(ARRIVAL.burstAt, withSequence(withTiming(1, { duration: 160, easing: EASE.out }),
        withTiming(0, { duration: DURATION.bloom, easing: EASE.out })));
      burst.value = withDelay(ARRIVAL.burstAt, withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear }));
      rain.value = withDelay(ARRIVAL.burstAt, withTiming(1, { duration: 2200, easing: Easing.linear }));
      later(ARRIVAL.burstAt, () => playSfx('fx.reward', 0.9));
      // 4. settle: Finn pops up and waves, the three cards land one by one.
      finn.value = withDelay(ARRIVAL.finnAt, withSpring(1, SPRING.pop));
      wave.value = withDelay(ARRIVAL.finnAt + 260, withSequence(
        withTiming(1, { duration: 180 }), withTiming(-0.4, { duration: 180 }),
        withTiming(1, { duration: 180 }), withSpring(0, SPRING.settle)));
      drop.forEach((v, i) => {
        v.value = withDelay(ARRIVAL.cardsAt + i * ARRIVAL.cardStepMs, withSpring(1, SPRING.land));
        later(ARRIVAL.cardsAt + i * ARRIVAL.cardStepMs + 120, () => queueHaptic('tickSelection'));
      });
    }
    later(ARRIVAL.handoffAt, () => startLeave());
    return () => {
      timers.current.forEach(clearTimeout); timers.current = [];
      [scrim, ribbon, banner, gold, bloom, flash, burst, rain, finn, wave, leave, ...fly, ...drop, ...ping].forEach(v => cancelAnimation(v));
    };
    // The moment plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Where each card goes: the limited coin (and the newest coin) to its spot on the map, the rest to the stack button.
  useEffect(() => {
    let active = true;
    const project = projector?.current;
    void (async () => {
      const origin = await new Promise<{ x: number; y: number } | null>(resolve => {
        if (!rootRef.current) { resolve(null); return; }
        rootRef.current.measureInWindow((x, y) => resolve(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null));
      });
      const points = await Promise.all(cards.map(async card => {
        const lat = card.kind === 'limited' ? card.latitude : card.kind === 'new' ? card.latitude : null;
        const lng = card.kind === 'limited' ? card.longitude : card.kind === 'new' ? card.longitude : null;
        if (!project || !origin || lat === null || lng === null) return null;
        const point = await project(lat, lng).catch(() => null);
        if (!point) return null;
        const local = { x: point.x - origin.x, y: point.y - origin.y };
        // Only a coin that is actually on screen gets a flight; otherwise the card folds into the HUD.
        return local.x > 20 && local.x < width - 20 && local.y > 90 && local.y < height - 160 ? local : null;
      }));
      if (active) setTargets(points);
    })();
    return () => { active = false; };
  }, [cards, projector, width, height]);

  const finish = () => {
    if (phase.current === 'done') return;
    phase.current = 'done';
    doneRef.current();
  };
  const later = (ms: number, run: () => void) => { timers.current.push(setTimeout(run, ms)); };
  const startLeave = () => {
    if (phase.current !== 'in') return;
    phase.current = 'out';
    timers.current.forEach(clearTimeout); timers.current = [];
    queueHaptic('tapLight');
    playSfx('fx.whoosh', 0.6);
    if (reduced) {
      leave.value = withTiming(1, { duration: DURATION.quick }, ok => { if (ok) runOnJS(finish)(); });
      return;
    }
    fly.forEach((v, i) => { v.value = withDelay(i * ARRIVAL.flyStepMs, withTiming(1, { duration: ARRIVAL.flyMs, easing: EASE.inOut })); });
    // A gold ring pings where a card lands on its coin, so the kid sees where today's coin lives.
    ping.forEach((v, i) => { v.value = withDelay(i * ARRIVAL.flyStepMs + ARRIVAL.flyMs - 40, withTiming(1, { duration: PING_MS, easing: EASE.out })); });
    leave.value = withDelay(140, withTiming(1, { duration: ARRIVAL.shrinkMs, easing: EASE.in }));
    gold.value = withTiming(0, { duration: DURATION.exit, easing: EASE.in });
    later(arrivalEndsAt(cards.length) - ARRIVAL.handoffAt + 120, finish);
  };
  const onTap = () => {
    // A kid mashing in still sees the name land; after that any tap hands off.
    if (Date.now() - mountedAt.current < ARRIVAL.minTapAt) return;
    startLeave();
  };

  const scrimStyle = useAnimatedStyle(() => ({ opacity: ARRIVAL.scrimOpacity * scrim.value * (1 - leave.value) }));
  const stageStyle = useAnimatedStyle(() => {
    const t = leave.value;
    if (reduced) return { opacity: 1 - t };
    return {
      opacity: 1 - Math.max(0, t - 0.55) / 0.45,
      transform: [
        { translateX: (stackX - width / 2) * t },
        { translateY: (stackY - ribbonCenterY) * t },
        { scale: 1 - 0.86 * t },
      ],
    };
  });
  const ribbonStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, ribbon.value) }, { scaleY: 0.6 + 0.4 * Math.min(1, ribbon.value) }] }));
  const bannerStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, banner.value * 1.5),
    transform: [{ scale: reduced ? 1 : 1.6 - 0.6 * banner.value }],
  }));
  const finnStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, finn.value * 2),
    transform: [{ translateY: 46 * (1 - finn.value) + 55 }, { rotate: `${wave.value * 12}deg` }, { translateY: -55 }, { scale: 0.4 + 0.6 * finn.value }],
  }));

  const cardWidth = Math.min(116, (width - 48) / 3);
  const cardsTop = ribbonCenterY + 92;

  return (
    <View ref={rootRef} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap} accessibilityRole="button"
        accessibilityLabel={`Welcome to ${parkName}! Tap to see today on the map.`}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
      </Pressable>
      {confetti > 0 && <ConfettiRain progress={rain} count={confetti} width={width} height={height} />}
      <Animated.View pointerEvents="none" style={[styles.stage, { top: ribbonCenterY - 150, height: 300 }, stageStyle]}>
        <GoldBurst size={Math.min(width * 1.25, 520)} amount={gold} bloom={bloom} reduced={reduced} style={styles.absCenter} />
        <RadialFlash flash={flash} size={260} />
        <View style={styles.origin}><SparkleBurst progress={burst} count={sparkles} radius={170} /></View>
        {/* Finn peeks over the ribbon's right end (drawn behind it, so the ribbon holds him up). */}
        <Animated.View style={[styles.finn, { right: Math.max(2, (width - ribbonWidth) / 2 - 6) }, finnStyle]}>
          <Image source={FINN} style={{ width: 100, height: 125 }} contentFit="contain" transition={0} />
        </Animated.View>
        {/* The scale runs on a plain wrapper: iOS left the plaque's fill behind at its start size when the
            bordered view itself was scaled. */}
        <Animated.View style={[styles.welcomeSlot, bannerStyle]}>
          <View style={styles.welcome}>
            <Text style={styles.welcomeText} allowFontScaling={false}>WELCOME TO</Text>
          </View>
        </Animated.View>
        <Animated.View style={[{ width: ribbonWidth, height: ribbonWidth / 3.92 }, ribbonStyle]}>
          <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
          <View style={styles.titleRow}>
            {title.split('').map((char, i) => (
              <StampLetter key={`${i}-${char}`} char={char} size={titleSize} delay={delays[i] ?? 0} start={stamp} reduced={reduced} />
            ))}
          </View>
        </Animated.View>
      </Animated.View>
      <View pointerEvents="none" style={[styles.cards, { top: cardsTop }]}>
        {cards.map((card, i) => (
          <TodayCard key={card.kind} card={card} index={i} width={cardWidth} drop={drop[i]} fly={fly[i]} leave={leave}
            from={{ x: width / 2 + (i - (cards.length - 1) / 2) * (cardWidth + 10), y: cardsTop + 80 }}
            to={targets[i] ?? { x: stackX, y: stackY }} toCoin={!!targets[i]} reduced={reduced} />
        ))}
      </View>
      {!reduced && cards.map((card, i) => targets[i]
        ? <CoinPing key={`ping-${card.kind}`} at={targets[i] as { x: number; y: number }} progress={ping[i]} /> : null)}
    </View>
  );
}

/** One letter of the park name: slams down from 1.7x with a little squash on impact. */
const StampLetter = memo(function StampLetter({ char, size, delay, start, reduced }: {
  readonly char: string; readonly size: number; readonly delay: number; readonly start: number; readonly reduced: boolean;
}) {
  const p = useSharedValue(0);
  const squash = useSharedValue(0);
  useEffect(() => {
    if (!start) return undefined;
    if (reduced) { p.value = 1; return undefined; }
    const local = Math.max(0, delay - ARRIVAL.lettersAt);
    p.value = withDelay(local, withTiming(1, { duration: DURATION.slam, easing: EASE.in }));
    squash.value = withDelay(local + DURATION.slam, withSequence(withTiming(1, { duration: 40 }), withSpring(0, SPRING.stamp)));
    return () => { cancelAnimation(p); cancelAnimation(squash); };
  }, [start, delay, reduced, p, squash]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 3),
    transform: [
      { scale: 1.7 - 0.7 * p.value },
      { scaleX: 1 + SLAM_SQUASH * squash.value },
      { scaleY: 1 - SLAM_SQUASH * squash.value },
    ],
  }));
  if (char === ' ') return <View style={{ width: size * 0.32 }} />;
  const text = { fontSize: size, lineHeight: size * 1.15 };
  return (
    <Animated.View style={style}>
      {OUTLINE.map(([dx, dy], i) => (
        <Text key={i} allowFontScaling={false} style={[styles.letter, styles.letterInk, text, { position: 'absolute', left: dx, top: dy }]}>{char}</Text>
      ))}
      <Text allowFontScaling={false} style={[styles.letter, text]}>{char}</Text>
    </Animated.View>
  );
});

const OUTLINE: readonly (readonly [number, number])[] = [[-2, 0], [2, 0], [0, -2], [0, 3], [2, 3], [-2, 3]];

/** A today card: drops in on SPRING.land, then flies to where it lives. */
function TodayCard({ card, index, width, drop, fly, leave, from, to, toCoin, reduced }: {
  readonly card: ArrivalCard; readonly index: number; readonly width: number;
  readonly drop: SharedValue<number>; readonly fly: SharedValue<number>; readonly leave: SharedValue<number>;
  readonly from: { x: number; y: number }; readonly to: { x: number; y: number }; readonly toCoin: boolean;
  readonly reduced: boolean;
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) return { opacity: Math.min(drop.value, 1 - leave.value) };
    const f = fly.value;
    const dx = (to.x - from.x) * f;
    // A small arc on the way out, like a card tossed onto the map.
    const dy = (to.y - from.y) * f - Math.sin(f * Math.PI) * 40;
    return {
      opacity: Math.min(1, drop.value * 2) * (f < 0.75 ? 1 : (1 - f) / 0.25),
      transform: [
        { translateX: dx },
        { translateY: -ARRIVAL.cardDrop * (1 - drop.value) + dy },
        { rotate: `${(index - 1) * 3 * (1 - f) + (toCoin ? 0 : 20 * f)}deg` },
        { scale: 1 - (toCoin ? 0.6 : 0.82) * f },
      ],
    };
  });
  return (
    <Animated.View style={[styles.card, { width }, style]}>
      <CardFace card={card} />
    </Animated.View>
  );
}

function CardFace({ card }: { readonly card: ArrivalCard }) {
  if (card.kind === 'limited') {
    return <>
      <View style={styles.tag}><Text style={styles.tagText} allowFontScaling={false}>LIMITED</Text></View>
      <SpinningCoin />
      <Text style={styles.cardName} numberOfLines={2} allowFontScaling={false}>{card.name}</Text>
    </>;
  }
  if (card.kind === 'boss') {
    return <>
      <View style={[styles.tag, styles.tagBlue]}><Text style={[styles.tagText, styles.tagTextLight]} allowFontScaling={false}>BOSS</Text></View>
      <Image source={BOSS} style={styles.art} contentFit="contain" transition={0} />
      <Text style={styles.cardBig} numberOfLines={1} adjustsFontSizeToFit allowFontScaling={false}>{card.time}</Text>
    </>;
  }
  if (card.kind === 'new') {
    return <>
      <View style={styles.tag}><Text style={styles.tagText} allowFontScaling={false}>NEW</Text></View>
      <Image source={MAP_COIN} style={styles.art} contentFit="contain" transition={0} />
      <Text style={styles.cardBig} allowFontScaling={false}>{card.count}</Text>
    </>;
  }
  return <>
    <View style={[styles.tag, styles.tagBlue]}><GameIcon name="map" size={16} /></View>
    <GameIcon name="coins" size={58} />
    <Text style={styles.cardBig} allowFontScaling={false}>{card.count}</Text>
  </>;
}

const PING_MS = 520;

/** Two gold rings spreading from a coin on the map: "this is where it is". */
function CoinPing({ at, progress }: { readonly at: { x: number; y: number }; readonly progress: SharedValue<number> }) {
  const outer = useAnimatedStyle(() => {
    const t = progress.value;
    return { opacity: t <= 0 || t >= 1 ? 0 : 1 - t, transform: [{ scale: 0.4 + 1.6 * t }] };
  });
  const inner = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (progress.value - 0.18) / 0.82));
    return { opacity: t <= 0 || t >= 1 ? 0 : 0.9 * (1 - t), transform: [{ scale: 0.3 + 1.1 * t }] };
  });
  return <View pointerEvents="none" style={{ position: 'absolute', left: at.x - 40, top: at.y - 40, width: 80, height: 80 }}>
    <Animated.View style={[styles.ring, outer]} />
    <Animated.View style={[styles.ring, styles.ringWhite, inner]} />
  </View>;
}

/** Today's limited coin turning slowly (a Y-spin, one turn per 4 s), only while ambient motion may run. */
function SpinningCoin() {
  const turn = useSharedValue(0);
  useAmbientLoop(
    () => { turn.value = 0; turn.value = withRepeat(withTiming(1, { duration: ARRIVAL.coinTurnMs, easing: Easing.linear }), -1, false); },
    () => { cancelAnimation(turn); turn.value = 0; },
  );
  const style = useAnimatedStyle(() => {
    const c = Math.cos(turn.value * Math.PI * 2);
    // Never fully edge-on: a coin always reads as a coin.
    return { transform: [{ scaleX: Math.sign(c || 1) * Math.max(0.14, Math.abs(c)) }] };
  });
  return <Animated.View style={style}>
    <Image source={GOLD_COIN} style={styles.art} contentFit="contain" transition={0} />
  </Animated.View>;
}

const CONFETTI_COLORS = [GOLD_FX.rays, BRAND.white, BRAND.blueBright, BRAND.gold, BRAND.sky, GOLD_FX.raysSoft];

/** One shower of blue, white and gold confetti falling once from the top with a sideways drift. */
function ConfettiRain({ progress, count, width, height }: {
  readonly progress: SharedValue<number>; readonly count: number; readonly width: number; readonly height: number;
}) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: ((i * 61) % 97) / 97 * width,
    delay: ((i * 37) % 10) / 10 * 0.28,
    fall: height * (0.55 + ((i * 23) % 40) / 100),
    drift: (i % 2 ? 1 : -1) * (14 + ((i * 17) % 22)),
    spin: (i % 2 ? 1 : -1) * (240 + ((i * 41) % 300)),
    w: 11 + (i % 3) * 3,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  })), [count, width, height]);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {pieces.map((piece, i) => <ConfettiPiece key={i} piece={piece} progress={progress} />)}
  </View>;
}

function ConfettiPiece({ piece, progress }: {
  readonly piece: { x: number; delay: number; fall: number; drift: number; spin: number; w: number; color: string };
  readonly progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (progress.value - piece.delay) / (1 - piece.delay)));
    if (t <= 0 || t >= 1) return { opacity: 0 };
    return {
      opacity: t < 0.75 ? 1 : (1 - t) / 0.25,
      transform: [
        { translateX: piece.x + Math.sin(t * Math.PI * 3) * piece.drift },
        // Gravity: slow at the top, faster as it falls.
        { translateY: -20 + piece.fall * (0.35 * t + 0.65 * t * t) },
        { rotate: `${piece.spin * t}deg` },
        { scaleY: 0.4 + 0.6 * Math.abs(Math.cos(t * Math.PI * 4)) },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: piece.w, height: piece.w * 0.6,
    borderRadius: 2, backgroundColor: piece.color, borderWidth: 0.5, borderColor: 'rgba(5,52,110,0.25)' }, style]} />;
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: '#0a5aa8' },
  ring: { ...StyleSheet.absoluteFillObject, borderRadius: 40, borderWidth: 5, borderColor: GOLD_FX.rays },
  ringWhite: { borderWidth: 3, borderColor: BRAND.white },
  stage: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  absCenter: { position: 'absolute' },
  origin: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  welcomeSlot: { alignItems: 'center', marginBottom: -6, zIndex: 2 },
  welcome: { backgroundColor: BRAND.navy, borderRadius: 14, borderWidth: 3, borderColor: BRAND.white,
    paddingHorizontal: 14, paddingVertical: 3 },
  welcomeText: { fontFamily: 'Shark', fontSize: 17, letterSpacing: 1.5, color: BRAND.gold },
  titleRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingBottom: '3%' },
  letter: { fontFamily: 'Shark', color: BRAND.white, textAlign: 'center' },
  letterInk: { color: BRAND.navy },
  finn: { position: 'absolute', top: 150 - 125 + 4 },
  cards: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  card: { alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 18, borderWidth: 3, borderColor: BRAND.white,
    paddingTop: 14, paddingBottom: 10, paddingHorizontal: 6, minHeight: 148,
    shadowColor: '#05346e', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 5 } },
  tag: { position: 'absolute', top: -12, alignSelf: 'center', backgroundColor: BRAND.gold, borderRadius: 10,
    borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 8, paddingVertical: 1, minHeight: 22, justifyContent: 'center' },
  tagBlue: { backgroundColor: BRAND.blueBright, borderColor: BRAND.white },
  tagText: { fontFamily: 'Shark', fontSize: 12, letterSpacing: 0.8, color: BRAND.navy },
  tagTextLight: { color: BRAND.white },
  art: { width: 64, height: 64, marginTop: 4 },
  cardBig: { fontFamily: 'Shark', fontSize: 26, color: BRAND.navy, marginTop: 4 },
  cardName: { fontFamily: 'Knockout', fontSize: 13, lineHeight: 15, color: BRAND.navy, textAlign: 'center', marginTop: 6 },
});

export default memo(ParkArrivalMoment);
