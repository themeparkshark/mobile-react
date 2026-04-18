import { faLocationArrow as faSolidArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow';
import { faLocationArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { Image } from 'expo-image';
import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Platform, Pressable, View, Easing, StyleSheet } from 'react-native';
import MapView, { MarkerAnimated, AnimatedRegion } from 'react-native-maps';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';

// Map always rotates with heading. Single button recenters on player.

export default function Map({ children, onPress }: { readonly children: ReactNode; readonly onPress?: () => void }) {
  const { location, heading, headingEnabled, setHeadingEnabled } = useContext(LocationContext);
  const { player } = useContext(AuthContext);

  // Shark marker animations
  const bobAnim = useRef(new Animated.Value(0)).current;
  const tiltAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowPulseAnim = useRef(new Animated.Value(0.3)).current;
  const shadowAnim = useRef(new Animated.Value(1)).current;

  // Smooth position interpolation — glide between GPS updates like Uber/Pokémon GO
  const animatedCoordinate = useRef(new AnimatedRegion({
    latitude: location?.latitude || 0,
    longitude: location?.longitude || 0,
    latitudeDelta: 0,
    longitudeDelta: 0,
  })).current;

  const markerRef = useRef<any>(null);
  const prevLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!location) return;

    // Skip animation on first location (just set it)
    if (!prevLocationRef.current) {
      prevLocationRef.current = { latitude: location.latitude, longitude: location.longitude };
      animatedCoordinate.setValue({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      return;
    }

    // Calculate distance to scale animation duration —
    // short steps (walking) get a quick glide, longer jumps (GPS catch-up) get more time
    const prev = prevLocationRef.current;
    const R = 6371e3;
    const p1 = (prev.latitude * Math.PI) / 180;
    const p2 = (location.latitude * Math.PI) / 180;
    const dp = ((location.latitude - prev.latitude) * Math.PI) / 180;
    const dl = ((location.longitude - prev.longitude) * Math.PI) / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const distMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Duration scales with distance:
    // ~500ms for small walking steps (1-3m) — keeps shark responsive
    // ~1000ms for normal strides (5-10m) — smooth and natural
    // ~1500ms max for GPS catch-up jumps — no jarring teleports
    const glideDuration = Math.min(1500, Math.max(500, distMeters * 80));

    prevLocationRef.current = { latitude: location.latitude, longitude: location.longitude };

    // Smooth glide to new position
    if (Platform.OS === 'ios') {
      (animatedCoordinate as any).timing({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: glideDuration,
        useNativeDriver: false,
      }).start();
    } else {
      // Android: use animateMarkerToCoordinate for native performance
      markerRef.current?.animateMarkerToCoordinate(
        { latitude: location.latitude, longitude: location.longitude },
        glideDuration
      );
    }
  }, [location?.latitude, location?.longitude]);

  useEffect(() => {
    // Float bob — gentle up/down like swimming
    Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, { toValue: -8, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bobAnim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Gentle side-to-side tilt — like a shark swaying in water
    Animated.loop(
      Animated.sequence([
        Animated.timing(tiltAnim, { toValue: 3, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(tiltAnim, { toValue: -3, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Subtle breathing scale
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.04, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Ground shadow pulses with the bob (smaller when higher)
    Animated.loop(
      Animated.sequence([
        Animated.timing(shadowAnim, { toValue: 0.85, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(shadowAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Glow ring pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulseAnim, { toValue: 0.7, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(glowPulseAnim, { toValue: 0.3, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
  }, []);
  const mapRef = useRef<MapView>(null);
  const [focusedOnPlayer, setFocusedOnPlayer] = useState<boolean>(true);
  // Animated value for user location heading indicator
  const userHeadingRotation = useRef(new Animated.Value(0)).current;
  const lastUserHeadingRef = useRef<number>(0);

  // Always enable heading on mount
  useEffect(() => {
    setHeadingEnabled(true);
  }, []);

  // Single recenter button
  const recenterOnPlayer = () => {
    setFocusedOnPlayer(true);
    if (mapRef.current && location) {
      mapRef.current.animateCamera({
        center: location,
        heading: heading !== null ? heading : 0,
        altitude: 200,
      }, { duration: 300 });
    }
  };

  // User heading indicator always points forward when centered (map rotates under it)
  useEffect(() => {
    if (heading !== null) {
      const targetRotation = focusedOnPlayer ? 0 : heading;
      const currentRotation = lastUserHeadingRef.current;
      let delta = targetRotation - currentRotation;
      
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      
      const newRotation = currentRotation + delta;
      lastUserHeadingRef.current = newRotation;

      Animated.timing(userHeadingRotation, {
        toValue: newRotation,
        duration: 33,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [heading, focusedOnPlayer]);

  // Update map camera when location or heading changes
  // NEVER override zoom (altitude) - respect user's pinch-to-zoom level
  useEffect(() => {
    if (!mapRef?.current || !focusedOnPlayer || !location) {
      return;
    }

    const cam: any = { center: location };
    if (heading !== null) cam.heading = heading;

    mapRef.current.setCamera(cam);
  }, [
    focusedOnPlayer,
    location?.latitude,
    location?.longitude,
    heading,
  ]);

  const userHeadingStyle = {
    transform: [{
      rotate: userHeadingRotation.interpolate({
        inputRange: [-360, 360],
        outputRange: ['-360deg', '360deg'],
      }),
    }],
  };

  return (
    <View
      style={{
        position: 'relative',
        flex: 1,
      }}
    >
      {/* Map controls */}
      <View
        style={{
          position: 'absolute',
          top: 72,
          right: 16,
          zIndex: 10,
          gap: 8,
        }}
      >
        {/* Recenter button */}
        <Pressable
          onPress={recenterOnPlayer}
          style={{
            padding: 12,
            backgroundColor: focusedOnPlayer ? config.primary : 'rgba(255,255,255,0.9)',
            borderRadius: 25,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          }}
        >
          <FontAwesomeIcon
            icon={focusedOnPlayer ? faSolidArrow : faLocationArrow}
            size={26}
            color={focusedOnPlayer ? '#fff' : config.primary}
          />
        </Pressable>
      </View>

      <MapView
        ref={mapRef}
        style={{
          width: Dimensions.get('window').width,
          height: '100%',
        }}
        initialCamera={{
          center: location || { latitude: 34.1381, longitude: -118.3534 },
          heading: 0,
          pitch: 0,
          altitude: 200,
          zoom: 17,
        }}
        showsUserLocation={false}
        showsIndoors={false}
        showsCompass={false}
        rotateEnabled={true}
        pitchEnabled={false}
        loadingEnabled={true}
        userInterfaceStyle="light"
        onPanDrag={() => {
          onPress?.();
        }}
        onRegionChangeComplete={(region) => {
          // After any gesture ends, check if map center drifted away from player
          // Zoom keeps center near player — only a real pan moves it far
          if (location && focusedOnPlayer) {
            const latDiff = Math.abs(region.latitude - location.latitude);
            const lngDiff = Math.abs(region.longitude - location.longitude);
            // ~50 meters threshold — if center moved further than this, user panned away
            if (latDiff > 0.0005 || lngDiff > 0.0005) {
              setFocusedOnPlayer(false);
            }
          }
        }}
        onPress={() => {
          onPress?.();
        }}
      >
        {/* Animated shark player marker — smooth glide between GPS updates */}
        {location && (
          <MarkerAnimated
            ref={markerRef}
            coordinate={animatedCoordinate as any}
            anchor={{ x: 0.5, y: 0.65 }}
            flat={true}
            tracksViewChanges={false}
            zIndex={9999}
          >
            <View style={styles.sharkMarkerContainer}>
              {/* Animated glow ring */}
              <Animated.View style={[styles.outerGlowRing, { opacity: glowPulseAnim }]} />
              {/* Inner blue ring (ground indicator) */}
              <View style={styles.groundRing} />
              {/* Animated shadow — shrinks when shark bobs up */}
              <Animated.View style={[styles.shadowDisc, { transform: [{ scaleX: shadowAnim }, { scaleY: shadowAnim }] }]} />
              {/* Directional indicator — only visible in heading mode */}
              {heading !== null && focusedOnPlayer && <View style={styles.sharkDirectionCone} />}
              {/* Player's avatar — bobs, tilts, breathes */}
              <Animated.View style={{
                width: 60, height: 60,
                transform: [
                  { translateY: bobAnim },
                  { rotate: tiltAnim.interpolate({ inputRange: [-3, 3], outputRange: ['-3deg', '3deg'] }) },
                  { scale: scaleAnim },
                ],
              }}>
                {player?.inventory?.skin_item?.no_eye_url ? (
                  <View style={{ width: 60, height: 60, position: 'relative' }}>
                    {/* Base skin (no eyes) */}
                    <Image
                      source={{ uri: player.inventory.skin_item.no_eye_url }}
                      style={{ width: 60, height: 60, position: 'absolute' }}
                      contentFit="contain"
                    />
                    {/* Animated eyes layer */}
                    <Image
                      source={require('../../assets/images/screens/inventory/blink.png')}
                      style={{ width: 60, height: 60, position: 'absolute' }}
                      contentFit="contain"
                    />
                    {/* Equipped items layered on top */}
                    {player.inventory.body_item?.paper_url && (
                      <Image source={{ uri: player.inventory.body_item.paper_url }} style={{ width: 60, height: 60, position: 'absolute' }} contentFit="contain" />
                    )}
                    {player.inventory.face_item?.paper_url && (
                      <Image source={{ uri: player.inventory.face_item.paper_url }} style={{ width: 60, height: 60, position: 'absolute' }} contentFit="contain" />
                    )}
                    {player.inventory.head_item?.paper_url && (
                      <Image source={{ uri: player.inventory.head_item.paper_url }} style={{ width: 60, height: 60, position: 'absolute' }} contentFit="contain" />
                    )}
                    {player.inventory.neck_item?.paper_url && (
                      <Image source={{ uri: player.inventory.neck_item.paper_url }} style={{ width: 60, height: 60, position: 'absolute' }} contentFit="contain" />
                    )}
                    {player.inventory.hand_item?.paper_url && (
                      <Image source={{ uri: player.inventory.hand_item.paper_url }} style={{ width: 60, height: 60, position: 'absolute' }} contentFit="contain" />
                    )}
                  </View>
                ) : (
                  <Image
                    source={require('../../assets/images/screens/explore/shark_player.gif')}
                    style={styles.sharkImage}
                    contentFit="contain"
                  />
                )}
              </Animated.View>
            </View>
          </MarkerAnimated>
        )}
        {children}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  sharkMarkerContainer: {
    width: 100,
    height: 110,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
  },
  outerGlowRing: {
    position: 'absolute',
    bottom: 0,
    width: 72,
    height: 22,
    borderRadius: 30,
    backgroundColor: 'rgba(33, 150, 243, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(33, 150, 243, 0.25)',
  },
  groundRing: {
    position: 'absolute',
    bottom: 3,
    width: 55,
    height: 17,
    borderRadius: 23,
    backgroundColor: 'rgba(33, 150, 243, 0.35)',
    borderWidth: 1.5,
    borderColor: 'rgba(33, 150, 243, 0.7)',
  },
  shadowDisc: {
    position: 'absolute',
    bottom: 6,
    width: 36,
    height: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  sharkDirectionCone: {
    position: 'absolute',
    top: 6,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 15,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: config.primary,
    zIndex: 1,
  },
  sharkImage: {
    width: 65,
    height: 65,
    zIndex: 10,
    marginBottom: 6,
  },
});
