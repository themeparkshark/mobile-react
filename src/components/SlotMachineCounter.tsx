import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Easing } from 'react-native';
import * as Haptics from '../helpers/haptics';
import { colors, typography } from '../design-system';

interface Props {
  value: number;
  digitCount?: number;
  duration?: number;
  style?: object;
  digitStyle?: object;
  commas?: boolean;
  prefix?: string;
  suffix?: string;
  onComplete?: () => void;
}

/**
 * Slot machine style counter - digits roll up individually.
 * Perfect for big wins, jackpots, and satisfying number reveals.
 */
export default function SlotMachineCounter({
  value,
  digitCount = 6,
  duration = 2000,
  style,
  digitStyle,
  commas = true,
  prefix,
  suffix,
  onComplete,
}: Props) {
  const [digits, setDigits] = useState<number[]>([]);
  const animValues = useRef<Animated.Value[]>([]);

  // Initialize animation values
  useEffect(() => {
    animValues.current = Array(digitCount)
      .fill(0)
      .map(() => new Animated.Value(0));
  }, [digitCount]);

  // Animate when value changes
  useEffect(() => {
    const valueStr = value.toString().padStart(digitCount, '0');
    const targetDigits = valueStr.split('').map(Number);

    // Stagger animations for each digit
    const animations = targetDigits.map((digit, index) => {
      const animValue = animValues.current[index];
      if (!animValue) return null;

      // Reset to 0
      animValue.setValue(0);

      // Calculate delay - rightmost digits animate first
      const delay = (digitCount - 1 - index) * 100;

      return Animated.sequence([
        Animated.delay(delay),
        Animated.timing(animValue, {
          toValue: digit + 10, // Spin through all digits plus target
          duration: duration - delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
    }).filter(Boolean) as Animated.CompositeAnimation[];

    // Haptic feedback during animation
    const hapticInterval = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 150);

    Animated.parallel(animations).start(() => {
      clearInterval(hapticInterval);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDigits(targetDigits);
      onComplete?.();
    });

    return () => clearInterval(hapticInterval);
  }, [value, digitCount, duration]);

  // Format with commas
  const formatValue = (val: number): string => {
    if (!commas) return val.toString();
    return val.toLocaleString();
  };

  return (
    <View style={[styles.container, style]}>
      {prefix && <Text style={[styles.affix, digitStyle]}>{prefix}</Text>}
      
      <View style={styles.digitsContainer}>
        {Array(digitCount)
          .fill(0)
          .map((_, index) => (
            <DigitRoller
              key={index}
              animValue={animValues.current[index]}
              style={digitStyle}
              showComma={commas && (digitCount - index) % 3 === 1 && index < digitCount - 1}
            />
          ))}
      </View>

      {suffix && <Text style={[styles.affix, digitStyle]}>{suffix}</Text>}
    </View>
  );
}

/**
 * Single rolling digit
 */
function DigitRoller({
  animValue,
  style,
  showComma,
}: {
  animValue?: Animated.Value;
  style?: object;
  showComma?: boolean;
}) {
  if (!animValue) return null;

  // Create digit strip (0-9 repeated twice for smooth rolling)
  const digitStrip = [...Array(20)].map((_, i) => i % 10);

  const translateY = animValue.interpolate({
    inputRange: [0, 20],
    outputRange: [0, -20 * 36], // 36 is digit height
  });

  return (
    <View style={styles.digitContainer}>
      <View style={styles.digitMask}>
        <Animated.View
          style={[
            styles.digitStrip,
            { transform: [{ translateY }] },
          ]}
        >
          {digitStrip.map((digit, i) => (
            <Text key={i} style={[styles.digit, style]}>
              {digit}
            </Text>
          ))}
        </Animated.View>
      </View>
      {showComma && <Text style={[styles.comma, style]}>,</Text>}
    </View>
  );
}

/**
 * Simple animated big number display
 */
export function BigNumberReveal({
  value,
  label,
  icon,
  color = colors.tertiary,
  duration = 1500,
}: {
  value: number;
  label: string;
  icon?: string;
  color?: string;
  duration?: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [value]);

  return (
    <Animated.View
      style={[
        styles.bigNumberContainer,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {icon && <Text style={styles.bigNumberIcon}>{icon}</Text>}
      <SlotMachineCounter
        value={value}
        digitCount={Math.max(1, value.toString().length)}
        duration={duration}
        digitStyle={{ color, fontSize: 48, fontFamily: 'Knockout' }}
      />
      <Text style={styles.bigNumberLabel}>{label}</Text>
    </Animated.View>
  );
}

const DIGIT_HEIGHT = 36;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  digitsContainer: {
    flexDirection: 'row',
  },
  digitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  digitMask: {
    height: DIGIT_HEIGHT,
    overflow: 'hidden',
  },
  digitStrip: {
    flexDirection: 'column',
  },
  digit: {
    height: DIGIT_HEIGHT,
    lineHeight: DIGIT_HEIGHT,
    fontFamily: 'Knockout',
    fontSize: 28,
    color: colors.textPrimary,
    textAlign: 'center',
    minWidth: 20,
  },
  comma: {
    fontFamily: 'Knockout',
    fontSize: 28,
    color: colors.textPrimary,
    marginRight: 2,
  },
  affix: {
    fontFamily: 'Knockout',
    fontSize: 28,
    color: colors.textPrimary,
  },
  bigNumberContainer: {
    alignItems: 'center',
    padding: 24,
  },
  bigNumberIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  bigNumberLabel: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 8,
  },
});
