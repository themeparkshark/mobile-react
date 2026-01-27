import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import config from '../config';

interface Props {
  current: number;
  max: number;
  secondsUntilNext: number;
}

/**
 * Energy bar showing current/max energy with regeneration timer.
 * Styled to match app's AAA quality standards.
 */
export default function EnergyBar({ current, max, secondsUntilNext }: Props) {
  const [timer, setTimer] = useState(secondsUntilNext);
  const percentage = Math.min(100, (current / max) * 100);
  const isFull = current >= max;
  const widthAnim = useRef(new Animated.Value(percentage)).current;

  // Animate bar width changes
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: percentage,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  // Countdown timer
  useEffect(() => {
    setTimer(secondsUntilNext);

    if (isFull || secondsUntilNext <= 0) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsUntilNext, isFull]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Energy color based on level
  const getEnergyColor = () => {
    if (percentage > 60) return '#4CAF50'; // Green - healthy
    if (percentage > 30) return config.tertiary; // Yellow/gold - medium
    return config.red; // Red - low
  };

  return (
    <View
      style={{
        width: '100%',
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      {/* Label Row */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 16,
            color: 'white',
            textTransform: 'uppercase',
            textShadowColor: 'rgba(0, 0, 0, 0.5)',
            textShadowOffset: { width: 1, height: 1 },
            textShadowRadius: 0,
          }}
        >
          ⚡ Energy
        </Text>
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 18,
            color: config.tertiary,
            textShadowColor: 'rgba(0, 0, 0, 0.5)',
            textShadowOffset: { width: 1, height: 1 },
            textShadowRadius: 0,
          }}
        >
          {current}/{max}
        </Text>
      </View>

      {/* Progress Bar Container */}
      <View
        style={{
          position: 'relative',
          width: '100%',
          height: 20,
          borderRadius: 10,
          borderWidth: 3,
          borderColor: config.primary,
          backgroundColor: 'white',
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 2, height: 2 },
          shadowRadius: 0,
          shadowOpacity: 0.3,
        }}
      >
        {/* Animated Fill */}
        <Animated.View
          style={{
            position: 'absolute',
            width: widthAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
            height: '100%',
            backgroundColor: getEnergyColor(),
            borderRadius: 7,
          }}
        />
      </View>

      {/* Regen Timer */}
      {!isFull && timer > 0 && (
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 12,
            color: 'rgba(255, 255, 255, 0.7)',
            textAlign: 'right',
            marginTop: 4,
          }}
        >
          +1 energy in {formatTime(timer)}
        </Text>
      )}
    </View>
  );
}
