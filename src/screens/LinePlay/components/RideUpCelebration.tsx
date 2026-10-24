/**
 * "Your ride's up!": the line ends and the app cheers you onto the ride.
 *
 * Four beats over the top of the queue recap (src/ui/motion.ts):
 *   gather   0 ms     a light sky veil, the gold banner drops in on SPRING.pop with the
 *                     ride's plain name, the ride icon hops twice;
 *            300 ms   the gold ring around the ride icon fills to 100% over 650 ms (EASE.out)
 *                     with the coin tick ladder climbing as it fills;
 *   hold     950 ms   one held 70 ms frame on the full ring (flash at or under 0.4, the win buzz);
 *   burst    1020 ms  a gold ring and 12 gold-and-white stars burst from the ring, and one
 *                     shower of 28 blue, white and gold confetti falls;
 *   settle   1100 ms  the recap's stats stagger in underneath (SessionRecap), then the veil
 *                     lifts and the banner floats up out of the way by 2.2 s.
 * Payoff inside 1.1 s, settled by 2.2 s, nothing loops. Every visual runs on the UI thread
 * (Reanimated and Skia); the haptics and sounds fire from the same UI timeline (runOnJS in
 * the animation callbacks and one reaction for the ticks). Reduce Motion: the banner and the
 * full ring fade in together and out again; the buzz and the sound stay. Plain ride names
 * only, no logos.
 */
import { Canvas, PaintStyle, Picture, Skia, StrokeCap, createPicture } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, ReduceMotion, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue,
} from 'react-native-reanimated';
import { isDimFlashingLightsEnabled } from '../../../../modules/flash-safety';
import { playHaptic, queueHaptic } from '../../../gamekit/Haptics';
import { playMoment } from '../../../gamekit/audio/playMoment';
import { useReduceMotionPreference } from '../../../hooks/useReducedGameMotion';
import { usePowerBudget } from '../../../power';
import { DURATION, EASE, GOLD_FX, SPRING, flashPeak, momentParticles } from '../../../ui/motionEasing';
import { BRAND } from '../../../ui/tokens';
import GameIcon from '../../../ui/GameIcon';
import { confettiPieces, drawRain } from '../../../components/park/ArrivalFxCanvas';
import BurstCanvas from '../../../components/park/BurstCanvas';
import { withDelay, withSequence, withSpring, withTiming } from '../../../components/park/momentTime';
import { perfMark } from '../../../components/park/momentPerf';

/** The beat sheet (ms), pure numbers so tests can read them. */
export const RIDE_UP = {
  ringAt: 300,
  ringMs: 650,
  hitAt: 950,
  burstAt: 1020,
  confettiAt: 1100,
  confettiMs: 1600,
  leaveAt: 2000,
  leaveMs: 220,
  /** The coin tick ladder while the ring fills. */
  ticks: 6,
  sparkles: 12,
  confetti: 28,
} as const;

export default function RideUpCelebration({ rideName }: { readonly rideName: string }) {
  const preference = useReduceMotionPreference();
  if (preference === null) return null;
  return <Stage rideName={rideName} reduced={preference} />;
}

const RING = 112;
const STROKE = 10;

