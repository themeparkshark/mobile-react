import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  View,
  Text,
  Platform,
} from 'react-native';
import LottieView from 'lottie-react-native';
import * as Haptics from '../helpers/haptics';
import config from '../config';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ============================================
// FLOATING REWARD NUMBER
// Shows "+50 XP" floating up and fading
// ============================================
interface FloatingNumberProps {
  value: number;
  label?: string;
  color?: string;
  emoji?: string;
  delay?: number;
  onComplete?: () => void;
}

export function FloatingNumber({
  value,
  label,
  color = '#4CAF50',
  emoji,
  delay = 0,
  onComplete,
}: FloatingNumberProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        // Pop in
        Animated.spring(scale, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }),
        // Float up
        Animated.timing(translateY, {
          toValue: -80,
          duration: 1500,
          useNativeDriver: true,
        }),
        // Fade out after delay
        Animated.sequence([
          Animated.delay(800),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start(() => onComplete?.());
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        transform: [{ translateY }, { scale }],
        opacity,
      }}
      pointerEvents="none"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {emoji && <Text style={{ fontSize: 24, marginRight: 4 }}>{emoji}</Text>}
        <Text
          style={{
            fontFamily: 'Shark',
            fontSize: 32,
            color,
            textShadowColor: 'rgba(0, 0, 0, 0.5)',
            textShadowOffset: { width: 2, height: 2 },
            textShadowRadius: 0,
          }}
        >
          +{value}
        </Text>
        {label && (
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 14,
              color: 'rgba(255, 255, 255, 0.8)',
              marginLeft: 4,
            }}
          >
            {label}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// ============================================
// REWARD POPUP CONTAINER
// Shows multiple floating rewards at once
// ============================================
interface Reward {
  id: string;
  value: number;
  label?: string;
  emoji?: string;
  color?: string;
}

interface RewardPopupProps {
  rewards: Reward[];
  onComplete?: () => void;
}

export function RewardPopup({ rewards, onComplete }: RewardPopupProps) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const handleComplete = (id: string) => {
    setCompleted((prev) => {
      const next = new Set(prev).add(id);
      if (next.size === rewards.length) {
        onComplete?.();
      }
      return next;
    });
  };

  return (
    <View style={styles.rewardContainer}>
      {rewards.map((reward, index) => (
        <FloatingNumber
          key={reward.id}
          value={reward.value}
          label={reward.label}
          emoji={reward.emoji}
          color={reward.color || '#4CAF50'}
          delay={index * 200}
          onComplete={() => handleComplete(reward.id)}
        />
      ))}
    </View>
  );
}

// ============================================
// STAR BURST EFFECT
// Animated stars that explode outward
// ============================================
interface StarBurstProps {
  visible: boolean;
  color?: string;
  count?: number;
}

function StarParticle({ angle, color, delay }: { angle: number; color: string; delay: number }) {
  const distance = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(distance, {
          toValue: 120,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(rotation, {
          toValue: 360,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, []);

  const translateX = Animated.multiply(
    distance,
    Math.cos((angle * Math.PI) / 180)
  );
  const translateY = Animated.multiply(
    distance,
    Math.sin((angle * Math.PI) / 180)
  );

  const spin = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        fontSize: 24,
        color,
        transform: [{ translateX }, { translateY }, { rotate: spin }, { scale }],
        opacity,
        textShadowColor: color,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
      }}
    >
      ⭐
    </Animated.Text>
  );
}

export function StarBurst({ visible, color = '#FFD700', count = 8 }: StarBurstProps) {
  if (!visible) return null;

  const angles = Array.from({ length: count }, (_, i) => (360 / count) * i);

  return (
    <View style={styles.burstContainer} pointerEvents="none">
      {angles.map((angle, i) => (
        <StarParticle
          key={i}
          angle={angle}
          color={color}
          delay={i * 30}
        />
      ))}
    </View>
  );
}

// ============================================
// CELEBRATION OVERLAY
// Full-screen celebration with Lottie + effects
// ============================================
export type CelebrationLevel = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

interface CelebrationOverlayProps {
  visible: boolean;
  level?: CelebrationLevel;
  rewards?: Reward[];
  onComplete?: () => void;
}

const CELEBRATION_CONFIG: Record<CelebrationLevel, {
  hapticPattern: () => void;
  glowColor: string;
  duration: number;
}> = {
  common: {
    hapticPattern: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    glowColor: '#4CAF50',
    duration: 800,
  },
  uncommon: {
    hapticPattern: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    glowColor: config.secondary,
    duration: 1000,
  },
  rare: {
    hapticPattern: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 100);
    },
    glowColor: '#9C27B0',
    duration: 1200,
  },
  epic: {
    hapticPattern: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 100);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 200);
    },
    glowColor: '#E91E63',
    duration: 1500,
  },
  legendary: {
    hapticPattern: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 400);
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 600);
    },
    glowColor: '#FFD700',
    duration: 2000,
  },
};

