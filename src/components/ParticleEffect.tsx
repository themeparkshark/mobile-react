import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, Dimensions, Text } from 'react-native';
import { colors } from '../design-system';

interface Particle {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  rotation: Animated.Value;
  emoji: string;
  color: string;
}

type ParticleType = 'confetti' | 'coins' | 'stars' | 'hearts' | 'sparkles' | 'custom';

interface Props {
  type: ParticleType;
  count?: number;
  duration?: number;
  spread?: number;
  active: boolean;
  customEmojis?: string[];
  onComplete?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Emoji sets for different particle types
const PARTICLE_EMOJIS: Record<ParticleType, string[]> = {
  confetti: ['🎉', '🎊', '✨', '🌟', '💫', '🎈'],
  coins: ['🪙', '💰', '💵', '🤑', '✨'],
  stars: ['⭐', '🌟', '💫', '✨', '🔆'],
  hearts: ['❤️', '💕', '💖', '💗', '💓', '💝'],
  sparkles: ['✨', '💫', '⚡', '🌟', '💥'],
  custom: [],
};

const PARTICLE_COLORS = [
  '#FFD700', // Gold
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#A78BFA', // Purple
  '#F472B6', // Pink
  '#60A5FA', // Blue
  '#34D399', // Green
];

/**
 * Animated particle explosion effect.
 * Perfect for celebrations, achievements, and rewards.
 */
export default function ParticleEffect({
  type,
  count = 30,
  duration = 2000,
  spread = 200,
  active,
  customEmojis,
  onComplete,
}: Props) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const emojis = type === 'custom' && customEmojis ? customEmojis : PARTICLE_EMOJIS[type];

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    // Create particles
    const newParticles: Particle[] = Array(count)
      .fill(0)
      .map((_, i) => ({
        id: i,
        x: new Animated.Value(SCREEN_WIDTH / 2),
        y: new Animated.Value(SCREEN_HEIGHT / 2),
        opacity: new Animated.Value(1),
        scale: new Animated.Value(0),
        rotation: new Animated.Value(0),
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      }));

    setParticles(newParticles);

