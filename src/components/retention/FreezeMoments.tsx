import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useAmbientLoop from '../../power/useAmbientLoop';
import { usePowerBudget } from '../../power';
import { FREEZE_FX, LOOP_CUES, PRESS, arcPoint, flameLook } from '../../services/retention/loopMotion';
import { BRAND } from '../../ui';
import { DURATION, SPRING, momentParticles } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import FlameArt from './FlameArt';
import CardSurface from './CardSurface';

const FREEZE = require('../../../assets/images/retention/freeze.png');
const FINN = require('../../assets/games/banana-basket/v2/shark_cheer.png');
const SOFT = require('../../../assets/images/reveal/soft-spot.webp');

/**
 * The two freeze slots beside the flame. A full slot is a shiny ice shield
 * with a glint every 6 s (ambient: rests when idle, in the background or with
 * Reduce Motion); an empty slot is a dotted outline. A freeze just earned
 * flies in on an arc, lands on the land spring and puffs six frost sparkles.
 */
export function FreezeSlots({ freezes, cap, arrive = 0, from, reducedMotion, onEmptyPress, emptyPressable = false, size = 36 }: {
  readonly freezes: number;
  readonly cap: number;
  /** How many of the full slots just arrived (they fly in). */
  readonly arrive?: number;
  /** Where they fly from, relative to the slots (pt). */
  readonly from?: { readonly x: number; readonly y: number };
  readonly reducedMotion: boolean;
  readonly onEmptyPress?: () => void;
  readonly emptyPressable?: boolean;
  readonly size?: number;
}) {
  return (
    <View style={styles.slots}>
      {Array.from({ length: cap }, (_, i) => {
        const full = i < freezes;
        const flying = full && i >= freezes - arrive;
        return full
          ? <Shield key={i} size={size} fly={flying ? { from: from ?? { x: 0, y: 220 }, order: i - (freezes - arrive) } : null} reducedMotion={reducedMotion} />
          : (
            <Pressable key={i} onPress={emptyPressable ? onEmptyPress : undefined} disabled={!emptyPressable} hitSlop={4}
              accessibilityRole="button" accessibilityLabel="Empty freeze slot"
              style={[styles.slot, { width: size, height: size }, emptyPressable && styles.slotOpen]}>
              {emptyPressable && <Text style={styles.plus}>+</Text>}
            </Pressable>
          );
      })}
    </View>
  );
}

