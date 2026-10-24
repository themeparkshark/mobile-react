/**
 * "Your ride's up!": the line ends and the recap's own header card cheers you onto the ride.
 * No veil and no second banner: the real header card is the stage.
 *
 * Four beats (src/ui/motion.ts), every piece mounted in the same render so they share one
 * beat sheet:
 *   gather   0 ms     the header card pops in (SPRING.pop, one overshoot) and a gold glow
 *                     builds behind its shark;
 *            120 ms   its own YOUR RIDE'S UP! title stamps down from 1.8x and slams
 *                     (SLAM_SQUASH, the winRoll buzz and the reveal cue on the impact frame);
 *            300 ms   a liquid gold bar fills along the card's bottom edge over 650 ms
 *                     (EASE.out) with the coin tick ladder climbing as it fills;
 *   hold     950 ms   one held 70 ms frame on the full bar: the card squashes and kicks 3 pt,
 *                     a white flash at or under 0.4 (none with Dim Flashing Lights), the win buzz;
 *   burst    1020 ms  the gold ray fan blooms inside the card, a gold ring and 12 stars burst
 *                     from the shark, and one shower of 28 blue, white and gold confetti falls
 *                     while the earned row counts up underneath (SessionRecap);
 *   settle   2000 ms  the rays and the bar fade, the card is back to how it looks at rest.
 * Payoff inside 1.1 s, settled by 2.3 s, nothing loops. Every visual runs on the UI thread
 * (Reanimated and Skia); the haptics and sounds fire from the same UI timeline (runOnJS in
 * the animation callbacks and one reaction for the ticks). Reduce Motion: the glow and the
 * full bar fade in and out, the buzz and the sound stay. Plain ride names only, no logos.
 */
import { Canvas, PaintStyle, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing, ReduceMotion, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue,
} from 'react-native-reanimated';
import { isDimFlashingLightsEnabled } from '../../../../modules/flash-safety';
import { playHaptic } from '../../../gamekit/Haptics';
import { playMoment } from '../../../gamekit/audio/playMoment';
import { useReduceMotionPreference } from '../../../hooks/useReducedGameMotion';
import { usePowerBudget } from '../../../power';
import { GoldBurst } from '../../../ui/GoldBurst';
import { SLAM_SQUASH } from '../../../ui/motion';
import { DURATION, EASE, GOLD_FX, SPRING, flashPeak, momentParticles } from '../../../ui/motionEasing';
import { confettiPieces, drawRain } from '../../../components/park/ArrivalFxCanvas';
import BurstCanvas from '../../../components/park/BurstCanvas';
import { withDelay, withSequence, withSpring, withTiming } from '../../../components/park/momentTime';
import { perfMark } from '../../../components/park/momentPerf';

/** The beat sheet (ms), pure numbers so tests can read them. */
export const RIDE_UP = {
  stampAt: 120,
  ringAt: 300,
  ringMs: 650,
  hitAt: 950,
  burstAt: 1020,
  confettiAt: 1100,
  confettiMs: 1600,
  leaveAt: 2000,
  leaveMs: 260,
  /** The coin tick ladder while the bar fills. */
  ticks: 6,
  sparkles: 12,
  confetti: 28,
} as const;

/** Where the burst comes from inside the header card: its shark (the card's right side). */
const SHARK = { fromRight: 84, fromBottom: 78 };
const BAR = 9;
const BRAND_NAVY = '#05346e';

/**
 * Wraps the recap's header card. While `active`, the card pops in, squashes on the hit,
 * glows gold behind its shark, fills a gold bar along its bottom edge and bursts stars.
 * `backdrop` is drawn inside the card, under its words (pass it as the card's first child).
 */
export function RideUpHero({ active, children }: { readonly active: boolean; readonly children: (backdrop: ReactNode) => ReactNode }) {
  const preference = useReduceMotionPreference();
  if (!active || preference === null) return <>{children(null)}</>;
  return <HeroStage reduced={preference}>{children}</HeroStage>;
}

