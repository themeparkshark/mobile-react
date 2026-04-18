/**
 * AnimatedBackground — Premium screen background with gradient + floating bokeh orbs.
 * Replaces static ImageBackground on key screens for that AAA game depth.
 *
 * Usage:
 *   <AnimatedBackground colors={['#0a1628', '#142040', '#09268f']}>
 *     {screenContent}
 *   </AnimatedBackground>
 */
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SW, height: SH } = Dimensions.get('window');

interface OrbConfig {
  x: number;
  y: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
}

interface Props {
  children: ReactNode;
  /** Gradient colors top to bottom */
  colors?: [string, string, ...string[]];
  /** Number of floating orbs (default 6) */
  orbCount?: number;
  /** Orb color palette */
  orbColors?: string[];
  /** Disable orbs for perf */
  noOrbs?: boolean;
}

function BokehOrb({ config }: { config: OrbConfig }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const start = () => {
      anim.setValue(0);
      Animated.sequence([
        Animated.delay(config.delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: config.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]).start(() => start());
    };
    start();
    return () => anim.stopAnimation();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: config.x,
        top: config.y,
        width: config.size,
        height: config.size,
        borderRadius: config.size / 2,
        backgroundColor: config.color,
        opacity: anim.interpolate({
          inputRange: [0, 0.3, 0.7, 1],
          outputRange: [0.05, 0.18, 0.12, 0.05],
        }),
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, -20 - Math.random() * 30, 0],
            }),
          },
          {
            translateX: anim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, (Math.random() - 0.5) * 40, 0],
            }),
          },
          {
            scale: anim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.9, 1.1, 0.9],
            }),
          },
        ],
      }}
    />
  );
}

export default function AnimatedBackground({
  children,
  colors = ['#0a1628', '#0f1d3a', '#09268f'],
  orbCount = 6,
  orbColors = ['#00a5f5', '#fec90e', '#9C27B0', '#FF6B00'],
  noOrbs = false,
}: Props) {
  const orbs = useMemo<OrbConfig[]>(
    () =>
      Array.from({ length: orbCount }, (_, i) => ({
        x: Math.random() * SW,
        y: Math.random() * SH,
        size: 40 + Math.random() * 120,
        color: orbColors[i % orbColors.length],
        duration: 6000 + Math.random() * 6000,
        delay: Math.random() * 3000,
      })),
    [orbCount],
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={colors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Bokeh orbs */}
      {!noOrbs && orbs.map((orb, i) => <BokehOrb key={i} config={orb} />)}

      {/* Content */}
      <View style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        {children}
      </View>
    </View>
  );
}
