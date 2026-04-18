/**
 * CurrencyPill — Polished currency display with glass background, glow, and animated value changes.
 * Replaces the flat currency badges in StoreScreen, Topbar, etc.
 *
 * Features:
 * - Glass background with subtle blur
 * - Icon glow matching currency color
 * - Number tick-up animation
 * - Bounce on value change
 * - Tap to show full number tooltip
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import shortenNumber from '../../helpers/shorten-number';

interface Props {
  /** Image URL for the currency icon */
  image: string;
  /** Current count */
  count: number;
  /** Display name */
  name?: string;
  /** Glow color for the pill border (auto-detected if omitted) */
  glow?: string;
  /** CurrencyFly target key */
  flyTarget?: string;
  /** Size: compact or full */
  size?: 'compact' | 'full';
}

export default function CurrencyPill({
  image,
  count,
  name,
  glow = '#fec90e',
  flyTarget,
  size = 'compact',
}: Props) {
  const { registerTarget } = useCurrencyFly();
  const containerRef = useRef<View>(null);
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const [displayCount, setDisplayCount] = useState(count);
  const prevCount = useRef(count);
  const [showFull, setShowFull] = useState(false);

  // Register fly target
  const measureAndRegister = useCallback(() => {
    if (flyTarget && containerRef.current) {
      containerRef.current.measureInWindow((x, y, w, h) => {
        if (x !== undefined && y !== undefined) {
          registerTarget(flyTarget, x + w / 2, y + h / 2);
        }
      });
    }
  }, [flyTarget, registerTarget]);

  // Bounce + tick on value change
  useEffect(() => {
    if (prevCount.current === count) return;
    const increased = count > prevCount.current;

    // Bounce
    Animated.sequence([
      Animated.spring(bounceAnim, {
        toValue: 1.2,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.spring(bounceAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();

    // Glow flash
    Animated.sequence([
      Animated.timing(glowAnim, { toValue: 0.9, duration: 100, useNativeDriver: false }),
      Animated.timing(glowAnim, { toValue: 0.3, duration: 600, useNativeDriver: false }),
    ]).start();

    // Tick animation
    if (increased && count - prevCount.current <= 100) {
      const start = prevCount.current;
      const dur = 400;
      const t0 = Date.now();
      const tick = () => {
        const p = Math.min((Date.now() - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplayCount(Math.round(start + (count - start) * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      tick();
    } else {
      setDisplayCount(count);
    }
    prevCount.current = count;
  }, [count]);

  useEffect(() => {
    if (displayCount !== count && prevCount.current === count) {
      setDisplayCount(count);
    }
  }, [count, displayCount]);

  const isCompact = size === 'compact';

  return (
    <View ref={containerRef} onLayout={measureAndRegister}>
      <TouchableOpacity
        onPress={() => setShowFull((p) => !p)}
        activeOpacity={0.8}
      >
        <Animated.View
          style={[
            styles.pill,
            {
              paddingHorizontal: isCompact ? 10 : 14,
              paddingVertical: isCompact ? 5 : 8,
              transform: [{ scale: bounceAnim }],
              shadowColor: glow,
              shadowOpacity: glowAnim as any,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 0 },
              borderColor: `${glow}50`,
            },
          ]}
        >
          {/* Glass background */}
          <LinearGradient
            colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.04)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Icon with glow */}
          <View style={{ position: 'relative' }}>
            <View
              style={[
                styles.iconGlow,
                { backgroundColor: glow, width: isCompact ? 26 : 32, height: isCompact ? 26 : 32 },
              ]}
            />
            <Image
              source={{ uri: image }}
              style={{
                width: isCompact ? 26 : 32,
                height: isCompact ? 26 : 32,
              }}
              contentFit="contain"
            />
          </View>

          {/* Count */}
          <Text
            style={[
              styles.countText,
              { fontSize: isCompact ? 18 : 22 },
            ]}
          >
            {showFull ? count.toLocaleString() : shortenNumber(displayCount)}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 50,
    borderWidth: 1.5,
    gap: 6,
    overflow: 'hidden',
  },
  iconGlow: {
    position: 'absolute',
    borderRadius: 20,
    opacity: 0.25,
    top: -3,
    left: -3,
    transform: [{ scale: 1.4 }],
  },
  countText: {
    fontFamily: 'Shark',
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
});
