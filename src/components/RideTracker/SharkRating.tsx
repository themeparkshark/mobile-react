import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, View, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

interface SharkRatingProps {
  rating: number;
  onRate?: (rating: number) => void;
  size?: number;
  readonly?: boolean;
}

const SharkRating: React.FC<SharkRatingProps> = React.memo(({ rating, onRate, size = 32, readonly = false }) => {
  const scales = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;
  const translateYs = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(0))).current;
  const splashOpacities = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(0))).current;
  const splashScales = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(0))).current;

  const handlePress = useCallback((index: number) => {
    if (readonly) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Jump animation for selected shark
    Animated.sequence([
      Animated.parallel([
        Animated.timing(translateYs[index], { toValue: -12, duration: 120, useNativeDriver: true }),
        Animated.timing(scales[index], { toValue: 1.4, duration: 120, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(translateYs[index], { toValue: 0, tension: 100, friction: 5, useNativeDriver: true }),
        Animated.spring(scales[index], { toValue: 1, tension: 100, friction: 5, useNativeDriver: true }),
      ]),
    ]).start();

    // Splash effect
    splashOpacities[index].setValue(1);
    splashScales[index].setValue(0.3);
    Animated.parallel([
      Animated.timing(splashOpacities[index], { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.spring(splashScales[index], { toValue: 1.5, tension: 40, friction: 6, useNativeDriver: true }),
    ]).start();

    // Cascade animation for sharks up to selected
    for (let i = 0; i <= index; i++) {
      if (i !== index) {
        setTimeout(() => {
          Animated.sequence([
            Animated.timing(translateYs[i], { toValue: -6, duration: 80, useNativeDriver: true }),
            Animated.spring(translateYs[i], { toValue: 0, tension: 120, friction: 6, useNativeDriver: true }),
          ]).start();
        }, i * 40);
      }
    }

    onRate?.(index + 1);
  }, [readonly, onRate, scales, translateYs, splashOpacities, splashScales]);

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => handlePress(i - 1)} hitSlop={8}>
          <View style={styles.sharkWrapper}>
            {/* Splash effect behind */}
            <Animated.View
              style={[
                styles.splash,
                {
                  width: size * 1.5,
                  height: size * 1.5,
                  borderRadius: size * 0.75,
                  opacity: splashOpacities[i - 1],
                  transform: [{ scale: splashScales[i - 1] }],
                },
              ]}
            />
            <Animated.Text
              style={[
                styles.shark,
                {
                  fontSize: size,
                  transform: [
                    { scale: scales[i - 1] },
                    { translateY: translateYs[i - 1] },
                  ],
                  opacity: i <= rating ? 1 : 0.25,
                },
              ]}
            >
              🦈
            </Animated.Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
});

SharkRating.displayName = 'SharkRating';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sharkWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shark: {
    textAlign: 'center',
  },
  splash: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 165, 245, 0.3)',
  },
});

export default SharkRating;
