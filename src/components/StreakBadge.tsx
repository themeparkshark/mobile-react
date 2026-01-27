import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View, Platform, Easing } from 'react-native';
import config from '../config';
import HapticPatterns from '../helpers/hapticPatterns';
import { AnimatedCounter } from './CelebrationEffects';

interface Props {
  streak: number;
  multiplier: number;
  atRisk?: boolean;
}

/**
 * Badge showing current streak and bonus multiplier.
 * Animated fire emoji and celebration on streak increases!
 */
export default function StreakBadge({ streak, multiplier, atRisk }: Props) {
  const [prevStreak, setPrevStreak] = useState(streak);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fireAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Fire flickering animation
  useEffect(() => {
    if (streak > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(fireAnim, {
            toValue: 1,
            duration: 150 + Math.random() * 100,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(fireAnim, {
            toValue: 0,
            duration: 150 + Math.random() * 100,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [streak > 0]);

  // Celebration when streak increases
  useEffect(() => {
    if (streak > prevStreak) {
      // Pop animation
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.3,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 3,
          useNativeDriver: true,
        }),
      ]).start();

      // Glow effect for milestones
      if (streak % 5 === 0 || streak === 7 || streak === 30 || streak === 100) {
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]).start();

        // Haptic for milestone
        if (Platform.OS === 'ios') {
          HapticPatterns.streakMilestone(streak);
        }
      }
    }
    setPrevStreak(streak);
  }, [streak, prevStreak]);

  // At-risk shake animation
  useEffect(() => {
    if (atRisk) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 3, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -3, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
          Animated.delay(2000),
        ])
      ).start();
    } else {
      shakeAnim.setValue(0);
    }
  }, [atRisk]);

  if (streak <= 0) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}
      >
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 14,
            color: 'rgba(255, 255, 255, 0.5)',
            textTransform: 'uppercase',
          }}
        >
          🔥 Start your streak!
        </Text>
      </View>
    );
  }

  // Determine badge color based on streak length
  const getBadgeColor = () => {
    if (streak >= 100) return '#FFD700'; // Gold for 100+
    if (streak >= 30) return '#9C27B0'; // Purple for 30+
    if (streak >= 7) return config.secondary; // Blue for 7+
    return '#4CAF50'; // Green for 1-6
  };

  // Fire scale animation
  const fireScale = fireAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  // Glow opacity
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.9],
  });

  return (
    <Animated.View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        opacity: atRisk ? 0.85 : 1,
        transform: [
          { scale: scaleAnim },
          { translateX: shakeAnim },
        ],
      }}
    >
      {/* Streak Badge with glow */}
      <Animated.View
        style={{
          shadowColor: getBadgeColor(),
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 10,
          shadowOpacity: glowOpacity,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: getBadgeColor(),
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: 'rgba(255, 255, 255, 0.3)',
            shadowColor: '#000',
            shadowOffset: { width: 2, height: 2 },
            shadowRadius: 0,
            shadowOpacity: 0.3,
          }}
        >
          {/* Animated Fire emoji */}
          <Animated.Text
            style={{
              fontSize: 16,
              marginRight: 4,
              transform: [{ scale: fireScale }],
            }}
          >
            🔥
          </Animated.Text>
          
          {/* Animated Streak Count */}
          <AnimatedCounter
            value={streak}
            style={{
              fontFamily: 'Knockout',
              fontSize: 18,
              color: 'white',
              textShadowColor: 'rgba(0, 0, 0, 0.5)',
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 0,
            }}
          />
        </View>
      </Animated.View>

      {/* Multiplier Badge with pulse */}
      {multiplier > 1 && (
        <Animated.View
          style={{
            marginLeft: 6,
            backgroundColor: config.tertiary,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: 'rgba(0, 0, 0, 0.2)',
            shadowColor: config.tertiary,
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 8,
            shadowOpacity: glowOpacity,
          }}
        >
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 14,
              color: config.primary,
              fontWeight: 'bold',
            }}
          >
            {multiplier}x
          </Text>
        </Animated.View>
      )}

      {/* At Risk Warning - pulses */}
      {atRisk && (
        <Animated.View
          style={{
            marginLeft: 6,
            backgroundColor: config.red,
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: 'white',
            shadowColor: config.red,
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 8,
            shadowOpacity: 0.8,
          }}
        >
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 14,
              color: 'white',
              fontWeight: 'bold',
            }}
          >
            !
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}
