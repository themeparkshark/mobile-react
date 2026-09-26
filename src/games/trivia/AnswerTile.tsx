/**
 * AnswerTile.tsx — one answer choice, fully juiced.
 *
 * States (driven by `state` prop):
 *   - 'idle'    : tappable. Press-in squashes (JUICE.squashTo), release springs.
 *   - 'chosen-wrong'  : the tile the player picked and got wrong → shakes, red.
 *   - 'reveal-correct': the correct tile → flips to gold and pulses.
 *   - 'reveal-green'   : the correct tile after a WRONG pick → pulses green so
 *                        the player learns the answer.
 *   - 'dimmed'  : not chosen, after reveal → faded back.
 *   - 'removed' : eliminated by a 50/50 lifeline → fades out, non-interactive.
 *
 * A gold "flip" is a scaleY dip through 0 with a color swap at the midpoint,
 * reading as a card turning over. All animation is Reanimated on the UI thread.
 */

import React, { useEffect } from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { GAME_COLORS, JUICE } from '../../gamekit';

export type TileState =
  | 'idle'
  | 'chosen-wrong'
  | 'reveal-correct'
  | 'reveal-green'
  | 'dimmed'
  | 'removed';

interface AnswerTileProps {
  label: string;
  index: number;
  state: TileState;
  disabled?: boolean;
  /** Fires with this tile's index; the game grades it. */
  onPress: (index: number) => void;
}

const LETTERS = ['A', 'B', 'C', 'D'] as const;

function AnswerTileImpl({ label, index, state, disabled, onPress }: AnswerTileProps) {
  const scale = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const shakeX = useSharedValue(0);
  const opacity = useSharedValue(1);
  // 0 = neutral surface, 1 = gold, 2 = red, 3 = green (color mixer input).
  const colorPhase = useSharedValue(0);

  // React to state transitions.
  useEffect(() => {
    switch (state) {
      case 'idle':
        colorPhase.value = withTiming(0, { duration: 160 });
        opacity.value = withTiming(1, { duration: 160 });
        scaleY.value = withSpring(1, JUICE.popSpring);
        scale.value = withSpring(1, JUICE.popSpring);
        break;
      case 'reveal-correct': {
        // Card flip: dip scaleY through ~0, swap to gold at the trough, pop back.
        scaleY.value = withSequence(
          withTiming(0.05, { duration: 130, easing: Easing.in(Easing.quad) }),
          withTiming(1, { duration: 180, easing: Easing.out(Easing.back(2)) }),
        );
        colorPhase.value = withDelay(120, withTiming(1, { duration: 60 }));
        scale.value = withSequence(
          withDelay(120, withTiming(JUICE.popTo, { duration: 120 })),
          withSpring(1, JUICE.popSpring),
        );
        opacity.value = withTiming(1, { duration: 120 });
        break;
      }
      case 'reveal-green':
        colorPhase.value = withTiming(3, { duration: 160 });
        opacity.value = withTiming(1, { duration: 120 });
        scale.value = withSequence(
          withTiming(1.04, { duration: 140 }),
          withSpring(1, JUICE.settleSpring),
        );
        break;
      case 'chosen-wrong':
        colorPhase.value = withTiming(2, { duration: 120 });
        // Sharp horizontal shake (capped, ~5 quick oscillations).
        shakeX.value = withSequence(
          withTiming(-9, { duration: 40 }),
          withTiming(9, { duration: 40 }),
          withTiming(-7, { duration: 40 }),
          withTiming(6, { duration: 40 }),
          withTiming(0, { duration: 40 }),
        );
        break;
      case 'dimmed':
        opacity.value = withTiming(0.4, { duration: 200 });
        colorPhase.value = withTiming(0, { duration: 200 });
        break;
      case 'removed':
        opacity.value = withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) });
        scale.value = withTiming(0.85, { duration: 260 });
        break;
    }
  }, [state, colorPhase, opacity, scale, scaleY, shakeX]);

  const pressIn = () => {
    if (disabled || state !== 'idle') return;
    scale.value = withSpring(JUICE.squashTo, JUICE.pressSpring);
  };
  const pressOut = () => {
    if (disabled || state !== 'idle') return;
    scale.value = withSpring(1, JUICE.popSpring);
  };

  const animStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      colorPhase.value,
      [0, 1, 2, 3],
      ['#edf9ff', GAME_COLORS.gold, GAME_COLORS.danger, GAME_COLORS.success],
    );
    return {
      backgroundColor: bg,
      opacity: opacity.value,
      transform: [
        { translateX: shakeX.value },
        { scale: scale.value },
        { scaleY: scaleY.value },
      ],
    };
  });

  // Gold/green/red tiles use dark text for contrast; neutral uses white.
  const textStyle = useAnimatedStyle(() => ({
    color: colorPhase.value < 1.5 ? '#064a80' : GAME_COLORS.text,
  }));

  const nonInteractive = disabled || state === 'removed' || state !== 'idle';

  return (
    <Animated.View style={[styles.tile, animStyle]}>
      <Pressable
        style={styles.press}
        onPress={() => onPress(index)}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={nonInteractive}
        hitSlop={4}
      >
        <Animated.Text style={[styles.letter, textStyle]}>{LETTERS[index] ?? ''}</Animated.Text>
        <Animated.Text style={[styles.label, textStyle]} numberOfLines={3}>
          {label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

export const AnswerTile = React.memo(AnswerTileImpl);

const styles = StyleSheet.create({
  tile: {
    borderRadius: 16,
    marginVertical: 6,
    borderWidth: 2,
    borderColor: '#9bd7f3',
    shadowColor: '#003b70', shadowOpacity: 0.18, shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
    overflow: 'hidden',
  },
  press: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 60,
  },
  letter: {
    fontSize: 16,
    fontWeight: '900',
    width: 28,
    opacity: 0.9,
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
});
