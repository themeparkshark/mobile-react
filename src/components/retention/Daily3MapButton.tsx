import { Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { isDimFlashingLightsEnabled } from '../../../modules/flash-safety';
import { haptic, playHaptic, queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { usePowerBudget } from '../../power';
import type { ButtonAttention } from '../../services/retention/logic';
import { CHECK, FULL_SET, LOOP_CUES, PRESS, arcPoint } from '../../services/retention/loopMotion';
import { BRAND, GameIcon, SHADOW } from '../../ui';
import { SparkleBurst } from '../../ui/GoldBurst';
import { DURATION, GOLD_FX, SPRING, flashPeak, momentParticles } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import FlameArt from './FlameArt';
import { useAmbient } from './power';

const WEEKLY = require('../../../assets/images/retention/weekly-box-closed.png');
const SPARK = require('../../../assets/fx/spark.webp');

const SIZE = 54;
/** The ring canvas around the button (three 120 degree segments, one per goal). */
const RING = 70;
const RING_R = 31;
const RING_W = 5;
/** The flying check (pt): big enough to read from arm's length. */
const FLY = 40;
const GAP_DEG = 9;

/** One goal's segment: starts at 12 o'clock, clockwise, a small gap between segments. */
function segmentPath(i: number) {
  const p = Skia.Path.Make();
  const rect = Skia.XYWHRect(RING / 2 - RING_R, RING / 2 - RING_R, RING_R * 2, RING_R * 2);
  p.addArc(rect, -90 + i * 120 + GAP_DEG / 2, 120 - GAP_DEG);
  return p;
}

/** A hand-drawn check in a `box` pt square. */
function checkPath(box: number) {
  const p = Skia.Path.Make();
  p.moveTo(box * 0.24, box * 0.53);
  p.lineTo(box * 0.43, box * 0.71);
  p.lineTo(box * 0.78, box * 0.31);
  return p;
}

export interface CheckLanding {
  /** Goal index that just turned done (0..2). */
  readonly index: number;
  /** Goals done after it (1..3). */
  readonly done: number;
  /** Replays whenever this changes. */
  readonly key: number;
}

/**
 * Daily 3 on the map, in the same column and style as the recenter and chest
 * buttons. One glance: the streak flame (it grows with the streak), its
 * number, and a three-part ring that fills a third per goal.
 *
 * A goal finished anywhere: a gold check flies from the shark to the button on
 * an arc, the ring fills one third, the check draws itself and stamps, six
 * sparkles pop and a "1 of 3" bubble shows how far along you are. The third
 * check flashes the ring, bursts 12 sparkles and hands off to the full-set
 * celebration (`onFullSet`). Every frame runs on the UI thread; ambient loops
 * stop when the map is covered, in the background, idle or with Reduce Motion.
 */
export default function Daily3MapButton({ pips, streak, attention, onPress, landing, onFullSet, active, reducedMotion }: {
  readonly pips: readonly boolean[];
  readonly streak: number;
  readonly attention: ButtonAttention;
  readonly onPress: () => void;
  readonly landing: CheckLanding | null;
  /** The third check landed: the full set's card grows out of the button (its centre on screen, when known). */
  readonly onFullSet?: (at?: { readonly x: number; readonly y: number }, enterInMs?: number) => void;
  readonly active: boolean;
  readonly reducedMotion: boolean;
}) {
  // Loops stop while the app is in the background (listened to here, so the map never re-renders for it).
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);
  const ambient = useAmbient();
  const budget = usePowerBudget();
  const { width, height } = useWindowDimensions();
  const running = active && foreground && ambient;
  const ready = attention === 'claim' || attention === 'weekly';
  const bounce = useSharedValue(0);
  const press = useSharedValue(1);
  const pop = useSharedValue(1);
  const seg0 = useSharedValue(pips[0] ? 1 : 0);
  const seg1 = useSharedValue(pips[1] ? 1 : 0);
  const seg2 = useSharedValue(pips[2] ? 1 : 0);
  const segs = [seg0, seg1, seg2];
  const ringFlash = useSharedValue(0);
  const fly = useSharedValue(0);
  const flyOn = useSharedValue(0);
  const draw = useSharedValue(0);
  const stamp = useSharedValue(0);
  const stampA = useSharedValue(0);
  const bubbleA = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const bubble = useSharedValue(0);
  const flyFrom = useSharedValue({ x: 0, y: 0 });
  const [bubbleDone, setBubbleDone] = useState(0);
  const [sparkCount, setSparkCount] = useState<number>(CHECK.sparkles);
  const anchor = useRef<View>(null);
  /** The button centre on screen (window points), measured on each landing: the full-set card grows out of it. */
  const center = useRef<{ x: number; y: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const paths = useMemo(() => [segmentPath(0), segmentPath(1), segmentPath(2)], []);
  const check = useMemo(() => checkPath(40), []);
  const flyCheck = useMemo(() => checkPath(FLY), []);

  // Segments follow the server outside a landing (a new day empties the ring).
  const landingKey = landing?.key ?? 0;
  const landed = useRef(0);
  useEffect(() => {
    pips.forEach((on, i) => {
      if (landing && landing.index === i && landed.current !== landing.key) return; // the landing fills this one
      if (!on) segs[i].value = 0; else if (segs[i].value === 0) segs[i].value = 1;
    });
  }, [pips.join(','), landingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A ready chest hops every ~2.4 s (noticeable from across the map, never frantic).
  useEffect(() => {
    cancelAnimation(bounce);
    bounce.value = 0;
    if (!running || reducedMotion || !ready) return;
    bounce.value = withRepeat(withSequence(
      withTiming(-7, { duration: 180, easing: EASE.out }),
      withSpring(0, { damping: 6, stiffness: 260 }),
      withDelay(1800, withTiming(0, { duration: 1 })),
    ), -1);
    return () => cancelAnimation(bounce);
  }, [running, reducedMotion, ready, bounce]);

  // The check-off: fly, fill, draw, stamp, bubble (and the full-set flash on the third).
  useEffect(() => {
    if (!landing || landed.current === landing.key) return;
    landed.current = landing.key;
    timers.current.forEach(clearTimeout); timers.current = [];
    const i = Math.max(0, Math.min(2, landing.index));
    const full = landing.done >= 3;
    setBubbleDone(landing.done);
    const cue = LOOP_CUES.checkLand;
    if (reducedMotion) {
      // Reduce Motion: no travel or loops, a short fade to the end state; the haptic and sound stay.
      segs[i].value = withTiming(1, { duration: DURATION.quick });
      draw.value = 1;
      stamp.value = 1;
      stampA.value = withSequence(withTiming(1, { duration: DURATION.quick }), withDelay(900, withTiming(0, { duration: DURATION.quick })));
      bubble.value = 1;
      bubbleA.value = withSequence(withTiming(1, { duration: DURATION.quick }), withDelay(CHECK.bubble, withTiming(0, { duration: DURATION.quick })));
      queueHaptic('hitMedium'); playSfx(cue.fallback, 0.8);
      if (full) later(() => onFullSet?.(), 600);
      return;
    }
    let handed = false;
    // The full set's card is mounted while the check is still flying and enters (on the UI thread) the moment the
    // ring completes, so a busy JS thread never leaves the kid waiting on the map.
    const t0 = Date.now();
    const handOff = full ? () => {
      if (handed) return;
      handed = true;
      onFullSet?.(center.current ?? undefined, Math.max(0, CHECK.fly + CHECK.fullRing - (Date.now() - t0)));
    } : null;
    // Every visual beat is scheduled on the UI thread at once (withDelay from the flight start), so a busy JS
    // thread never stretches it; JS timers only fire the haptics, sounds and the hand-off on the same marks.
    const F = CHECK.fly;
    // A safety net if the ring animation is cancelled (the map was covered mid-fill).
    if (full) later(() => handOff?.(), 250);
    const sparks = momentParticles(full ? CHECK.fullSparkles : CHECK.sparkles, budget, false);
    setSparkCount(sparks);
    anchor.current?.measureInWindow((bx, by, bw, bh) => {
      // Fly from where the shark stands (the middle of the map), relative to this button.
      flyFrom.value = { x: width / 2 - (bx + bw / 2), y: height * 0.49 - (by + bh / 2) };
      if (Number.isFinite(bx) && bw > 0) center.current = { x: bx + bw / 2, y: by + bh / 2 };
      handOff?.();
      fly.value = 0;
      flyOn.value = 1;
      fly.value = withTiming(1, { duration: F, easing: EASE.inOut });
      flyOn.value = withDelay(F, withTiming(0, { duration: 60 }));
      // Arrival: the ring segment fills, the check draws then stamps (scale and fade on separate clocks).
      segs[i].value = 0;
      // The third segment's fill hands off to the full set the frame it completes (UI-thread clock, not a JS timer),
      // so the card opens with the flash, never after a pause on the map.
      segs[i].value = withDelay(F, withTiming(1, { duration: full ? CHECK.fullRing : CHECK.ring, easing: EASE.out }));
      draw.value = 0;
      draw.value = withDelay(F, withTiming(1, { duration: CHECK.draw, easing: EASE.out }));
      stamp.value = 1;
      stamp.value = withDelay(F + CHECK.draw, withSequence(withTiming(1.3, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.stamp)));
      stampA.value = withDelay(F, withSequence(withTiming(1, { duration: 60 }),
        withDelay(CHECK.draw + (full ? 260 : 700), withTiming(0, { duration: DURATION.exit, easing: EASE.in }))));
      // One goal: six sparkles on arrival. The third: the ring completes, flashes white, 12 sparkles, a bigger pop.
      const burstAt = full ? F + CHECK.fullRing : F;
      sparkle.value = 0;
      sparkle.value = withDelay(burstAt, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
      pop.value = withDelay(F, withSequence(withTiming(1.12, { duration: 90, easing: EASE.out }), withSpring(1, SPRING.stamp),
        ...(full ? [withTiming(1.28, { duration: 120, easing: EASE.out }), withSpring(1, SPRING.pop)] : [])));
      if (full) {
        // A gold glow ring, capped like every flash (none with Dim Flashing Lights or Reduce Motion): never a white strobe.
        const peak = flashPeak(isDimFlashingLightsEnabled(), reducedMotion);
        ringFlash.value = withDelay(burstAt, withSequence(withTiming(peak, { duration: 40 }), withTiming(0, { duration: FULL_SET.flash - 40 })));
      }
      // The "1 of 3" bubble.
      bubble.value = 0;
      bubble.value = withDelay(F + 60, withSpring(1, SPRING.stamp));
      bubbleA.value = withDelay(F + 60, withSequence(withTiming(1, { duration: 90 }),
        withDelay(CHECK.bubble, withTiming(0, { duration: DURATION.exit, easing: EASE.in }))));
    });
    playSfx(LOOP_CUES.checkFly.fallback, 0.35);
    later(() => { queueHaptic('hitMedium'); playSfx(cue.fallback, 0.9); }, F);
    if (full) later(() => { playHaptic('golden'); playSfx(LOOP_CUES.fullSet.fallback, 0.9); }, F + CHECK.fullRing);
  }, [landingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }, { scale: press.value * pop.value }] }));
  const flyStyle = useAnimatedStyle(() => {
    const p = arcPoint(fly.value, flyFrom.value, { x: 0, y: 0 }, 90);
    const s = fly.value < 0.5 ? 0.6 + fly.value * 1.4 : 1.3 - (fly.value - 0.5) * 1.0;
    return { opacity: flyOn.value, transform: [{ translateX: p.x }, { translateY: p.y }, { scale: s }, { rotate: `${(1 - fly.value) * -30}deg` }] };
  });
  const stampStyle = useAnimatedStyle(() => ({ opacity: stampA.value, transform: [{ scale: stamp.value }] }));
  const flashOpacity = useDerivedValue(() => ringFlash.value);
  const glowOpacity = useDerivedValue(() => Math.min(1, ringFlash.value * 2));
  // Two little sparkles trail the flying check along the same arc.
  const trail1 = useAnimatedStyle(() => {
    const t = Math.max(0, fly.value - 0.08);
    const p = arcPoint(t, flyFrom.value, { x: 0, y: 0 }, 90);
    return { opacity: flyOn.value * (fly.value > 0.08 ? 0.9 : 0), transform: [{ translateX: p.x }, { translateY: p.y }, { scale: 0.8 }] };
  });
  const trail2 = useAnimatedStyle(() => {
    const t = Math.max(0, fly.value - 0.17);
    const p = arcPoint(t, flyFrom.value, { x: 0, y: 0 }, 90);
    return { opacity: flyOn.value * (fly.value > 0.17 ? 0.6 : 0), transform: [{ translateX: p.x }, { translateY: p.y }, { scale: 0.55 }] };
  });
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleA.value,
    transform: [{ translateX: (1 - bubble.value) * 14 }, { scale: 0.6 + 0.4 * bubble.value }],
  }));
  const done = pips.filter(Boolean).length;
  const label = ready ? 'Daily 3: a reward is ready to open'
    : `Daily 3: ${done} of 3 done${streak > 0 ? `, ${streak} day streak` : ''}`;

  return (
    <View ref={anchor} collapsable={false}>
      <Animated.View style={buttonStyle}>
        <Pressable onPress={() => { haptic('tapLight'); onPress(); }} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
          onPressIn={() => { press.value = withTiming(PRESS.scale, { duration: PRESS.inMs }); }}
          onPressOut={() => { press.value = withSpring(1, PRESS.spring); }}
          style={[styles.button, ready && styles.buttonReady]}>
          {attention === 'weekly'
            ? <Image source={WEEKLY} style={{ width: 36, height: 36 }} contentFit="contain" />
            : ready ? <GameIcon name="chest" size={34} />
              : <FlameArt days={streak} size={44} reducedMotion={reducedMotion} still={!running} />}
          <Animated.View pointerEvents="none" style={[styles.stamp, stampStyle]}>
            <Canvas style={{ width: 40, height: 40 }}>
              <Circle cx={20} cy={20} r={18} color={BRAND.gold} />
              <Circle cx={20} cy={20} r={18} color={BRAND.white} style="stroke" strokeWidth={3} />
              <Path path={check} style="stroke" strokeWidth={8} color={BRAND.navy} strokeCap="round" strokeJoin="round" end={draw} />
              <Path path={check} style="stroke" strokeWidth={4.5} color={BRAND.white} strokeCap="round" strokeJoin="round" end={draw} />
            </Canvas>
          </Animated.View>
        </Pressable>
        <View pointerEvents="none" style={styles.ring} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Canvas style={{ width: RING, height: RING }}>
            {paths.map((p, i) => (
              <Group key={i}>
                <Path path={p} style="stroke" strokeWidth={RING_W + 3} color={BRAND.navy} strokeCap="round" opacity={0.55} />
                <Path path={p} style="stroke" strokeWidth={RING_W} color="#cfe9fb" strokeCap="round" />
                <Path path={p} style="stroke" strokeWidth={RING_W} color={BRAND.gold} strokeCap="round" end={segs[i]} />
              </Group>
            ))}
            <Circle cx={RING / 2} cy={RING / 2} r={RING_R} color={GOLD_FX.glow} style="stroke" strokeWidth={RING_W + 9} opacity={glowOpacity} />
            <Circle cx={RING / 2} cy={RING / 2} r={RING_R} color={BRAND.white} style="stroke" strokeWidth={RING_W + 1} opacity={flashOpacity} />
          </Canvas>
        </View>
        {streak > 0 && !ready && (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText} allowFontScaling={false}>{streak}</Text>
          </View>
        )}
        {ready && <View style={styles.dot} pointerEvents="none" />}
      </Animated.View>
      <View pointerEvents="none" style={styles.center}>
        <SparkleBurst progress={sparkle} count={sparkCount} radius={46} />
      </View>
      <Animated.View pointerEvents="none" style={[styles.bubble, bubbleStyle]}>
        <View style={styles.bubbleDots}>
          {[0, 1, 2].map(k => <View key={k} style={[styles.bubbleDot, k < bubbleDone && styles.bubbleDotOn]} />)}
        </View>
        <Text style={styles.bubbleText} allowFontScaling={false}>{bubbleDone >= 3 ? 'All 3!' : `${bubbleDone} of 3`}</Text>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.trail, trail2]}><Image source={SPARK} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} /></Animated.View>
      <Animated.View pointerEvents="none" style={[styles.trail, trail1]}><Image source={SPARK} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} /></Animated.View>
      <Animated.View pointerEvents="none" style={[styles.flyer, flyStyle]}>
        <Canvas style={{ width: FLY, height: FLY }}>
          <Circle cx={FLY / 2} cy={FLY / 2} r={FLY / 2 - 1} color={BRAND.gold} />
          <Circle cx={FLY / 2} cy={FLY / 2} r={FLY / 2 - 1} color={BRAND.white} style="stroke" strokeWidth={3} />
          <Path path={flyCheck} style="stroke" strokeWidth={8} color={BRAND.navy} strokeCap="round" strokeJoin="round" />
          <Path path={flyCheck} style="stroke" strokeWidth={4.5} color={BRAND.white} strokeCap="round" strokeJoin="round" />
        </Canvas>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.blueBright, borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  buttonReady: { borderColor: BRAND.gold },
  ring: { position: 'absolute', left: (SIZE - RING) / 2, top: (SIZE - RING) / 2, width: RING, height: RING },
  stamp: { position: 'absolute', width: 40, height: 40 },
  center: { position: 'absolute', left: SIZE / 2, top: SIZE / 2, width: 0, height: 0 },
  flyer: { position: 'absolute', left: SIZE / 2 - FLY / 2, top: SIZE / 2 - FLY / 2, width: FLY, height: FLY },
  trail: { position: 'absolute', left: SIZE / 2 - 11, top: SIZE / 2 - 11, width: 22, height: 22 },
  badge: { position: 'absolute', top: -7, right: -9, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11,
    backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.navy, marginTop: 1 },
  // The same gold ready dot as the daily chest button above it.
  dot: { position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: 8,
    backgroundColor: BRAND.gold, borderWidth: 2.5, borderColor: BRAND.white },
  // "1 of 3": three dots read with zero words; the number is for grown-ups.
  bubble: { position: 'absolute', right: SIZE + 12, top: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: BRAND.white, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 2.5,
    borderColor: BRAND.gold, ...SHADOW.card },
  bubbleDots: { flexDirection: 'row', gap: 3 },
  bubbleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#cfe9fb', borderWidth: 1.5, borderColor: BRAND.navySoft },
  bubbleDotOn: { backgroundColor: BRAND.gold, borderColor: BRAND.goldLip },
  bubbleText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy, marginTop: 1 },
});
