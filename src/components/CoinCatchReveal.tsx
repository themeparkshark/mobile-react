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
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { playSfx } from '../gamekit/SFX';
import { LinearGradient } from 'expo-linear-gradient';
import { GoldBurst, RadialFlash, ShineSweep, SparkleBurst } from '../ui/GoldBurst';
import { DURATION, EASE, PARTICLES, SPRING, flashPeak, momentBeats, momentParticles } from '../ui/motionEasing';
import { isDimFlashingLightsEnabled } from '../../modules/flash-safety';
import StrokedText from './StrokedText';
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
  readonly onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finished = useRef(false);
  const [burst, setBurst] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const callbacks = useRef({ onDone, onBurst });
  callbacks.current = { onDone, onBurst };
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
  const budget = usePowerBudget();
  const [reducedFx, setReducedFx] = useState(false);

  const stopVisuals = () => {
    [flip, scale, wobble, lift, flash, rays, title, backdrop, coinOpacity, confetti, shiftX, exitScale, bloom, sparkle, shine]
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

      // 1. Anticipation: the coin spins in from edge-on, then wobbles three
      //    times with each wobble's haptic stronger than the last.
      playSfx('whoosh', 0.7);
      flip.value = withTiming(1, { duration: 480, easing: EASE.out });
      scale.value = withSequence(
        withTiming(0.8, { duration: 480, easing: EASE.out }),
        // The wind-up: the coin keeps swelling while it wobbles and the gold gathers (never a still hold),
        // then draws in a little (the squash before the pop) and punches past full size.
        withTiming(0.9, { duration: Math.max(0, T.burst - 480 - 240), easing: EASE.charge }),
        withTiming(0.72, { duration: 240, easing: EASE.in }),
        withTiming(1.28, { duration: 110, easing: Easing.out(Easing.quad) }),
        withSpring(1, SPRING.pop),
      );

      const wobbleOnce = (deg: number) => withSequence(
        withTiming(deg, { duration: 60 }),
        withTiming(-deg, { duration: 100 }),
        withTiming(0, { duration: 60 }),
      );
      wobble.value = withDelay(T.wobble, withSequence(
        wobbleOnce(12),
        withDelay(40, wobbleOnce(17)),
        withDelay(40, wobbleOnce(23)),
      ));
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
        // The gold gathers behind the coin while it wobbles (a faint glow swelling), then blooms.
        const gatherFrom = T.wobble;
        rays.value = burstAt > gatherFrom + 200
          ? withSequence(withDelay(gatherFrom, withTiming(0.4, { duration: burstAt - gatherFrom, easing: EASE.charge })),
            withTiming(1, { duration: 200, easing: EASE.out }))
          : withDelay(burstAt, withTiming(1, { duration: 200, easing: EASE.out }));
        bloom.value = withDelay(burstAt, withSequence(withTiming(1, { duration: 140, easing: EASE.out }),
          withTiming(0, { duration: DURATION.bloom, easing: EASE.out })));
        sparkle.value = withDelay(burstAt, withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear }));
        shine.value = withDelay(burstAt + 260, withTiming(1, { duration: 620, easing: EASE.inOut }));
        confetti.value = withDelay(burstAt, withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }));
        const exitAt = burstAt + (T.lift - T.burst);
        title.value = withDelay(burstAt + 120, withSequence(
          withSpring(1, SPRING.stamp),
          withDelay(Math.max(0, exitAt - burstAt - 520), withTiming(0, { duration: 160 })),
        ));
        at(burstAt, () => {
          phase.current = 'burst';
          setBurst(true);
          success();
          playSfx('coin', 0.9);
        });
        at(exitAt, () => { phase.current = 'exit'; exit(); });
        at(exitAt + (T.done - T.lift) + 400, finish); // safety net if the animation is interrupted
      };

      backdrop.value = withTiming(1, { duration: 180 });
      scheduleBurst(T.burst);
      fastForwardRef.current = () => {
        // A first tap during the anticipation goes straight to the payoff.
        clearTimers();
        [flip, scale, wobble, flash, rays, title, confetti, bloom, sparkle, shine].forEach(value => cancelAnimation(value));
        flip.value = 1; wobble.value = 0;
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
      { rotateZ: `${wobble.value}deg` },
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
    opacity: Math.min(1, title.value * 2),
    transform: [{ scale: 1.5 - title.value * 0.5 }, { rotate: `${(1 - title.value) * -4}deg` }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

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

      <Confetti progress={confetti} originY={height * 0.42} width={width} />
      {burst && <Text style={styles.skip}>Tap to continue</Text>}
    </Pressable>
  );
}

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
  skip: {
    position: 'absolute', bottom: 60, alignSelf: 'center', fontFamily: 'Shark',
    fontSize: 17, color: '#ffffff', textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1,
  },
});

const GENERIC_COIN = require('../../assets/icons/game/coin.png');
const BACKDROP = ['#0d5bb0', '#08408c', '#042a62'] as const;
/** How much of the deep-water gradient covers the blurred world art: the water tint shows through, its props (a window grid, the chest, a laurel) no longer read as shapes. */
const WORLD_VEIL = 0.9;

const CONFETTI_COLORS = ['#ffcf3b', '#ffffff', '#38bdf8', '#fb923c', '#ffe27a'];
const PIECES = Array.from({ length: 28 }, (_, i) => {
  const angle = (i / 28) * Math.PI * 2 + (i % 3) * 0.21;
  const speed = 150 + ((i * 53) % 110);
  return {
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
function Confetti({ progress, originY, width }: {
  readonly progress: SharedValue<number>;
  readonly originY: number;
  readonly width: number;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PIECES.map((p, i) => <ConfettiPiece key={i} piece={p} progress={progress} x={width / 2} y={originY} />)}
    </View>
  );
}

function ConfettiPiece({ piece, progress, x, y }: {
  readonly piece: typeof PIECES[number];
  readonly progress: SharedValue<number>;
  readonly x: number;
  readonly y: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: t === 0 ? 0 : 1 - t * t,
      transform: [
        { translateX: x + piece.dx * t },
        { translateY: y + piece.dy * t + 260 * t * t }, // gravity
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
