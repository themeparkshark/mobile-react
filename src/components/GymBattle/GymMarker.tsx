import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Marker } from 'react-native-maps';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { getGym, GymData } from '../../api/endpoints/gym-battle';

const TEAM_COLORS = {
  mouse: '#F59E0B', // Gold/Orange
  globe: '#22C55E', // Green
  shark: '#3B82F6', // Blue
};

const TEAM_EMOJIS = {
  mouse: '🐭',
  globe: '🌍',
  shark: '🦈',
};

interface Props {
  parkId: number;
  latitude: number;
  longitude: number;
  onPress: () => void;
}

export default function GymMarker({ parkId, latitude, longitude, onPress }: Props) {
  const [gymData, setGymData] = useState<GymData | null>(null);
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    const fetchGym = async () => {
      try {
        const data = await getGym(parkId);
        setGymData(data);
      } catch (error) {
        // Silent fail
      }
    };

    fetchGym();
    const interval = setInterval(fetchGym, 30000);
    return () => clearInterval(interval);
  }, [parkId]);

  // Smooth breathing animation
  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 2500 }),
        withTiming(1, { duration: 2500 })
      ),
      -1,
      true
    );

    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 2500 }),
        withTiming(0.2, { duration: 2500 })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const leader = gymData?.leader;
  const leaderColor = leader ? TEAM_COLORS[leader] : '#FBBF24';

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.8 }}
    >
      <View style={styles.container}>
        {/* Glow effect under the arena */}
        <Animated.View
          style={[
            styles.glow,
            glowStyle,
            { backgroundColor: leaderColor },
          ]}
        />

        {/* Arena image */}
        <Animated.View style={pulseStyle}>
          <Image
            source={require('../../../assets/images/arena.png')}
            style={styles.arenaImage}
            contentFit="contain"
          />
        </Animated.View>

        {/* Leader indicator badge */}
        {leader && (
          <View style={[styles.leaderBadge, { backgroundColor: leaderColor }]}>
            <Text style={styles.leaderEmoji}>{TEAM_EMOJIS[leader]}</Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 110,
  },
  glow: {
    position: 'absolute',
    bottom: 20,
    width: 80,
    height: 40,
    borderRadius: 40,
  },
  arenaImage: {
    width: 90,
    height: 90,
  },
  leaderBadge: {
    position: 'absolute',
    top: 0,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1E293B',
  },
  leaderEmoji: {
    fontSize: 13,
  },
  labelContainer: {
    marginTop: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  labelText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
