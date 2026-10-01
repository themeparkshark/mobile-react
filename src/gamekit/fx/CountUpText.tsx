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
  /** Fixed duration; default scales with the jump (250-1200ms). */
  durationMs?: number;
  /** Delay before counting (results cards stagger). */
  delayMs?: number;
  prefix?: string;
  suffix?: string;
  /** Punch scale on change (1 = none). */
  punch?: number;
  /** Call onTick every N points counted (JS thread). */
  tickEvery?: number;
  onTick?: () => void;
  onDone?: () => void;
  reducedMotion?: boolean;
  style?: StyleProp<TextStyle>;
}

export function CountUpText({
  value, durationMs, delayMs = 0, prefix = '', suffix = '', punch = 1.12, tickEvery = 0,
  onTick, onDone, reducedMotion = false, style,
}: CountUpTextProps) {
  const shown = useSharedValue(value);
  const scale = useSharedValue(1);
  const from = useRef(value);
  const lastTick = useSharedValue(value);

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
    const run = () => {
      shown.value = withTiming(value, { duration: ms, easing: Easing.out(Easing.cubic) }, (finished) => {
        'worklet';
        if (finished && onDone) runOnJS(onDone)();
      });
      scale.value = withSequence(withTiming(punch, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 300 }));
    };
    if (delayMs > 0) {
      const t = setTimeout(run, delayMs);
      return () => clearTimeout(t);
    }
    run();
    return undefined;
  }, [value, durationMs, delayMs, punch, reducedMotion, onDone, shown, scale]);

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
    const text = prefix + formatScore(shown.value) + suffix;
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
      defaultValue={prefix + formatScore(value) + suffix}
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
