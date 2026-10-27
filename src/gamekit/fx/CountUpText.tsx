/**
 * CountUpText: a score that counts up on the UI thread (no React re-render
 * per digit) with a punch on every change. Shark font, navy outline shadow.
 *
 *   <CountUpText value={score} style={{ fontSize: 40 }} />
 *   <CountUpText value={total} durationMs={900} onTick={() => coinTick()} />
 *
 * Uses the Reanimated TextInput technique (animated `text` prop). onTick
 * fires on JS about every `tickEvery` points for count-up sounds/haptics.
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, TextInput, type TextStyle, type StyleProp } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  withDelay,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { countUpMs, formatScore } from '../core/scoring';

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

export interface CountUpTextProps {
  value: number;
  /** Where the first count starts (results cards count up from 0). Default: value (no count on mount). */
  from?: number;
  /** Fixed duration; default scales with the jump (250-1200ms). */
  durationMs?: number;
  /** Delay before counting (results cards stagger). */
  delayMs?: number;
  /** Count up from this value on mount (a card that mounts with its final score still rolls). */
  fromValue?: number;
  prefix?: string;
  suffix?: string;
  /** Punch scale on change (1 = none). */
  punch?: number;
  /** When the punch lands: as the count starts (default) or on its last digit (a payoff counter). */
  punchAt?: 'start' | 'end';
  /** The roll's curve (worklet easing); default ease-out cubic. Ease-out quad keeps the climb visible longer. */
  easing?: (t: number) => number;
  /** Call onTick every N points counted (JS thread). */
  tickEvery?: number;
  onTick?: () => void;
  onDone?: () => void;
  reducedMotion?: boolean;
  /** 'short' shows 950, 1.2k, 12k (tight pills). Default: full number with commas. */
  format?: 'full' | 'short';
  style?: StyleProp<TextStyle>;
}

/** 950, 1.2k, 12k: same rule as trailModel.shortSteps, as a worklet. */
export function shortCount(value: number): string {
  'worklet';
  const v = Math.max(0, Math.round(value));
  if (v < 1000) return String(v);
  if (v < 10000) {
    const t = Math.floor(v / 100) / 10;
    return (t === Math.floor(t) ? String(t) : t.toFixed(1)) + 'k';
  }
  return String(Math.floor(v / 1000)) + 'k';
}

export function CountUpText({
  value, from: fromProp, durationMs, delayMs = 0, fromValue: fromValueProp, prefix = '', suffix = '', punch = 1.12, punchAt = 'start', easing, tickEvery = 0,
  onTick, onDone, reducedMotion = false, format = 'full', style,
}: CountUpTextProps) {
  const fromValue = fromValueProp ?? fromProp;
  const first = reducedMotion || fromValue == null ? value : fromValue;
  const shown = useSharedValue(first);
  const scale = useSharedValue(1);
  const from = useRef(first);
  /** The text on the first native frame: the count's start, not its end (a mounting card still rolls). */
  const firstText = useRef(first).current;
  const lastTick = useSharedValue(first);

  useEffect(() => {
    const start = from.current;
    from.current = value;
    cancelAnimation(shown);
    if (reducedMotion || start === value) {
      shown.value = value;
      if (start !== value) onDone?.();
      return;
    }
    const ms = durationMs ?? countUpMs(start, value);
    // The delay runs on the UI thread (withDelay), so a busy JS thread can never hold the roll on its first
    // number and then snap it (the r5 breather showed +0 for 500 ms, then the total in one frame).
    const wait = Math.max(0, delayMs);
    shown.value = withDelay(wait, withTiming(value, { duration: ms, easing: easing ?? Easing.out(Easing.cubic) }, (finished) => {
      'worklet';
      if (finished && onDone) runOnJS(onDone)();
    }));
    const pop = withSequence(withTiming(punch, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 300 }));
    scale.value = withDelay(punchAt === 'end' ? wait + ms : wait, pop);
    return () => { cancelAnimation(shown); cancelAnimation(scale); };
  }, [value, durationMs, delayMs, punch, punchAt, easing, reducedMotion, onDone, shown, scale]);

  useAnimatedReaction(
    () => Math.floor(shown.value),
    (now) => {
      if (tickEvery > 0 && onTick && Math.abs(now - lastTick.value) >= tickEvery) {
        lastTick.value = now;
        runOnJS(onTick)();
      }
    },
    [tickEvery, onTick],
  );

  const animatedProps = useAnimatedProps(() => {
    const text = prefix + (format === 'short' ? shortCount(shown.value) : formatScore(shown.value)) + suffix;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { text, defaultValue: text } as any;
  });
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedInput
      editable={false}
      caretHidden
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={prefix + (format === 'short' ? shortCount(firstText) : formatScore(firstText)) + suffix}
      animatedProps={animatedProps}
      style={[styles.text, style, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: 'Shark',
    fontSize: 36,
    color: '#ffffff',
    textAlign: 'center',
    padding: 0,
    textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
  },
});
