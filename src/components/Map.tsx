import { faLocationArrow as faSolidArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow';
import { faCompass } from '@fortawesome/free-solid-svg-icons/faCompass';
import { faLocationArrow } from '@fortawesome/pro-light-svg-icons/faLocationArrow';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { Image } from 'expo-image';
import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, View, Easing, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';

type MapMode = 'north-up' | 'heading';

export default function Map({ children }: { readonly children: ReactNode }) {
  const { location, heading, headingEnabled, setHeadingEnabled } = useContext(LocationContext);
  const { player } = useContext(AuthContext);

  // Shark marker animations
  const bobAnim = useRef(new Animated.Value(0)).current;
  const tiltAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowPulseAnim = useRef(new Animated.Value(0.3)).current;
  const shadowAnim = useRef(new Animated.Value(1)).current;

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
  const [mapMode, setMapMode] = useState<MapMode>('north-up');
  
  // Animated value for smooth compass icon rotation
  const compassRotation = useRef(new Animated.Value(0)).current;
  const lastHeadingRef = useRef<number>(0);
  
  // Animated value for user location heading indicator
  const userHeadingRotation = useRef(new Animated.Value(0)).current;
  const lastUserHeadingRef = useRef<number>(0);

  // Toggle between north-up and heading mode
  const toggleMapMode = () => {
    if (mapMode === 'north-up') {
      setMapMode('heading');
      setHeadingEnabled(true);
      setFocusedOnPlayer(true);
    } else {
      setMapMode('north-up');
      setHeadingEnabled(false);
      // Reset map to north
      if (mapRef.current && location) {
        mapRef.current.animateCamera({
          center: location,
          altitude: 200,
          heading: 0,
        }, { duration: 300 });
      }
    }
  };

  // Re-center and re-enable following
  const recenterOnPlayer = () => {
    setFocusedOnPlayer(true);
    if (mapMode === 'heading') {
      setHeadingEnabled(true);
    }
    // Immediately animate camera to current location
    if (mapRef.current && location) {
      mapRef.current.animateCamera({
        center: location,
        altitude: 200,
        heading: mapMode === 'heading' && heading !== null ? heading : 0,
      }, { duration: 300 });
    }
  };

  // Animate compass icon to show current heading
  useEffect(() => {
    if (heading !== null && mapMode === 'heading') {
      // Calculate shortest rotation path
      let targetRotation = -heading; // Negative because icon should point opposite to show "north"
      const currentRotation = lastHeadingRef.current;
      let delta = targetRotation - currentRotation;
      
      // Handle wraparound
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      
      const newRotation = currentRotation + delta;
      lastHeadingRef.current = newRotation;

      Animated.timing(compassRotation, {
        toValue: newRotation,
        duration: 33,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [heading, mapMode]);

  // Animate user location heading indicator
  useEffect(() => {
    if (heading !== null) {
      const targetRotation = mapMode === 'heading' ? 0 : heading;
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
  }, [heading, mapMode]);

  // Update map camera when location or heading changes
  useEffect(() => {
    if (!mapRef?.current || !focusedOnPlayer || !location) {
      return;
    }

    if (mapMode === 'heading' && heading !== null) {
      mapRef.current.animateCamera({
        center: location,
        altitude: 200,
        heading: heading,
      }, { duration: 100 }); // Smoother, less CPU-intensive
    } else {
      mapRef.current.animateCamera({
        center: location,
        altitude: 200,
        heading: 0,
      });
    }
  }, [
    focusedOnPlayer,
    location?.latitude,
    location?.longitude,
    heading,
    mapMode,
  ]);

  const compassRotationStyle = {
    transform: [{
      rotate: compassRotation.interpolate({
        inputRange: [-360, 360],
        outputRange: ['-360deg', '360deg'],
      }),
    }],
  };

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
          top: 48,
          right: 16,
          zIndex: 10,
          gap: 8,
        }}
      >
        {/* Compass / Heading toggle */}
        <Pressable
          onPress={toggleMapMode}
          style={{
            padding: 12,
            backgroundColor: mapMode === 'heading' ? config.primary : 'rgba(255,255,255,0.9)',
            borderRadius: 25,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          }}
        >
          <Animated.View style={mapMode === 'heading' ? compassRotationStyle : undefined}>
            <FontAwesomeIcon
              icon={faCompass}
              size={26}
              color={mapMode === 'heading' ? '#fff' : config.primary}
            />
          </Animated.View>
        </Pressable>

        {/* Re-center button */}
        <Pressable
          onPress={recenterOnPlayer}
          style={{
            padding: 12,
            backgroundColor: focusedOnPlayer ? 'rgba(255,255,255,0.9)' : 'rgba(200,200,200,0.9)',
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
            color={config.primary}
          />
        </Pressable>
      </View>

      <MapView
        ref={mapRef}
        style={{
          width: Dimensions.get('window').width,
          height: '100%',
        }}
        showsUserLocation={false}
        showsIndoors={false}
        showsCompass={false}
        rotateEnabled={mapMode === 'heading'}
        pitchEnabled={false}
        loadingEnabled={true}
        userInterfaceStyle="light"
        onPanDrag={() => {
          setFocusedOnPlayer(false);
        }}
      >
        {/* Animated shark player marker */}
        {location && (
          <Marker
            coordinate={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            anchor={{ x: 0.5, y: 0.65 }}
            flat={true}
            tracksViewChanges={true}
          >
            <View style={styles.sharkMarkerContainer}>
              {/* Animated glow ring */}
              <Animated.View style={[styles.outerGlowRing, { opacity: glowPulseAnim }]} />
              {/* Inner blue ring (ground indicator) */}
              <View style={styles.groundRing} />
              {/* Animated shadow — shrinks when shark bobs up */}
              <Animated.View style={[styles.shadowDisc, { transform: [{ scaleX: shadowAnim }, { scaleY: shadowAnim }] }]} />
              {/* Directional indicator */}
              {heading !== null && <View style={styles.sharkDirectionCone} />}
              {/* Player's avatar — bobs, tilts, breathes */}
              <Animated.View style={{
                width: 50, height: 50,
                transform: [
                  { translateY: bobAnim },
                  { rotate: tiltAnim.interpolate({ inputRange: [-3, 3], outputRange: ['-3deg', '3deg'] }) },
                  { scale: scaleAnim },
                ],
              }}>
                {player?.inventory?.skin_item?.no_eye_url ? (
                  <View style={{ width: 50, height: 50, position: 'relative' }}>
                    {/* Base skin (no eyes) */}
                    <Image
                      source={{ uri: player.inventory.skin_item.no_eye_url }}
                      style={{ width: 50, height: 50, position: 'absolute' }}
                      contentFit="contain"
                    />
                    {/* Animated eyes layer */}
                    <Image
                      source={require('../../assets/images/screens/inventory/blink.png')}
                      style={{ width: 50, height: 50, position: 'absolute' }}
                      contentFit="contain"
                    />
                    {/* Equipped items layered on top */}
                    {player.inventory.body_item?.paper_url && (
                      <Image source={{ uri: player.inventory.body_item.paper_url }} style={{ width: 50, height: 50, position: 'absolute' }} contentFit="contain" />
                    )}
                    {player.inventory.face_item?.paper_url && (
                      <Image source={{ uri: player.inventory.face_item.paper_url }} style={{ width: 50, height: 50, position: 'absolute' }} contentFit="contain" />
                    )}
                    {player.inventory.head_item?.paper_url && (
                      <Image source={{ uri: player.inventory.head_item.paper_url }} style={{ width: 50, height: 50, position: 'absolute' }} contentFit="contain" />
                    )}
                    {player.inventory.neck_item?.paper_url && (
                      <Image source={{ uri: player.inventory.neck_item.paper_url }} style={{ width: 50, height: 50, position: 'absolute' }} contentFit="contain" />
                    )}
                    {player.inventory.hand_item?.paper_url && (
                      <Image source={{ uri: player.inventory.hand_item.paper_url }} style={{ width: 50, height: 50, position: 'absolute' }} contentFit="contain" />
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
          </Marker>
        )}
        {children}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  sharkMarkerContainer: {
    width: 86,
    height: 96,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
  },
  outerGlowRing: {
    position: 'absolute',
    bottom: 0,
    width: 60,
    height: 18,
    borderRadius: 30,
    backgroundColor: 'rgba(33, 150, 243, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(33, 150, 243, 0.25)',
  },
  groundRing: {
    position: 'absolute',
    bottom: 3,
    width: 46,
    height: 14,
    borderRadius: 23,
    backgroundColor: 'rgba(33, 150, 243, 0.35)',
    borderWidth: 1.5,
    borderColor: 'rgba(33, 150, 243, 0.7)',
  },
  shadowDisc: {
    position: 'absolute',
    bottom: 6,
    width: 30,
    height: 10,
    borderRadius: 15,
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
