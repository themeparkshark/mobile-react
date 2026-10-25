import { Image, type ImageSource } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { withDelayUntil } from './delayUntil';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { queueHaptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { counterTicks } from '../../services/retention/counterTicks';
import { PRIZE_FLIGHT, arcPoint, type FlightLeg, type FlightTarget } from '../../services/retention/loopMotion';
import { BRAND, ICON_SOURCES } from '../../ui';
import { HUD_BUMP, SPRING } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';

export interface Point { readonly x: number; readonly y: number }
export interface FlightSpec extends FlightLeg {
  /** Where its row's icon sat on screen (window points). */
  readonly from: Point;
  /** The HUD counter it lives in (window points). */
  readonly to: Point;
}

const ICON: Record<FlightTarget, ImageSource | number> = { coins: ICON_SOURCES.coin, tickets: ICON_SOURCES.ticket, energy: ICON_SOURCES.energy };
const ICON_SIZE = 34;

/**
 * Prizes fly home in plain sight: each icon lifts off its own prize row and
 * arcs to its HUD counter (coins first, then tickets, then energy), shrinking
 * a little as it goes. Every landing flashes a gold ring on the counter and
 * bumps it (HUD_BUMP) and steps its number up (counterTicks), the first landing
 * pops a "+N" just under it (never up into the status bar), and a light
 * haptic and a rising tick play per landing. All motion is scheduled on the
 * UI thread from the first frame (withDelay); JS timers only fire the haptics
 * and sounds. The layer never takes touches.
 */
export default function PrizeFlight({ legs, origin, reducedMotion, startAt, landed }: {
  readonly legs: readonly FlightSpec[];
  /** Written on the UI thread (epoch ms) the frame the last icon lands: the next card grows in from here. */
  readonly landed?: SharedValue<number>;
  /** When the flight starts (epoch ms, UI thread): the icons keep their marks however late this mounts, so the next
   * card (entering on the same clock) never overlaps or lags the landings. */
  readonly startAt?: number;
  /** The layer's own window origin (subtracted from every point). */
  readonly origin: Point;
  readonly reducedMotion: boolean;
}) {
  // Sounds and haptics on each landing, climbing a little each time (the coin_tick ladder's fallback).
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let step = 0;
    // Time already gone since the flight's mark (a late mount catches up instead of shifting every landing).
    const gone = startAt ? Math.max(0, Date.now() - startAt) : 0;
    // Each HUD counter steps up as its icons land (never a jump after the flight).
    legs.forEach(leg => {
      const landings = reducedMotion ? [160]
        : Array.from({ length: leg.icons }, (_, i) => Math.max(0, leg.delay + i * PRIZE_FLIGHT.stepMs + PRIZE_FLIGHT.flyMs - gone));
      counterTicks.plan(leg.target, { amount: leg.amount, landings });
    });
    legs.forEach(leg => {
      for (let i = 0; i < leg.icons; i++) {
        const at = reducedMotion ? 160 : leg.delay + i * PRIZE_FLIGHT.stepMs + PRIZE_FLIGHT.flyMs;
        const n = step++;
        timers.push(setTimeout(() => {
          queueHaptic(i === leg.icons - 1 ? 'hitMedium' : 'tapLight');
          playSfx(leg.target === 'coins' ? 'fx.coinTick' : 'ui.select', 0.45 + Math.min(0.5, n * 0.04));
        }, Math.max(0, at - gone)));
        if (reducedMotion) break;
      }
    });
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lastLeg = legs.reduce<FlightSpec | null>((m, l) => (!m || l.lastLand >= m.lastLand ? l : m), null);
  // Reduce Motion (no icons fly): the counters tick at once and the next card follows right away.
  useEffect(() => { if (reducedMotion && landed) landed.value = Date.now() + 160; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {legs.map(leg => <Leg key={leg.target} leg={leg} origin={origin} reducedMotion={reducedMotion} startAt={startAt}
        landed={leg === lastLeg ? landed : undefined} />)}
    </View>
  );
}

function Leg({ leg, origin, reducedMotion, startAt, landed }: {
  readonly leg: FlightSpec; readonly origin: Point; readonly reducedMotion: boolean; readonly startAt?: number; readonly landed?: SharedValue<number>;
}) {
  const at = <T,>(ms: number, a: T): T => (startAt ? (withDelayUntil(startAt + ms, a as never) as T) : (withDelay(ms, a as never) as T));
  const from = { x: leg.from.x - origin.x, y: leg.from.y - origin.y };
  const to = { x: leg.to.x - origin.x, y: leg.to.y - origin.y };
  const firstLand = leg.delay + PRIZE_FLIGHT.flyMs;
  const ring = useSharedValue(0);
  const bump = useSharedValue(1);
  const plus = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) {
      plus.value = withSequence(withTiming(1, { duration: 160 }), withDelay(500, withTiming(0, { duration: 160 })));
      return;
    }
    // One ring flash per landing, the counter bumps on each (HUD_BUMP), the "+N" pops on the first.
    const span = (leg.icons - 1) * PRIZE_FLIGHT.stepMs;
    ring.value = at(firstLand, withTiming(1, { duration: span + 360, easing: EASE.out }));
    bump.value = at(firstLand, withSequence(
      ...Array.from({ length: Math.min(leg.icons, 4) }, () => withSequence(
        withTiming(HUD_BUMP.peak, { duration: 50 }), withTiming(1.04, { duration: Math.max(40, span / 4) }))),
      withSpring(1, SPRING.stamp)));
    plus.value = at(firstLand, withSequence(withSpring(1, SPRING.pop), withDelay(420, withTiming(0, { duration: 220, easing: EASE.in }))));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const icons = useMemo(() => Array.from({ length: reducedMotion ? 0 : leg.icons }, (_, i) => {
    // A small spread around the row icon, so they peel off like a handful, not a single file.
    const a = i * 2.39996;
    const r = i === 0 ? 0 : 6 + (i % 3) * 5;
    return { i, dx: Math.cos(a) * r, dy: Math.sin(a) * r, lift: 90 + (i % 4) * 22 };
  }), [leg.icons, reducedMotion]);
  const ringStyle = useAnimatedStyle(() => {
    const t = ring.value;
    // Pulses as each icon lands (a sawtooth over the landing span), then fades.
    const pulses = Math.max(1, Math.min(4, leg.icons));
    const phase = (t * pulses) % 1;
    return { opacity: t <= 0 || t >= 1 ? 0 : 0.85 * (1 - phase) * (1 - t * 0.5), transform: [{ scale: (0.6 + phase * 0.9) * bump.value }] };
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: ring.value <= 0 || ring.value >= 1 ? 0 : 0.55 * (1 - ring.value), transform: [{ scale: bump.value }] }));
  // The "+N" pops just below its counter and drifts down a little: never up over the clock or the Dynamic Island.
  const plusStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, plus.value * 1.4), transform: [{ translateY: 22 + 10 * plus.value }, { scale: 0.6 + 0.4 * plus.value }] }));
  return (
    <>
      {icons.map(p => (
        <FlyingIcon key={p.i} source={ICON[leg.target]} from={{ x: from.x + p.dx, y: from.y + p.dy }} to={to} lift={p.lift}
          delay={leg.delay + p.i * PRIZE_FLIGHT.stepMs} startAt={startAt} landed={p.i === icons.length - 1 ? landed : undefined} />
      ))}
      <Animated.View style={[styles.at, { left: to.x - 30, top: to.y - 30 }, glowStyle]}>
        <View style={styles.glow} />
      </Animated.View>
      <Animated.View style={[styles.at, { left: to.x - 30, top: to.y - 30 }, ringStyle]}>
        <View style={styles.ring} />
      </Animated.View>
      <Animated.View style={[styles.plusAt, { left: to.x - 50, top: to.y - 14 }, plusStyle]}>
        <Text style={styles.plus} allowFontScaling={false}>{`+${leg.amount}`}</Text>
      </Animated.View>
    </>
  );
}

