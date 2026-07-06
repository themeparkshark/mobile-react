/**
 * Juice.ts — reusable Reanimated game-feel primitives.
 *
 * All animation runs on the UI thread. Each helper returns { style, ...fire }
 * where `style` goes onto an Animated.View and the fire functions are safe to
 * call from JS-thread event handlers.
 *
 * Primitives:
 *   - useSpringScale : squash/stretch pop on demand (taps, hits).
 *   - useShake       : screen / element shake, capped at MAX_SHAKE_MS.
 *   - useFlash       : full-bleed color flash overlay (big hits, fails).
 *   - usePopIn       : mount pop-in / pop-out presets.
 */

import { useCallback, useMemo } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  cancelAnimation,
  runOnJS,
  Easing,
  type SharedValue,
  type AnimatedStyle,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';
import { JUICE, MAX_SHAKE_MS } from './theme';

// =============================================================================
// Spring scale (squash / stretch)
// =============================================================================

export interface SpringScaleResult {
  scale: SharedValue<number>;
  style: AnimatedStyle<ViewStyle>;
  /** Pop out then settle (a "hit" / success punch). */
  pop: (to?: number) => void;
  /** Squash down (press-in). Pair with release(). */
  squash: (to?: number) => void;
  /** Return to rest scale. */
  release: () => void;
}

export function useSpringScale(initial = 1): SpringScaleResult {
  const scale = useSharedValue(initial);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pop = useCallback(
    (to: number = JUICE.popTo) => {
      scale.value = withSequence(
        withTiming(to, { duration: 90, easing: Easing.out(Easing.quad) }),
        withSpring(1, JUICE.popSpring),
      );
    },
    [scale],
  );

  const squash = useCallback(
    (to: number = JUICE.squashTo) => {
      scale.value = withSpring(to, JUICE.pressSpring);
    },
    [scale],
  );

  const release = useCallback(() => {
    scale.value = withSpring(1, JUICE.popSpring);
  }, [scale]);

  return useMemo(
    () => ({ scale, style, pop, squash, release }),
    [scale, style, pop, squash, release],
  );
}

// =============================================================================
// Shake (screen / element)
// =============================================================================

export interface ShakeResult {
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  style: AnimatedStyle<ViewStyle>;
  /**
   * Fire a shake. `intensity` is peak offset in px; `ms` is total duration,
   * hard-capped at MAX_SHAKE_MS to honor the quality bar.
   */
  shake: (intensity?: number, ms?: number) => void;
}

export function useShake(): ShakeResult {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const shake = useCallback(
    (intensity = 8, ms = 100) => {
      const dur = Math.min(ms, MAX_SHAKE_MS);
      // ~4 oscillations within the duration.
      const cycles = 4;
      const step = Math.max(8, Math.round(dur / (cycles * 2)));
      const decay = (n: number) => intensity * (1 - n / (cycles * 2 + 1));

      cancelAnimation(translateX);
      cancelAnimation(translateY);

      const seqX = [];
      const seqY = [];
      for (let i = 0; i < cycles * 2; i++) {
        const sign = i % 2 === 0 ? 1 : -1;
        seqX.push(withTiming(sign * decay(i), { duration: step, easing: Easing.linear }));
        // Y jitters at half amplitude, offset phase, for a less mechanical feel.
        seqY.push(
          withTiming(-sign * decay(i) * 0.5, { duration: step, easing: Easing.linear }),
        );
      }
      seqX.push(withTiming(0, { duration: step }));
      seqY.push(withTiming(0, { duration: step }));

      // withSequence requires at least 2 args; we always have many.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      translateX.value = (withSequence as any)(...seqX);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      translateY.value = (withSequence as any)(...seqY);
    },
    [translateX, translateY],
  );

  return useMemo(
    () => ({ translateX, translateY, style, shake }),
    [translateX, translateY, style, shake],
  );
}

// =============================================================================
// Flash overlay
// =============================================================================

export interface FlashResult {
  opacity: SharedValue<number>;
  style: AnimatedStyle<ViewStyle>;
  /** Flash to `peak` opacity then fade out over `ms`. */
  flash: (peak?: number, ms?: number) => void;
}

export function useFlash(): FlashResult {
  const opacity = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const flash = useCallback(
    (peak = 0.6, ms: number = JUICE.flashMs) => {
      cancelAnimation(opacity);
      opacity.value = withSequence(
        withTiming(peak, { duration: Math.min(60, ms * 0.4), easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: ms, easing: Easing.in(Easing.quad) }),
      );
    },
    [opacity],
  );

  return useMemo(() => ({ opacity, style, flash }), [opacity, style, flash]);
}

// =============================================================================
// Pop in / out (mount transitions)
// =============================================================================

export interface PopInResult {
  scale: SharedValue<number>;
  opacity: SharedValue<number>;
  style: AnimatedStyle<ViewStyle>;
  popIn: () => void;
  popOut: (onDone?: () => void) => void;
}

export function usePopIn(startVisible = false): PopInResult {
  const scale = useSharedValue(startVisible ? 1 : 0.6);
  const opacity = useSharedValue(startVisible ? 1 : 0);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const popIn = useCallback(() => {
    opacity.value = withTiming(1, { duration: 120 });
    scale.value = withSpring(1, JUICE.popSpring);
  }, [opacity, scale]);

  const popOut = useCallback(
    (onDone?: () => void) => {
      opacity.value = withTiming(0, { duration: 140 });
      scale.value = withTiming(0.6, { duration: 140 }, (finished) => {
        'worklet';
        if (finished && onDone) {
          // Hop back to JS thread for the completion callback.
          runOnJS(onDone)();
        }
      });
    },
    [opacity, scale],
  );

  return useMemo(
    () => ({ scale, opacity, style, popIn, popOut }),
    [scale, opacity, style, popIn, popOut],
  );
}

// =============================================================================
// Pulse (looping attention / fever glow) — bonus preset
// =============================================================================

export interface PulseResult {
  value: SharedValue<number>;
  style: AnimatedStyle<ViewStyle>;
  start: (min?: number, max?: number, ms?: number) => void;
  stop: () => void;
}

export function usePulse(): PulseResult {
  const value = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: value.value }] }));

  const start = useCallback(
    (min = 1, max = 1.08, ms = 500) => {
      cancelAnimation(value);
      value.value = min;
      value.value = withRepeat(
        withSequence(
          withTiming(max, { duration: ms, easing: Easing.inOut(Easing.quad) }),
          withTiming(min, { duration: ms, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    },
    [value],
  );

  const stop = useCallback(() => {
    cancelAnimation(value);
    value.value = withTiming(1, { duration: 150 });
  }, [value]);

  return useMemo(() => ({ value, style, start, stop }), [value, style, start, stop]);
}
