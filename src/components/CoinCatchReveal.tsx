import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { playSfx } from '../gamekit/SFX';
import { LinearGradient } from 'expo-linear-gradient';
import { GatherRings, GoldBurst, RadialFlash, ShineSweep, SparkleBurst } from '../ui/GoldBurst';
import { DURATION, EASE, GOLD_FX, PARTICLES, SPRING, flashPeak, momentBeats, momentParticles, windupWobble } from '../ui/motionEasing';
import { isDimFlashingLightsEnabled } from '../../modules/flash-safety';
import StrokedText from './StrokedText';
import GameIcon from '../ui/GameIcon';
import { usePowerBudget } from '../power';

/**
 * The ride-coin "catch" beat that plays before the rewards summary, shaped like a
 * classic catch game: anticipation (coin flips in and wobbles with rising haptics),
 * a hit-stop flash, a burst (pop, rays, confetti, success haptic), then the coin
 * flies into the summary's hero slot (`handoff`), one shared-element move, or
 * lifts away when no slot is known. A tap during the anticipation jumps straight
 * to the burst (the payoff is never skipped); a tap after it continues.
 * Reduced motion shows the caught coin still, with the same feedback.
 *
 * Timings come from the shared motion language (ui/motion.ts, momentBeats
 * 'coinReveal'): the gold glow gathers behind the coin while it wobbles, a
 * 70 ms hit-stop flash, then the gold rays bloom, sparkles fly, a shine sweeps
 * the coin and the title stamps in. Sound, haptic and visual fire on one frame.
 */
/** Where the summary's hero coin sits, in window coordinates. */
export interface CatchHandoff { readonly x: number; readonly y: number; readonly size: number }

