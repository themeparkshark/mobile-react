import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import config from '../config';
import { PlayerType } from '../models/player-type';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';

function AnimatedStat({
  label,
  value,
  icon,
  emoji,
  delay,
}: {
  label: string;
  value: number;
  icon?: any;
  emoji?: string;
  delay: number;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const animValue = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: 1,
      duration: 500,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  // Number counter effect
  const [displayNum, setDisplayNum] = useState(0);
  useEffect(() => {
    const target = value;
    if (target === 0) return;
    const duration = 800;
    const startTime = Date.now() + delay;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed < 0) return;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayNum(Math.round(eased * target));
      if (progress >= 1) clearInterval(interval);
    }, 16);
    return () => clearInterval(interval);
  }, [value]);

  const scale = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });

  const handlePress = () => {
    playSound(require('../../assets/sounds/button_press.mp3'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Squish the whole card
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.88,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Bounce the icon/emoji up
    Animated.sequence([
      Animated.timing(iconBounce, {
        toValue: -10,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(iconBounce, {
        toValue: 0,
        friction: 3,
        tension: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <Pressable onPress={handlePress} style={{ flex: 1 }}>
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderRadius: 14,
          padding: 12,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 90,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 3,
          opacity: animValue,
          transform: [{ scale: Animated.multiply(scale, scaleAnim) }],
        }}
      >
        <Animated.View style={{ transform: [{ translateY: iconBounce }] }}>
          {icon ? (
            <Image
              source={icon}
              style={{ width: 28, height: 28, marginBottom: 6 }}
              contentFit="contain"
            />
          ) : (
            <Text style={{ fontSize: 24, marginBottom: 4 }}>{emoji}</Text>
          )}
        </Animated.View>
        <Text
          style={{
            fontFamily: 'Shark',
            fontSize: 20,
            color: config.primary,
            textAlign: 'center',
          }}
        >
          {displayNum.toLocaleString()}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            fontFamily: 'Knockout',
            fontSize: 11,
            color: '#64748b',
            textTransform: 'uppercase',
            textAlign: 'center',
            marginTop: 2,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function Stats({ player }: { readonly player: PlayerType }) {
  const stats = [
    {
      label: 'Keys',
      value: player.keys,
      emoji: '🔑',
    },
    {
      label: 'Park Coins',
      value: player.park_coins_count,
      icon: require('../../assets/images/screens/community-center-coin.png'),
    },
    {
      label: 'Parks',
      value: player.visited_parks_count,
      emoji: '🏰',
    },
    {
      label: 'Shark Coins',
      value: player.coins,
      icon: require('../../assets/images/coingold.png'),
    },
    {
      label: 'Tasks Done',
      value: player.completed_tasks_count,
      emoji: '✅',
    },
    {
      label: 'Total XP',
      value: player.total_experience,
      icon: require('../../assets/images/screens/explore/xp.png'),
    },
  ];

  const row1 = stats.slice(0, 3);
  const row2 = stats.slice(3, 6);

  return (
    <View style={{ gap: 10, paddingHorizontal: 8 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {row1.map((stat, i) => (
          <AnimatedStat key={stat.label} {...stat} delay={i * 80} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {row2.map((stat, i) => (
          <AnimatedStat key={stat.label} {...stat} delay={(i + 3) * 80} />
        ))}
      </View>
    </View>
  );
}