    // Animate each particle
    const animations = newParticles.map((particle) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * spread + spread / 2;
      const targetX = SCREEN_WIDTH / 2 + Math.cos(angle) * distance;
      const targetY = SCREEN_HEIGHT / 2 + Math.sin(angle) * distance - 100; // Bias upward

      return Animated.parallel([
        // Move outward
        Animated.timing(particle.x, {
          toValue: targetX,
          duration: duration,
          useNativeDriver: true,
        }),
        // Move up then fall
        Animated.sequence([
          Animated.timing(particle.y, {
            toValue: targetY,
            duration: duration * 0.4,
            useNativeDriver: true,
          }),
          Animated.timing(particle.y, {
            toValue: SCREEN_HEIGHT + 50,
            duration: duration * 0.6,
            useNativeDriver: true,
          }),
        ]),
        // Scale up then down
        Animated.sequence([
          Animated.spring(particle.scale, {
            toValue: 1 + Math.random() * 0.5,
            friction: 4,
            useNativeDriver: true,
          }),
          Animated.timing(particle.scale, {
            toValue: 0,
            duration: duration * 0.3,
            delay: duration * 0.5,
            useNativeDriver: true,
          }),
        ]),
        // Rotate
        Animated.timing(particle.rotation, {
          toValue: (Math.random() - 0.5) * 4,
          duration: duration,
          useNativeDriver: true,
        }),
        // Fade out
        Animated.timing(particle.opacity, {
          toValue: 0,
          duration: duration * 0.3,
          delay: duration * 0.7,
          useNativeDriver: true,
        }),
      ]);
    });

    Animated.parallel(animations).start(() => {
      setParticles([]);
      onComplete?.();
    });
  }, [active, count, duration, spread, emojis]);

  if (particles.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((particle) => (
        <Animated.View
          key={particle.id}
          style={[
            styles.particle,
            {
              transform: [
                { translateX: Animated.subtract(particle.x, SCREEN_WIDTH / 2) },
                { translateY: Animated.subtract(particle.y, SCREEN_HEIGHT / 2) },
                { scale: particle.scale },
                {
                  rotate: particle.rotation.interpolate({
                    inputRange: [-2, 2],
                    outputRange: ['-360deg', '360deg'],
                  }),
                },
              ],
              opacity: particle.opacity,
            },
          ]}
        >
          <Text style={styles.emoji}>{particle.emoji}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * Coin shower effect - coins rain from top
 */
export function CoinShower({
  active,
  count = 20,
  duration = 3000,
  onComplete,
}: {
  active: boolean;
  count?: number;
  duration?: number;
  onComplete?: () => void;
}) {
  const [coins, setCoins] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setCoins([]);
      return;
    }

    const newCoins: Particle[] = Array(count)
      .fill(0)
      .map((_, i) => ({
        id: i,
        x: new Animated.Value(Math.random() * SCREEN_WIDTH),
        y: new Animated.Value(-50 - Math.random() * 100),
        opacity: new Animated.Value(1),
        scale: new Animated.Value(0.5 + Math.random() * 0.5),
        rotation: new Animated.Value(0),
        emoji: '🪙',
        color: '#FFD700',
      }));

    setCoins(newCoins);

    const animations = newCoins.map((coin, i) => {
      const delay = i * (duration / count / 2);
      const swayAmount = 30 + Math.random() * 20;

      return Animated.parallel([
        // Fall down
        Animated.timing(coin.y, {
          toValue: SCREEN_HEIGHT + 50,
          duration: duration - delay,
          delay,
          useNativeDriver: true,
        }),
        // Sway side to side
        Animated.loop(
          Animated.sequence([
            Animated.timing(coin.x, {
              toValue: (coin.x as any)._value + swayAmount,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(coin.x, {
              toValue: (coin.x as any)._value - swayAmount,
              duration: 300,
              useNativeDriver: true,
            }),
          ])
        ),
        // Rotate
        Animated.loop(
          Animated.timing(coin.rotation, {
            toValue: 1,
            duration: 500 + Math.random() * 500,
            useNativeDriver: true,
          })
        ),
      ]);
    });

    Animated.parallel(animations).start(() => {
      setCoins([]);
      onComplete?.();
    });

    // Cleanup timeout
    const timeout = setTimeout(() => {
      setCoins([]);
      onComplete?.();
    }, duration + 500);

    return () => clearTimeout(timeout);
  }, [active, count, duration]);

  if (coins.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {coins.map((coin) => (
        <Animated.View
          key={coin.id}
          style={[
            styles.particle,
            {
              transform: [
                { translateX: coin.x },
                { translateY: coin.y },
                { scale: coin.scale },
                {
                  rotateY: coin.rotation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.emoji, { fontSize: 32 }]}>{coin.emoji}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * Sparkle burst from a point
 */
export function SparkleBurst({
  x,
  y,
  active,
  onComplete,
}: {
  x: number;
  y: number;
  active: boolean;
  onComplete?: () => void;
}) {
  const [sparkles, setSparkles] = useState<any[]>([]);

  useEffect(() => {
    if (!active) {
      setSparkles([]);
      return;
    }

    const newSparkles = Array(8)
      .fill(0)
      .map((_, i) => ({
        id: i,
        scale: new Animated.Value(0),
        opacity: new Animated.Value(1),
        angle: (i / 8) * Math.PI * 2,
      }));

    setSparkles(newSparkles);

    const animations = newSparkles.map((sparkle) =>
      Animated.parallel([
        Animated.sequence([
          Animated.spring(sparkle.scale, {
            toValue: 1,
            friction: 3,
            useNativeDriver: true,
          }),
          Animated.timing(sparkle.scale, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(sparkle.opacity, {
          toValue: 0,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        }),
      ])
    );

    Animated.parallel(animations).start(() => {
      setSparkles([]);
      onComplete?.();
    });
  }, [active, x, y]);

  if (sparkles.length === 0) return null;

  return (
    <View style={[styles.sparkleContainer, { left: x - 40, top: y - 40 }]} pointerEvents="none">
      {sparkles.map((sparkle) => {
        const offsetX = Math.cos(sparkle.angle) * 30;
        const offsetY = Math.sin(sparkle.angle) * 30;

        return (
          <Animated.Text
            key={sparkle.id}
            style={[
              styles.sparkle,
              {
                transform: [
                  { translateX: offsetX },
                  { translateY: offsetY },
                  { scale: sparkle.scale },
                ],
                opacity: sparkle.opacity,
              },
            ]}
          >
            ✨
          </Animated.Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  particle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
  },
  emoji: {
    fontSize: 24,
  },
  sparkleContainer: {
    position: 'absolute',
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  sparkle: {
    position: 'absolute',
    fontSize: 16,
  },
});
