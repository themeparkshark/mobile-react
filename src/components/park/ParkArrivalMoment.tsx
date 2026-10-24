/**
 * "Welcome to Magic Kingdom!": the moment you walk into a park.
 *
 * The map recedes under a light sky-blue veil, the gold ribbon unfurls, the
 * park name stamps in letter by letter, one held flash and the buzz, then a
 * wide gold fan with a white-hot core bursts behind the name with confetti,
 * Finn pops up and waves, and three prize cards drop in with what today holds:
 * the limited coin (gold rim, a coin turning slowly), the boss time and what is
 * new (or the coins still to find here, drawn as grey coins with a "?"). Each
 * card catches a shine as it lands. At 1.5 s Finn points at the limited coin
 * and it flips once, and today's Daily 3 (a flame and three pips) stamps in.
 * Tap anywhere (or wait 2.6 s): each card flies home (to its coin on the map
 * with a gold ping and a hop, or into the HUD's stack button, which catches it
 * with a bump and a tick), and the ribbon folds into the stack.
 *
 * Four beats (src/ui/motion.ts): gather (veil, ribbon, letters, gold charging),
 * hold (one 70 ms frame: flash at or below 0.4 and the haptic), burst (rays,
 * sparkles, confetti), settle (cards on SPRING.land, Finn waves). Every visual
 * runs on the UI thread from shared values; the haptic and the sound fire from
 * the same UI clock (one reaction, runOnJS) so they land on their frames even
 * under JS load. The stage mounts invisible and starts one frame after it has
 * laid out and the ribbon art has decoded, so the first visible frame is the
 * first frame of the unfurl (no frozen half-built frame). Reduce Motion: the
 * ribbon and cards fade in together, no travel, no confetti; haptic and sound
 * stay. Once per park per day (parkArrival.ts).
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withRepeat, Easing, ReduceMotion, type SharedValue,
} from 'react-native-reanimated';
import { withDelay, withSequence, withSpring, withTiming, momentMs } from './momentTime';
import { isDimFlashingLightsEnabled } from '../../../modules/flash-safety';
import { queueHaptic } from '../../gamekit/Haptics';
import { playMoment } from '../../gamekit/audio/playMoment';
import { playSfx } from '../../gamekit/SFX';
import { useReduceMotionPreference } from '../../hooks/useReducedGameMotion';
import { useAmbientLoop, usePowerBudget } from '../../power';
import { GoldBurst, RadialFlash, ShineSweep } from '../../ui/GoldBurst';
import { DURATION, EASE, GOLD_FX, SPRING, flashPeak, momentParticles } from '../../ui/motionEasing';
import { HUD_BUMP, SLAM_SQUASH } from '../../ui/motion';
import { BRAND } from '../../ui/tokens';
import GameIcon from '../../ui/GameIcon';
import { HUD_ROW_HEIGHT, HUD_TOP } from '../map/statusStack';
import {
  ARRIVAL, ARRIVAL_REPEAT, arrivalCues, arrivalTitle, arrivalTitleSize, bossClockHands, flyPoint, letterDelays,
  type ArrivalCard, type ArrivalGoal,
} from './parkArrival';
import { ARRIVAL_ART, FINN_ART, warmArrivalArt } from './arrivalArt';
import ArrivalFxCanvas, { confettiPieces } from './ArrivalFxCanvas';
import { perfMark } from './momentPerf';

type Projector = (latitude: number, longitude: number) => Promise<{ x: number; y: number } | null>;
type Point = { x: number; y: number };

export interface ParkArrivalMomentProps {
  readonly parkName: string;
  readonly cards: readonly ArrivalCard[];
  /** Today's Daily 3, when the server has it on: a flame and three pips under the cards. */
  readonly goal?: ArrivalGoal | null;
  /** Map coordinates to window points (the map's projector), so a card can fly to its coin. */
  readonly projector?: MutableRefObject<Projector | null>;
  /** A replay from the Today chip: no confetti, no first-time fanfare. */
  readonly replay?: boolean;
  /** A second arrival at this park this week: the short hello (ribbon, name, cards, about 1.4 s). */
  readonly repeat?: boolean;
  /** Which of Finn's hello poses (fixed per park and day). */
  readonly pose?: number;
  readonly onDone: () => void;
}

/** Waits until the OS says whether Reduce Motion is on (cached after start-up), so it never starts in the wrong mode. */
function ParkArrivalMoment(props: ParkArrivalMomentProps) {
  const preference = useReduceMotionPreference();
  if (preference === null) return null;
  return <ArrivalStage {...props} reduced={preference} />;
}

