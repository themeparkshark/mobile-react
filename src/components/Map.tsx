import { Image } from 'expo-image';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Images, LineLayer, MapView, ShapeSource, SymbolLayer, type CameraRef, type MapViewRef } from '@maplibre/maplibre-react-native';
import { edgeArrow, GUIDE_PATH_MS, guideLine } from './map/guide';
import { Animated, Linking, Pressable, Text, View, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import Reanimated, { cancelAnimation, Easing as REasing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../gamekit/Haptics';
import { BRAND, GameIcon, SHADOW } from '../ui';
import { AuthContext } from '../context/AuthProvider';
import { HeadingContext, LocationContext } from '../context/LocationProvider';
import { Marker } from './map/Marker';
import { buildDecorations, DECO_ICONS, decorationBand } from './map/decorations';
import { TPS_MAP_STYLE } from './map/tpsMapStyle';
import { nearestWaterPoint } from './map/water';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { useFocusEffect } from '@react-navigation/native';
import { outfitLayerUrls } from '../helpers/wardrobe';

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

export default function Map({ children, onPress, focusCoordinate, controlsTop = 72, onZoomChange, guideTarget }: {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  /** Move the camera here; `zoom` defaults to the ride focus zoom. */
  readonly focusCoordinate?: { latitude: number; longitude: number; requestId?: number; zoom?: number } | null;
  readonly controlsTop?: number;
  /** Camera zoom after each move, for marker declutter. */
  readonly onZoomChange?: (zoom: number) => void;
  /** After "Find": a dashed path for 4 s, and an edge arrow while the target is off screen. */
  readonly guideTarget?: { latitude: number; longitude: number; requestId: number } | null;
}) {
  const { location } = useContext(LocationContext);
  const { heading, setHeadingEnabled } = useContext(HeadingContext);
  const { player } = useContext(AuthContext);
  const reducedMotion = useReducedGameMotion();
  // A map on a tab the player left stays mounted. Its compass, camera pushes
  // and idle loops would keep the GPU and sensors busy, so pause them off screen.
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    setHeadingEnabled(true);
    return () => { setScreenFocused(false); setHeadingEnabled(false); };
  }, [setHeadingEnabled]));

  // Player shark idle: swim bob, sway, breathe, shadow and glow, all on the UI
  // thread. Loops stop on unmount; reduced motion holds the shark still.
  const idle = useSharedValue(0), sway = useSharedValue(0), glow = useSharedValue(0.5);
  useEffect(() => {
    if (reducedMotion || !screenFocused) { idle.value = 0; sway.value = 0; glow.value = 0.5; return; }
    const ease = REasing.inOut(REasing.sin);
    idle.value = withRepeat(withSequence(withTiming(1, { duration: 1000, easing: ease }), withTiming(0, { duration: 1000, easing: ease })), -1, false);
    sway.value = withRepeat(withSequence(withTiming(1, { duration: 1200, easing: ease }), withTiming(-1, { duration: 1200, easing: ease })), -1, false);
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1400, easing: ease }), withTiming(0, { duration: 1400, easing: ease })), -1, false);
    return () => { cancelAnimation(idle); cancelAnimation(sway); cancelAnimation(glow); };
  }, [reducedMotion, screenFocused, idle, sway, glow]);
  const sharkStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -8 * idle.value }, { rotate: `${3 * sway.value}deg` }, { scale: 1 + 0.04 * idle.value }],
  }));
  const shadowStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 - 0.15 * idle.value }, { scaleY: 1 - 0.15 * idle.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.3 + 0.4 * glow.value }));

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

  const cameraRef = useRef<CameraRef>(null);
  // A water-and-sparkle cover hides the blank map while tiles stream in, then
  // lifts away once the map has fully drawn (or after 4 s, whatever happens).
  const cover = useRef(new Animated.Value(1)).current;
  const [covered, setCovered] = useState(true);
  const revealed = useRef(false);
  const revealMap = () => {
    if (revealed.current) return;
    revealed.current = true;
    Animated.timing(cover, { toValue: 0, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(() => setCovered(false));
  };
  useEffect(() => {
    const t = setTimeout(revealMap, 4000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // Find guide: dashed path for a few seconds, edge arrow while off screen.
  const [viewSize, setViewSize] = useState<{ width: number; height: number } | null>(null);
  const [guidePoint, setGuidePoint] = useState<{ x: number; y: number } | null>(null);
  const [pathShown, setPathShown] = useState(false);
  const guideRef = useRef(guideTarget); guideRef.current = guideTarget;
  const projectGuide = useCallback(async () => {
    const target = guideRef.current;
    if (!target) { setGuidePoint(null); return; }
    try {
      const point = await mapViewRef.current?.getPointInView([target.longitude, target.latitude]);
      if (guideRef.current?.requestId === target.requestId) setGuidePoint(point ? { x: point[0], y: point[1] } : null);
    } catch { /* the map is not ready; the next camera move retries */ }
  }, []);
  useEffect(() => {
    void projectGuide();
    if (!guideTarget) { setPathShown(false); return; }
    setPathShown(true);
    const timer = setTimeout(() => setPathShown(false), GUIDE_PATH_MS);
    return () => clearTimeout(timer);
  }, [guideTarget?.requestId, projectGuide]); // eslint-disable-line react-hooks/exhaustive-deps
  const arrow = guideTarget && guidePoint && viewSize ? edgeArrow(guidePoint, viewSize) : null;
  const [focusedOnPlayer, setFocusedOnPlayer] = useState<boolean>(true);
  const followRef = useRef(true);
  followRef.current = focusedOnPlayer;
  useEffect(() => {
    if (!focusCoordinate || !Number.isFinite(focusCoordinate.latitude) ||
      !Number.isFinite(focusCoordinate.longitude)) return;
    setFocusedOnPlayer(false);
    followRef.current = false;
    cameraRef.current?.setCamera({ centerCoordinate: [focusCoordinate.longitude, focusCoordinate.latitude],
      heading: 0, zoomLevel: focusCoordinate.zoom ?? 17.9, animationDuration: reducedMotion ? 0 : 450, animationMode: reducedMotion ? 'moveTo' : 'easeTo' });
  }, [focusCoordinate?.latitude, focusCoordinate?.longitude, focusCoordinate?.requestId, reducedMotion]);
  // Animated value for user location heading indicator
  const userHeadingRotation = useRef(new Animated.Value(0)).current;
  const lastUserHeadingRef = useRef<number>(0);

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
        <Reanimated.View style={[styles.outerGlowRing, glowStyle]} />
        {/* Inner blue ring (ground indicator) */}
        <View style={styles.groundRing} />
        {/* Animated shadow — shrinks when shark bobs up */}
        <Reanimated.View style={[styles.shadowDisc, shadowStyle]} />
        {/* Directional indicator — only visible in heading mode */}
        {heading !== null && focusedOnPlayer && <View style={styles.sharkDirectionCone} />}
        {/* Player's avatar — bobs, tilts, breathes */}
        <Reanimated.View style={[{ width: 60, height: 60 }, sharkStyle]}>
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
              {/* Equipped items layered on top, in the shared outfit order */}
              {outfitLayerUrls(player.inventory).map((uri) => (
                <Image key={uri} source={{ uri }} style={{ width: 60, height: 60, position: 'absolute' }} contentFit="contain" />
              ))}
            </View>
          ) : (
            <Image
              source={require('../../assets/images/screens/explore/shark_player.gif')}
              style={styles.sharkImage}
              contentFit="contain"
            />
          )}
        </Reanimated.View>
      </View>
  );

  return (
    <View
      style={{
        position: 'relative',
        flex: 1,
      }}
      onLayout={event => setViewSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
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
        {/* Recenter: Alex's compass on a blue button; gold when you have panned away. */}
        <Pressable
          onPress={() => { haptic('tapLight'); recenterOnPlayer(); }}
          accessibilityRole="button"
          accessibilityLabel={focusedOnPlayer ? 'Following your shark' : 'Center the map on your shark'}
          hitSlop={6}
          style={({ pressed }) => [styles.recenter, !focusedOnPlayer && styles.recenterAway, pressed && styles.recenterPressed]}
        >
          <RecenterIcon away={!focusedOnPlayer} reducedMotion={reducedMotion} />
        </Pressable>
      </View>

      <MapView
        ref={mapViewRef}
        style={StyleSheet.absoluteFill}
        mapStyle={TPS_MAP_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        rotateEnabled
        pitchEnabled={false}
        regionWillChangeDebounceTime={0}
        onRegionWillChange={(feature) => {
          if (!feature.properties?.isUserInteraction) return;
          onPress?.();
        }}
        onDidFinishRenderingMapFully={() => { refreshDecorations(); revealMap(); }}
        onRegionDidChange={(feature) => {
          refreshDecorations();
          void projectGuide();
          const zoom = Number(feature.properties?.zoomLevel);
          if (Number.isFinite(zoom)) onZoomChange?.(zoom);
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
        {guideTarget && location && pathShown && (
          <ShapeSource id="tps-guide" shape={guideLine(location, guideTarget)}>
            <LineLayer id="tps-guide-casing" style={{ lineColor: BRAND.navy, lineWidth: 7, lineCap: 'round', lineOpacity: 0.85 }} />
            <LineLayer id="tps-guide" style={{ lineColor: BRAND.gold, lineWidth: 4, lineCap: 'round', lineDasharray: [1.6, 1.4] }} />
          </ShapeSource>
        )}
        <MapQueryContext.Provider value={mapQuery}>{children}</MapQueryContext.Provider>
        {/* Panned away: the shark stays pinned to its spot on the map. Markers draw in
            order, so it comes after the ride islands and is never hidden under one. */}
        {location && !focusedOnPlayer && (
          <Marker coordinate={location} anchor={{ x: 0.5, y: 0.65 }}>
            {playerShark}
          </Marker>
        )}
      </MapView>
      {arrow && <GuideArrow x={arrow.x} y={arrow.y} angle={arrow.angle} reducedMotion={reducedMotion} />}
      {/* Map data credit, in the game's own type instead of the stock (i) button. */}
      <Pressable accessibilityRole="link" accessibilityLabel="Map data from OpenStreetMap contributors"
        onPress={() => { void Linking.openURL('https://www.openstreetmap.org/copyright'); }}
        hitSlop={8} style={styles.attribution}>
        <Text style={styles.attributionText}>© OpenStreetMap</Text>
      </Pressable>
      {covered && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cover, {
          opacity: cover, transform: [{ scale: cover.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }] }]}>
          {/* The player's shark (drawn above) swims on the water until the map lands under it. */}
          <Image source={require('../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
      )}
      {location && focusedOnPlayer && (
        <View pointerEvents="none" style={styles.centerOverlay}>
          <View style={styles.centerShark}>{playerShark}</View>
        </View>
      )}
    </View>
  );
}

/** Edge arrow toward an off-screen Find target: pops in, then leans toward it. */
function GuideArrow({ x, y, angle, reducedMotion }: { readonly x: number; readonly y: number; readonly angle: number; readonly reducedMotion: boolean }) {
  const pop = useSharedValue(reducedMotion ? 1 : 0), lean = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) { pop.value = 1; lean.value = 0; return; }
    pop.value = withSpring(1, { damping: 9, stiffness: 220 });
    lean.value = withRepeat(withSequence(withTiming(1, { duration: 520 }), withTiming(0, { duration: 520 })), -1, false);
    return () => { cancelAnimation(lean); };
  }, [reducedMotion, pop, lean]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x - 24 }, { translateY: y - 24 }, { rotate: `${angle}deg` },
      { translateX: lean.value * 5 }, { scale: pop.value }],
  }));
  return <Reanimated.View pointerEvents="none" accessible accessibilityLabel="Your target is this way" style={[styles.guideArrow, style]}>
    <GameIcon name="arrow" size={48} />
  </Reanimated.View>;
}

