/**
 * ShimmerEffect — Animated diagonal light sweep across any child.
 * The "premium" shimmer you see on cards, buttons, and rewards in AAA games.
 *
 * Wraps children and overlays a moving gradient highlight that loops infinitely.
 */
import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  children: ReactNode;
  /** Width of the shimmer band in px (default 120) */
  width?: number;
  /** Duration of one sweep in ms (default 2500) */
  duration?: number;
  /** Delay between sweeps in ms (default 3000) */
  pauseMs?: number;
  /** Shimmer color (default white at 20% opacity) */
  color?: string;
  /** Disable the shimmer (renders children only) */
  disabled?: boolean;
  style?: ViewStyle;
}

export default function ShimmerEffect({
  children,
  width = 120,
  duration = 2500,
  pauseMs = 3000,
  color = 'rgba(255,255,255,0.20)',
  disabled = false,
  style,
}: Props) {
  const translateX = useRef(new Animated.Value(-width * 2)).current;

  useEffect(() => {
    if (disabled) return;

    const animate = () => {
      translateX.setValue(-width * 2);
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: 500, // overshoots container width, clipped by overflow:hidden
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(pauseMs),
      ]).start(() => animate());
    };
    animate();

    return () => translateX.stopAnimation();
  }, [disabled, duration, pauseMs]);

  return (
    <View style={[{ overflow: 'hidden', position: 'relative' }, style]}>
      {children}
      {!disabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [{ translateX }, { rotate: '-20deg' }],
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', color, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{
              width,
              height: '200%', // overshoot for rotated coverage
              marginTop: '-50%',
            }}
          />
        </Animated.View>
      )}
    </View>
  );
}