function ArrivalStage({ parkName, cards, goal, projector, replay = false, repeat = false, pose = 0, onDone, reduced }: ParkArrivalMomentProps & { readonly reduced: boolean }) {
  const { width, height } = useWindowDimensions();
  const budget = usePowerBudget();
  const rootRef = useRef<View>(null);
  // The beat sheet: the full party the first time this week, the short hello after that (and on a replay).
  const A = repeat || replay ? ARRIVAL_REPEAT : ARRIVAL;
  const title = arrivalTitle(parkName, parkName);
  const ribbonWidth = Math.min(width - 32, 380);
  const titleSize = arrivalTitleSize(title, ribbonWidth * 0.74);
  const delays = useMemo(() => letterDelays(title.length, A), [title, A]);
  const sparkles = momentParticles(A.sparkles, budget, reduced);
  const confetti = replay ? 0 : momentParticles(A.confetti, budget, reduced);
  const confetti2 = replay ? 0 : momentParticles(A.confettiSecond, budget, reduced);
  // Confetti and sparkles never cover the header or the HUD row: the particle canvas starts below it.
  const fxTop = HUD_TOP + HUD_ROW_HEIGHT + 8;
  const flashTop = flashPeak(isDimFlashingLightsEnabled(), reduced);

  // One "go" frame: everything below is scheduled from it, on the UI thread. While arming, the stage sits
  // at an invisible 1% (not 0: iOS skips drawing a fully transparent layer, so its images would decode on
  // the first real frame and drop the unfurl) with the gold already a hair above zero for the same reason.
  const shown = useSharedValue<number>(A.armOpacity);
  const clock = useSharedValue(-1);
  const scrim = useSharedValue(0);
  const ribbon = useSharedValue(0);
  const punch = useSharedValue(0);
  const banner = useSharedValue(0);
  const gold = useSharedValue<number>(A.armOpacity);
  const bloom = useSharedValue(0);
  const flash = useSharedValue(0);
  const burst = useSharedValue(0);
  const rain = useSharedValue(0);
  const rain2 = useSharedValue(0);
  const finn = useSharedValue(0);
  const wave = useSharedValue(0);
  const point = useSharedValue(0);
  const flip = useSharedValue(0);
  const goalIn = useSharedValue(0);
  const leave = useSharedValue(0);
  const fly = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const drop = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const shine = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const ping = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  // Where each card lands, as a shared value: the moment never re-renders React once it has started
  // (a React commit mid-moment can flash the animated views back to their first frame on Fabric).
  const targets = useSharedValue<(Point | null)[]>([null, null, null]);
  const phase = useRef<'arming' | 'in' | 'out' | 'done'>('arming');
  const doneRef = useRef(onDone); doneRef.current = onDone;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedAt = useRef(0);
  const laidOut = useRef(false);
  const artReady = useRef(false);

  // Where the ribbon sits and where it folds to (the HUD stack button, top right of the map).
  const stackX = width - 12 - 27;
  const stackY = HUD_TOP + HUD_ROW_HEIGHT / 2;
  const ribbonCenterY = Math.max(150, height * 0.24);
  const cardWidth = Math.min(116, (width - 48) / 3);
  const cardsTop = ribbonCenterY + 92;
  // Where each card sits (its centre), the start of its flight home and of its trail.
  const froms = useMemo(() => cards.map((_, i) => ({ x: width / 2 + (i - (cards.length - 1) / 2) * (cardWidth + 10), y: cardsTop + 76 })),
    [cards, width, cardWidth, cardsTop]);
  const pieces = useMemo(() => confettiPieces(confetti, width, height - fxTop, 0), [confetti, width, height, fxTop]);
  const pieces2 = useMemo(() => confettiPieces(confetti2, width, (height - fxTop) * 0.8, 7), [confetti2, width, height, fxTop]);

  const finish = useCallback(() => {
    if (phase.current === 'done') return;
    phase.current = 'done';
    perfMark('arrival.done');
    doneRef.current();
  }, []);
  const startLeave = useCallback(() => {
    if (phase.current !== 'in') return;
    phase.current = 'out';
    playSfx('fx.whoosh', 0.6);
    cancelAnimation(clock);
    if (reduced) {
      leave.value = withTiming(1, { duration: DURATION.quick, reduceMotion: ReduceMotion.Never }, ok => { if (ok) runOnJS(finish)(); });
      return;
    }
    perfMark('arrival.handoff');
    fly.forEach((v, i) => {
      // One card at a time on a visible arc (EASE.inOut: a move between two points), a gold trail behind it.
      v.value = withDelay(i * A.flyStepMs, withTiming(1, { duration: A.flyMs, easing: EASE.inOut }, ok => {
        // The stack (or the coin) catches it: a tick in the hand on the frame it lands.
        if (ok) runOnJS(queueHaptic)('tickSelection');
      }));
    });
    // A gold ring pings where a card lands: on its coin ("this is where it is") or on the stack button that caught it.
    const last = Math.max(0, cards.length - 1);
    ping.forEach((v, i) => {
      v.value = withDelay(i * A.flyStepMs + A.flyMs - 40, withTiming(1, { duration: PING_MS, easing: EASE.out }, ok => {
        // The moment ends on the frame the last ping fades (the UI clock, not a JS timer).
        if (ok && i === last) runOnJS(finish)();
      }));
    });
    // The ribbon folds into the stack button behind the cards (the eye follows the cards first).
    leave.value = withDelay(220, withTiming(1, { duration: A.shrinkMs, easing: EASE.in }));
    gold.value = withTiming(0, { duration: DURATION.exit, easing: EASE.in });
    // Safety only: a dropped animation callback never leaves the stage up.
    timers.current.push(setTimeout(finish, momentMs(last * A.flyStepMs + A.flyMs + PING_MS + 900)));
    // Shared values are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, cards.length, finish]);

  // The JS side of each beat (haptic, sound, handoff), fired from the UI clock so it lands on its frame.
  const cues = useMemo(() => arrivalCues(cards.length, !!goal, reduced, A), [cards.length, goal, reduced, A]);
  const cueAt = useMemo(() => cues.map(cue => cue.at), [cues]);
  const fire = useCallback((index: number) => {
    const cue = cues[index];
    if (__DEV__ && process.env.EXPO_PUBLIC_PARK_ARRIVAL_DEBUG === '1') console.log('[arrival] cue', cue?.kind, cue?.at, Date.now() - startedAt.current);
    if (!cue || phase.current !== 'in') return;
    if (cue.kind === 'hit') {
      if (replay) { queueHaptic('hitMedium'); playSfx('fx.reveal', 0.6); }
      else playMoment('park.arrival', { haptic: true });
    } else if (cue.kind === 'card' || cue.kind === 'goal') {
      queueHaptic('tickSelection');
    } else if (cue.kind === 'handoff') {
      startLeave();
    }
  }, [cues, replay, startLeave]);
  useAnimatedReaction(() => clock.value, (now, before) => {
    if (now < 0 || before === null || before === undefined) return;
    for (let i = 0; i < cueAt.length; i += 1) {
      if (before < cueAt[i] && now >= cueAt[i]) runOnJS(fire)(i);
    }
  }, [cueAt, fire]);

  const go = () => {
    if (phase.current !== 'arming') return;
    phase.current = 'in';
    startedAt.current = Date.now();
    perfMark('arrival.start');
    shown.value = 1;
    clock.value = 0;
    // The beat clock always runs in real time: Reanimated would otherwise jump it to the end under the
    // system Reduce Motion setting and fire every cue (the handoff included) on the first frame.
    clock.value = withTiming(A.clockMs, { duration: A.clockMs, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    if (reduced) {
      // Reduce Motion: one 160 ms fade in, no travel.
      const fade = { duration: DURATION.quick, reduceMotion: ReduceMotion.Never };
      scrim.value = withTiming(1, fade);
      ribbon.value = withTiming(1, fade);
      banner.value = withTiming(1, fade);
      finn.value = withTiming(1, fade);
      goalIn.value = withTiming(1, fade);
      // A soft static gold glow at half strength (no rays pasted behind a faded stage).
      gold.value = withTiming(0.5, fade);
      drop.forEach(v => { v.value = withTiming(1, fade); });
      return;
    }
    // 1. gather: the map recedes, the ribbon unfurls from the centre, the plaque stamps, the gold charges.
    scrim.value = withTiming(1, { duration: A.scrimMs, easing: EASE.out });
    ribbon.value = withSequence(withTiming(1.05, { duration: A.ribbonMs, easing: EASE.out }), withSpring(1, SPRING.stamp));
    banner.value = withDelay(A.welcomeAt, withSpring(1, SPRING.stamp));
    gold.value = withSequence(withDelay(120, withTiming(0.32, { duration: A.hitAt - 120, easing: EASE.charge })),
      // 3. burst: the wide fan blooms and keeps a slow turn while the cards land.
      withDelay(A.burstAt - A.hitAt, withTiming(1, { duration: 180, easing: EASE.out })),
      withTiming(A.goldHold, { duration: DURATION.bloom, easing: EASE.out }));
    // 2. hold: one held frame on the landed name, a capped flash, the ribbon squashes like a stamp.
    flash.value = withDelay(A.hitAt, withSequence(
      withTiming(flashTop, { duration: 40 }), withTiming(flashTop, { duration: DURATION.hitStop - 40 }),
      withTiming(0, { duration: DURATION.flash })));
    punch.value = withDelay(A.hitAt, withSequence(withTiming(1, { duration: 50 }),
      withTiming(1, { duration: DURATION.hitStop - 50 }), withSpring(0, SPRING.pop)));
    bloom.value = withDelay(A.burstAt, withSequence(withTiming(1, { duration: 160, easing: EASE.out }),
      withTiming(0, { duration: DURATION.bloom, easing: EASE.out })));
    burst.value = withDelay(A.burstAt, withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear }));
    rain.value = withDelay(A.burstAt, withTiming(1, { duration: A.rainMs, easing: Easing.linear }));
    rain2.value = withDelay(A.confettiSecondAt, withTiming(1, { duration: A.rainMs - 300, easing: Easing.linear }));
    // 4. settle: Finn pops up and waves, the three cards land one by one and each catches a shine.
    finn.value = withDelay(A.finnAt, withSpring(1, SPRING.pop));
    if (!repeat && !replay) wave.value = withDelay(A.finnAt + 240, withSequence(
      withTiming(1, { duration: 170 }), withTiming(-0.4, { duration: 170 }),
      withTiming(1, { duration: 170 }), withSpring(0, SPRING.settle)));
    drop.forEach((v, i) => {
      const at = A.cardsAt + i * A.cardStepMs;
      v.value = withDelay(at, withSpring(1, SPRING.land));
      shine[i].value = withDelay(at + A.shineAfterMs, withTiming(1, { duration: A.shineMs, easing: EASE.inOut }));
    });
    // The micro-beat while the kid looks: Finn points at today's limited coin and it flips once; the Daily 3 stamps in.
    point.value = withDelay(A.pointAt, withSequence(withSpring(1, SPRING.stamp), withDelay(520, withSpring(0, SPRING.settle))));
    flip.value = withDelay(A.pointAt + 120, withTiming(1, { duration: A.flipMs, easing: EASE.inOut }));
    goalIn.value = withDelay(A.goalAt, withSpring(1, SPRING.stamp));
  };

  const armed = useRef(false);
  const tryStart = () => {
    if (!laidOut.current || !artReady.current || armed.current || phase.current !== 'arming') return;
    armed.current = true;
    // A few frames after layout (drawn at 1%, so every layer is decoded and rasterized), the first visible
    // frame is the first frame of the moment.
    timers.current.push(setTimeout(() => requestAnimationFrame(() => go()), A.armMs));
  };

  useEffect(() => {
    // The art is preloaded while the arrival waits its turn (useParkArrival); never hold the moment on a slow decode.
    timers.current.push(setTimeout(() => { artReady.current = true; tryStart(); }, A.artWaitMs));
    warmArrivalArt();
    return () => {
      timers.current.forEach(clearTimeout); timers.current = [];
      [shown, clock, scrim, ribbon, punch, banner, gold, bloom, flash, burst, rain, rain2, finn, wave, point, flip, goalIn, leave,
        ...fly, ...drop, ...shine, ...ping].forEach(v => cancelAnimation(v));
    };
    // The moment plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Where each card goes: the limited coin (and the newest coin) to its spot on the map, the rest to the stack button.
  useEffect(() => {
    let active = true;
    const project = projector?.current;
    void (async () => {
      const origin = await new Promise<Point | null>(resolve => {
        if (!rootRef.current) { resolve(null); return; }
        rootRef.current.measureInWindow((x, y) => resolve(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null));
      });
      const points = await Promise.all(cards.map(async card => {
        const lat = card.kind === 'limited' || card.kind === 'new' ? card.latitude : null;
        const lng = card.kind === 'limited' || card.kind === 'new' ? card.longitude : null;
        if (!project || !origin || lat === null || lng === null) return null;
        const at = await project(lat, lng).catch(() => null);
        if (!at) return null;
        const local = { x: at.x - origin.x, y: at.y - origin.y };
        // Only a coin that is actually on screen (below the HUD row) gets a flight; otherwise the card folds into the HUD.
        return local.x > 24 && local.x < width - 24 && local.y > HUD_TOP + HUD_ROW_HEIGHT + 40 && local.y < height - 170 ? local : null;
      }));
      if (active) targets.value = points;
    })();
    return () => { active = false; };
  }, [cards, projector, width, height]);

  const onTap = () => {
    // A kid mashing in still sees the name land; after that any tap hands off.
    if (phase.current !== 'in' || Date.now() - startedAt.current < A.minTapAt) return;
    startLeave();
  };

  const rootStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.max(0.01, A.scrimOpacity * scrim.value) * (1 - leave.value) }));
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
  const ribbonStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: Math.max(0.001, ribbon.value) * (1 + SLAM_SQUASH * punch.value) },
      { scaleY: (0.6 + 0.4 * Math.min(1, ribbon.value)) * (1 - SLAM_SQUASH * punch.value) },
    ],
  }));
  const bannerStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, banner.value * 1.5),
    transform: [{ scale: reduced ? 1 : 1.6 - 0.6 * banner.value }],
  }));
  const finnStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0.01, Math.min(1, finn.value * 2)),
    transform: [
      { translateX: -14 * point.value },
      { translateY: 46 * (1 - finn.value) + 55 },
      { rotate: `${wave.value * 12 - point.value * 16}deg` },
      { translateY: -55 },
      { scale: 0.4 + 0.6 * finn.value },
    ],
  }));

  return (
    <Animated.View ref={rootRef} collapsable={false} style={[StyleSheet.absoluteFill, rootStyle]} pointerEvents="box-none">
      {/* Plain view (never an animated one) tells us the stage has laid out. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={() => { laidOut.current = true; tryStart(); }} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap} accessibilityRole="button"
        accessibilityLabel={`Welcome to ${parkName}! Tap to see today on the map.`}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          <LinearGradient colors={SCRIM} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Pressable>
      <Animated.View pointerEvents="none" style={[styles.stage, { top: ribbonCenterY - 150, height: 300 }, stageStyle]}>
        {/* Reduce Motion: a soft static glow only (rays pasted behind a faded stage looked stuck on). */}
        {!reduced && <GoldBurst size={Math.min(width * 1.85, 760)} amount={gold} bloom={bloom} reduced={reduced} style={styles.absCenter} />}
        <CoreBloom gold={gold} bloom={bloom} width={ribbonWidth} />
        <RadialFlash flash={flash} size={300} />
        {/* Finn peeks over the ribbon's right end (drawn behind it, so the ribbon holds him up). */}
        <Animated.View style={[styles.finn, { right: Math.max(2, (width - ribbonWidth) / 2 - 6) }, finnStyle]}>
          <Image source={FINN_ART[pose % FINN_ART.length]} style={{ width: 100, height: 125 }} contentFit="contain" transition={0} />
        </Animated.View>
        {/* The scale runs on a plain wrapper: iOS left the plaque's fill behind at its start size when the
            bordered view itself was scaled. */}
        <Animated.View style={[styles.welcomeSlot, bannerStyle]}>
          <View style={styles.welcome}>
            <Text style={styles.welcomeText} allowFontScaling={false}>WELCOME TO</Text>
          </View>
        </Animated.View>
        <Animated.View style={[{ width: ribbonWidth, height: ribbonWidth / 3.92 }, ribbonStyle]}>
          <Image source={ARRIVAL_ART.ribbon} style={StyleSheet.absoluteFill} contentFit="contain" transition={0}
            onLoad={() => { artReady.current = true; tryStart(); }} onError={() => { artReady.current = true; tryStart(); }} />
          <View style={styles.titleRow}>
            {title.split('').map((char, i) => (
              <StampLetter key={`${i}-${char}`} char={char} size={titleSize} at={delays[i] ?? 0} clock={clock} reduced={reduced} />
            ))}
          </View>
        </Animated.View>
      </Animated.View>
      {!reduced && !(__DEV__ && (globalThis as { __tpsNoFxCanvas?: boolean }).__tpsNoFxCanvas) && <ArrivalFxCanvas width={width} height={height} top={fxTop} rain={rain} rain2={rain2}
        pieces={pieces} pieces2={pieces2} burst={burst} sparkles={sparkles}
        burstAt={{ x: width / 2, y: ribbonCenterY }} burstRadius={190}
        fly={fly} targets={targets} froms={froms} stack={{ x: stackX, y: stackY }} />}
      <View pointerEvents="none" style={[styles.cards, { top: cardsTop }]}>
        {cards.map((card, i) => (
          <TodayCard key={card.kind} card={card} index={i} width={cardWidth} drop={drop[i]} fly={fly[i]} leave={leave}
            shine={shine[i]} flip={card.kind === 'limited' ? flip : undefined}
            fromX={froms[i]?.x ?? width / 2} fromY={froms[i]?.y ?? cardsTop + 80}
            targets={targets} stackX={stackX} stackY={stackY} reduced={reduced} />
        ))}
      </View>
      {goal && <GoalStrip goal={goal} progress={goalIn} leave={leave} top={cardsTop + 172} />}
      {!reduced && cards.map((card, i) => (
        <CoinPing key={`ping-${card.kind}`} index={i} targets={targets} stackX={stackX} stackY={stackY} progress={ping[i]} />
      ))}
    </Animated.View>
  );
}