function Shield({ size, fly, reducedMotion }: {
  readonly size: number;
  readonly fly: { readonly from: { readonly x: number; readonly y: number }; readonly order: number } | null;
  readonly reducedMotion: boolean;
}) {
  const budget = usePowerBudget();
  const t = useSharedValue(fly && !reducedMotion ? 0 : 1);
  const land = useSharedValue(1);
  const frost = useSharedValue(0);
  const flashRing = useSharedValue(0);
  /** The landing kick (pt) and the frost ring that bursts out of the slot. */
  const kick = useSharedValue(0);
  const ring = useSharedValue(0);
  const glint = useSharedValue(0);
  const from = useSharedValue(fly?.from ?? { x: 0, y: 0 });
  const puffs = fly && !reducedMotion ? momentParticles(FREEZE_FX.frost, budget, false) : 0;
  useEffect(() => {
    if (!fly) return;
    if (reducedMotion) { queueHaptic('hitMedium'); playSfx(LOOP_CUES.freezeEarn.fallback, 0.8); return; }
    const delay = 200 + fly.order * 160;
    t.value = withDelay(delay, withTiming(1, { duration: FREEZE_FX.flyMs, easing: EASE.inOut }));
    // It lands big (1.6x) and springs into its slot, the slot ring flashes ice blue and frost puffs out.
    // It lands big (1.6x), holds one hit-stop beat, then springs into its slot with a little kick and a frost ring.
    land.value = withDelay(delay + FREEZE_FX.flyMs, withSequence(withTiming(FREEZE_FX.landPop, { duration: 90, easing: EASE.out }),
      withDelay(DURATION.hitStop, withSpring(1, SPRING.land))));
    kick.value = withDelay(delay + FREEZE_FX.flyMs + 90 + DURATION.hitStop, withSequence(withTiming(3, { duration: 40, easing: EASE.out }),
      withTiming(-2, { duration: 50 }), withTiming(0, { duration: 60, easing: EASE.out })));
    ring.value = withDelay(delay + FREEZE_FX.flyMs + 90 + DURATION.hitStop, withTiming(1, { duration: 560, easing: EASE.out }));
    frost.value = withDelay(delay + FREEZE_FX.flyMs, withTiming(1, { duration: 800, easing: EASE.out }));
    flashRing.value = withDelay(delay + FREEZE_FX.flyMs, withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 520, easing: EASE.out })));
    // A clink: a rigid tap, then a light one 70 ms later.
    const timer = setTimeout(() => { queueHaptic('hitRigid'); playSfx(LOOP_CUES.freezeEarn.fallback, 0.8); }, delay + FREEZE_FX.flyMs);
    const timer2 = setTimeout(() => queueHaptic('tapLight'), delay + FREEZE_FX.flyMs + 140);
    return () => { clearTimeout(timer); clearTimeout(timer2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A glint sweeps across the shield every 6 s.
  useAmbientLoop(() => {
    glint.value = 0;
    glint.value = withRepeat(withSequence(withDelay(FREEZE_FX.glintEveryMs - 700, withTiming(1, { duration: 700 })), withTiming(0, { duration: 0 })), -1);
  }, () => { cancelAnimation(glint); glint.value = 0; }, !reducedMotion);
  const style = useAnimatedStyle(() => {
    const p = arcPoint(t.value, from.value, { x: 0, y: 0 }, 80);
    const s = t.value < 1 ? 0.6 + 0.4 * t.value + 0.35 * Math.sin(Math.PI * t.value) : 1;
    return { opacity: Math.min(1, t.value * 4), transform: [{ translateX: p.x }, { translateY: p.y + kick.value }, { scale: s * land.value },
      { rotate: `${(1 - t.value) * 200}deg` }] };
  });
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashRing.value, transform: [{ scale: 1 + 0.5 * (1 - flashRing.value) }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value <= 0 || ring.value >= 1 ? 0 : 0.9 * (1 - ring.value),
    transform: [{ scale: 0.8 + 1.7 * ring.value }] }));
  const glintStyle = useAnimatedStyle(() => ({ opacity: glint.value > 0 && glint.value < 1 ? 1 : 0,
    transform: [{ translateX: -size + size * 2 * glint.value }, { rotate: '24deg' }] }));
  return (
    <View style={{ width: size, height: size, zIndex: fly ? 5 : 0 }} accessibilityLabel="Streak freeze">
      {fly && <Animated.View pointerEvents="none" style={[styles.flash, { width: size + 12, height: size + 12, borderRadius: size }, flashStyle]} />}
      {fly && !reducedMotion && (
        <Animated.View pointerEvents="none" style={[styles.frostRing, { width: size + 8, height: size + 8, borderRadius: size, left: -4, top: -4 }, ringStyle]} />
      )}
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Image cachePolicy="memory-disk" source={FREEZE} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: size * 0.3 }]} pointerEvents="none">
          <Animated.View style={[{ width: size * 0.35, height: size * 1.6, top: -size * 0.3 }, glintStyle]}>
            <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      </Animated.View>
      {puffs > 0 && <FrostPuff progress={frost} count={puffs} radius={size * 1.2} />}
    </View>
  );
}

/** Frost sparkles: small white and ice-blue dots (code-drawn) puffing out and fading. */
export function FrostPuff({ progress, count, radius }: { readonly progress: SharedValue<number>; readonly count: number; readonly radius: number }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + 0.4;
    return { dx: Math.cos(a) * radius, dy: Math.sin(a) * radius, s: 5 + (i % 3) * 2, c: i % 2 ? BRAND.white : '#bfe8ff' };
  }), [count, radius]);
  return (
    <View pointerEvents="none" style={styles.puffOrigin}>
      {pieces.map((p, i) => <Puff key={i} p={p} progress={progress} />)}
    </View>
  );
}

function Puff({ p, progress }: { readonly p: { dx: number; dy: number; s: number; c: string }; readonly progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    if (t <= 0 || t >= 1) return { opacity: 0 };
    const out = 1 - Math.pow(1 - t, 3);
    return { opacity: 1 - t, transform: [{ translateX: p.dx * out }, { translateY: p.dy * out + 10 * t * t }, { scale: 1 - 0.4 * t }] };
  });
  return <Animated.View style={[{ position: 'absolute', left: -p.s / 2, top: -p.s / 2, width: p.s, height: p.s, borderRadius: p.s, backgroundColor: p.c }, style]} />;
}

/**
 * A freeze kept the flame going: the flame sits inside a thin ice shell, a crack
 * draws across it, the two halves fall away gently (600 ms) and the flame
 * breathes out warm again. Finn gives a happy fin. No timers, no shop.
 */
