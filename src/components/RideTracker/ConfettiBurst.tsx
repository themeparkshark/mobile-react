import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');
const COLORS = ['#fec90e', '#00a5f5', '#ff6b00', '#4CAF50', '#9C27B0', '#FF5252'];
const PIECE_COUNT = 30;

interface Piece {
  x: Animated.Value;
  y: Animated.Value;
  rotate: Animated.Value;
  opacity: Animated.Value;
  color: string;
  size: number;
}

const ConfettiBurst: React.FC<{ trigger: boolean }> = ({ trigger }) => {
  const pieces = useRef<Piece[]>(
    Array.from({ length: PIECE_COUNT }, () => ({
      x: new Animated.Value(width / 2),
      y: new Animated.Value(-20),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(0),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
    }))
  ).current;

  useEffect(() => {
    if (!trigger) return;

    pieces.forEach((p) => {
      const targetX = Math.random() * width;
      const targetY = height * 0.3 + Math.random() * height * 0.5;
      const delay = Math.random() * 300;

      p.x.setValue(width / 2 - 20 + Math.random() * 40);
      p.y.setValue(-20);
      p.opacity.setValue(1);
      p.rotate.setValue(0);

      Animated.parallel([
        Animated.timing(p.x, { toValue: targetX, duration: 1200 + Math.random() * 600, delay, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: targetY, duration: 1200 + Math.random() * 600, delay, useNativeDriver: true }),
        Animated.timing(p.rotate, { toValue: 360 * (1 + Math.random() * 2), duration: 1500, delay, useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: 800, delay: delay + 800, useNativeDriver: true }),
      ]).start();
    });
  }, [trigger]);

  if (!trigger) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.piece,
            {
              width: p.size,
              height: p.size * 0.6,
              backgroundColor: p.color,
              borderRadius: p.size * 0.15,
              opacity: p.opacity,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                {
                  rotate: p.rotate.interpolate({
                    inputRange: [0, 360],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
  },
});

export default ConfettiBurst;
