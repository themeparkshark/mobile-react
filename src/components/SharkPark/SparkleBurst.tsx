import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

function Sparkle({ delay }: { delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const randX = useRef((Math.random() - 0.5) * 60).current;
  const randY = useRef(-Math.random() * 50 - 10).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.timing(translateY, { toValue: randY, duration: 600, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: randX, duration: 600, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start();
    }, delay);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        styles.sparkle,
        { opacity, transform: [{ translateX }, { translateY }, { scale }] },
      ]}
    />
  );
}

export default function SparkleBurst() {
  const sparkles = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);
  return (
    <View style={styles.container}>
      {sparkles.map((i) => (
        <Sparkle key={i} delay={i * 60} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    height: 0,
    zIndex: 11,
    pointerEvents: 'none',
  },
  sparkle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fec90e',
  },
});
