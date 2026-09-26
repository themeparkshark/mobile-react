import { faLocationArrow as faSolidArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow';
import { faLocationArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { Image } from 'expo-image';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Images, MapView, ShapeSource, SymbolLayer, type CameraRef, type MapViewRef } from '@maplibre/maplibre-react-native';
import { Animated, Pressable, View, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import { Marker } from './map/Marker';
import { buildDecorations, DECO_ICONS, decorationBand } from './map/decorations';
import { TPS_MAP_STYLE } from './map/tpsMapStyle';
import { nearestWaterPoint } from './map/water';

type LatLng = { latitude: number; longitude: number };

/** Lets map pins ask about the rendered map (e.g. where the nearest water is). */
export const MapQueryContext = createContext<{
  readonly findWater: (latitude: number, longitude: number, margin?: number) => Promise<LatLng | null>;
} | null>(null);

// Map always rotates with heading. Single button recenters on player.
// While following, the shark is drawn at screen center and the cartoon map
// eases under it (Pokemon GO style); panned away, it becomes a map marker.

const FALLBACK_CENTER = { latitude: 34.1381, longitude: -118.3534 };
const FOLLOW_ZOOM = 17.6;

export default function Map({ children, onPress, focusCoordinate, controlsTop = 72 }: {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly focusCoordinate?: { latitude: number; longitude: number; requestId?: number } | null;
  readonly controlsTop?: number;
}) {
  const { location, heading, headingEnabled, setHeadingEnabled } = useContext(LocationContext);
  const { player } = useContext(AuthContext);

  // Shark marker animations
  const bobAnim = useRef(new Animated.Value(0)).current;
  const tiltAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowPulseAnim = useRef(new Animated.Value(0.3)).current;
  const shadowAnim = useRef(new Animated.Value(1)).current;

  const prevLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const glideRef = useRef(0);
  const locationRef = useRef(location);
  locationRef.current = location;
  const headingRef = useRef(heading);
  headingRef.current = heading;
  // Ease the camera to the latest position/heading. Every call carries the
  // target center so a heading tick never freezes a position glide mid-way.
  const pushCamera = (duration: number, zoomLevel?: number) => {
    const loc = locationRef.current;
    if (!followRef.current || !loc) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [loc.longitude, loc.latitude],
      ...(headingRef.current !== null ? { heading: headingRef.current } : {}),
      ...(zoomLevel !== undefined ? { zoomLevel } : {}),
      animationDuration: duration,
      animationMode: duration > 0 ? 'easeTo' : 'moveTo',
    });
  };

  useEffect(() => {
    if (!location) return;

    // Skip animation on first location (just set it)
    if (!prevLocationRef.current) {
      prevLocationRef.current = { latitude: location.latitude, longitude: location.longitude };
      pushCamera(0);
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
    glideRef.current = glideDuration;
    pushCamera(glideDuration);
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
  const cameraRef = useRef<CameraRef>(null);
  const mapViewRef = useRef<MapViewRef>(null);
  const window = useWindowDimensions();
  const mapQuery = useMemo(() => ({
    findWater: async (latitude: number, longitude: number, margin?: number) => {
      // MapLibre's rect is [top, right, bottom, left] with top the larger y.
      const found = await mapViewRef.current?.queryRenderedFeaturesInRect(
        [window.height, window.width, 0, 0], undefined, ['water']);
      return nearestWaterPoint(found?.features ?? [], latitude, longitude, margin);
    },
  }), [window.height, window.width]);

  // Trees, bushes and ripples are planted as icons for what's on screen.
  const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const [decorations, setDecorations] = useState<GeoJSON.FeatureCollection>(EMPTY);
  const decoKey = useRef('');
  const decoTimer = useRef<ReturnType<typeof setTimeout>>();
  const refreshDecorations = useCallback(() => {
    clearTimeout(decoTimer.current);
    decoTimer.current = setTimeout(async () => {
      const map = mapViewRef.current;
      if (!map) return;
      try {
        const [zoom, [[east, north], [west, south]]] = await Promise.all([map.getZoom(), map.getVisibleBounds()]);
        // Skip rebuilding for tiny camera nudges (walking follow) at the same density.
        const key = `${decorationBand(zoom)}|${(north * 4000).toFixed(0)}|${(west * 4000).toFixed(0)}|${((north - south) * 400).toFixed(0)}`;
        if (key === decoKey.current) return;
        const rect: [number, number, number, number] = [window.height, window.width, 0, 0];
        const [wood, green, water, homes, buildings, roads] = await Promise.all([
          map.queryRenderedFeaturesInRect(rect, undefined, ['wood']),
          map.queryRenderedFeaturesInRect(rect, undefined, ['grass', 'park']),
          map.queryRenderedFeaturesInRect(rect, undefined, ['water']),
          map.queryRenderedFeaturesInRect(rect, undefined, ['residential']),
          map.queryRenderedFeaturesInRect(rect, undefined, ['bldg']),
          map.queryRenderedFeaturesInRect(rect, undefined, ['road', 'path']),
        ]);
        decoKey.current = key;
        setDecorations(buildDecorations({ wood: wood.features, green: green.features, water: water.features,
          homes: homes.features, buildings: buildings.features, roads: roads.features },
          { north, south, east, west }, zoom));
      } catch { /* map not ready yet; the next camera change retries */ }
    }, 250);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.height, window.width]);
  useEffect(() => () => clearTimeout(decoTimer.current), []);
  const [focusedOnPlayer, setFocusedOnPlayer] = useState<boolean>(true);
  const followRef = useRef(true);
  followRef.current = focusedOnPlayer;
  useEffect(() => {
    if (!focusCoordinate || !Number.isFinite(focusCoordinate.latitude) ||
      !Number.isFinite(focusCoordinate.longitude)) return;
    setFocusedOnPlayer(false);
    followRef.current = false;
    cameraRef.current?.setCamera({ centerCoordinate: [focusCoordinate.longitude, focusCoordinate.latitude],
      heading: 0, zoomLevel: 17.9, animationDuration: 450, animationMode: 'easeTo' });
  }, [focusCoordinate?.latitude, focusCoordinate?.longitude, focusCoordinate?.requestId]);
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
    followRef.current = true;
    pushCamera(300, FOLLOW_ZOOM);
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

  // Heading ticks rotate the map; throttled so the camera isn't flooded.
  const lastHeadingPush = useRef(0);
  useEffect(() => {
    if (!focusedOnPlayer || heading === null) return;
    const now = Date.now();
    if (now - lastHeadingPush.current < 120) return;
    lastHeadingPush.current = now;
    pushCamera(Math.max(180, glideRef.current * 0.5));
  }, [focusedOnPlayer, heading]);

  const userHeadingStyle = {
    transform: [{
      rotate: userHeadingRotation.interpolate({
        inputRange: [-360, 360],
        outputRange: ['-360deg', '360deg'],
      }),
    }],
  };

  const playerShark = (
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
  );

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
          top: controlsTop,
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
        ref={mapViewRef}
        style={StyleSheet.absoluteFill}
        mapStyle={TPS_MAP_STYLE}
        logoEnabled={false}
        attributionEnabled
        attributionPosition={{ bottom: 8, left: 8 }}
        compassEnabled={false}
        rotateEnabled
        pitchEnabled={false}
        regionWillChangeDebounceTime={0}
        onRegionWillChange={(feature) => {
          if (!feature.properties?.isUserInteraction) return;
          onPress?.();
        }}
        onDidFinishRenderingMapFully={refreshDecorations}
        onRegionDidChange={(feature) => {
          refreshDecorations();
          // A real pan (not a pinch around the shark) drops follow mode.
          if (!feature.properties?.isUserInteraction || !followRef.current || !location) return;
          const [lng, lat] = feature.geometry.coordinates;
          if (Math.abs(lat - location.latitude) > 0.0005 || Math.abs(lng - location.longitude) > 0.0005) {
            followRef.current = false;
            setFocusedOnPlayer(false);
          }
        }}
        onPress={() => {
          onPress?.();
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [(location ?? FALLBACK_CENTER).longitude, (location ?? FALLBACK_CENTER).latitude],
            zoomLevel: FOLLOW_ZOOM,
            heading: 0,
          }}
        />
        <Images images={DECO_ICONS} />
        <ShapeSource id="tps-decorations" shape={decorations}>
          <SymbolLayer id="tps-decorations" belowLayerID="plaza" style={{
            iconImage: ['get', 'icon'],
            // Zoom must lead the expression; each stop scales by the item's own size.
            iconSize: ['interpolate', ['exponential', 1.4], ['zoom'],
              15, ['*', 0.32, ['get', 's']], 16, ['*', 0.46, ['get', 's']], 17, ['*', 0.68, ['get', 's']],
              18, ['*', 0.95, ['get', 's']], 19, ['*', 1.3, ['get', 's']]],
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconAnchor: 'bottom',
            iconRotationAlignment: 'viewport',
            iconPitchAlignment: 'viewport',
            symbolSortKey: ['get', 'k'],
          }} />
        </ShapeSource>
        {/* Panned away: the shark stays pinned to its spot on the map. */}
        {location && !focusedOnPlayer && (
          <Marker coordinate={location} anchor={{ x: 0.5, y: 0.65 }}>
            {playerShark}
          </Marker>
        )}
        <MapQueryContext.Provider value={mapQuery}>{children}</MapQueryContext.Provider>
      </MapView>
      {location && focusedOnPlayer && (
        <View pointerEvents="none" style={styles.centerOverlay}>
          <View style={styles.centerShark}>{playerShark}</View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The shark's ground point sits 65% down its 110px box; lift it so that
  // point lands exactly on the map center the camera is following.
  centerShark: { transform: [{ translateY: -16.5 }] },
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