function HeroStage({ reduced, children }: { readonly reduced: boolean; readonly children: (backdrop: ReactNode) => ReactNode }) {
  const budget = usePowerBudget();
  const sparkles = momentParticles(RIDE_UP.sparkles, budget, reduced);
  const peak = flashPeak(isDimFlashingLightsEnabled(), reduced);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const pop = useSharedValue(0);
  const glow = useSharedValue(0);
  const ring = useSharedValue(0);
  const punch = useSharedValue(0);
  const flash = useSharedValue(0);
  const burst = useSharedValue(0);
  const leave = useSharedValue(0);
  const alive = useRef(true);

  const win = () => { if (alive.current) { playHaptic('win'); playMoment('game.win'); } };
  const tick = (step: number) => { if (alive.current) playMoment('ui.counterTick', { step }); };
  // The tick ladder rides the bar's own fill: one rung each sixth of the bar, on the frame it is reached.
  useAnimatedReaction(() => Math.floor(ring.value * RIDE_UP.ticks + 0.0001), (now, before) => {
    if (reduced || before === null || before === undefined || now <= before || now <= 0) return;
    runOnJS(tick)(now);
  }, [reduced]);

  useEffect(() => {
    alive.current = true;
    perfMark('rideUp.start');
    if (reduced) {
      const fade = { duration: DURATION.quick, reduceMotion: ReduceMotion.Never };
      pop.value = 1;
      ring.value = 1;
      glow.value = withSequence(ReduceMotion.Never, withTiming(0.6, fade),
        withDelay(RIDE_UP.leaveAt, withTiming(0, fade, ok => { if (ok) runOnJS(win)(); }), ReduceMotion.Never));
      leave.value = withDelay(RIDE_UP.leaveAt, withTiming(1, fade), ReduceMotion.Never);
      return () => { alive.current = false; [glow, leave].forEach(v => cancelAnimation(v)); };
    }
    // 1. gather: the card pops in with one overshoot, the glow builds, the bar fills.
    pop.value = withSpring(1, SPRING.pop);
    glow.value = withSequence(withTiming(0.35, { duration: DURATION.base, easing: EASE.charge }),
      withDelay(RIDE_UP.burstAt - DURATION.base, withTiming(1, { duration: DURATION.quick, easing: EASE.out })),
      withDelay(RIDE_UP.leaveAt - RIDE_UP.burstAt - DURATION.quick, withTiming(0, { duration: RIDE_UP.leaveMs * 2, easing: EASE.in })));
    ring.value = withDelay(RIDE_UP.ringAt, withTiming(1, { duration: RIDE_UP.ringMs, easing: EASE.out }));
    // 2. hold: one held frame on the full bar: squash, kick, a capped flash and the win buzz.
    punch.value = withDelay(RIDE_UP.hitAt, withSequence(withTiming(1, { duration: 1 }),
      withDelay(DURATION.hitStop - 1, withSpring(0, SPRING.pop))));
    flash.value = withDelay(RIDE_UP.hitAt, withSequence(withTiming(peak, { duration: 30 }),
      withTiming(peak, { duration: DURATION.hitStop - 30 }, ok => { if (ok) runOnJS(win)(); }),
      withTiming(0, { duration: DURATION.flash })));
    // 3. burst: the ring and stars from the shark.
    burst.value = withDelay(RIDE_UP.burstAt, withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear }));
    // 4. settle: the bar fades with the rays (exits faster than entrances).
    leave.value = withDelay(RIDE_UP.leaveAt, withTiming(1, { duration: RIDE_UP.leaveMs, easing: EASE.in }, ok => {
      if (ok) runOnJS(perfMark)('rideUp.done');
    }));
    return () => { alive.current = false; [pop, glow, ring, punch, flash, burst, leave].forEach(v => cancelAnimation(v)); };
    // One-shot per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heroStyle = useAnimatedStyle(() => (reduced ? {} : {
    transform: [
      { translateY: -14 * (1 - pop.value) + 3 * punch.value },
      { scale: 0.9 + 0.1 * pop.value },
      { scaleX: 1 + SLAM_SQUASH * 0.5 * punch.value }, { scaleY: 1 - SLAM_SQUASH * 0.7 * punch.value },
    ],
  }));
  const barStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ scaleX: Math.max(0.001, ring.value) }] }));
  const glintStyle = useAnimatedStyle(() => ({
    opacity: ring.value > 0 && ring.value < 1 ? 1 - leave.value : 0,
    transform: [{ translateX: (box?.width ?? 0) * ring.value - 10 }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!box || Math.abs(box.width - width) > 1 || Math.abs(box.height - height) > 1) setBox({ width, height });
  };
  const sharkAt = box ? { x: box.width - SHARK.fromRight, y: box.height - SHARK.fromBottom } : null;
  const backdrop = <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {/* The gold ray fan behind the card's shark, under its words. */}
    {sharkAt && <GoldBurst size={Math.max(260, (box?.height ?? 176) * 2)} amount={glow} reduced={reduced}
      style={{ position: 'absolute', left: sharkAt.x - Math.max(130, (box?.height ?? 176)), top: sharkAt.y - Math.max(130, (box?.height ?? 176)) }} />}
    {/* The liquid gold bar along the bottom edge, with a bright glint riding its tip. */}
    <Animated.View style={[styles.bar, barStyle]} />
    <Animated.View style={[styles.glint, glintStyle]} />
    <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />
  </View>;

  return <Animated.View style={heroStyle} onLayout={onLayout}>
    {children(backdrop)}
    {!reduced && sharkAt && <BurstCanvas progress={burst} count={sparkles} radius={124} ring={44} starSize={13}
      x={sharkAt.x} y={sharkAt.y} />}
  </Animated.View>;
}

/**
 * The header card's own title. On "Your ride's up!" it stamps down from 1.8x and slams on
 * its impact frame (the winRoll buzz and the reveal cue); at rest it is the same line.
 */
export function RideUpKicker({ active, style, children }: { readonly active: boolean; readonly style: StyleProp<TextStyle>; readonly children: string }) {
  const preference = useReduceMotionPreference();
  const stamp = useSharedValue(active && preference === false ? 0 : 1);
  const punch = useSharedValue(0);
  const alive = useRef(true);
  const cheer = () => { if (alive.current) { playHaptic('winRoll'); playMoment('reward.reveal'); } };
  useEffect(() => {
    alive.current = true;
    if (!active || preference === null) return () => { alive.current = false; };
    if (preference) { cheer(); return () => { alive.current = false; }; }
    stamp.value = 0;
    stamp.value = withDelay(RIDE_UP.stampAt, withTiming(1, { duration: DURATION.slam, easing: EASE.in }, ok => { if (ok) runOnJS(cheer)(); }));
    punch.value = withDelay(RIDE_UP.stampAt + DURATION.slam, withSequence(withTiming(1, { duration: 1 }),
      withDelay(DURATION.hitStop, withSpring(0, SPRING.stamp))));
    return () => { alive.current = false; cancelAnimation(stamp); cancelAnimation(punch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, preference]);
  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, stamp.value * 3),
    transform: [{ scale: 1.8 - 0.8 * stamp.value }, { scaleX: 1 + SLAM_SQUASH * punch.value }, { scaleY: 1 - SLAM_SQUASH * punch.value }],
  }));
  if (!active) return <Text style={style}>{children}</Text>;
  return <Animated.Text style={[style, styles.kickerGlow, styles.kickerOrigin, animated]}>{children}</Animated.Text>;
}

