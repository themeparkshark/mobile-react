import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, View } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Particle {
  x: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * SCREEN_WIDTH,
    size: 3 + Math.random() * 5,
    duration: 3000 + Math.random() * 4000,
    delay: Math.random() * 3000,
    opacity: 0.15 + Math.random() * 0.35,
  }));
}

function FloatingParticle({ particle }: { particle: Particle }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startAnimation = () => {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: particle.duration,
        delay: particle.delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => startAnimation());
    };
    startAnimation();
  }, []);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [500, -50],
  });

  const translateX = anim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 15, -10, 12, 0],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.1, 0.8, 1],
    outputRange: [0, particle.opacity, particle.opacity, 0],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: particle.x,
        width: particle.size,
        height: particle.size,
        borderRadius: particle.size / 2,
        backgroundColor: '#FFD700',
        opacity,
        transform: [{ translateY }, { translateX }],
        shadowColor: '#FFD700',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 3,
      }}
    />
  );
}

export default function FloatingParticles({ count = 12 }: { count?: number }) {
  const particles = useRef(createParticles(count)).current;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      {particles.map((p, i) => (
        <FloatingParticle key={i} particle={p} />
      ))}
    </View>
  );
}