const SCRIM = ['rgba(28,128,222,0.95)', 'rgba(120,196,255,0.8)', 'rgba(28,128,222,0.95)'] as const;

/** A white-hot glow behind the ribbon's middle: the name sits in the brightest spot on the screen. */
function CoreBloom({ gold, bloom, width }: { readonly gold: SharedValue<number>; readonly bloom: SharedValue<number>; readonly width: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, 0.55 * gold.value + 0.5 * bloom.value),
    transform: [{ scaleX: 0.7 + 0.3 * gold.value + 0.2 * bloom.value }, { scaleY: 0.6 + 0.25 * gold.value + 0.3 * bloom.value }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.absCenter, { width: width * 1.1, height: width * 0.62 }, style]}>
    <Image source={ARRIVAL_ART.soft} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor="#fffbe8" />
  </Animated.View>;
}

/**
 * One letter of the park name: slams down from 1.7x with a little squash on impact, read straight off the
 * stage's UI clock (no React re-render to start it, no per-letter timers). Two text layers: a navy body
 * offset down for depth, and the white face with a navy edge.
 */
const StampLetter = memo(function StampLetter({ char, size, at, clock, reduced }: {
  readonly char: string; readonly size: number; readonly at: number; readonly clock: SharedValue<number>; readonly reduced: boolean;
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) return { opacity: clock.value >= 0 ? 1 : 0 };
    const ms = clock.value - at;
    if (ms <= 0) return { opacity: 0, transform: [{ scale: 1.7 }] };
    const slam = Math.min(1, ms / DURATION.slam);
    const p = slam * slam; // eased in: it speeds up into the ribbon
    const after = ms - DURATION.slam;
    // A damped squash after impact (SPRING.stamp feel): out, back past zero, settle.
    const squash = after <= 0 ? 0 : Math.exp(-after / 70) * Math.cos(after / 34);
    return {
      opacity: Math.min(1, p * 3),
      transform: [
        { scale: 1.7 - 0.7 * p },
        { scaleX: 1 + SLAM_SQUASH * squash },
        { scaleY: 1 - SLAM_SQUASH * squash },
      ],
    };
  });
  if (char === ' ') return <View style={{ width: size * 0.32 }} />;
  const text = { fontSize: size, lineHeight: size * 1.15 };
  return (
    <Animated.View style={style}>
      <Text allowFontScaling={false} style={[styles.letter, styles.letterInk, text]}>{char}</Text>
      <Text allowFontScaling={false} style={[styles.letter, styles.letterFace, text]}>{char}</Text>
    </Animated.View>
  );
});

