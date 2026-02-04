import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import config from '../config';

interface Props {
  heading: number; // compass heading in degrees
  imageUrl?: string;
}

/**
 * 3D-style shark player marker for the map.
 * Uses the same animation pattern as PrepItem for consistency.
 */
export default function SharkPlayerMarker({ heading, imageUrl }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const rotationAnim = useRef(new Animated.Value(heading)).current;
  const lastHeadingRef = useRef<number>(heading);

  // Pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.7,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 1200,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  // Smooth heading rotation
  useEffect(() => {
    // Calculate shortest rotation path to avoid spinning the long way
    let targetRotation = heading;
    const currentRotation = lastHeadingRef.current;
    let delta = targetRotation - currentRotation;

    // Handle wraparound (e.g., 350 to 10 should go +20, not -340)
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    const newRotation = currentRotation + delta;
    lastHeadingRef.current = newRotation;

    Animated.timing(rotationAnim, {
      toValue: newRotation,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [heading]);

  const rotationStyle = {
    transform: [
      { scale: pulseAnim },
      {
        rotate: rotationAnim.interpolate({
          inputRange: [-360, 360],
          outputRange: ['-360deg', '360deg'],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[styles.container, rotationStyle]}>
      {/* Glow effect */}
      <Animated.View
        style={[
          styles.glow,
          { opacity: glowAnim },
        ]}
      />

      {/* Directional cone/wedge pointing forward */}
      <View style={styles.directionCone} />

      {/* White circular background */}
      <View style={styles.circleBackground} />

      {/* Shark image */}
      <Image
        source={
          imageUrl
            ? { uri: imageUrl }
            : require('../../assets/images/screens/welcome/shark.png')
        }
        style={styles.sharkImage}
        contentFit="contain"
      />

      {/* Small accent dot */}
      <View style={styles.accentDot} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 85,
    height: 85,
    borderRadius: 42,
    backgroundColor: config.primary,
  },
  directionCone: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderBottomWidth: 25,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: config.primary,
  },
  circleBackground: {
    position: 'absolute',
    width: 65,
    height: 65,
    borderRadius: 32,
    backgroundColor: 'white',
    borderWidth: 3,
    borderColor: config.primary,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowRadius: 4,
    shadowOpacity: 0.3,
    elevation: 5,
  },
  sharkImage: {
    width: 50,
    height: 50,
    zIndex: 10,
  },
  accentDot: {
    position: 'absolute',
    top: 8,
    right: 18,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: 'white',
  },
});
