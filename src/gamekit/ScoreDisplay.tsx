/**
 * ScoreDisplay.tsx — tweened score counter with multiplier badge and
 * personal-best delta flash.
 *
 * The number tweens on the UI thread via a Reanimated shared value; we mirror
 * it into React state only as often as needed to update the <Text> (RN can't
 * bind text to a shared value directly, so samples arrive via useDerivedValue
 * and runOnJS; a sample from an older target cannot undo a round reset).
 *
 * Props are intentionally minimal so any game can drop this into its HUD.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withSequence,
  withSpring,
  runOnJS,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { GAME_COLORS, SCORE_TWEEN_MS, COMBO_TIER_COLORS, JUICE } from './theme';

interface ScoreDisplayProps {
  /** Target score. Animates up (or down) from the previous value. */
  score: number;
  /** Current multiplier (1,2,3,5…). Hidden when <= 1 unless showMultiplierAtOne. */
  multiplier?: number;
  /** Fever mode — tints the counter and pulses the badge. */
  fever?: boolean;
  /** Personal best to compare against; flashes gold when the score passes it. */
  personalBest?: number;
  /** Optional label above the number, e.g. "SCORE". */
  label?: string;
  /** Force-show the multiplier badge even at 1x. */
  showMultiplierAtOne?: boolean;
  compact?: boolean;
  reducedMotion?: boolean;
}

export function ScoreDisplay({
  score,
  multiplier = 1,
  fever = false,
  personalBest,
  label,
  showMultiplierAtOne = false,
  compact = false,
  reducedMotion = false,
}: ScoreDisplayProps) {
  const animated = useSharedValue(score);
  const [display, setDisplay] = useState(score);
  const prevScore = useRef(score);
  const generation = useRef(0);
  const sampleGeneration = useSharedValue(0);
  const beatenPB = useRef(false);
  const prevMultiplier = useRef(multiplier);

  // Badge + PB flash animation values.
  const badgeScale = useSharedValue(1);
  const pbFlash = useSharedValue(0);
  const punch = useSharedValue(1);

  // Tween the number toward `score`.
  useEffect(() => {
    generation.current += 1;
    sampleGeneration.value = generation.current;
    if (reducedMotion || score === 0) {
      cancelAnimation(animated); cancelAnimation(punch);
      animated.value = score; punch.value = 1; prevScore.current = score;
      setDisplay(score);
      return;
    }
    if (score !== prevScore.current) {
      animated.value = withTiming(score, {
        duration: SCORE_TWEEN_MS,
        easing: Easing.out(Easing.cubic),
      });
      // Punch the whole readout on any increase.
      if (score > prevScore.current) {
        punch.value = withSequence(
          withTiming(JUICE.popTo, { duration: 90 }),
          withSpring(1, JUICE.settleSpring),
        );
      }
      prevScore.current = score;
    }
  }, [score, reducedMotion, animated, punch, sampleGeneration]);

  const sampleScore = useCallback((value: number, target: number, epoch: number) => {
    // UI-thread samples queued by a previous round cannot overwrite its reset.
    if (prevScore.current === target && generation.current === epoch) setDisplay(value);
  }, []);

  // Sample the tweened value into React state for the <Text>.
  useDerivedValue(() => {
    const rounded = Math.round(animated.value);
    runOnJS(sampleScore)(rounded, score, sampleGeneration.value);
  }, [animated, score, sampleScore, sampleGeneration]);

  // Personal-best delta flash — one-shot when score first passes PB.
  useEffect(() => {
    if (personalBest == null) return;
    if (!beatenPB.current && score > personalBest && personalBest > 0) {
      beatenPB.current = true;
      pbFlash.value = reducedMotion ? 1 : withSequence(
        withTiming(1, { duration: 140 }),
        withTiming(0, { duration: 600, easing: Easing.in(Easing.quad) }),
      );
    }
    if (score <= personalBest) { beatenPB.current = false; cancelAnimation(pbFlash); pbFlash.value = 0; }
    if (reducedMotion) { cancelAnimation(pbFlash); pbFlash.value = beatenPB.current ? 1 : 0; }
  }, [score, personalBest, reducedMotion, pbFlash]);

  // Pop the badge whenever the multiplier changes.
  useEffect(() => {
    if (reducedMotion) { cancelAnimation(badgeScale); badgeScale.value = 1; }
    else if (prevMultiplier.current !== multiplier) badgeScale.value = withSequence(
      withTiming(1.35, { duration: 90 }),
      withSpring(1, JUICE.popSpring),
    );
    prevMultiplier.current = multiplier;
  }, [multiplier, reducedMotion, badgeScale]);
  useEffect(() => () => { [animated, punch, badgeScale, pbFlash].forEach(cancelAnimation); },
    [animated, punch, badgeScale, pbFlash]);

  const rootStyle = useAnimatedStyle(() => ({
    transform: [{ scale: punch.value }],
  }));

  const pbStyle = useAnimatedStyle(() => ({
    opacity: pbFlash.value,
    transform: [{ translateY: (1 - pbFlash.value) * 8 }],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  const tierColor =
    (COMBO_TIER_COLORS as Record<number, string>)[multiplier] ?? GAME_COLORS.blue;
  const showBadge = multiplier > 1 || showMultiplierAtOne;
  const numberColor = fever ? GAME_COLORS.gold : GAME_COLORS.text;

  return (
    <Animated.View style={[styles.root, rootStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <Text
          style={[
            compact ? styles.numberCompact : styles.number,
            { color: numberColor },
            fever && styles.numberFever,
          ]}
          numberOfLines={1}
        >
          {display.toLocaleString()}
        </Text>
        {showBadge ? (
          <Animated.View
            style={[
              styles.badge,
              { backgroundColor: tierColor, shadowColor: tierColor },
              badgeStyle,
            ]}
          >
            <Text style={styles.badgeText}>x{multiplier}</Text>
          </Animated.View>
        ) : null}
      </View>
      <Animated.Text style={[styles.pb, pbStyle]}>NEW BEST!</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  label: {
    color: GAME_COLORS.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  number: {
    fontSize: 44,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  numberCompact: {
    fontSize: 26,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  numberFever: {
    textShadowColor: GAME_COLORS.gold,
    textShadowRadius: 12,
  },
  badge: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  pb: {
    color: GAME_COLORS.gold,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 2,
    height: 16,
  },
});