export function FreezeSavedCard({ streak, days, reducedMotion, onDone }: {
  readonly streak: number;
  /** How many missed days the freeze covered. */
  readonly days: number;
  readonly reducedMotion: boolean;
  readonly onDone: () => void;
}) {
  const crack = useSharedValue(reducedMotion ? 1 : 0);
  const fall = useSharedValue(reducedMotion ? 1 : 0);
  const warm = useSharedValue(reducedMotion ? 1 : 0);
  const words = useSharedValue(reducedMotion ? 1 : 0);
  const finn = useSharedValue(reducedMotion ? 1 : 0);
  const press = useSharedValue(1);
  const frost = useSharedValue(0);
  const budget = usePowerBudget();
  const puffs = reducedMotion ? 0 : momentParticles(FREEZE_FX.frost * 2, budget, false);
  const SHELL = 150;
  const crackPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(SHELL / 2 + 4, 4); p.lineTo(SHELL / 2 - 8, SHELL * 0.3); p.lineTo(SHELL / 2 + 10, SHELL * 0.5);
    p.lineTo(SHELL / 2 - 6, SHELL * 0.72); p.lineTo(SHELL / 2 + 3, SHELL - 4);
    return p;
  }, []);
  useEffect(() => {
    if (reducedMotion) { queueHaptic('hitMedium'); playSfx(LOOP_CUES.freezeSaved.fallback, 0.8); return; }
    const C = FREEZE_FX.crackAt;
    crack.value = withDelay(C, withTiming(1, { duration: 160, easing: EASE.out }));
    fall.value = withDelay(C + 220, withTiming(1, { duration: FREEZE_FX.fallMs, easing: EASE.in }));
    frost.value = withDelay(C + 200, withTiming(1, { duration: 700, easing: EASE.out }));
    warm.value = withDelay(C + 260, withSpring(1, SPRING.pop));
    words.value = withDelay(C + 520, withSpring(1, SPRING.stamp));
    finn.value = withDelay(C + 700, withSpring(1, SPRING.land));
    const t1 = setTimeout(() => queueHaptic('tickSelection'), C);
    const t2 = setTimeout(() => { queueHaptic('hitMedium'); playSfx(LOOP_CUES.freezeSaved.fallback, 0.8); }, C + 220);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const left = useAnimatedStyle(() => ({ opacity: 1 - fall.value, transform: [{ translateX: -34 * fall.value }, { translateY: 70 * fall.value * fall.value },
    { rotate: `${-18 * fall.value}deg` }] }));
  const right = useAnimatedStyle(() => ({ opacity: 1 - fall.value, transform: [{ translateX: 34 * fall.value }, { translateY: 70 * fall.value * fall.value },
    { rotate: `${18 * fall.value}deg` }] }));
  const crackStyle = useAnimatedStyle(() => ({ opacity: fall.value > 0.05 ? 0 : 1 }));
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + 0.08 * warm.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.2 + 0.6 * warm.value }));
  const wordsStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, words.value * 1.5), transform: [{ scale: 1.3 - 0.3 * words.value }] }));
  const finnStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, finn.value * 2), transform: [{ translateX: -40 * (1 - finn.value) }] }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  return (
    <View style={styles.card}>
      <CardSurface />
      <View style={styles.stage}>
        <Animated.View style={[styles.glow, glowStyle]}>
          <Image cachePolicy="memory-disk" source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" tintColor="#FFD54A" transition={0} />
        </Animated.View>
        <Animated.View style={flameStyle}><FlameArt days={streak} size={128} reducedMotion={reducedMotion} /></Animated.View>
        {/* The ice shell: two halves of a pale dome, a crack drawn across, then they fall away. */}
        <View style={[styles.shell, { width: SHELL, height: SHELL }]} pointerEvents="none">
          <Animated.View style={[styles.half, { width: SHELL / 2, height: SHELL, left: 0 }, left]}>
            <View style={[styles.dome, { width: SHELL, height: SHELL, borderRadius: SHELL / 2 }]} />
          </Animated.View>
          <Animated.View style={[styles.half, { width: SHELL / 2, height: SHELL, left: SHELL / 2 }, right]}>
            <View style={[styles.dome, { width: SHELL, height: SHELL, borderRadius: SHELL / 2, left: -SHELL / 2 }]} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, crackStyle]}>
            <Canvas style={{ width: SHELL, height: SHELL }}>
              <Path path={crackPath} style="stroke" strokeWidth={3.5} color={BRAND.white} strokeCap="round" strokeJoin="round" end={crack} />
            </Canvas>
          </Animated.View>
        </View>
        {puffs > 0 && <View style={styles.center}><FrostPuff progress={frost} count={puffs} radius={95} /></View>}
        <Image cachePolicy="memory-disk" source={FREEZE} style={styles.badge} contentFit="contain" />
      </View>
      <Animated.View style={wordsStyle}>
        <Text style={styles.lead}>Your freeze saved your flame!</Text>
        <Text style={styles.small}>{days > 1 ? `It covered ${days} days. ${streak} days and counting!` : `${streak} days and counting!`}</Text>
      </Animated.View>
      <View style={styles.bottom}>
        <Animated.View style={[styles.finn, finnStyle]} pointerEvents="none">
          <Image cachePolicy="memory-disk" source={FINN} style={{ width: 70, height: 70 }} contentFit="contain" />
        </Animated.View>
        <Animated.View style={[{ flex: 1 }, btnStyle]}>
          <Pressable onPress={onDone} accessibilityRole="button" style={styles.button}
            onPressIn={() => { press.value = withTiming(PRESS.scale, { duration: PRESS.inMs }); }}
            onPressOut={() => { press.value = withSpring(1, PRESS.spring); }}>
            <Text style={styles.buttonText}>KEEP IT GOING</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * The streak ended: the flame gently settles into a warm ember (no tears, no
 * sad shark, no red, no countdown) and invites a new flame.
 */
