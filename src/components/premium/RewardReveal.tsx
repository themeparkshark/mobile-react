/**
 * RewardReveal — Cinematic reward reveal with light burst, scale-in, and particle shower.
 * Use for daily gifts, chest opens, level-up rewards, wheel prizes.
 *
 * Features:
 * - White flash burst
 * - Scale + rotate entrance
 * - Radial light rays
 * - Floating sparkle particles
 * - Haptic feedback sequence
 */
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  /** Whether the reveal is active */
  visible: boolean;
  /** Reward icon URL or require() */
  icon: string | number;
  /** Reward label, e.g. "+50 Coins" */
  label: string;
  /** Sub-label, e.g. "Legendary Chest" */
  subLabel?: string;
  /** Glow/ray color (default gold) */
  color?: string;
  /** Called after the animation completes */
  onComplete?: () => void;
}

function Sparkle({ delay, x }: { delay: number; x: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, {
        toValue: 1,
        duration: 1200 + Math.random() * 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: SH * 0.35,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#FFD700',
        opacity: anim.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0, 1, 0],
        }),
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -120 - Math.random() * 100],
            }),
          },
          {
            translateX: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, (Math.random() - 0.5) * 200],
            }),
          },
          {
            scale: anim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, 1.5, 0.3],
            }),
          },
        ],
      }}
    />
  );
}

export default function RewardReveal({
  visible,
  icon,
  label,
  subLabel,
  color = '#FFD700',
  onComplete,
}: Props) {
  const flash = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const raysRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    // Haptic burst
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 150);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 300);

    // Flash
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    // Icon entrance
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(iconScale, {
          toValue: 1,
          friction: 3,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(iconRotate, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Label fade in
    Animated.sequence([
      Animated.delay(500),
      Animated.timing(labelOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => onComplete?.(), 1500);
    });

    // Spinning rays
    Animated.loop(
      Animated.timing(raysRotate, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [visible]);

  if (!visible) return null;

  const sparkles = Array.from({ length: 16 }).map((_, i) => (
    <Sparkle key={i} delay={200 + i * 60} x={SW * 0.1 + Math.random() * SW * 0.8} />
  ));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Radial light rays */}
      <Animated.View
        style={[
          styles.raysContainer,
          {
            transform: [
              {
                rotate: raysRotate.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          },
        ]}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.ray,
              {
                backgroundColor: `${color}20`,
                transform: [{ rotate: `${i * 30}deg` }],
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* Flash overlay */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'white', opacity: flash },
        ]}
        pointerEvents="none"
      />

      {/* Sparkles */}
      {sparkles}

      {/* Icon */}
      <Animated.View
        style={[
          styles.iconContainer,
          {
            transform: [
              { scale: iconScale },
              {
                rotate: iconRotate.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-30deg', '0deg'],
                }),
              },
            ],
            shadowColor: color,
            shadowOpacity: 0.8,
            shadowRadius: 30,
          },
        ]}
      >
        <Image
          source={typeof icon === 'string' ? { uri: icon } : icon}
          style={styles.icon}
          contentFit="contain"
        />
      </Animated.View>

      {/* Labels */}
      <Animated.View style={[styles.labelContainer, { opacity: labelOpacity }]}>
        <Text style={styles.label}>{label}</Text>
        {subLabel && <Text style={styles.subLabel}>{subLabel}</Text>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  raysContainer: {
    position: 'absolute',
    top: SH * 0.25,
    left: SW / 2 - 150,
    width: 300,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ray: {
    position: 'absolute',
    width: 8,
    height: 300,
    borderRadius: 4,
  },
  iconContainer: {
    position: 'absolute',
    top: SH * 0.3,
    left: SW / 2 - 60,
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
  },
  icon: {
    width: 100,
    height: 100,
  },
  labelContainer: {
    position: 'absolute',
    top: SH * 0.52,
    width: SW,
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Shark',
    fontSize: 32,
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
    textTransform: 'uppercase',
  },
  subLabel: {
    fontFamily: 'Knockout',
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
    textAlign: 'center',
  },
});
