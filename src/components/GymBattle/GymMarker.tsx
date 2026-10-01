import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Marker } from '../map/Marker';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { GymData } from '../../api/endpoints/gym-battle';
import { useMapAlive } from '../map/alive/MapAliveContext';
import { TEAMS, type TeamId } from '../../constants/teams';

const TEAM_COLORS: Record<TeamId, string> = { mouse: TEAMS.mouse.color, globe: TEAMS.globe.color, shark: TEAMS.shark.color };

interface Props {
  /** The map's gym data (ExploreScreen polls it); the marker only shows the leader. */
  leader: GymData['leader'] | null | undefined;
  latitude: number;
  longitude: number;
  onPress: () => void;
}

export default function GymMarker({ leader, latitude, longitude, onPress }: Props) {
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);
  // The breathing pauses with the living map (off screen, background, calm tier).
  const { running } = useMapAlive();

  // Smooth breathing animation
  useEffect(() => {
    if (!running) {
      cancelAnimation(pulseScale);
      cancelAnimation(glowOpacity);
      return;
    }
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
    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(glowOpacity);
    };
  }, [running]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

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
            <Image source={TEAMS[leader].badge} style={{ width: 18, height: 18 }} contentFit="contain" />
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
    borderColor: '#05468f',
  },
  leaderEmoji: {
    fontSize: 13,
  },
  labelContainer: {
    marginTop: 2,
    backgroundColor: 'rgba(7, 104, 185, 0.9)',
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
