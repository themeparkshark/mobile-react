/**
 * NextStarBar: the one next-star read every results card shares.
 *
 * A fill bar that ends in a star, with one short word over it (KEEP GOING,
 * HALFWAY THERE, ALMOST!, ALL 3 STARS!). A kid who cannot read 8,000 still
 * sees how close the star is. The exact points live in the accessibility
 * label. The fill grows once, after the score count, on the UI thread.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import { formatScore, type NextStarGoal } from '../core/scoring';
import { nextStarWord } from './feelings';

export function NextStarBar({ goal, delayMs = 0, reducedMotion = false, tone = 'onBlue' }: {
  goal: NextStarGoal;
  delayMs?: number;
  reducedMotion?: boolean;
  /** 'onBlue' for the shared blue card, 'onWhite' for Sharky's white card. */
  tone?: 'onBlue' | 'onWhite';
}) {
  const bar = useSharedValue(reducedMotion ? goal.progress : 0);
  useEffect(() => {
    if (reducedMotion) {
      bar.value = goal.progress;
      return undefined;
    }
    bar.value = withDelay(delayMs, withTiming(goal.progress, { duration: 700, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(bar);
  }, [goal.progress, delayMs, reducedMotion, bar]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, bar.value)) * 100}%` }));
  return (
    <View style={styles.goal} accessible accessibilityLabel={goal.nextStar
      ? `${formatScore(goal.remaining)} points to star ${goal.nextStar}` : 'All three stars'}>
      <Text style={[styles.word, tone === 'onWhite' && styles.wordInk]}>{nextStarWord(goal)}</Text>
      <View style={styles.row}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]} />
        </View>
        <View style={styles.star}>
          <GameIcon name="star" size={34} mono={goal.nextStar ? '#bfe5ff' : undefined} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  goal: { width: '100%', marginTop: 8, alignItems: 'center' },
  word: { fontFamily: 'Shark', fontSize: 17, color: '#ffffff', marginBottom: 4 },
  wordInk: { color: '#05346e' },
  row: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  track: { flex: 1, height: 18, borderRadius: 9, backgroundColor: '#bfe5ff', borderWidth: 3, borderColor: '#05346e', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#ffcf3b' },
  star: { marginLeft: -8 },
});
