import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import config from '../config';
import { PlayerType } from '../models/player-type';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import ProfileStatIcon from './ProfileStatIcon';
import useReducedGameMotion from '../hooks/useReducedGameMotion';

export function AnimatedStat({
  label,
  value,
  iconIndex,
  delay,
}: {
  label: string;
  value: number;
  iconIndex: number;
  delay: number;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const animValue = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const iconBounce = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedGameMotion();

  useEffect(() => {
    if (reducedMotion) {
      animValue.setValue(1);
      scaleAnim.setValue(1);
      iconBounce.setValue(0);
      return;
    }
    Animated.timing(animValue, {
      toValue: 1,
      duration: 500,
      delay,
      useNativeDriver: true,
    }).start();
    return () => { animValue.stopAnimation(); scaleAnim.stopAnimation(); iconBounce.stopAnimation(); };
  }, [animValue, scaleAnim, iconBounce, delay, reducedMotion]);

  // Number counter effect
  const [displayNum, setDisplayNum] = useState(value);
  useEffect(() => {
    const target = value;
    if (target === 0 || reducedMotion) { setDisplayNum(target); return; }
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
  }, [value, delay, reducedMotion]);

  const scale = useMemo(() => animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  }), [animValue]);
  const cardScale = useMemo(() => Animated.multiply(scale, scaleAnim), [scale, scaleAnim]);

  const handlePress = () => {
    playSound(require('../../assets/sounds/button_press.mp3'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (reducedMotion) return;

    // Keep the card's surface stable while its contents respond to the tap.
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.94,
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
    <Pressable onPress={handlePress} accessibilityRole="button"
      accessibilityLabel={`${label}: ${value.toLocaleString()}`} style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#D5E8F5',
          padding: 12,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 90,
          shadowColor: '#174D76',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <Animated.View style={{ alignItems: 'center', opacity: animValue,
          transform: [{ scale: cardScale }] }}>
        <Animated.View style={{ marginBottom: 6, transform: [{ translateY: iconBounce }] }}>
          <ProfileStatIcon index={iconIndex} />
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
            color: '#46617A',
            textTransform: 'uppercase',
            textAlign: 'center',
            marginTop: 2,
          }}
        >
          {label}
        </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

/** A count the server may hide: null or undefined (a stranger's balances) means "do not show". */
export function visibleCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function Stats({ player, hideBalances = false }: {
  readonly player: PlayerType;
  /** Another player who is not your friend: balances and park history are private (the kid-safety backend sends 0 or null). */
  readonly hideBalances?: boolean;
}) {
  const all = [
    {
      label: 'Keys',
      value: hideBalances ? null : visibleCount(player.keys),
      iconIndex: 0,
    },
    {
      label: 'Park Coins',
      value: visibleCount(player.park_coins_count),
      iconIndex: 1,
    },
    {
      label: 'Parks',
      value: hideBalances ? null : visibleCount(player.visited_parks_count),
      iconIndex: 2,
    },
    {
      label: 'Shark Coins',
      value: hideBalances ? null : visibleCount(player.coins),
      iconIndex: 3,
    },
    {
      label: 'Ride Wins',
      value: visibleCount(player.completed_tasks_count),
      iconIndex: 4,
    },
    {
      label: 'Total XP',
      // Lifetime XP can never read lower than the XP inside the current level.
      value: visibleCount(player.total_experience) === null && visibleCount(player.experience) === null
        ? null
        : Math.max(Number(player.total_experience) || 0, Number(player.experience) || 0),
      iconIndex: 5,
    },
  ];

  // Hidden values (a stranger's Keys and Shark Coins) drop their tile; the rest stay in even rows.
  const stats = all.filter((s): s is typeof s & { value: number } => s.value !== null);
  if (stats.length === 0) return null;
  const perRow = stats.length === 4 ? 2 : 3;
  const rows: (typeof stats)[] = [];
  for (let i = 0; i < stats.length; i += perRow) rows.push(stats.slice(i, i + perRow));

  return (
    <View style={{ gap: 10, paddingHorizontal: 8 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((stat, i) => (
            <AnimatedStat key={stat.label} {...stat} delay={(r * perRow + i) * 80} />
          ))}
        </View>
      ))}
    </View>
  );
}
