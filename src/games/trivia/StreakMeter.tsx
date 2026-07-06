/**
 * StreakMeter.tsx — the FIRE METER that climbs the screen edge.
 *
 * A vertical bar pinned to the right edge fills from the bottom as the streak
 * grows toward FEVER_STREAK. At fever it saturates to coral, glows, and pulses.
 * The fill is a Reanimated shared value so it springs smoothly on every hit and
 * drops on a miss.
 *
 * No Skia needed — a gradient-less colored bar with a shadow reads as a flame
 * gauge and costs nothing. Gold flame emoji caps the top on fever for punch.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolateColor,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { GAME_COLORS, JUICE } from '../../gamekit';
import { FEVER_STREAK } from './config';

interface StreakMeterProps {
  streak: number;
  fever: boolean;
  /** Full bar height in px. */
  height?: number;
}

function StreakMeterImpl({ streak, fever, height = 220 }: StreakMeterProps) {
  // 0..1 fill toward fever; clamps at 1 and stays full during fever.
  const fill = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    const target = Math.max(0, Math.min(1, streak / FEVER_STREAK));
    fill.value = withSpring(target, JUICE.settleSpring);
  }, [streak, fill]);

  useEffect(() => {
    if (fever) {
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 380, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.4, { duration: 380, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(glow);
      glow.value = withTiming(0, { duration: 220 });
    }
  }, [fever, glow]);

  const fillStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      fill.value,
      [0, 0.5, 0.85, 1],
      [GAME_COLORS.blue, '#7c4dff', GAME_COLORS.warn, GAME_COLORS.coral],
    );
    return {
      height: `${fill.value * 100}%`,
      backgroundColor: bg,
      shadowOpacity: 0.4 + glow.value * 0.5,
      shadowRadius: 6 + glow.value * 14,
    };
  });

  const capStyle = useAnimatedStyle(() => ({
    opacity: fill.value >= 0.98 ? 1 : 0,
    transform: [{ scale: 1 + glow.value * 0.25 }],
  }));

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="none">
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
      <Animated.Text style={[styles.cap, capStyle]}>🔥</Animated.Text>
      {streak > 1 ? (
        <Text style={[styles.streakNum, fever && styles.streakNumFever]}>{streak}</Text>
      ) : null}
    </View>
  );
}

export const StreakMeter = React.memo(StreakMeterImpl);

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 10,
    top: '50%',
    marginTop: -110,
    width: 34,
    alignItems: 'center',
  },
  track: {
    width: 12,
    flex: 1,
    borderRadius: 6,
    backgroundColor: GAME_COLORS.bgElevated,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  fill: {
    width: '100%',
    borderRadius: 6,
    shadowColor: GAME_COLORS.coral,
    shadowOffset: { width: 0, height: 0 },
  },
  cap: { position: 'absolute', top: -22, fontSize: 22 },
  streakNum: {
    marginTop: 6,
    color: GAME_COLORS.textDim,
    fontSize: 15,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  streakNumFever: { color: GAME_COLORS.coral },
});