/** One shower of confetti over the whole recap, on the burst (the only full-screen piece; no veil). */
export default function RideUpCelebration({ rideName }: { readonly rideName: string }) {
  const preference = useReduceMotionPreference();
  if (preference === null || preference) return null;
  return <Confetti rideName={rideName} />;
}

function Confetti({ rideName }: { readonly rideName: string }) {
  const { width, height } = useWindowDimensions();
  const budget = usePowerBudget();
  const confetti = momentParticles(RIDE_UP.confetti, budget, false);
  const rain = useSharedValue(0);
  useEffect(() => {
    rain.value = withDelay(RIDE_UP.confettiAt, withTiming(1, { duration: RIDE_UP.confettiMs, easing: Easing.linear }));
    return () => cancelAnimation(rain);
  }, [rain]);
  const pieces = useMemo(() => confettiPieces(confetti, width, height * 0.75, 3), [confetti, width, height]);
  const rainPicture = useDerivedValue(() => createPicture(canvas => {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const ink = Skia.Paint();
    ink.setAntiAlias(true);
    ink.setStyle(PaintStyle.Stroke);
    ink.setStrokeWidth(1);
    ink.setColor(Skia.Color('#05346e'));
    drawRain(canvas, paint, ink, rain.value, pieces);
  }, { width, height }));
  if (confetti <= 0) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite"
    accessible accessibilityLabel={`Your ride's up! ${rideName}. Have fun!`}>
    <Canvas style={StyleSheet.absoluteFill}><Picture picture={rainPicture} /></Canvas>
  </View>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: BAR, backgroundColor: GOLD_FX.rays,
    borderTopWidth: 2, borderTopColor: '#fff2b0', transformOrigin: 'left' },
  glint: { position: 'absolute', left: 0, bottom: -3, width: 20, height: BAR + 6, borderRadius: 10, backgroundColor: '#fff6cf' },
  flash: { backgroundColor: '#fffbe8' },
  kickerGlow: { textShadowColor: BRAND_NAVY, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  kickerOrigin: { alignSelf: 'flex-start', transformOrigin: 'left' },
});
