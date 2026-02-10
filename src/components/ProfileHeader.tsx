import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import config from '../config';
import { PlayerType } from '../models/player-type';

const coinIcon = require('../../assets/images/coingold.png');
const xpIcon = require('../../assets/images/screens/explore/xp.png');

export default function ProfileHeader({ player }: { readonly player: PlayerType }) {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(slideUp, {
        toValue: 0,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: fadeIn,
        transform: [{ translateY: slideUp }],
        alignItems: 'center',
        paddingTop: 16,
        paddingBottom: 8,
      }}
    >
      {/* Username */}
      <Text
        style={{
          fontFamily: 'Shark',
          fontSize: 28,
          color: config.primary,
          textTransform: 'uppercase',
          textAlign: 'center',
          letterSpacing: 1,
          textShadowColor: 'rgba(9, 38, 143, 0.15)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 4,
        }}
      >
        {player.screen_name}
      </Text>

      {/* Badges row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 8,
          gap: 12,
        }}
      >
        {/* Verified badge */}
        {player.verified_at && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 165, 245, 0.1)',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
            }}
          >
            <Text style={{ fontSize: 12, marginRight: 4 }}>✓</Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 12,
                color: config.secondary,
                textTransform: 'uppercase',
              }}
            >
              Verified
            </Text>
          </View>
        )}

        {/* Subscriber badge */}
        {player.is_subscribed && (
          <LinearGradient
            colors={[config.tertiary, '#e6b800']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
            }}
          >
            <Text style={{ fontSize: 12, marginRight: 4 }}>⭐</Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 12,
                color: '#1a1a2e',
                textTransform: 'uppercase',
                fontWeight: 'bold',
              }}
            >
              Subscriber
            </Text>
          </LinearGradient>
        )}
      </View>

      {/* Stats pills */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 12,
          gap: 16,
        }}
      >
        {/* Coins */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 165, 245, 0.08)',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: 'rgba(0, 165, 245, 0.12)',
          }}
        >
          <Image source={coinIcon} style={{ width: 18, height: 18, marginRight: 6 }} contentFit="contain" />
          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: 18,
              color: config.primary,
            }}
          >
            {player.coins?.toLocaleString() ?? '0'}
          </Text>
        </View>

        {/* XP */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 165, 245, 0.08)',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: 'rgba(0, 165, 245, 0.12)',
          }}
        >
          <Image source={xpIcon} style={{ width: 18, height: 18, marginRight: 6 }} contentFit="contain" />
          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: 18,
              color: config.primary,
            }}
          >
            {player.total_experience?.toLocaleString() ?? player.experience?.toLocaleString() ?? '0'}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