/** A today card: drops in on SPRING.land, catches a shine, then flies to where it lives. */
const TodayCard = memo(function TodayCard({ card, index, width, drop, fly, leave, shine, flip, fromX, fromY, targets, stackX, stackY, reduced }: {
  readonly card: ArrivalCard; readonly index: number; readonly width: number;
  readonly drop: SharedValue<number>; readonly fly: SharedValue<number>; readonly leave: SharedValue<number>;
  readonly shine: SharedValue<number>; readonly flip?: SharedValue<number>;
  readonly fromX: number; readonly fromY: number;
  readonly targets: SharedValue<(Point | null)[]>; readonly stackX: number; readonly stackY: number;
  readonly reduced: boolean;
}) {
  const style = useAnimatedStyle(() => {
    if (reduced) return { opacity: Math.min(drop.value, 1 - leave.value) };
    const target = targets.value[index] ?? null;
    const toCoin = target !== null;
    const to = target ?? { x: stackX, y: stackY };
    const f = fly.value;
    // One arc home (flyPoint, shared with the gold trail): bound for the HUD it swings right and climbs the
    // right edge (never across Ride Control or Adventure); bound for a coin it lobs up and drops onto it.
    const at = flyPoint(fromX, fromY, to.x, to.y, toCoin, f);
    // A little anticipation: the card lifts and leans back before it goes.
    const lift = f > 0 && f < 0.12 ? Math.sin((f / 0.12) * Math.PI) * 6 : 0;
    return {
      // Never exactly 0 before it drops (a hair of opacity keeps its art decoded and ready).
      opacity: Math.max(f > 0 ? 0 : 0.01, Math.min(1, drop.value * 2) * (f < 0.86 ? 1 : (1 - f) / 0.14)),
      transform: [
        { translateX: at.x - fromX },
        { translateY: -ARRIVAL.cardDrop * (1 - drop.value) + at.y - fromY - lift },
        { rotate: `${(index - 1) * 3 * (1 - f) + (toCoin ? -8 * Math.sin(f * Math.PI) : 18 * f)}deg` },
        { scale: (0.9 + 0.1 * Math.min(1, drop.value)) * (1 - (toCoin ? 0.62 : 0.66) * f) },
      ],
    };
  });
  const shineStyle = useAnimatedStyle(() => {
    const t = shine.value;
    return { opacity: t <= 0 || t >= 1 ? 0 : 1, transform: [{ translateX: -width * 0.5 + width * 1.6 * t }, { rotate: '18deg' }] };
  });
  return (
    <Animated.View style={[styles.cardSlot, { width }, style]}>
      {card.kind === 'limited' && <Image source={ARRIVAL_ART.soft} style={styles.cardGlow} contentFit="fill" transition={0} tintColor={GOLD_FX.glow} />}
      <View style={styles.cardShadow} />
      <View style={[styles.card, card.kind === 'limited' && styles.cardGold]}>
        <CardFace card={card} flip={flip} shine={shine} />
        <View pointerEvents="none" style={styles.cardClip}>
          <Animated.View style={[styles.cardShine, { width: width * 0.4 }, shineStyle]}>
            <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      </View>
      {/* Tags sit outside the clipped card so they can hang over its top edge. */}
      <CardTag card={card} />
    </Animated.View>
  );
});