export default function CoinCatchReveal({
  coinUrl,
  rideName,
  isNewCoin,
  ready = true,
  handoff = null,
  onBurst,
  onExit,
  onDone,
}: {
  /** The summary hero slot the coin lands in (shared element). */
  readonly handoff?: CatchHandoff | null;
  readonly coinUrl?: string;
  readonly rideName: string;
  readonly isNewCoin: boolean;
  /** Hold the sequence until the parent's heavy next screen has mounted. */
  readonly ready?: boolean;
  /** Fires at the burst. */
  readonly onBurst?: () => void;
  /** Fires when the coin starts leaving for the summary, so the summary fades in under it (no empty frame between). */
  readonly onExit?: () => void;
  readonly onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finished = useRef(false);
  const [burst, setBurst] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const callbacks = useRef({ onDone, onBurst, onExit });
  callbacks.current = { onDone, onBurst, onExit };
  const handoffRef = useRef<CatchHandoff | null>(handoff);
  handoffRef.current = handoff;
  const origin = useRef({ x: 0, y: 0 });
  const rootRef = useRef<View>(null);
  const phase = useRef<'idle' | 'anticipation' | 'burst' | 'exit'>('idle');
  const fastForwardRef = useRef<(() => void) | null>(null);
  const shiftX = useSharedValue(0);
  const exitScale = useSharedValue(1);

  const flip = useSharedValue(0); // 0 edge-on → 1 face-on
  const scale = useSharedValue(0.35);
  const wobble = useSharedValue(0); // degrees
  const lift = useSharedValue(0); // exit translateY
  const flash = useSharedValue(0);
  const rays = useSharedValue(0);
  const title = useSharedValue(0);
  const backdrop = useSharedValue(0);
  const coinOpacity = useSharedValue(1);
  const confetti = useSharedValue(0);
  const bloom = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const shine = useSharedValue(0);
  // The wind-up (0 to 1, linear): the wobble grows bigger and faster from it, and gold rings tighten onto the coin.
  const windup = useSharedValue(0);
  const rings = useSharedValue(0);
  const tapCue = useSharedValue(0);
  // 0 to 1: the title fades and lifts out just before the coin leaves, so it never stacks on the summary's text.
  const titleOut = useSharedValue(0);
  const budget = usePowerBudget();
  const [reducedFx, setReducedFx] = useState(false);

  const stopVisuals = () => {
    [flip, scale, wobble, lift, flash, rays, title, backdrop, coinOpacity, confetti, shiftX, exitScale, bloom, sparkle, shine, windup, rings, tapCue, titleOut]
      .forEach(value => cancelAnimation(value));
  };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    clearTimers();
    stopVisuals();
    callbacks.current.onDone();
  };

  const at = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  useEffect(() => {
    if (!ready || finished.current) return undefined;
    let cancelled = false;
    let preferenceChanged = false;
    let feedbackPlayed = false;
    let started = false;
    const success = () => {
      if (feedbackPlayed) return;
      feedbackPlayed = true;
      callbacks.current.onBurst?.();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      playSfx('win');
    };
    const begin = (reduced: boolean) => {
      if (cancelled || finished.current) return;
      started = true;
      setReducedFx(reduced);
      if (reduced) {
        clearTimers();
        stopVisuals();
        backdrop.value = 1;
        flip.value = 1;
        scale.value = 1;
        wobble.value = 0;
        lift.value = 0;
        coinOpacity.value = 1;
        flash.value = 0;
        // A still gold glow (no turning, no sparkles): the moment still reads as gold.
        rays.value = 1;
        confetti.value = 0;
        title.value = 1;
        setBurst(true);
        success();
        at(1100, finish);
        return;
      }

      // 5. Exit: into the summary's hero slot when it is known, else up and away.
      const exit = () => {
        // The title is already on its way out (scheduled TITLE_OUT_MS before this); a late exit still clears it first.
        if (titleOut.value < 1) titleOut.value = withTiming(1, { duration: 90 });
        callbacks.current.onExit?.();
        cancelAnimation(tapCue); tapCue.value = withTiming(0, { duration: 120 });
        const target = handoffRef.current;
        const coinSize = Math.min(width * 0.52, 240);
        if (target) {
          const centerX = width / 2, centerY = height * 0.42;
          const tx = target.x - origin.current.x + target.size / 2;
          const ty = target.y - origin.current.y + target.size / 2;
          const duration = 420;
          shiftX.value = withTiming(tx - centerX, { duration, easing: Easing.inOut(Easing.cubic) });
          lift.value = withTiming(ty - centerY, { duration, easing: Easing.inOut(Easing.cubic) });
          exitScale.value = withTiming(target.size / coinSize, { duration, easing: Easing.inOut(Easing.cubic) });
          backdrop.value = withTiming(0, { duration: duration + 40 }, ok => { if (ok) runOnJS(finish)(); });
          playSfx('whoosh', 0.5);
          return;
        }
        lift.value = withTiming(-height * 0.34, { duration: 360, easing: Easing.in(Easing.cubic) });
        coinOpacity.value = withDelay(180, withTiming(0, { duration: 180 }));
        backdrop.value = withDelay(160, withTiming(0, { duration: 200 }, ok => { if (ok) runOnJS(finish)(); }));
        playSfx('whoosh', 0.5);
      };

      if (!isNewCoin) {
        // A repeat is a quick deposit: one lift, one tactile beat, no long wobble.
        backdrop.value = withTiming(1, { duration: 100 });
        flip.value = 1; title.value = 1;
        rays.value = withTiming(0.7, { duration: DURATION.quick });
        bloom.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 420, easing: EASE.out }));
        sparkle.value = withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear });
        scale.value = withSequence(withTiming(1.06, { duration: 160 }),
          withTiming(1, { duration: 140 }));
        at(160, () => { setBurst(true); success(); });
        at(600, exit);
        at(1300, finish);
        return;
      }

      // Every visual beat is scheduled up front on the UI thread (withDelay), so
      // a busy JS thread can't stall or skip the animation. Haptics and sound
      // ride JS timers at the same offsets; finish is driven by the last beat.
      const beats = momentBeats('coinReveal', { reduced: false });
      const T = { wobble: 420, burst: beats.burstAt, lift: beats.settledAt + 150, done: beats.settledAt + 510 };
      phase.current = 'anticipation';

      // 1. Anticipation: the coin spins in from edge-on, then winds up: it swells, its wobble grows bigger
      //    and faster, the gold behind it brightens and gold rings close in on it faster and faster, with
      //    each haptic stronger than the last. Every frame looks closer to popping (no "is it stuck" beat).
      playSfx('whoosh', 0.7);
      const windFor = WINDUP_MS;
      flip.value = withTiming(1, { duration: 480, easing: EASE.out });
      scale.value = withSequence(
        withTiming(0.75, { duration: 480, easing: EASE.out }),
        // The wind-up: a strong swell while it wobbles and the gold gathers,
        // then it draws in a little (the squash before the pop) and punches past full size.
        withTiming(0.95, { duration: windFor, easing: EASE.charge }),
        withTiming(0.72, { duration: 240, easing: EASE.in }),
        withTiming(1.28, { duration: 110, easing: Easing.out(Easing.quad) }),
        withSpring(1, SPRING.pop),
      );
      windup.value = withDelay(480, withTiming(1, { duration: windFor, easing: Easing.linear }));
      rings.value = withDelay(480, withSequence(withTiming(3, { duration: windFor, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 0 })));
      [
        [T.wobble, Haptics.ImpactFeedbackStyle.Light],
        [T.wobble + 260, Haptics.ImpactFeedbackStyle.Medium],
        [T.wobble + 520, Haptics.ImpactFeedbackStyle.Heavy],
      ].forEach(([ms, style]) => at(ms as number, () => {
        void Haptics.impactAsync(style as Haptics.ImpactFeedbackStyle).catch(() => undefined);
        playSfx('tick', 0.8);
      }));

      // 2. Hit-stop flash, 3. burst, 4. exit, scheduled relative to `burstAt`.
      const scheduleBurst = (burstAt: number) => {
        // Hit-stop: one held white frame (capped well under the photosensitivity limit).
        flash.value = withDelay(Math.max(0, burstAt - DURATION.hitStop), withSequence(
          withTiming(flashPeak(isDimFlashingLightsEnabled(), false), { duration: 40 }), withTiming(0, { duration: DURATION.flash })));
        // The gold gathers behind the coin while it wobbles (a glow that keeps brightening), then blooms.
        const gatherFrom = T.wobble;
        rays.value = burstAt > gatherFrom + 200
          ? withSequence(withDelay(gatherFrom, withTiming(0.55, { duration: burstAt - gatherFrom, easing: EASE.charge })),
            withTiming(1, { duration: 200, easing: EASE.out }))
          : withDelay(burstAt, withTiming(1, { duration: 200, easing: EASE.out }));
        bloom.value = withDelay(burstAt, withSequence(withTiming(1, { duration: 140, easing: EASE.out }),
          withTiming(0, { duration: DURATION.bloom, easing: EASE.out })));
        sparkle.value = withDelay(burstAt, withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear }));
        shine.value = withDelay(burstAt + 260, withTiming(1, { duration: 620, easing: EASE.inOut }));
        confetti.value = withDelay(burstAt, withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }));
        const exitAt = burstAt + (T.lift - T.burst);
        title.value = withDelay(burstAt + 120, withSpring(1, SPRING.stamp));
        // The title fades and lifts out on the UI clock, finishing before the summary starts fading in under the coin.
        titleOut.value = 0;
        titleOut.value = withDelay(Math.max(0, exitAt - TITLE_OUT_MS), withTiming(1, { duration: TITLE_OUT_MS - 10, easing: EASE.in }));
        at(burstAt, () => {
          phase.current = 'burst';
          setBurst(true);
          success();
          playSfx('coin', 0.9);
        });
        // A big gold "tap" pill pulses in once the coin has landed (a kid who cannot read sees where to tap).
        tapCue.value = withDelay(burstAt + 700, withSequence(withSpring(1, SPRING.stamp),
          withRepeat(withSequence(withTiming(1.07, { duration: 480, easing: EASE.inOut }), withTiming(1, { duration: 480, easing: EASE.inOut })), 4, false)));
        at(exitAt, () => { phase.current = 'exit'; exit(); });
        at(exitAt + (T.done - T.lift) + 400, finish); // safety net if the animation is interrupted
      };

      backdrop.value = withTiming(1, { duration: 180 });
      scheduleBurst(T.burst);
      fastForwardRef.current = () => {
        // A first tap during the anticipation goes straight to the payoff.
        clearTimers();
        [flip, scale, wobble, flash, rays, title, confetti, bloom, sparkle, shine, windup, rings, titleOut].forEach(value => cancelAnimation(value));
        flip.value = 1; wobble.value = 0; windup.value = 0; rings.value = 0;
        scale.value = withSequence(withTiming(1.28, { duration: 90, easing: Easing.out(Easing.quad) }),
          withSpring(1, SPRING.pop));
        scheduleBurst(80);
      };
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      preferenceChanged = true;
      if (reduced || !started) begin(reduced);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!preferenceChanged) begin(reduced);
    }).catch(() => { if (!preferenceChanged) begin(true); });
    return () => {
      cancelled = true;
      subscription.remove();
      clearTimers();
      stopVisuals();
    };
    // Plays once, as soon as the parent is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const coinStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shiftX.value },
      { translateY: lift.value },
      { perspective: 800 },
      { rotateY: `${(1 - flip.value) * 540}deg` },
      { rotateZ: `${wobble.value + windupWobble(windup.value, WINDUP_MS, 3, 15)}deg` },
      { scale: scale.value * exitScale.value },
    ],
    opacity: coinOpacity.value,
  }));
  // The gold fades as the coin lifts away to the summary.
  const raysStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, Math.abs(lift.value) / 140),
  }));
  // The title stamps down: big and light, then lands at full size.
  const titleStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, title.value * 2) * (1 - titleOut.value),
    transform: [{ translateY: -14 * titleOut.value }, { scale: 1.5 - title.value * 0.5 }, { rotate: `${(1 - title.value) * -4}deg` }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const tapStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, tapCue.value * 1.5), transform: [{ scale: 0.6 + 0.4 * tapCue.value }] }));

  const coinSize = Math.min(width * 0.52, 240);

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={() => {
        if (phase.current === 'anticipation' && fastForwardRef.current) {
          const forward = fastForwardRef.current;
          fastForwardRef.current = null;
          forward();
          return;
        }
        finish();
      }}
      ref={rootRef}
      onLayout={() => rootRef.current?.measureInWindow?.((x, y) => {
        if (Number.isFinite(x) && Number.isFinite(y)) origin.current = { x, y };
      })}
      accessibilityRole="button"
      accessibilityLabel={`${isNewCoin ? 'New ride coin' : 'Ride coin'} collected: ${rideName}. Tap to continue.`}
    >
      {/* A clean deep-water stage lit softly where the coin lands. Alex's water world still shows through,
          blurred and faint (its props turn to soft shapes), so the money shot stays in the TPS world. */}
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        {/* Pre-softened once at build time (a small, blurred copy of water_background.png): no runtime blur of a
            1290 x 2790 image on the frame the reveal starts, which stalled the money shot on a busy device. */}
        <Image source={require('../../assets/images/reveal/water-soft.webp')} transition={0}
          contentFit="cover" style={StyleSheet.absoluteFill} />
        <LinearGradient colors={BACKDROP} locations={[0, 0.42, 1]} style={[StyleSheet.absoluteFill, { opacity: WORLD_VEIL }]} />
        <Image source={require('../../assets/images/reveal/soft-spot.webp')} tintColor="#5fb4ff" transition={0} contentFit="fill"
          style={{ position: 'absolute', opacity: 0.45, width: width * 1.5, height: width * 1.5,
            left: -width * 0.25, top: height * 0.42 - width * 0.75 }} />
      </Animated.View>

      <View style={[styles.stage, { top: height * 0.42 - coinSize / 2 }]} pointerEvents="none">
        <Animated.View style={[styles.rays, raysStyle]}>
          <GoldBurst size={coinSize * 2.9} amount={rays} bloom={bloom} reduced={reducedFx} />
        </Animated.View>
        <Animated.View style={[{ width: coinSize, height: coinSize, alignItems: 'center', justifyContent: 'center' }, coinStyle]}>
          {/* The reveal never waits on the network: a brand-new coin's art is often not downloaded yet, so the
              house coin shows from the first frame and the real art fades in over it the moment it arrives. */}
          {coinUrl && !artFailed
            ? <Image source={coinUrl} placeholder={GENERIC_COIN} placeholderContentFit="contain" transition={180}
              cachePolicy="memory-disk" style={{ width: coinSize, height: coinSize }} contentFit="contain" onError={() => setArtFailed(true)} />
            : <Image source={GENERIC_COIN} style={{ width: coinSize, height: coinSize }} contentFit="contain" />}
          {!reducedFx && <ShineSweep progress={shine} size={coinSize * 0.86} />}
        </Animated.View>
        {!reducedFx && <GatherRings progress={rings} size={coinSize * 0.98} count={2} color={GOLD_FX.rays} width={6} />}
        {!reducedFx && <SparkleBurst progress={sparkle} radius={coinSize * 0.95}
          count={momentParticles(PARTICLES.sparkles, budget, reducedFx)} />}
        {/* The hit-stop flash pops on the coin, not over the whole screen. */}
        <RadialFlash flash={flash} size={coinSize * 1.5} />
      </View>

      <Animated.View style={[styles.titleWrap, { top: height * 0.42 + coinSize * 0.62 }, titleStyle]} pointerEvents="none">
        {/* Thick navy outline: the title sits on bright gold rays. */}
        <StrokedText style={styles.kicker} strokeColor="#05346e">{isNewCoin ? 'NEW RIDE COIN!' : 'COIN ADDED!'}</StrokedText>
        <StrokedText style={styles.ride} strokeColor="#05346e" numberOfLines={2}>{rideName}</StrokedText>
      </Animated.View>

      <Confetti progress={confetti} originY={height * 0.42} width={width} spawnRadius={coinSize * CONFETTI_SPAWN} />
      {/* Where to tap, for a kid who cannot read yet: a big gold pill with the check, gently pulsing. */}
      {burst && (
        <Animated.View pointerEvents="none" style={[styles.tapWrap, reducedFx ? null : tapStyle]}>
          {/* The gold lip is its own rounded view under the pill: a pill with a thicker bottom border than its sides
              drew its gold fill as a half ellipse on iOS (navy showed through and "TAP!" was navy on navy). */}
          <View style={styles.tapLip} />
          <View style={styles.tapPill}>
            <GameIcon name="check" size={30} />
            <Text style={styles.tapText}>TAP!</Text>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

/** How far the TAP! pill's gold lip shows under it. */
const TAP_LIP = 5;
const styles = StyleSheet.create({
  stage: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  rays: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  titleWrap: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  kicker: {
    fontFamily: 'Shark', fontSize: 36, color: '#ffd84a', textAlign: 'center',
  },
  ride: {
    fontFamily: 'Shark', fontSize: 26, color: '#ffffff', textAlign: 'center', marginTop: 4,
  },
  tapWrap: { position: 'absolute', bottom: 56, alignSelf: 'center', paddingBottom: TAP_LIP },
  /** The pill's gold lip: the same rounded shape, offset down under it (one uniform border, so iOS fills it whole). */
  tapLip: {
    position: 'absolute', left: 0, right: 0, top: TAP_LIP, bottom: 0, borderRadius: 28, backgroundColor: '#d99a00',
    borderWidth: 3, borderColor: '#ffffff',
  },
  tapPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 56, paddingHorizontal: 26, borderRadius: 28, backgroundColor: '#ffcf3b',
    borderWidth: 3, borderColor: '#ffffff',
  },
  tapText: { fontFamily: 'Shark', fontSize: 26, color: '#05346e', paddingTop: 3 },
});

/** The title leaves this long before the coin starts its trip to the summary (fade and lift on the UI clock). */
const TITLE_OUT_MS = 130;
const GENERIC_COIN = require('../../assets/icons/game/coin.png');
/** The wind-up between the coin's flip-in (480 ms) and the squash before the pop (240 ms). */
const WINDUP_MS = Math.max(1, momentBeats('coinReveal', { reduced: false }).burstAt - 480 - 240);
const BACKDROP = ['#0d5bb0', '#08408c', '#042a62'] as const;
/** How much of the deep-water gradient covers the blurred world art: the water tint shows through, its props (a window grid, the chest, a laurel) no longer read as shapes. */
const WORLD_VEIL = 0.9;
/** Confetti spawn radius in coin sizes: past the rim at the 1.28x punch (0.64), so the coin face stays clear. */
const CONFETTI_SPAWN = 0.7;

/** Blue, white and gold only (the house palette). */
const CONFETTI_COLORS = ['#ffcf3b', '#ffffff', '#38bdf8', '#f5b301', '#ffe27a'];
const PIECES = Array.from({ length: 28 }, (_, i) => {
  const angle = (i / 28) * Math.PI * 2 + (i % 3) * 0.21;
  const speed = 150 + ((i * 53) % 110);
  return {
    ux: Math.cos(angle),
    uy: Math.sin(angle),
    dx: Math.cos(angle) * speed,
    dy: Math.sin(angle) * speed - 60,
    spin: ((i * 97) % 540) - 270,
    size: 7 + (i % 4) * 3,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: i % 3 === 0,
  };
});

/** One shared progress value drives every piece on the UI thread: no per-burst
 *  data crosses from JS, so the burst can't stall the reveal. */
function Confetti({ progress, originY, width, spawnRadius }: {
  readonly progress: SharedValue<number>;
  readonly originY: number;
  readonly width: number;
  /** Pieces start out past the coin's rim (even at its 1.28x punch), so no clump ever sits on the coin face. */
  readonly spawnRadius: number;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PIECES.map((p, i) => <ConfettiPiece key={i} piece={p} progress={progress} x={width / 2} y={originY} r0={spawnRadius} />)}
    </View>
  );
}

function ConfettiPiece({ piece, progress, x, y, r0 }: {
  readonly piece: typeof PIECES[number];
  readonly progress: SharedValue<number>;
  readonly x: number;
  readonly y: number;
  readonly r0: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    // Fades in over the first few frames as it flies off the rim, then fades out as it falls.
    const fadeIn = Math.min(1, t / 0.05);
    return {
      opacity: t === 0 ? 0 : fadeIn * (1 - t * t),
      transform: [
        { translateX: x + piece.ux * r0 + piece.dx * t },
        { translateY: y + piece.uy * r0 + piece.dy * t + 260 * t * t }, // gravity
        { rotate: `${piece.spin * t}deg` },
        { scale: 1 - t * 0.35 },
      ],
    };
  });
  return (
    <Animated.View style={[{
      position: 'absolute', left: -piece.size / 2, top: -piece.size / 2,
      width: piece.size, height: piece.round ? piece.size : piece.size * 0.55,
      borderRadius: piece.round ? piece.size / 2 : 2, backgroundColor: piece.color,
    }, style]} />
  );
}
