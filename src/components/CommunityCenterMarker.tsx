import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

const CommunityCenterIcon = require('../assets/community-center.png');

interface Props {
  center: {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    available_gifts: number;
  };
  onPress: () => void;
}

export default function CommunityCenterMarker({ center, onPress }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  
  const hasGifts = center.available_gifts > 0;
  
  // Floating animation - always active to stand out
  useEffect(() => {
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    float.start();
    return () => float.stop();
  }, []);

  // Extra animations when gifts available
  useEffect(() => {
    if (hasGifts) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.6,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      // Subtle wiggle rotation
      const wiggle = Animated.loop(
        Animated.sequence([
          Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 150,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: -1,
            duration: 300,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: 0,
            duration: 150,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.delay(2000), // Pause between wiggles
        ])
      );
      
      pulse.start();
      glow.start();
      wiggle.start();
      
      return () => {
        pulse.stop();
        glow.stop();
        wiggle.stop();
      };
    }
  }, [hasGifts]);

  const rotation = rotateAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-3deg', '3deg'],
  });

  return (
    <Marker
      coordinate={{
        latitude: center.latitude,
        longitude: center.longitude,
      }}
      onPress={onPress}
      tracksViewChanges={true}
    >
      <View style={styles.container}>
        {/* Gift count badge */}
        {hasGifts && (
          <Animated.View style={[styles.badge, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.badgeText}>🎁 {center.available_gifts}</Text>
          </Animated.View>
        )}
        
        {/* Underglow - always visible, brighter when gifts */}
        <Animated.View
          style={[
            styles.underglow,
            {
              opacity: hasGifts ? glowAnim : 0.4,
              transform: [{ scaleX: hasGifts ? 1.2 : 1 }],
            },
          ]}
        />
        
        {/* Secondary glow ring when gifts available */}
        {hasGifts && (
          <Animated.View
            style={[
              styles.glowRing,
              {
                opacity: glowAnim,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
        )}
        
        {/* Community Center icon */}
        <Animated.View
          style={[
            styles.iconContainer,
            {
              transform: [
                { translateY: floatAnim },
                { scale: hasGifts ? pulseAnim : 1 },
                { rotate: hasGifts ? rotation : '0deg' },
              ],
            },
          ]}
        >
          <Image 
            source={CommunityCenterIcon} 
            style={styles.buildingImage}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: 90,
    height: 105,
  },
  badge: {
    position: 'absolute',
    top: 0,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 10,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 5,
  },
  badgeText: {
    fontFamily: 'Shark',
    fontSize: 12,
    color: 'white',
  },
  underglow: {
    position: 'absolute',
    bottom: 20,
    width: 60,
    height: 16,
    borderRadius: 30,
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 10,
  },
  glowRing: {
    position: 'absolute',
    bottom: 16,
    width: 75,
    height: 30,
    borderRadius: 40,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#4ade80',
    shadowColor: '#4ade80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  buildingImage: {
    width: 65,
    height: 72,
  },
  labelContainer: {
    marginTop: 2,
  },
  label: {
    fontFamily: 'Knockout',
    fontSize: 11,
    color: '#333',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
    fontWeight: '600',
  },
});