/** Picture tags: a gold star for today's special coin (never a word that reads like a countdown), a NEW tag, a magnifier for coins to find. */
function CardTag({ card }: { readonly card: ArrivalCard }) {
  if (card.kind === 'limited') return <View style={[styles.tag, styles.tagStar]}><GameIcon name="star" size={18} /><GameIcon name="sparkle" size={14} /></View>;
  if (card.kind === 'boss') return <View style={[styles.tag, styles.tagBlue]}><Text style={[styles.tagText, styles.tagTextLight]} allowFontScaling={false}>BOSS</Text></View>;
  if (card.kind === 'new') return <View style={[styles.tag, styles.tagNew]}><Text style={styles.tagText} allowFontScaling={false}>NEW</Text></View>;
  return <View style={[styles.tag, styles.tagBlue]}><GameIcon name="search" size={16} /></View>;
}

/**
 * The boss time as a picture: a clock face with the hands at the park's time (a kid matches it to any
 * clock), a sun or a moon for day or night, and the time in small print for the grown-up.
 */
function BossClock({ card }: { readonly card: Extract<ArrivalCard, { kind: 'boss' }> }) {
  const hands = card.at ? bossClockHands(card.at) : null;
  return <View style={styles.bossArt}>
    <Image source={ARRIVAL_ART.boss} style={styles.bossKraken} contentFit="contain" transition={0} />
    {hands && <View style={styles.clock} accessible accessibilityLabel={`Boss at ${card.time}`}>
      {[0, 90, 180, 270].map(deg => <View key={deg} style={[styles.clockTick, { transform: [{ rotate: `${deg}deg` }, { translateY: -15 }] }]} />)}
      <View style={[styles.hand, styles.hourHand, { transform: [{ rotate: `${hands.hour}deg` }, { translateY: -5 }] }]} />
      <View style={[styles.hand, styles.minuteHand, { transform: [{ rotate: `${hands.minute}deg` }, { translateY: -7.5 }] }]} />
      <View style={styles.clockHub} />
      {hands.night && <View style={styles.clockSky}><GameIcon name="moon" size={13} /></View>}
    </View>}
  </View>;
}

