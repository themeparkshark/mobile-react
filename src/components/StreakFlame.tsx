import { useEffect, useRef, memo } from 'react';
import { Animated, StyleSheet, Text, View, Easing } from 'react-native';
import { colors } from '../design-system';

interface Props {
  streak: number;
  size?: 'small' | 'medium' | 'large';
  showNumber?: boolean;
  animated?: boolean;
}

const SIZES = {
  small: { flame: 20, number: 12, container: 32 },
  medium: { flame: 32, number: 18, container: 48 },
  large: { flame: 48, number: 28, container: 72 },
};

/**
 * Animated streak flame with flickering effect.
 * The flame intensity increases with streak length.
 */
function StreakFlame({ streak, size = 'medium', showNumber = true, animated = true }: Props) {
  const { flame, number, container } = SIZES[size];
  
  const flicker1 = useRef(new Animated.Value(0)).current;
  const flicker2 = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0.3)).current;

  // Determine flame intensity based on streak
  const intensity = Math.min(streak / 100, 1); // 0-1 based on 100 day max
  const flameColor = getFlameColor(streak);
  const glowColor = getGlowColor(streak);

  useEffect(() => {
    if (!animated) return;

    // Random flicker animation
    const createFlicker = (animValue: Animated.Value, minDuration: number, maxDuration: number) => {
      const animate = () => {
        const duration = minDuration + Math.random() * (maxDuration - minDuration);
        Animated.sequence([
          Animated.timing(animValue, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(animate);
      };
      animate();
    };

    createFlicker(flicker1, 100, 200);
    createFlicker(flicker2, 150, 300);

    // Glow pulse based on intensity
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 0.5 + intensity * 0.3,
          duration: 800,
          useNativeDriver: false,
        }),
        Animated.timing(glow, {
          toValue: 0.3 + intensity * 0.2,
          duration: 800,
          useNativeDriver: false,
        }),
      ])
    ).start();

    // Subtle breathing scale
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1 + intensity * 0.05,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [animated, intensity]);

  const flicker1Scale = flicker1.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  const flicker2Rotate = flicker2.interpolate({
    inputRange: [0, 1],
    outputRange: ['-3deg', '3deg'],
  });

  if (streak <= 0) {
    return (
      <View style={[styles.container, { width: container, height: container }]}>
        <Text style={[styles.flame, { fontSize: flame, opacity: 0.3 }]}>🔥</Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: container,
          height: container,
          transform: [{ scale }],
        },
      ]}
    >
      {/* Glow effect */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: container * 1.5,
            height: container * 1.5,
            borderRadius: container,
            backgroundColor: glowColor,
            opacity: glow,
          },
        ]}
      />

      {/* Main flame with flicker */}
      <Animated.Text
        style={[
          styles.flame,
          {
            fontSize: flame,
            transform: [
              { scale: flicker1Scale },
              { rotate: flicker2Rotate },
            ],
          },
        ]}
      >
        🔥
      </Animated.Text>

      {/* Streak number */}
      {showNumber && (
        <View style={styles.numberContainer}>
          <Text
            style={[
              styles.number,
              {
                fontSize: number,
                color: streak >= 100 ? colors.rarity.legendary.main : 'white',
                textShadowColor: streak >= 100 ? colors.rarity.legendary.main : 'rgba(0,0,0,0.5)',
              },
            ]}
          >
            {streak}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(StreakFlame);

/**
 * Get flame color based on streak length
 */
function getFlameColor(streak: number): string {
  if (streak >= 100) return '#FFD700'; // Gold
  if (streak >= 30) return '#FF6B00'; // Orange
  if (streak >= 7) return '#FF4500'; // Red-orange
  return '#FF6347'; // Tomato
}

/**
 * Get glow color based on streak length
 */
function getGlowColor(streak: number): string {
  if (streak >= 100) return 'rgba(255, 215, 0, 0.5)'; // Gold glow
  if (streak >= 30) return 'rgba(255, 107, 0, 0.4)'; // Orange glow
  if (streak >= 7) return 'rgba(255, 69, 0, 0.35)'; // Red-orange glow
  return 'rgba(255, 99, 71, 0.3)'; // Tomato glow
}

/**
 * Milestone badges for streak
 */
export function StreakMilestoneBadge({ streak }: { streak: number }) {
  const milestone = getNextMilestone(streak);
  const progress = streak / milestone;

  return (
    <View style={styles.milestoneBadge}>
      <StreakFlame streak={streak} size="small" showNumber={false} />
      <View style={styles.milestoneProgress}>
        <View style={[styles.milestoneBar, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.milestoneText}>{streak}/{milestone}</Text>
    </View>
  );
}

function getNextMilestone(streak: number): number {
  const milestones = [7, 14, 30, 60, 100, 200, 365, 500, 1000];
  return milestones.find((m) => m > streak) || streak + 100;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  flame: {
    textAlign: 'center',
  },
  numberContainer: {
    position: 'absolute',
    bottom: -4,
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  number: {
    fontFamily: 'Knockout',
    fontWeight: 'bold',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  milestoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgMedium,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
  },
  milestoneProgress: {
    width: 60,
    height: 6,
    backgroundColor: colors.bgDark,
    borderRadius: 3,
    overflow: 'hidden',
  },
  milestoneBar: {
    height: '100%',
    backgroundColor: colors.tertiary,
    borderRadius: 3,
  },
  milestoneText: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: colors.textSecondary,
  },
});