export function EmberCard({ was, reducedMotion, onDone }: {
  /** The flame size it settles from. */
  readonly was: number;
  readonly reducedMotion: boolean;
  readonly onDone: () => void;
}) {
  const from = flameLook(was).scale / flameLook(0).scale;
  const s = useSharedValue(reducedMotion ? 1 : from);
  const words = useSharedValue(reducedMotion ? 1 : 0);
  const press = useSharedValue(1);
  useEffect(() => {
    queueHaptic('tickSelection');
    if (reducedMotion) return;
    s.value = withDelay(250, withTiming(1, { duration: 900, easing: EASE.inOut }));
    words.value = withDelay(700, withSpring(1, SPRING.stamp));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const wordsStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, words.value * 1.5), transform: [{ translateY: (1 - words.value) * 10 }] }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  return (
    <View style={styles.card}>
      <CardSurface />
      <View style={styles.stage}>
        <Animated.View style={flameStyle}><FlameArt days={0} size={120} reducedMotion={reducedMotion} /></Animated.View>
      </View>
      <Animated.View style={wordsStyle}>
        <Text style={styles.lead}>Start a new flame today!</Text>
        <Text style={styles.small}>{`Your best is ${was} days. Finish Daily 3 to light it.`}</Text>
      </Animated.View>
      <Animated.View style={[{ alignSelf: 'stretch' }, btnStyle]}>
        <Pressable onPress={onDone} accessibilityRole="button" style={styles.button}
          onPressIn={() => { press.value = withTiming(PRESS.scale, { duration: PRESS.inMs }); }}
          onPressOut={() => { press.value = withSpring(1, PRESS.spring); }}>
          <Text style={styles.buttonText}>LET'S GO</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slots: { gap: 4, alignItems: 'center' },
  flash: { position: 'absolute', left: -6, top: -6, borderWidth: 4, borderColor: '#bfe8ff', backgroundColor: 'rgba(191,232,255,0.35)' },
  frostRing: { position: 'absolute', borderWidth: 3, borderColor: '#bfe8ff' },
  slot: { borderRadius: 10, borderWidth: 2.5, borderStyle: 'dashed', borderColor: '#9fd2f5', alignItems: 'center', justifyContent: 'center' },
  slotOpen: { borderColor: BRAND.gold, backgroundColor: 'rgba(255, 207, 59, 0.15)' },
  plus: { fontFamily: 'Shark', fontSize: 22, color: BRAND.gold, marginTop: -2 },
  puffOrigin: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  card: { width: '94%', marginTop: -14, backgroundColor: BRAND.blue, borderRadius: 24, borderWidth: 4, borderColor: BRAND.white,
    paddingTop: 22, paddingBottom: 14, paddingHorizontal: 14, alignItems: 'center', gap: 10 },
  stage: { width: '100%', height: 190, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  glow: { position: 'absolute', width: 220, height: 220 },
  shell: { position: 'absolute' },
  half: { position: 'absolute', top: 0, overflow: 'hidden' },
  dome: { position: 'absolute', top: 0, backgroundColor: 'rgba(217, 241, 255, 0.55)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  badge: { position: 'absolute', right: 34, bottom: 6, width: 54, height: 54 },
  lead: { fontFamily: 'Shark', fontSize: 23, color: BRAND.white, textAlign: 'center' },
  small: { fontFamily: 'Shark', fontSize: 16, color: '#e4f7ff', textAlign: 'center', marginTop: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 6 },
  finn: { width: 70, height: 70 },
  button: { alignSelf: 'stretch', backgroundColor: BRAND.gold, borderRadius: 16, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 4,
    borderBottomColor: BRAND.goldLip },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
});