function CardFace({ card, flip, shine }: { readonly card: ArrivalCard; readonly flip?: SharedValue<number>; readonly shine: SharedValue<number> }) {
  if (card.kind === 'limited') {
    return <>
      <SpinningCoin flip={flip} shine={shine} />
      <Text style={styles.cardName} numberOfLines={2} allowFontScaling={false}>{card.name}</Text>
    </>;
  }
  if (card.kind === 'boss') {
    return <>
      <BossClock card={card} />
      <Text style={styles.cardSmall} numberOfLines={1} adjustsFontSizeToFit allowFontScaling={false}>{card.time}</Text>
    </>;
  }
  if (card.kind === 'new') {
    return <>
      <View style={styles.art}>
        <Image source={ARRIVAL_ART.mapCoin} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
        <Image source={ARRIVAL_ART.sparkle} style={styles.newSpark} contentFit="contain" transition={0} />
      </View>
      <Text style={styles.cardBig} allowFontScaling={false}>{card.count}</Text>
    </>;
  }
  // Coins still to find here: empty coin spots (round, dashed, full coin shape) and a "?" coin in front;
  // never the wallet's coin stack (that reads as a reward). The count sits in a gold pill.
  return <>
    <View style={styles.art}>
      <View style={[styles.slotGhost, styles.ghostBack]} />
      <View style={[styles.slotGhost, styles.ghostMid]} />
      <View style={[styles.ghost, styles.ghostFront]}>
        <Image source={ARRIVAL_ART.mapCoin} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
        <View style={styles.askDisc}><Text style={styles.ask} allowFontScaling={false}>?</Text></View>
      </View>
    </View>
    <View style={styles.countPill}><Text style={styles.countPillText} allowFontScaling={false}>{card.count}</Text></View>
  </>;
}

