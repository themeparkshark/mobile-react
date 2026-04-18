/**
 * GradientButton — Premium 3D-style button with gradient, glow, and press depth.
 * Replaces flat buttons with that AAA mobile game feel.
 *
 * Features:
 * - Gradient background with bottom shadow strip (3D depth)
 * - Glow pulse on idle
 * - Squish + darken on press
 * - Optional icon slot
 * - Size variants: sm, md, lg
 */
import { ReactNode, useContext, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../../context/SoundEffectProvider';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'legendary';
type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  text: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  icon?: ReactNode;
  /** Extra wrapper styles */
  style?: ViewStyle;
  /** Skip sound on press */
  silent?: boolean;
}

const VARIANTS: Record<ButtonVariant, { colors: [string, string]; shadow: string; textShadow: string }> = {
  primary: {
    colors: ['#00c6fb', '#005bea'],
    shadow: '#003d99',
    textShadow: 'rgba(0,60,180,0.5)',
  },
  secondary: {
    colors: ['#a18cd1', '#6a5acd'],
    shadow: '#483d8b',
    textShadow: 'rgba(72,61,139,0.5)',
  },
  success: {
    colors: ['#56ab2f', '#338a1f'],
    shadow: '#1b5e0f',
    textShadow: 'rgba(27,94,15,0.5)',
  },
  danger: {
    colors: ['#ff416c', '#cc1e4a'],
    shadow: '#8b0030',
    textShadow: 'rgba(139,0,48,0.5)',
  },
  legendary: {
    colors: ['#FFD700', '#FF8C00'],
    shadow: '#B8860B',
    textShadow: 'rgba(184,134,11,0.5)',
  },
};

const SIZES: Record<ButtonSize, { height: number; fontSize: number; px: number; radius: number }> = {
  sm: { height: 40, fontSize: 14, px: 16, radius: 12 },
  md: { height: 52, fontSize: 18, px: 24, radius: 16 },
  lg: { height: 64, fontSize: 22, px: 32, radius: 20 },
};

export default function GradientButton({
  text,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  icon,
  style,
  silent = false,
}: Props) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const v = VARIANTS[variant];
  const s = SIZES[size];

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scaleAnim, {
      toValue: 0.93,
      friction: 6,
      tension: 300,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (disabled) return;
    if (!silent) {
      playSound(require('../../../assets/sounds/button_press.mp3'));
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View
        style={[
          {
            transform: [{ scale: scaleAnim }],
            opacity: disabled ? 0.45 : 1,
            borderRadius: s.radius,
            // Outer glow
            shadowColor: v.colors[0],
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: disabled ? 0 : 0.4,
            shadowRadius: 12,
          },
          style,
        ]}
      >
        {/* 3D bottom shadow strip */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: s.height,
            borderRadius: s.radius,
            backgroundColor: v.shadow,
            transform: [{ translateY: 4 }],
          }}
        />

        {/* Main gradient body */}
        <LinearGradient
          colors={v.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{
            height: s.height,
            borderRadius: s.radius,
            paddingHorizontal: s.px,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Top shine */}
          <LinearGradient
            colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.55 }}
            style={[StyleSheet.absoluteFill, { borderRadius: s.radius }]}
          />

          {icon && <View style={{ marginRight: 8 }}>{icon}</View>}

          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: s.fontSize,
              color: 'white',
              textTransform: 'uppercase',
              textShadowColor: v.textShadow,
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 0,
              letterSpacing: 1,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {text}
          </Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}
