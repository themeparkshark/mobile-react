import React, { useEffect, useState } from 'react';
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
import { useMapAlive } from '../map/alive/MapAliveContext';

interface Props {
  id: number;
  latitude: number;
  longitude: number;
  expiresAt: string;
  onPress: () => void;
  /** Mounted but parked and not drawn (an empty pool slot). */
  hidden?: boolean;
}

export default function SwordMarker({ id, latitude, longitude, expiresAt, onPress, hidden = false }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const bounceY = useSharedValue(0);
  const glowOpacity = useSharedValue(0.4);
  const glowScale = useSharedValue(1);
  // The countdown ticks while the map is on screen; the bounce is ambience and
  // also rests in the calm tier.
  const { active, running } = useMapAlive();

  // Calculate time remaining
  useEffect(() => {
    const updateTime = () => {
      const now = new Date().getTime();
      const expires = new Date(expiresAt).getTime();
      const diff = Math.max(0, Math.floor((expires - now) / 1000));
      setSecondsLeft(diff);
    };

    updateTime();
    if (!active) return;
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, active]);

  // Animations
  useEffect(() => {
    if (!running) {
      cancelAnimation(bounceY);
      cancelAnimation(glowOpacity);
      cancelAnimation(glowScale);
      return;
    }
    // Bounce
    bounceY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 500 }),
        withTiming(0, { duration: 500 })
      ),
      -1,
      false
    );

    // Glow pulse
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      false
    );

    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(bounceY);
      cancelAnimation(glowOpacity);
      cancelAnimation(glowScale);
    };
  }, [running]);

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isUrgent = secondsLeft < 60;

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      onPress={onPress}
      hidden={hidden}
      anchor={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        {/* Glow */}
        <Animated.View style={[styles.glow, glowStyle]} />

        {/* Sword GIF */}
        <Animated.View style={[styles.swordContainer, bounceStyle]}>
          <Image
            source={require('../../../assets/images/sword-marker.gif')}
            autoplay={running}
            style={styles.swordImage}
            contentFit="contain"
          />
        </Animated.View>

        {/* Timer */}
        <View style={[styles.timerBadge, isUrgent && styles.timerUrgent]}>
          <Text style={[styles.timerText, isUrgent && styles.timerTextUrgent]}>
            {formatTime(secondsLeft)}
          </Text>
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 80,
    height: 80,
  },
  glow: {
    position: 'absolute',
    bottom: 18,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FBBF24',
  },
  swordContainer: {
    width: 52,
    height: 52,
    marginBottom: -4, // Pull it down slightly to center on glow
  },
  swordImage: {
    width: 52,
    height: 52,
  },
  timerBadge: {
    marginTop: 2,
    backgroundColor: 'rgba(7, 104, 185, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  timerUrgent: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  timerText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '800',
  },
  timerTextUrgent: {
    color: 'white',
  },
});