/** Today's Daily 3 under the cards: a flame (with the streak) and three pips, gold when done. Pictures only. */
const GoalStrip = memo(function GoalStrip({ goal, progress, leave, top }: {
  readonly goal: ArrivalGoal; readonly progress: SharedValue<number>; readonly leave: SharedValue<number>; readonly top: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 2) * (1 - leave.value),
    transform: [{ scale: 1.6 - 0.6 * progress.value }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.goalWrap, { top }, style]}
    accessible accessibilityLabel={`Daily 3: ${goal.done} of ${goal.total} done today`}>
    <View style={styles.goal}>
      <GameIcon name="streak" size={26} />
      {goal.streak > 0 && <Text style={styles.goalStreak} allowFontScaling={false}>{goal.streak}</Text>}
      <View style={styles.pips}>
        {Array.from({ length: goal.total }, (_, i) => <View key={i} style={[styles.pip, i < goal.done && styles.pipDone]} />)}
      </View>
    </View>
  </Animated.View>;
});

const PING_MS = 520;

/**
 * Where a card lands: on a map coin, two gold rings spread and a small gold coin hops out ("it is here");
 * on the stack button, a gold disc bumps to HUD_BUMP.peak behind two rings (the button catches it).
 */
const CoinPing = memo(function CoinPing({ index, targets, stackX, stackY, progress }: {
  readonly index: number; readonly targets: SharedValue<(Point | null)[]>; readonly stackX: number; readonly stackY: number;
  readonly progress: SharedValue<number>;
}) {
  const place = useAnimatedStyle(() => {
    const at = targets.value[index] ?? { x: stackX, y: stackY };
    return { transform: [{ translateX: at.x - 40 }, { translateY: at.y - 40 }] };
  });
  const outer = useAnimatedStyle(() => {
    const t = progress.value;
    const coin = targets.value[index] !== null && targets.value[index] !== undefined;
    return { opacity: t <= 0 || t >= 1 ? 0 : 1 - t, transform: [{ scale: 0.4 + (coin ? 1.6 : 1.1) * t }] };
  });
  const inner = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (progress.value - 0.18) / 0.82));
    return { opacity: t <= 0 || t >= 1 ? 0 : 0.9 * (1 - t), transform: [{ scale: 0.3 + 1.1 * t }] };
  });
  // On the stack button: a gold disc bumps to HUD_BUMP.peak behind the rings (the button catches the card).
  const catcher = useAnimatedStyle(() => {
    const t = progress.value;
    const coin = targets.value[index] !== null && targets.value[index] !== undefined;
    if (coin || t <= 0 || t >= 1) return { opacity: 0 };
    const bump = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
    return { opacity: 0.6 * bump, transform: [{ scale: 1 + (HUD_BUMP.peak - 1) * bump }] };
  });
  // On a map coin: a small gold coin hops out of it ("it is here").
  const hop = useAnimatedStyle(() => {
    const t = progress.value;
    const coin = targets.value[index] !== null && targets.value[index] !== undefined;
    if (!coin || t <= 0 || t >= 1) return { opacity: 0 };
    return { opacity: t < 0.7 ? 1 : (1 - t) / 0.3, transform: [{ translateY: -26 * Math.sin(t * Math.PI) }, { scale: 0.6 + 0.5 * Math.sin(t * Math.PI) }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.pingBox, place]}>
    <Animated.View style={[styles.catcher, catcher]} />
    <Animated.View style={[styles.ring, outer]} />
    <Animated.View style={[styles.ring, styles.ringWhite, inner]} />
    <Animated.View style={[styles.hop, hop]}>
      <Image source={ARRIVAL_ART.goldCoin} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    </Animated.View>
  </Animated.View>;
});

/**
 * Today's limited coin turning slowly (a Y-spin, one turn per 4 s) while ambient motion may run; on the
 * micro-beat it hops and flips once while Finn points at it, and a shine crosses its face as the card lands.
 */
