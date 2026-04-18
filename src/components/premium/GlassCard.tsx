/**
 * GlassCard — Premium glassmorphism card with animated border glow.
 * Inspired by Crate Rush / Groove on Fight style UI panels.
 *
 * Usage:
 *   <GlassCard glow="#FFD700" intensity="high">
 *     <Text>Content</Text>
 *   </GlassCard>
 */
import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadows } from '../../design-system';

interface Props {
  children: ReactNode;
  /** Glow color for animated border pulse */
  glow?: string;
  /** Glow intensity: none | low | medium | high */
  intensity?: 'none' | 'low' | 'medium' | 'high';
  /** Extra styles on the outer wrapper */
  style?: ViewStyle;
  /** Background opacity 0-1 (default 0.35) */
  bgOpacity?: number;
  /** Border radius (default 20) */
  radius?: number;
  /** Disable blur for perf on older devices */
  noBlur?: boolean;
  /** Use a specific gradient instead of default dark */
  gradient?: [string, string, ...string[]];
}

const INTENSITY_MAP = {
  none: { shadowOpacity: 0, shadowRadius: 0, borderWidth: 1 },
  low: { shadowOpacity: 0.25, shadowRadius: 8, borderWidth: 1.5 },
  medium: { shadowOpacity: 0.45, shadowRadius: 16, borderWidth: 2 },
  high: { shadowOpacity: 0.7, shadowRadius: 24, borderWidth: 2.5 },
};

export default function GlassCard({
  children,
  glow = colors.secondary,
  intensity = 'medium',
  style,
  bgOpacity = 0.35,
  radius = 20,
  noBlur = false,
  gradient,
}: Props) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const config = INTENSITY_MAP[intensity];

  useEffect(() => {
    if (intensity === 'none') return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    ).start();
    return () => pulseAnim.stopAnimation();
  }, [intensity]);

  const animatedShadowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [config.shadowOpacity * 0.5, config.shadowOpacity],
  });

  const animatedBorderColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      `${glow}40`, // 25% alpha
      `${glow}B3`, // 70% alpha
    ],
  });

  const defaultGradient: [string, string, ...string[]] = gradient ?? [
    `rgba(20, 32, 64, ${bgOpacity})`,
    `rgba(10, 22, 40, ${bgOpacity + 0.15})`,
  ];

  return (
    <Animated.View
      style={[
        {
          borderRadius: radius,
          borderWidth: config.borderWidth,
          borderColor: animatedBorderColor,
          shadowColor: glow,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: animatedShadowOpacity,
          shadowRadius: config.shadowRadius,
          elevation: 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {/* Background gradient */}
      <LinearGradient
        colors={defaultGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Blur overlay */}
      {!noBlur && (
        <BlurView
          intensity={30}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Inner highlight (top edge shine) */}
      <LinearGradient
        colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />

      {/* Content */}
      <View style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </View>
    </Animated.View>
  );
}
