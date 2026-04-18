/**
 * SkiaStar - Vector Star Component
 * 
 * Crisp, scalable star using React Native Skia.
 * Two states: filled (golden) and empty (silver outline)
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Path,
  LinearGradient,
  vec,
  Skia,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface SkiaStarProps {
  size?: number;
  filled?: boolean;
  animated?: boolean;
  delay?: number;
}

// Generate 5-point star path string
function createStarPathString(size: number, innerRatio: number = 0.4): string {
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 2;
  const innerRadius = outerRadius * innerRatio;
  const points = 5;
  
  let path = '';
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI / 2) + (i * Math.PI / points);
    const x = cx + radius * Math.cos(angle);
    const y = cy - radius * Math.sin(angle);
    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  path += ' Z';
  
  return path;
}

export default function SkiaStar({
  size = 60,
  filled = true,
  animated = true,
  delay = 0,
}: SkiaStarProps) {
  const scale = useSharedValue(animated ? 0 : 1);
  const rotation = useSharedValue(animated ? -180 : 0);

  useEffect(() => {
    if (animated) {
      const timeout = setTimeout(() => {
        scale.value = withSpring(1, { damping: 8, stiffness: 100 });
        rotation.value = withSpring(0, { damping: 12, stiffness: 80 });
      }, delay);
      
      return () => clearTimeout(timeout);
    }
  }, [animated, delay]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const pathString = createStarPathString(size);
  const path = Skia.Path.MakeFromSVGString(pathString);

  if (!path) return null;

  return (
    <Animated.View style={[{ width: size, height: size }, animatedContainerStyle]}>
      <Canvas style={{ width: size, height: size }}>
        {filled ? (
          // FILLED STAR - Golden gradient
          <Path path={path}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(size, size)}
              colors={['#ffe066', '#ffd700', '#ffb347', '#ff8c00']}
            />
          </Path>
        ) : (
          // EMPTY STAR - Silver outline only
          <Path
            path={path}
            style="stroke"
            strokeWidth={2.5}
            color="#808080"
          />
        )}
      </Canvas>
    </Animated.View>
  );
}

// Convenience component for star rows
interface StarRatingProps {
  rating: number;
  total?: number;
  size?: number;
  animated?: boolean;
  staggerDelay?: number;
}

export function StarRating({
  rating,
  total = 3,
  size = 56,
  animated = true,
  staggerDelay = 200,
}: StarRatingProps) {
  return (
    <View style={styles.starRow}>
      {Array.from({ length: total }).map((_, i) => (
        <SkiaStar
          key={i}
          size={size}
          filled={i < rating}
          animated={animated}
          delay={animated ? i * staggerDelay : 0}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