function SpinningCoin({ flip, shine }: { readonly flip?: SharedValue<number>; readonly shine: SharedValue<number> }) {
  const turn = useSharedValue(0);
  useAmbientLoop(
    () => { turn.value = 0; turn.value = withRepeat(withTiming(1, { duration: ARRIVAL.coinTurnMs, easing: Easing.linear }), -1, false); },
    () => { cancelAnimation(turn); turn.value = 0; },
  );
  const style = useAnimatedStyle(() => {
    const c = Math.cos((turn.value + (flip ? flip.value : 0)) * Math.PI * 2);
    const hop = flip ? Math.sin(Math.min(1, flip.value) * Math.PI) : 0;
    // Never fully edge-on: a coin always reads as a coin.
    return { transform: [{ translateY: -10 * hop }, { scale: 1 + 0.12 * hop }, { scaleX: Math.sign(c || 1) * Math.max(0.14, Math.abs(c)) }] };
  });
  return <Animated.View style={[styles.art, styles.coinArt, style]}>
    <Image source={ARRIVAL_ART.goldCoin} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    <ShineSweep progress={shine} size={64} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  pingBox: { position: 'absolute', left: 0, top: 0, width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: GOLD_FX.rays },
  ringWhite: { borderWidth: 3, borderColor: BRAND.white },
  catcher: { position: 'absolute', width: 58, height: 58, borderRadius: 18, backgroundColor: GOLD_FX.raysSoft },
  hop: { width: 34, height: 34 },
  stage: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  absCenter: { position: 'absolute' },
  origin: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  welcomeSlot: { alignItems: 'center', marginBottom: -6, zIndex: 2 },
  welcome: { backgroundColor: BRAND.navy, borderRadius: 14, borderWidth: 3, borderColor: BRAND.white,
    paddingHorizontal: 14, paddingVertical: 3 },
  welcomeText: { fontFamily: 'Shark', fontSize: 17, letterSpacing: 1.5, color: BRAND.gold },
  titleRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingBottom: '3%' },
  letter: { fontFamily: 'Shark', textAlign: 'center' },
  letterInk: { position: 'absolute', left: 0, right: 0, top: 3, color: BRAND.navy,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
  letterFace: { color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 2.5 },
  finn: { position: 'absolute', top: 150 - 125 + 4 },
  cards: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  cardSlot: { alignItems: 'center' },
  card: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 18, borderWidth: 3, borderColor: BRAND.white,
    paddingTop: 16, paddingBottom: 10, paddingHorizontal: 6, minHeight: 148 },
  // A hard sticker shadow (no blurred shadow on a moving card: cheap for the GPU, and it reads hand-drawn).
  cardShadow: { position: 'absolute', left: 2, right: -2, top: 6, bottom: -6, borderRadius: 18, backgroundColor: 'rgba(5,52,110,0.3)' },
  cardGlow: { position: 'absolute', left: -26, right: -26, top: -26, bottom: -26 },
  cardGold: { borderColor: BRAND.gold, borderWidth: 4, backgroundColor: '#fff6d6' },
  cardClip: { ...StyleSheet.absoluteFillObject, borderRadius: 15, overflow: 'hidden' },
  cardShine: { position: 'absolute', top: -30, bottom: -30 },
  tag: { position: 'absolute', top: -12, alignSelf: 'center', backgroundColor: BRAND.gold, borderRadius: 10,
    borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 8, paddingVertical: 1, minHeight: 22, justifyContent: 'center' },
  tagBlue: { backgroundColor: BRAND.blueBright, borderColor: BRAND.white },
  tagNew: { backgroundColor: BRAND.white, borderColor: BRAND.blueBright },
  tagText: { fontFamily: 'Shark', fontSize: 12, letterSpacing: 0.8, color: BRAND.navy },
  tagStar: { flexDirection: 'row', alignItems: 'center', gap: 1, paddingHorizontal: 6 },
  bossArt: { width: 72, height: 64, marginTop: 4 },
  bossKraken: { position: 'absolute', left: -2, top: 0, width: 52, height: 52 },
  clock: { position: 'absolute', right: -4, bottom: -2, width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND.white,
    borderWidth: 3, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  clockTick: { position: 'absolute', width: 2, height: 4, borderRadius: 1, backgroundColor: BRAND.navy },
  hand: { position: 'absolute', borderRadius: 2, backgroundColor: BRAND.navy },
  hourHand: { width: 3.5, height: 10 },
  minuteHand: { width: 2.5, height: 15 },
  clockHub: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.gold },
  clockSky: { position: 'absolute', top: -10, right: -10 },
  cardSmall: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy, marginTop: 6 },
  slotGhost: { position: 'absolute', width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, borderStyle: 'dashed',
    borderColor: BRAND.blueBright, backgroundColor: 'rgba(120,196,255,0.18)' },
  askDisc: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: BRAND.white,
    borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  countPill: { marginTop: 6, minWidth: 44, paddingHorizontal: 10, borderRadius: 12, backgroundColor: BRAND.gold,
    borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center' },
  countPillText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  tagTextLight: { color: BRAND.white },
  art: { width: 64, height: 64, marginTop: 4 },
  coinArt: { alignItems: 'center', justifyContent: 'center' },
  newSpark: { position: 'absolute', right: -8, top: -6, width: 26, height: 26 },
  ghost: { position: 'absolute', width: 44, height: 44 },
  ghostBack: { left: -6, top: 2 },
  ghostMid: { right: -6, top: 2 },
  ghostFront: { left: 10, top: 16, alignItems: 'center', justifyContent: 'center' },
  ask: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy, marginTop: 1 },
  cardBig: { fontFamily: 'Shark', fontSize: 26, color: BRAND.navy, marginTop: 4 },
  cardName: { fontFamily: 'Knockout', fontSize: 13, lineHeight: 15, color: BRAND.navy, textAlign: 'center', marginTop: 6 },
  goalWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.blue, borderRadius: 18, borderWidth: 3,
    borderColor: BRAND.white, paddingHorizontal: 12, paddingVertical: 5, borderBottomWidth: 5, borderBottomColor: BRAND.navy },
  goalStreak: { fontFamily: 'Shark', fontSize: 18, color: BRAND.gold, marginRight: 4 },
  pips: { flexDirection: 'row', gap: 6 },
  pip: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: BRAND.white, backgroundColor: 'rgba(255,255,255,0.18)' },
  pipDone: { backgroundColor: BRAND.gold },
});

export default memo(ParkArrivalMoment);