function FlyingIcon({ source, from, to, lift, delay, startAt, landed }: {
  readonly source: ImageSource | number; readonly from: Point; readonly to: Point; readonly lift: number; readonly delay: number; readonly startAt?: number;
  readonly landed?: SharedValue<number>;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    // From the flight's mark (worked out now): a late mount starts at once rather than shifting every icon.
    const d = startAt ? Math.max(0, startAt + delay - Date.now()) : delay;
    t.value = withDelay(d, withTiming(1, { duration: PRIZE_FLIGHT.flyMs, easing: EASE.inOut }, finished => {
      'worklet';
      // The last icon home: the next card's cue (on the UI thread, whatever the JS thread is doing).
      if (landed) landed.value = Date.now();
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => fly(t, from, to, lift));
  return (
    <Animated.View style={[styles.icon, style]}>
      <Image cachePolicy="memory-disk" source={source} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
    </Animated.View>
  );
}

function fly(t: SharedValue<number>, from: Point, to: Point, lift: number) {
  'worklet';
  const v = t.value;
  if (v <= 0 || v >= 1) return { opacity: v <= 0 ? 1 : 0, transform: [{ translateX: from.x - ICON_SIZE / 2 }, { translateY: from.y - ICON_SIZE / 2 }, { scale: v <= 0 ? 1 : 0.5 }] };
  const p = arcPoint(v, from, to, lift);
  // A little pop as it lifts off, then it shrinks into the counter.
  const s = v < 0.15 ? 1 + 0.25 * (v / 0.15) : 1.25 - 0.7 * ((v - 0.15) / 0.85);
  return { opacity: 1, transform: [{ translateX: p.x - ICON_SIZE / 2 }, { translateY: p.y - ICON_SIZE / 2 }, { scale: s }, { rotate: `${v * 220}deg` }] };
}

const styles = StyleSheet.create({
  icon: { position: 'absolute', left: 0, top: 0, width: ICON_SIZE, height: ICON_SIZE },
  at: { position: 'absolute', width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 56, height: 56, borderRadius: 28, borderWidth: 4, borderColor: BRAND.gold },
  glow: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255, 224, 122, 0.7)' },
  plusAt: { position: 'absolute', width: 100, alignItems: 'center' },
  plus: { fontFamily: 'Shark', fontSize: 24, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
});
