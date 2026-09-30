/**
 * motion.ts: Reanimated animation recipes in the studio grammar.
 *
 * Each returns an animation you assign to a SharedValue (UI thread, no React
 * renders): anticipation, overshoot, settle, pops, slams, wobbles, squash and
 * stretch. Use core/ease.ts for the same curves inside worklets/Skia.
 *
 *   scale.value = withPop(1.18);
 *   badge.value = withSlam(2.4);               // FEVER! / star stamps
 *   x.value = withAnticipation(x.value, 120);  // wind-up, action, settle
 *   const sq = useSquashStretch(); sq.impact(0.14); <Animated.View style={sq.style}>
 */

import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
  type WithSpringConfig,
} from 'react-native-reanimated';

export const SPRING = {
  pop: { damping: 9, stiffness: 320, mass: 0.6 },
  settle: { damping: 14, stiffness: 180, mass: 0.9 },
  press: { damping: 12, stiffness: 400, mass: 0.5 },
  emerge: { damping: 10, stiffness: 380, mass: 0.5 },
  kick: { damping: 12, stiffness: 500, mass: 1 },
  badge: { damping: 9, stiffness: 320, mass: 0.8 },
} satisfies Record<string, WithSpringConfig>;

/** 1 -> peak -> spring back to 1 (hits, pickups, HUD punches). */
export function withPop(peak = 1.18, inMs = 90, spring: WithSpringConfig = SPRING.pop) {
  'worklet';
  return withSequence(
    withTiming(peak, { duration: inMs, easing: Easing.out(Easing.quad) }),
    withSpring(1, spring),
  );
}

/** Pop in from `from` (0 = appear): 0 -> peak -> 1. */
export function withPopIn(from = 0, peak = 1.15, inMs = 120, spring: WithSpringConfig = SPRING.pop) {
  'worklet';
  return withSequence(
    withTiming(from, { duration: 0 }),
    withTiming(peak, { duration: inMs, easing: Easing.out(Easing.back(1.6)) }),
    withSpring(1, spring),
  );
}

/** Slam: big -> slightly under -> 1 with a hard stop (FEVER!, stars, VS). */
export function withSlam(from = 2.2, inMs = 140, spring: WithSpringConfig = SPRING.badge) {
  'worklet';
  return withSequence(
    withTiming(from, { duration: 0 }),
    withTiming(0.92, { duration: inMs, easing: Easing.in(Easing.quad) }),
    withSpring(1, spring),
  );
}

/**
 * Anticipation -> action -> overshoot -> settle from `from` to `to`.
 * dip and overshoot are fractions of the travel.
 */
export function withAnticipation(from: number, to: number, opts: { dip?: number; antMs?: number; actMs?: number; overshoot?: number; spring?: WithSpringConfig } = {}) {
  'worklet';
  const travel = to - from;
  const dip = opts.dip ?? 0.12;
  const over = opts.overshoot ?? 0.1;
  return withSequence(
    withTiming(from - travel * dip, { duration: opts.antMs ?? 90, easing: Easing.out(Easing.quad) }),
    withTiming(to + travel * over, { duration: opts.actMs ?? 140, easing: Easing.out(Easing.cubic) }),
    withSpring(to, opts.spring ?? SPRING.settle),
  );
}

/** Decaying shake around 0 (px). Capped at maxMs (walk-safe). */
export function withWobble(amp = 6, durMs = 150, cycles = 3) {
  'worklet';
  const steps = cycles * 2;
  const step = Math.max(10, Math.round(durMs / (steps + 1)));
  const seq = [];
  for (let i = 0; i < steps; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    seq.push(withTiming(sign * amp * (1 - i / steps), { duration: step, easing: Easing.linear }));
  }
  seq.push(withTiming(0, { duration: step }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (withSequence as any)(...seq);
}

/** Delay helper that reads well in stagger loops. */
export function after(ms: number, anim: number) {
  'worklet';
  return withDelay(ms, anim);
}

export interface SquashStretch {
  sx: SharedValue<number>;
  sy: SharedValue<number>;
  style: ViewStyle;
  /** Squash on impact (depth 0.1-0.2), springs back with a wobble. */
  impact: (depth?: number) => void;
  /** Stretch up (anticipation of a jump / emerge). */
  stretch: (amount?: number, ms?: number) => void;
  /** Emerge pop: scaleX 1.12 / scaleY 0.90 spring to rest. */
  emerge: () => void;
}

/** Volume-preserving squash and stretch for an Animated.View. */
export function useSquashStretch(anchorBottom = true, height = 0): SquashStretch {
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const style = useAnimatedStyle((): ViewStyle => ({
    transform: anchorBottom && height > 0
      ? [{ translateY: (height * (1 - sy.value)) / 2 }, { scaleX: sx.value }, { scaleY: sy.value }]
      : [{ scaleX: sx.value }, { scaleY: sy.value }],
  }));
  return useMemo(() => ({
    sx, sy, style,
    impact: (depth = 0.14) => {
      const y = 1 - depth;
      sy.value = withSequence(withTiming(y, { duration: 50, easing: Easing.out(Easing.quad) }), withSpring(1, SPRING.pop));
      sx.value = withSequence(withTiming(1 / Math.sqrt(y), { duration: 50, easing: Easing.out(Easing.quad) }), withSpring(1, SPRING.pop));
    },
    stretch: (amount = 0.12, ms = 80) => {
      const y = 1 + amount;
      sy.value = withSequence(withTiming(y, { duration: ms }), withSpring(1, SPRING.settle));
      sx.value = withSequence(withTiming(1 / Math.sqrt(y), { duration: ms }), withSpring(1, SPRING.settle));
    },
    emerge: () => {
      sx.value = withSequence(withTiming(1.12, { duration: 0 }), withSpring(1, SPRING.emerge));
      sy.value = withSequence(withTiming(0.9, { duration: 0 }), withSpring(1, SPRING.emerge));
    },
  }), [sx, sy, style]);
}
