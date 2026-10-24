/**
 * LiveScore: the header score that answers on the hit frame (wow-games lane, round 4).
 *
 * The number is a shared value the game writes on the UI thread when a hit lands (Whack's runtime
 * writes banked + live sim score inside its frame callback), so the biggest number on screen rolls
 * up on the same frame as the thump: no 250 ms JS poll, no React render per point.
 *
 *   - Roll: the shown value eases to the new total over ROLL_MS (EASE.out), drawn through the
 *     Reanimated TextInput technique (animated `text` prop), so nothing re-renders.
 *   - Hit: a small press-like punch (1.08) on every increase.
 *   - Landing: when a fly-to-score label arrives (`arrived`, bumped by FxStage on the UI thread)
 *     the pill bumps to HUD_BUMP.peak on SPRING.stamp and the digits flash gold, then settle.
 *   - Fever: the digits stay gold. Reduce Motion: the value jumps, no punch, the gold flash stays.
 *
 *   <LiveScore value={runtime.liveScore} arrived={flyArrived} fever={fever} reduced={rm} />
 */

import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import Animated, {
  cancelAnimation, interpolateColor, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue,
  withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { GOLD_FX, HUD_BUMP } from '../../ui/motion';
import { EASE } from '../../ui/motionEasing';
import { formatScore } from '../core/scoring';

Animated.addWhitelistedNativeProps({ text: true });
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/** Roll time for one hit's points (short: hits come fast, the number must keep up). */
export const LIVE_ROLL_MS = 260;
/** The punch on every increase (smaller than the landing bump). */
export const LIVE_HIT_PUNCH = 1.08;

export interface LiveScoreProps {
  value: SharedValue<number>;
  /** Bumped when a fly-to-score label lands in the pill. */
  arrived?: SharedValue<number>;
  fever?: boolean;
  reduced?: boolean;
}

export const LiveScore = React.memo(function LiveScore({ value, arrived, fever = false, reduced = false }: LiveScoreProps) {
  const shown = useSharedValue(value.value);
  const scale = useSharedValue(1);
  const gold = useSharedValue(0);
  const feverSv = useSharedValue(fever ? 1 : 0);
  React.useEffect(() => { feverSv.value = fever ? 1 : 0; }, [fever, feverSv]);

  useAnimatedReaction(
    () => value.value,
    (now, prev) => {
      if (prev == null || now === prev) return;
      if (reduced || now < prev) {
        // A new Run resets to 0 instantly (never a roll down).
        cancelAnimation(shown);
        shown.value = now;
        return;
      }
      shown.value = withTiming(now, { duration: LIVE_ROLL_MS, easing: EASE.out });
      scale.value = withSequence(withTiming(LIVE_HIT_PUNCH, { duration: 70 }), withSpring(1, HUD_BUMP.spring));
    },
    [reduced],
  );
  useAnimatedReaction(
    () => (arrived ? arrived.value : 0),
    (now, prev) => {
      if (prev == null || now === prev) return;
      gold.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 420 }));
      if (!reduced) scale.value = withSequence(withTiming(HUD_BUMP.peak, { duration: 80 }), withSpring(1, HUD_BUMP.spring));
    },
    [reduced, arrived],
  );

  const animatedProps = useAnimatedProps(() => {
    const text = formatScore(shown.value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { text, defaultValue: text } as any;
  });
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    color: interpolateColor(Math.max(gold.value, feverSv.value), [0, 1], ['#ffffff', GOLD_FX.rays]),
  }));

  return (
    <AnimatedInput
      editable={false}
      caretHidden
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={formatScore(value.value)}
      animatedProps={animatedProps}
      style={[styles.text, style]}
      accessibilityLabel="Score"
    />
  );
});

const styles = StyleSheet.create({
  text: {
    fontSize: 26,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    color: '#ffffff',
    textAlign: 'center',
    padding: 0,
    minWidth: 64,
    textShadowColor: 'rgba(5,52,110,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
});