export function CelebrationOverlay({
  visible,
  level = 'common',
  rewards,
  onComplete,
}: CelebrationOverlayProps) {
  const screenGlow = useRef(new Animated.Value(0)).current;
  const lottieRef = useRef<LottieView>(null);
  const config = CELEBRATION_CONFIG[level];

  useEffect(() => {
    if (visible) {
      // Trigger haptics
      if (Platform.OS === 'ios') {
        config.hapticPattern();
      }

      // Screen glow flash
      Animated.sequence([
        Animated.timing(screenGlow, {
          toValue: 0.3,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(screenGlow, {
          toValue: 0,
          duration: config.duration - 100,
          useNativeDriver: true,
        }),
      ]).start();

      // Play Lottie animation
      lottieRef.current?.play();

      // Complete callback
      const timer = setTimeout(() => {
        onComplete?.();
      }, config.duration);

      return () => clearTimeout(timer);
    }
  }, [visible, level]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Screen glow */}
      <Animated.View
        style={[
          styles.screenGlow,
          {
            backgroundColor: config.glowColor,
            opacity: screenGlow,
          },
        ]}
      />

      {/* Confetti Lottie */}
      {(level === 'epic' || level === 'legendary') && (
        <LottieView
          ref={lottieRef}
          source={require('../../assets/animations/confetti.json')}
          style={styles.lottie}
          autoPlay
          loop={false}
        />
      )}

      {/* Star burst for rare+ */}
      {level !== 'common' && level !== 'uncommon' && (
        <View style={styles.burstWrapper}>
          <StarBurst
            visible
            color={config.glowColor}
            count={level === 'legendary' ? 12 : 8}
          />
        </View>
      )}

      {/* Floating rewards */}
      {rewards && rewards.length > 0 && (
        <RewardPopup rewards={rewards} />
      )}
    </View>
  );
}

// ============================================
// ANIMATED COUNTER
// Counts from old value to new value
// ============================================
interface AnimatedCounterProps {
  value: number;
  duration?: number;
  style?: any;
  prefix?: string;
  suffix?: string;
}

export function AnimatedCounter({
  value,
  duration = 500,
  style,
  prefix = '',
  suffix = '',
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (value !== previousValue.current) {
      const startValue = previousValue.current;
      const endValue = value;
      const startTime = Date.now();

      // Pop animation
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.2,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
      ]).start();

      // Count up animation
      const tick = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(startValue + (endValue - startValue) * easeOut);
        setDisplayValue(current);

        if (progress < 1) {
          requestAnimationFrame(tick);
        }
      };

      requestAnimationFrame(tick);
      previousValue.current = value;
    }
  }, [value, duration]);

  return (
    <Animated.Text style={[style, { transform: [{ scale }] }]}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </Animated.Text>
  );
}

// ============================================
// PULSE GLOW EFFECT
// Pulsing glow around an element
// ============================================
interface PulseGlowProps {
  color?: string;
  intensity?: number;
  speed?: number;
  children: React.ReactNode;
}

export function PulseGlow({
  color = '#FFD700',
  intensity = 0.8,
  speed = 1500,
  children,
}: PulseGlowProps) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: speed / 2,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: speed / 2,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [speed]);

  const shadowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, intensity],
  });

  return (
    <Animated.View
      style={{
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 15,
        shadowOpacity,
      }}
    >
      {children}
    </Animated.View>
  );
}

// ============================================
// SHAKE EFFECT
// Shakes the content
// ============================================
interface ShakeEffectProps {
  trigger: boolean;
  intensity?: number;
  children: React.ReactNode;
}

export function ShakeEffect({ trigger, intensity = 10, children }: ShakeEffectProps) {
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger) {
      Animated.sequence([
        Animated.timing(shake, { toValue: intensity, duration: 25, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -intensity, duration: 25, useNativeDriver: true }),
        Animated.timing(shake, { toValue: intensity, duration: 25, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -intensity, duration: 25, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 25, useNativeDriver: true }),
      ]).start();
    }
  }, [trigger, intensity]);

  return (
    <Animated.View style={{ transform: [{ translateX: shake }] }}>
      {children}
    </Animated.View>
  );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  screenGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  lottie: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: 'absolute',
  },
  burstContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: 240,
    height: 240,
  },
  burstWrapper: {
    position: 'absolute',
    top: '30%',
  },
  rewardContainer: {
    position: 'absolute',
    top: '40%',
    alignItems: 'center',
  },
});

export default {
  FloatingNumber,
  RewardPopup,
  StarBurst,
  CelebrationOverlay,
  AnimatedCounter,
  PulseGlow,
  ShakeEffect,
};
