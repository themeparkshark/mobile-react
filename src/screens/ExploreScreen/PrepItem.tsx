import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { PrepItemType } from '../../models/prep-item-type';
import config from '../../config';
import dayjs from 'dayjs';

interface Props {
  prepItem: PrepItemType;
  onExpire: () => void;
}

/**
 * Prep item marker for the home map.
 * Styled to match app's AAA quality standards.
 */
export default function PrepItem({ prepItem, onExpire }: Props) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  // Pulse animation for attention
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.6,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!prepItem.active_to) return;

    const interval = setInterval(() => {
      const now = dayjs();
      const end = dayjs(prepItem.active_to);
      const diff = end.diff(now, 'second');

      if (diff <= 0) {
        clearInterval(interval);
        onExpire();
        return;
      }

      const minutes = Math.floor(diff / 60);
      const seconds = diff % 60;
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [prepItem.active_to, onExpire]);

  // Rarity config
  const rarityConfig = {
    1: { color: '#4CAF50', label: 'Common' },
    2: { color: config.secondary, label: 'Uncommon' },
    3: { color: '#9C27B0', label: 'Rare' },
  }[prepItem.rarity] || { color: '#4CAF50', label: 'Common' };

  return (
    <Animated.View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 80,
        height: 80,
        transform: [{ scale: pulseAnim }],
      }}
    >
      {/* Glow effect based on rarity */}
      <Animated.View
        style={{
          position: 'absolute',
          width: 70,
          height: 70,
          borderRadius: 35,
          backgroundColor: rarityConfig.color,
          opacity: glowAnim,
        }}
      />

      {/* White outline circle */}
      <View
        style={{
          position: 'absolute',
          width: 60,
          height: 60,
          borderRadius: 30,
          borderWidth: 3,
          borderColor: 'white',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          shadowColor: '#000',
          shadowOffset: { width: 2, height: 2 },
          shadowRadius: 0,
          shadowOpacity: 0.3,
        }}
      />

      {/* Item icon or fallback */}
      {prepItem.icon_url ? (
        <Image
          source={{ uri: prepItem.icon_url }}
          style={{
            width: 45,
            height: 45,
            zIndex: 10,
          }}
          contentFit="contain"
        />
      ) : (
        <View
          style={{
            width: 45,
            height: 45,
            borderRadius: 22,
            backgroundColor: rarityConfig.color,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <Text style={{ fontSize: 24 }}>🎁</Text>
        </View>
      )}

      {/* Timer */}
      {timeRemaining && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            backgroundColor: config.primary,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: 'white',
            shadowColor: '#000',
            shadowOffset: { width: 1, height: 1 },
            shadowRadius: 0,
            shadowOpacity: 0.3,
          }}
        >
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 11,
              color: 'white',
            }}
          >
            {timeRemaining}
          </Text>
        </View>
      )}

      {/* Rarity indicator */}
      <View
        style={{
          position: 'absolute',
          top: 5,
          right: 10,
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: rarityConfig.color,
          borderWidth: 2,
          borderColor: 'white',
          shadowColor: '#000',
          shadowOffset: { width: 1, height: 1 },
          shadowRadius: 0,
          shadowOpacity: 0.3,
        }}
      />
    </Animated.View>
  );
}
