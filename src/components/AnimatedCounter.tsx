import { useEffect, useRef, useState } from 'react';
import { Animated, Text, TextStyle, View, ViewStyle } from 'react-native';
import * as Haptics from '../helpers/haptics';

interface Props {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  style?: TextStyle;
  containerStyle?: ViewStyle;
  formatNumber?: boolean;
  hapticOnComplete?: boolean;
  onComplete?: () => void;
}

/**
 * Animated number counter that ticks up/down satisfyingly.
 * Perfect for coins, XP, scores - anything where numbers going up feels good.
 */
export default function AnimatedCounter({
  value,
  duration = 800,
  prefix = '',
  suffix = '',
  style,
  containerStyle,
  formatNumber = true,
  hapticOnComplete = false,
  onComplete,
}: Props) {
  const [displayValue, setDisplayValue] = useState(value);
  const animatedValue = useRef(new Animated.Value(value)).current;
  const previousValue = useRef(value);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const diff = Math.abs(value - previousValue.current);
    
    // Skip animation for initial render or tiny changes
    if (diff === 0) return;

    // Calculate duration based on difference (faster for small changes)
    const adjustedDuration = Math.min(duration, Math.max(300, diff * 10));

    // Animate the value
    Animated.timing(animatedValue, {
      toValue: value,
      duration: adjustedDuration,
      useNativeDriver: false,
    }).start(() => {
      if (hapticOnComplete && value > previousValue.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onComplete?.();
    });

    // Scale bounce when value increases significantly
    if (value > previousValue.current && diff > 10) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }

    previousValue.current = value;
  }, [value]);

  useEffect(() => {
    const listener = animatedValue.addListener(({ value: v }) => {
      setDisplayValue(Math.floor(v));
    });

    return () => animatedValue.removeListener(listener);
  }, []);

  const formattedValue = formatNumber
    ? displayValue.toLocaleString()
    : displayValue.toString();

  return (
    <View style={containerStyle}>
      <Animated.Text
        style={[
          style,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {prefix}{formattedValue}{suffix}
      </Animated.Text>
    </View>
  );
}

/**
 * Specialized counter for currency with icon
 */
export function CurrencyCounter({
  value,
  icon,
  iconSize = 20,
  ...props
}: Props & { icon: string; iconSize?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: iconSize }}>{icon}</Text>
      <AnimatedCounter value={value} {...props} />
    </View>
  );
}

/**
 * XP counter with level-up detection
 */
export function XPCounter({
  value,
  maxValue,
  onLevelUp,
  ...props
}: Props & { maxValue: number; onLevelUp?: () => void }) {
  const previousValue = useRef(value);

  useEffect(() => {
    // Detect level up (value reset to lower number)
    if (value < previousValue.current && previousValue.current > maxValue * 0.9) {
      onLevelUp?.();
    }
    previousValue.current = value;
  }, [value]);

  return (
    <View style={{ alignItems: 'center' }}>
      <AnimatedCounter
        value={value}
        suffix={` / ${maxValue.toLocaleString()}`}
        {...props}
      />
    </View>
  );
}
