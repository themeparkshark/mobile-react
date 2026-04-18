/**
 * PremiumProgressBar — Glossy, glowing progress bar with animated fill and shine.
 * Replaces flat progress bars throughout the app.
 *
 * Features:
 * - 3D depth with bottom shadow
 * - Animated glossy shine overlay
 * - Glow pulse at fill tip
 * - Color-coded thresholds
 * - Label slot
 */
import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  /** 0 to 1 */
  progress: number;
  /** Gradient colors for the fill [start, end] */
  colors?: [string, string];
  /** Height in px (default 18) */
  height?: number;
  /** Border radius (default height/2) */
  radius?: number;
  /** Show percentage text inside */
  showPercent?: boolean;
  /** Label above the bar */
  label?: string;
  /** Right-aligned label (e.g. "50/100") */
  rightLabel?: string;
  /** Glow color at the fill tip */
  glowColor?: string;
  style?: ViewStyle;
}

export default function PremiumProgressBar({
  progress,
  colors: fillColors = ['#00c6fb', '#005bea'],
  height = 18,
  radius,
  showPercent = false,
  label,
  rightLabel,
  glowColor,
  style,
}: Props) {
  const r = radius ?? height / 2;
  const fillAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const tipGlow = useRef(new Animated.Value(0.4)).current;

  const clampedProgress = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: clampedProgress,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clampedProgress]);

  // Shimmer sweep
  useEffect(() => {
    const loop = () => {
      shimmerAnim.setValue(0);
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(4000),
      ]).start(() => loop());
    };
    loop();
    return () => shimmerAnim.stopAnimation();
  }, []);

  // Tip glow pulse
  useEffect(() => {
    if (clampedProgress <= 0) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(tipGlow, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: false,
        }),
        Animated.timing(tipGlow, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: false,
        }),
      ]),
    ).start();
    return () => tipGlow.stopAnimation();
  }, [clampedProgress > 0]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const resolvedGlow = glowColor ?? fillColors[1];

  return (
    <View style={style}>
      {/* Labels row */}
      {(label || rightLabel) && (
        <View style={styles.labelRow}>
          {label && (
            <Text style={styles.label}>{label}</Text>
          )}
          {rightLabel && (
            <Text style={styles.rightLabel}>{rightLabel}</Text>
          )}
        </View>
      )}

      {/* Bar container */}
      <View
        style={[
          styles.track,
          {
            height,
            borderRadius: r,
          },
        ]}
      >
        {/* 3D bottom shadow */}
        <View
          style={{
            position: 'absolute',
            bottom: -2,
            left: 0,
            right: 0,
            height: height * 0.6,
            borderRadius: r,
            backgroundColor: 'rgba(0,0,0,0.3)',
          }}
        />

        {/* Fill */}
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: fillWidth,
            borderRadius: r,
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={fillColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Glossy shine (top half highlight) */}
          <LinearGradient
            colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.6 }}
            style={[StyleSheet.absoluteFill, { height: height * 0.5 }]}
          />

          {/* Animated shimmer sweep */}
          <Animated.View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              transform: [
                {
                  translateX: shimmerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-80, 400],
                  }),
                },
                { rotate: '-20deg' },
              ],
            }}
          >
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.25)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ width: 60, height: '200%', marginTop: '-50%' }}
            />
          </Animated.View>
        </Animated.View>

        {/* Glow dot at fill tip */}
        {clampedProgress > 0.02 && (
          <Animated.View
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: height,
              alignItems: 'center',
              justifyContent: 'center',
              // positioned by fill width via parent
            }}
            pointerEvents="none"
          >
            <Animated.View
              style={{
                width: height * 0.7,
                height: height * 0.7,
                borderRadius: height,
                backgroundColor: 'white',
                opacity: tipGlow,
                shadowColor: resolvedGlow,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.9,
                shadowRadius: 8,
              }}
            />
          </Animated.View>
        )}

        {/* Percentage text */}
        {showPercent && (
          <View style={StyleSheet.absoluteFill}>
            <Text
              style={[
                styles.percentText,
                { fontSize: Math.max(height * 0.6, 10), lineHeight: height },
              ]}
            >
              {Math.round(clampedProgress * 100)}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'white',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  rightLabel: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  track: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    position: 'relative',
  },
  percentText: {
    fontFamily: 'Shark',
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
});
