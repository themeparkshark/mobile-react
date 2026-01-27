import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, typography } from '../design-system';

interface Props {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  gradientColors?: [string, string];
  backgroundColor?: string;
  showPercentage?: boolean;
  showLabel?: boolean;
  label?: string;
  centerContent?: React.ReactNode;
  animated?: boolean;
  duration?: number;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Circular progress ring with optional gradient and animation.
 * Perfect for collection progress, achievement progress, etc.
 */
export default function ProgressRing({
  progress,
  size = 100,
  strokeWidth = 8,
  color = colors.secondary,
  gradientColors,
  backgroundColor = colors.bgDark,
  showPercentage = true,
  showLabel = false,
  label,
  centerContent,
  animated = true,
  duration = 1000,
}: Props) {
  const animatedProgress = useRef(new Animated.Value(0)).current;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (animated) {
      Animated.timing(animatedProgress, {
        toValue: progress,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // strokeDashoffset not supported by native driver
      }).start();
    } else {
      animatedProgress.setValue(progress);
    }
  }, [progress, animated, duration]);

  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  // Determine if complete
  const isComplete = progress >= 100;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Gradient definition */}
        {gradientColors && (
          <Defs>
            <LinearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={gradientColors[0]} />
              <Stop offset="100%" stopColor={gradientColors[1]} />
            </LinearGradient>
          </Defs>
        )}

        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        {/* Progress circle */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={gradientColors ? 'url(#progressGradient)' : (isComplete ? colors.rarity.legendary.main : color)}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {/* Center content */}
      <View style={styles.centerContainer}>
        {centerContent ? (
          centerContent
        ) : showPercentage ? (
          <Text style={[styles.percentage, isComplete && styles.percentageComplete]}>
            {Math.round(progress)}%
          </Text>
        ) : null}
        {showLabel && label && (
          <Text style={styles.label}>{label}</Text>
        )}
      </View>
    </View>
  );
}

/**
 * Mini progress ring for inline use
 */
export function MiniProgressRing({
  progress,
  size = 32,
  color = colors.secondary,
}: {
  progress: number;
  size?: number;
  color?: string;
}) {
  return (
    <ProgressRing
      progress={progress}
      size={size}
      strokeWidth={3}
      color={color}
      showPercentage={false}
      animated={false}
    />
  );
}

/**
 * Collection completion ring with count
 */
export function CollectionRing({
  collected,
  total,
  size = 80,
  label,
}: {
  collected: number;
  total: number;
  size?: number;
  label?: string;
}) {
  const progress = (collected / total) * 100;
  const isComplete = collected >= total;

  return (
    <ProgressRing
      progress={progress}
      size={size}
      strokeWidth={6}
      gradientColors={isComplete ? ['#FFD700', '#FFA500'] : [colors.secondary, colors.primary]}
      centerContent={
        <View style={styles.collectionCenter}>
          <Text style={[styles.collectionCount, isComplete && styles.collectionCountComplete]}>
            {collected}
          </Text>
          <Text style={styles.collectionTotal}>/{total}</Text>
        </View>
      }
      showLabel={!!label}
      label={label}
    />
  );
}

/**
 * XP progress ring with level
 */
export function XPRing({
  currentXP,
  requiredXP,
  level,
  size = 100,
}: {
  currentXP: number;
  requiredXP: number;
  level: number;
  size?: number;
}) {
  const progress = (currentXP / requiredXP) * 100;

  return (
    <ProgressRing
      progress={progress}
      size={size}
      strokeWidth={8}
      gradientColors={[colors.secondary, colors.tertiary]}
      centerContent={
        <View style={styles.xpCenter}>
          <Text style={styles.xpLevelLabel}>LVL</Text>
          <Text style={styles.xpLevel}>{level}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentage: {
    fontFamily: 'Knockout',
    fontSize: 24,
    color: colors.textPrimary,
  },
  percentageComplete: {
    color: colors.rarity.legendary.main,
  },
  label: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  collectionCenter: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  collectionCount: {
    fontFamily: 'Knockout',
    fontSize: 20,
    color: colors.textPrimary,
  },
  collectionCountComplete: {
    color: colors.rarity.legendary.main,
  },
  collectionTotal: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: colors.textSecondary,
  },
  xpCenter: {
    alignItems: 'center',
  },
  xpLevelLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: colors.textSecondary,
  },
  xpLevel: {
    fontFamily: 'Knockout',
    fontSize: 32,
    color: colors.textPrimary,
    marginTop: -4,
  },
});
