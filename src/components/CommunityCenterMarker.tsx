import { Image, StyleSheet, Text, View } from 'react-native';
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
  const hasGifts = center.available_gifts > 0;

  // NOTE: All animations REMOVED. react-native-maps Marker children must have
  // a completely static layout — any Animated transform (translateY, scale, rotate)
  // causes the marker to teleport/jump erratically on the map because the native
  // map view re-computes the marker anchor on every frame when the child size/position
  // shifts. Keep this component 100% static.

  return (
    <Marker
      coordinate={{
        latitude: center.latitude,
        longitude: center.longitude,
      }}
      onPress={onPress}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={styles.container}>
        {/* Gift count badge */}
        {hasGifts && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🎁 {center.available_gifts}</Text>
          </View>
        )}
        
        {/* Underglow */}
        <View
          style={[
            styles.underglow,
            {
              opacity: hasGifts ? 0.8 : 0.4,
              transform: [{ scaleX: hasGifts ? 1.2 : 1 }],
            },
          ]}
        />
        
        {/* Secondary glow ring when gifts available */}
        {hasGifts && (
          <View style={styles.glowRing} />
        )}
        
        {/* Community Center icon */}
        <View style={styles.iconContainer}>
          <Image 
            source={CommunityCenterIcon} 
            style={styles.buildingImage}
            resizeMode="contain"
          />
        </View>
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