/** The compass nudges once when you pan away, so the way back is noticed. */
function RecenterIcon({ away, reducedMotion }: { readonly away: boolean; readonly reducedMotion: boolean }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!away || reducedMotion) { turn.value = 0; return; }
    turn.value = withSequence(withTiming(-18, { duration: 120 }), withSpring(0, { damping: 6, stiffness: 240 }));
  }, [away, reducedMotion, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return <Reanimated.View style={style}><GameIcon name="map" size={32} /></Reanimated.View>;
}

const styles = StyleSheet.create({
  guideArrow: { position: 'absolute', left: 0, top: 0, width: 48, height: 48, zIndex: 9 },
  recenter: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.blueBright, borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  recenterAway: { backgroundColor: BRAND.gold },
  recenterPressed: { transform: [{ scale: 0.94 }] },
  attribution: { position: 'absolute', left: 8, bottom: 6, zIndex: 4, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.7)' },
  attributionText: { fontFamily: 'Knockout', fontSize: 10, color: BRAND.navySoft },
  cover: { zIndex: 5, backgroundColor: '#0768b9' },
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
    borderBottomColor: BRAND.blue,
    zIndex: 1,
  },
  sharkImage: {
    width: 65,
    height: 65,
    zIndex: 10,
    marginBottom: 6,
  },
});