function Stage({ rideName, reduced }: { readonly rideName: string; readonly reduced: boolean }) {
  const { width, height } = useWindowDimensions();
  const budget = usePowerBudget();
  const sparkles = momentParticles(RIDE_UP.sparkles, budget, reduced);
  const confetti = momentParticles(RIDE_UP.confetti, budget, reduced);
  const peak = flashPeak(isDimFlashingLightsEnabled(), reduced);
  const veil = useSharedValue(0);
  const banner = useSharedValue(0);
  const hop = useSharedValue(0);
  const ring = useSharedValue(0);
  const flash = useSharedValue(0);
  const burst = useSharedValue(0);
  const rain = useSharedValue(0);
  const leave = useSharedValue(0);
  const alive = useRef(true);
  const ringTop = 150;
  const ringCenter = { x: width / 2, y: ringTop + RING / 2 };

  const cheer = () => { if (alive.current) { queueHaptic('hitMedium'); playMoment('reward.reveal'); } };
  const win = () => { if (alive.current) { playHaptic('win'); playMoment('game.win'); } };
  const tick = (step: number) => { if (alive.current) playMoment('ui.counterTick', { step }); };
  // The tick ladder rides the ring's own fill: one rung each sixth of the ring, on the frame it is reached.
  useAnimatedReaction(() => Math.floor(ring.value * RIDE_UP.ticks + 0.0001), (now, before) => {
    if (reduced || before === null || before === undefined || now <= before || now <= 0) return;
    runOnJS(tick)(now);
  }, [reduced]);

  useEffect(() => {
    alive.current = true;
    perfMark('rideUp.start');
    if (reduced) {
      const fade = { duration: DURATION.quick, reduceMotion: ReduceMotion.Never };
      veil.value = withTiming(1, fade);
      ring.value = 1;
      banner.value = withTiming(1, fade, ok => { if (ok) runOnJS(cheer)(); });
      leave.value = withDelay(RIDE_UP.leaveAt, withTiming(1, fade, ok => { if (ok) runOnJS(win)(); }), ReduceMotion.Never);
      return () => { alive.current = false; [veil, banner, leave].forEach(v => cancelAnimation(v)); };
    }
    // 1. gather: the veil, the banner drops in, the ride icon hops twice, the ring fills.
    veil.value = withTiming(1, { duration: DURATION.base, easing: EASE.out });
    banner.value = withSpring(1, SPRING.pop, ok => { if (ok) runOnJS(cheer)(); });
    hop.value = withDelay(140, withSequence(
      withTiming(1, { duration: 140, easing: EASE.out }), withTiming(0, { duration: 140, easing: EASE.in }),
      withTiming(0.7, { duration: 120, easing: EASE.out }), withSpring(0, SPRING.land)));
    ring.value = withDelay(RIDE_UP.ringAt, withTiming(1, { duration: RIDE_UP.ringMs, easing: EASE.out }));
    // 2. hold: one held frame on the full ring, a capped flash and the win buzz.
    flash.value = withDelay(RIDE_UP.hitAt, withSequence(withTiming(peak, { duration: 30 }),
      withTiming(peak, { duration: DURATION.hitStop - 30 }, ok => { if (ok) runOnJS(win)(); }),
      withTiming(0, { duration: DURATION.flash })));
    // 3. burst: the ring and stars, then the confetti shower.
    burst.value = withDelay(RIDE_UP.burstAt, withTiming(1, { duration: DURATION.sparkle, easing: Easing.linear }));
    rain.value = withDelay(RIDE_UP.confettiAt, withTiming(1, { duration: RIDE_UP.confettiMs, easing: Easing.linear }));
    // 4. settle: the veil lifts and the banner floats up out of the way (exits faster than entrances).
    leave.value = withDelay(RIDE_UP.leaveAt, withTiming(1, { duration: RIDE_UP.leaveMs, easing: EASE.in }, ok => {
      if (ok) runOnJS(perfMark)('rideUp.done');
    }));
    return () => { alive.current = false; [veil, banner, hop, ring, flash, burst, rain, leave].forEach(v => cancelAnimation(v)); };
    // One-shot per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const veilStyle = useAnimatedStyle(() => ({ opacity: 0.55 * veil.value * (1 - leave.value) }));
  const bannerStyle = useAnimatedStyle(() => (reduced
    ? { opacity: banner.value * (1 - leave.value) }
    : {
      opacity: Math.min(1, banner.value * 2) * (1 - leave.value),
      transform: [{ translateY: -70 * (1 - banner.value) - 60 * leave.value }, { scale: 0.7 + 0.3 * banner.value }],
    }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -14 * hop.value }, { scaleY: 1 + 0.08 * hop.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value, transform: [{ scale: 0.9 + 0.3 * flash.value }] }));
  const ringWrap = useAnimatedStyle(() => (reduced
    ? { opacity: banner.value * (1 - leave.value) }
    : { opacity: Math.min(1, veil.value * 2) * (1 - leave.value), transform: [{ scale: (0.85 + 0.15 * Math.min(1, banner.value)) * (1 + 0.08 * flash.value / Math.max(0.01, peak || 1)) }] }));

  // The gold ring: a navy track and a gold arc filling clockwise from the top, one Skia picture per frame.
  const ringPicture = useDerivedValue(() => createPicture(canvas => {
    const c = RING / 2;
    const r = c - STROKE / 2 - 2;
    const track = Skia.Paint();
    track.setAntiAlias(true);
    track.setStyle(PaintStyle.Stroke);
    track.setStrokeWidth(STROKE);
    track.setColor(Skia.Color('rgba(5,52,110,0.35)'));
    canvas.drawCircle(c, c, r, track);
    const sweep = 360 * ring.value;
    if (sweep > 0.5) {
      const arc = Skia.Paint();
      arc.setAntiAlias(true);
      arc.setStyle(PaintStyle.Stroke);
      arc.setStrokeWidth(STROKE);
      arc.setStrokeCap(StrokeCap.Round);
      arc.setColor(Skia.Color(GOLD_FX.rays));
      const path = Skia.Path.Make();
      path.addArc(Skia.XYWHRect(c - r, c - r, r * 2, r * 2), -90, sweep);
      canvas.drawPath(path, arc);
      // The liquid gold highlight riding the tip of the fill.
      const tip = ((-90 + sweep) * Math.PI) / 180;
      const glint = Skia.Paint();
      glint.setAntiAlias(true);
      glint.setColor(Skia.Color('#fff6cf'));
      canvas.drawCircle(c + r * Math.cos(tip), c + r * Math.sin(tip), STROKE * 0.42, glint);
    }
  }, { width: RING, height: RING }));

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

  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLiveRegion="polite"
    accessible accessibilityLabel={`Your ride's up! ${rideName}. Have fun!`}>
    <Animated.View style={[StyleSheet.absoluteFill, styles.veil, veilStyle]} />
    <Animated.View style={[styles.bannerWrap, bannerStyle]}>
      <View style={styles.banner}>
        <Text style={styles.bannerText} allowFontScaling={false}>YOUR RIDE&apos;S UP!</Text>
      </View>
      <View style={styles.namePlate}>
        <Text style={styles.nameText} numberOfLines={1} adjustsFontSizeToFit allowFontScaling={false}>{rideName}</Text>
      </View>
    </Animated.View>
    <Animated.View style={[styles.ringWrap, { left: ringCenter.x - RING / 2, top: ringTop }, ringWrap]}>
      <View style={styles.ringDisc} />
      <Animated.View style={[styles.flash, flashStyle]} />
      <Canvas style={StyleSheet.absoluteFill}><Picture picture={ringPicture} /></Canvas>
      <Animated.View style={[styles.icon, iconStyle]}><GameIcon name="ride" size={54} /></Animated.View>
    </Animated.View>
    {!reduced && <BurstCanvas progress={burst} count={sparkles} radius={120} ring={RING / 2} starSize={13}
      x={ringCenter.x} y={ringCenter.y} />}
    {!reduced && confetti > 0 && <Canvas style={StyleSheet.absoluteFill}><Picture picture={rainPicture} /></Canvas>}
  </View>;
}

const styles = StyleSheet.create({
  veil: { backgroundColor: '#bfe6ff' },
  bannerWrap: { position: 'absolute', top: 36, left: 16, right: 16, alignItems: 'center' },
  banner: { backgroundColor: BRAND.gold, borderRadius: 18, borderWidth: 4, borderColor: BRAND.white, paddingHorizontal: 22, paddingVertical: 6,
    borderBottomWidth: 7, borderBottomColor: '#d99a00' },
  bannerText: { fontFamily: 'Shark', fontSize: 30, color: BRAND.navy, letterSpacing: 1 },
  namePlate: { marginTop: -4, backgroundColor: BRAND.navy, borderRadius: 12, borderWidth: 3, borderColor: BRAND.white,
    paddingHorizontal: 14, paddingVertical: 3, maxWidth: '86%' },
  nameText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white },
  ringWrap: { position: 'absolute', width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringDisc: { position: 'absolute', width: RING - 8, height: RING - 8, borderRadius: (RING - 8) / 2, backgroundColor: BRAND.white,
    borderWidth: 3, borderColor: BRAND.blueBright },
  flash: { position: 'absolute', width: RING * 1.3, height: RING * 1.3, borderRadius: RING * 0.65, backgroundColor: '#fffbe8' },
  icon: { alignItems: 'center', justifyContent: 'center' },
});
