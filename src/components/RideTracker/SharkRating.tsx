import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Pressable, View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

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
  const animations = useRef(new Set<Animated.CompositeAnimation>()).current;
  const reducedMotion = useReducedGameMotion();
  useEffect(() => {
    if (reducedMotion) {
      animations.forEach(animation => animation.stop()); animations.clear();
      scales.forEach(value => value.setValue(1));
      translateYs.forEach(value => value.setValue(0));
      splashOpacities.forEach(value => value.setValue(0));
    }
    return () => { animations.forEach(animation => animation.stop()); animations.clear(); };
  }, [reducedMotion, animations, scales, translateYs, splashOpacities]);

  const handlePress = useCallback((index: number) => {
    if (readonly) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    onRate?.(index + 1);
    if (reducedMotion) return;
    const start = (animation: Animated.CompositeAnimation) => {
      animations.add(animation);
      animation.start(() => animations.delete(animation));
    };

    // Jump animation for selected shark
    start(Animated.sequence([
      Animated.parallel([
        Animated.timing(translateYs[index], { toValue: -12, duration: 120, useNativeDriver: true }),
        Animated.timing(scales[index], { toValue: 1.4, duration: 120, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(translateYs[index], { toValue: 0, tension: 100, friction: 5, useNativeDriver: true }),
        Animated.spring(scales[index], { toValue: 1, tension: 100, friction: 5, useNativeDriver: true }),
      ]),
    ]));

    // Splash effect
    splashOpacities[index].setValue(1);
    splashScales[index].setValue(0.3);
    start(Animated.parallel([
      Animated.timing(splashOpacities[index], { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.spring(splashScales[index], { toValue: 1.5, tension: 40, friction: 6, useNativeDriver: true }),
    ]));

    // Cascade animation for sharks up to selected
    for (let i = 0; i <= index; i++) {
      if (i !== index) {
          start(Animated.sequence([
            Animated.delay(i * 40),
            Animated.timing(translateYs[i], { toValue: -6, duration: 80, useNativeDriver: true }),
            Animated.spring(translateYs[i], { toValue: 0, tension: 120, friction: 6, useNativeDriver: true }),
          ]));
      }
    }

  }, [readonly, onRate, scales, translateYs, splashOpacities, splashScales, reducedMotion, animations]);

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => handlePress(i - 1)} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={`Rate ${i} out of 5`}
          accessibilityState={{ selected: i === rating, disabled: readonly }}>
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
            <Animated.Image
              source={require('../../../assets/images/screens/pin-collections/star.png')}
              style={[
                styles.shark,
                {
                  width: size,
                  height: size,
                  transform: [
                    { scale: scales[i - 1] },
                    { translateY: translateYs[i - 1] },
                  ],
                  opacity: i <= rating ? 1 : 0.25,
                },
              ]}
            />
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
  shark: { resizeMode: 'contain' },
  splash: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 165, 245, 0.3)',
  },
});

export default SharkRating;
