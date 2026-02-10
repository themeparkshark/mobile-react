import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { PlayerType } from '../models/player-type';
import Avatar from './Avatar';
import Button from './Button';

const tapSound = require('../../assets/sounds/tap.mp3');
const revealSound = require('../../assets/sounds/reveal.mp3');

const CROWN_IMAGES = {
  1: require('../../assets/images/screens/leaderboard/crown-gold.png'),
  2: require('../../assets/images/screens/leaderboard/crown-silver.png'),
  3: require('../../assets/images/screens/leaderboard/crown-bronze.png'),
};

const RANK_COLORS = {
  1: { frame: '#FFD700', frameShadow: '#B8860B', bg: '#1a3a8a', glow: '#FFD700' },
  2: { frame: '#C0C0C0', frameShadow: '#808080', bg: '#2a5a9a', glow: '#C0C0C0' },
  3: { frame: '#CD7F32', frameShadow: '#8B4513', bg: '#5a3a2a', glow: '#CD7F32' },
};

function AnimatedScore({ value, color, fontSize }: { value: number; color: string; fontSize: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame: number;
    const duration = 1200;
    const start = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <Text
      style={{
        fontFamily: 'Shark',
        color,
        fontSize,
        textShadowColor: 'rgba(0, 0, 0, .5)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 0,
        textAlign: 'center',
      }}
    >
      {display.toLocaleString()}
    </Text>
  );
}

export default function LeaderboardPlayer({
  player,
  rank = 1,
  scoreKey = 'park_coins',
}: {
  readonly player: PlayerType;
  readonly rank?: 1 | 2 | 3;
  readonly scoreKey?: keyof PlayerType;
}) {
  const colors = RANK_COLORS[rank];
  const isFirst = rank === 1;
  const avatarSize = isFirst ? 'xl' : 'lg';
  const { playSound } = useContext(SoundEffectContext);

  // Glow pulse for #1
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  // Crown shimmer
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFirst) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.4,
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ])
      ).start();
    }

    // Crown shimmer for all ranks
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const glowRadius = glowAnim.interpolate({
    inputRange: [0.4, 1],
    outputRange: [8, 20],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0.4, 1],
    outputRange: [0.4, 0.9],
  });

  const crownScale = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.08, 1],
  });

  const crownOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.85, 1, 0.85],
  });

  return (
    <View style={{ alignItems: 'center' }}>
      {/* Crown with shimmer */}
      <Animated.View
        style={{
          marginBottom: -12,
          zIndex: 20,
          transform: [{ scale: crownScale }],
          opacity: crownOpacity,
        }}
      >
        <Image
          source={CROWN_IMAGES[rank]}
          style={{
            width: isFirst ? 48 : 38,
            height: isFirst ? 48 : 38,
          }}
          contentFit="contain"
        />
      </Animated.View>

      {/* Avatar with ornate frame + glow */}
      <Button
        onPress={() => {
          playSound(tapSound);
          RootNavigation.navigate('Player', {
            player: player.id,
          });
        }}
      >
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          {/* Glow ring behind avatar (all ranks, strongest on #1) */}
          {isFirst && (
            <Animated.View
              style={{
                position: 'absolute',
                width: isFirst ? 110 : 90,
                height: isFirst ? 110 : 90,
                borderRadius: 999,
                backgroundColor: colors.glow,
                opacity: glowOpacity,
                shadowColor: colors.glow,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 1,
                shadowRadius: glowRadius,
                elevation: 12,
              }}
            />
          )}
          <View
            style={{
              borderWidth: isFirst ? 5 : 4,
              borderColor: colors.frame,
              borderRadius: 999,
              padding: 3,
              shadowColor: colors.frameShadow,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.8,
              shadowRadius: 6,
              elevation: 8,
              backgroundColor: colors.frame,
            }}
          >
            <View style={{ borderRadius: 999, overflow: 'hidden' }}>
              <Avatar player={player} size={avatarSize} />
            </View>
          </View>
        </View>
      </Button>

      {/* Name card */}
      <View
        style={{
          backgroundColor: colors.bg,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 4,
          marginTop: 6,
          borderWidth: 2,
          borderColor: colors.frame,
          minWidth: 80,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            textAlign: 'center',
            fontFamily: 'Shark',
            textTransform: 'uppercase',
            color: 'white',
            fontSize: isFirst ? 16 : 13,
            textShadowColor: 'rgba(0, 0, 0, .5)',
            textShadowOffset: { width: 1, height: 1 },
            textShadowRadius: 0,
          }}
          numberOfLines={1}
        >
          {player.screen_name}
        </Text>
      </View>

      {/* Animated score badge */}
      <View
        style={{
          borderRadius: 6,
          backgroundColor: 'rgba(0, 0, 0, .6)',
          paddingHorizontal: 14,
          paddingVertical: 3,
          marginTop: 4,
        }}
      >
        <AnimatedScore
          value={Number(player[scoreKey]) || 0}
          color={colors.frame}
          fontSize={isFirst ? 26 : 22}
        />
      </View>
    </View>
  );
}
