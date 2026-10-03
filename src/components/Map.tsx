import { Image } from 'expo-image';
import { createContext, type MutableRefObject, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CircleLayer, FillLayer, HeatmapLayer, Images, LineLayer, MapView, ShapeSource, SymbolLayer, type CameraRef, type MapViewRef } from '@maplibre/maplibre-react-native';
import { edgeArrow, GUIDE_PATH_MS, guideLine } from './map/guide';
import { Animated, Linking, Pressable, Text, View, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import Reanimated, { cancelAnimation, Easing as REasing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../gamekit/Haptics';
import { BRAND, GameIcon, SHADOW } from '../ui';
import { AuthContext } from '../context/AuthProvider';
import { HeadingContext, LocationContext } from '../context/LocationProvider';
import { Marker } from './map/Marker';
import { buildDecorations, buildLampPoints, buildWaterGlints, DECO_ICONS, decorationBand } from './map/decorations';
import { MapAliveProvider, useMapAliveEngine } from './map/alive/MapAliveContext';
import { MapLightOverlay, MapSkyOverlay } from './map/alive/MapSkyOverlay';
import { WaterGlints } from './map/alive/WaterGlints';
import { SharkTrail, SharkWake } from './map/alive/SharkTrail';
import { lightForElevation, sunElevation } from './map/alive/skyLight';
import { TPS_MAP_STYLE } from './map/tpsMapStyle';
import { FrightMapLayer, FrightMapSources, type FrightMapInput } from './map/fright';
import { nearestWaterPoint } from './map/water';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { GRAB_TAG_SIZE, grabTagCenter } from '../screens/ExploreScreen/homeMapLayout';
import { useFocusEffect } from '@react-navigation/native';
import { hasDressedShark, outfitLayerUrls, sharkBaseLayers } from '../helpers/wardrobe';

type LatLng = { latitude: number; longitude: number };

/** Where a map coordinate is on screen, in window points (null when off the map or not ready). */
export type MapProjector = (latitude: number, longitude: number) => Promise<{ x: number; y: number } | null>;

/** Lets map pins ask about the rendered map (e.g. where the nearest water is). */
export const MapQueryContext = createContext<{
  readonly findWater: (latitude: number, longitude: number, margin?: number) => Promise<LatLng | null>;
} | null>(null);

// Map always rotates with heading. Single button recenters on player.
// While following, the shark is drawn at screen center and the cartoon map
// eases under it (Pokemon GO style); panned away, it becomes a map marker.

const FALLBACK_CENTER = { latitude: 34.1381, longitude: -118.3534 };
// The whole map, for the time-of-day tint layer.
const WORLD: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
  geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } }] };
const FOLLOW_ZOOM = 17.6;

/** The GRAB ZONE tag's slot inside the grab-zone box (a 2r square), centred on its spot on the circle. */
function grabTagSlotPosition(radius: number, angleDeg: number) {
  const c = grabTagCenter(radius, angleDeg);
  return { left: radius + c.x - GRAB_TAG_SIZE.width / 2, top: radius + c.y - GRAB_TAG_SIZE.height / 2 };
}

/** Map points per metre at this zoom and latitude (MapLibre: 512-point world tiles). */
export function pointsPerMeter(zoom: number, latitude: number): number {
  const metersPerPoint = 40075016.686 * Math.cos(latitude * Math.PI / 180) / (512 * 2 ** zoom);
  return metersPerPoint > 0 ? 1 / metersPerPoint : 0;
}

export default function Map({ children, onPress, focusCoordinate, controlsTop = 72, onZoomChange, guideTarget, ambientPaused = false, crowdHaze = null, sunOverride, projector, pickupRange = null, extraControls, fright = null }: {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  /** Move the camera here; `zoom` defaults to the ride focus zoom. */
  readonly focusCoordinate?: { latitude: number; longitude: number; requestId?: number; zoom?: number } | null;
  readonly controlsTop?: number;
  /** Camera zoom after each move, for marker declutter. */
  readonly onZoomChange?: (zoom: number) => void;
  /** After "Find": a dashed path for 4 s, and an edge arrow while the target is off screen. */
  readonly guideTarget?: { latitude: number; longitude: number; requestId: number } | null;
  /** A full-screen flow covers the map: hold every ambient loop still (battery). */
  readonly ambientPaused?: boolean;
  /** Park pulse: busy rides as weighted points; a soft warm haze gathers over them. */
  readonly crowdHaze?: GeoJSON.FeatureCollection | null;
  /** Development previews: pin the sun at this elevation (degrees) instead of the real sky. */
  readonly sunOverride?: number;
  /** Filled with a function that finds a map coordinate on screen (window points), for moments that leave the map. */
  readonly projector?: MutableRefObject<MapProjector | null>;
  /**
   * Home map: a dashed "grab zone" circle around the shark at the real pickup
   * radius, gold while a find is inside it. Replaces the shark's blue ground
   * pill, which read like a mystery button.
   */
  readonly pickupRange?: {
    readonly meters: number;
    readonly findInside: boolean;
    /** Where the GRAB ZONE tag sits, degrees clockwise from the top, clear of every find. */
    readonly tagAngle?: number;
  } | null;
  /** More round buttons under the recenter button (the daily chest). */
  readonly extraControls?: ReactNode;
  /** Fin-ister Nights map takeover (src/components/map/fright); null is off. */
  readonly fright?: FrightMapInput | null;
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
  // Time of day: the real sun over the player, rechecked each minute while the map is on screen.
  const [skyNow, setSkyNow] = useState(() => Date.now());
  useEffect(() => {
    if (!screenFocused) return;
    setSkyNow(Date.now());
    const timer = setInterval(() => setSkyNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [screenFocused]);
  const skyLat = location ? Math.round(location.latitude * 100) / 100 : null;
  const skyLng = location ? Math.round(location.longitude * 100) / 100 : null;
  const devSun = __DEV__ ? Number(process.env.EXPO_PUBLIC_MAP_SUN ?? NaN) : NaN;
  const pinnedSun = sunOverride ?? (Number.isFinite(devSun) ? devSun : undefined);
  const sun = pinnedSun ?? (skyLat === null || skyLng === null ? 45 : Math.round(sunElevation(skyNow, skyLat, skyLng) * 2) / 2);
  const light = useMemo(() => lightForElevation(sun), [sun]);
  const alive = useMapAliveEngine({ focused: screenFocused, paused: ambientPaused, light });

  // Player shark idle: swim bob, sway, breathe, shadow and glow, all on the UI
  // thread. Loops stop on unmount; reduced motion holds the shark still.
  const idle = useSharedValue(0), sway = useSharedValue(0), glow = useSharedValue(0.5);
  const wake = useSharedValue(0);
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
    // A real step (not GPS wobble) stirs the shark's wake for the glide, then it settles.
    if (distMeters >= 1 && distMeters < 60) {
      wake.value = withSequence(withTiming(1, { duration: 200 }), withDelay(glideDuration + 600, withTiming(0, { duration: 700 })));
    }
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
  const rootRef = useRef<View>(null);
  useEffect(() => {
    if (!projector) return;
    projector.current = async (latitude, longitude) => {
      const point = await mapViewRef.current?.getPointInView([longitude, latitude]).catch(() => null);
      if (!point) return null;
      const origin = await new Promise<{ x: number; y: number } | null>(resolve => {
        if (!rootRef.current) { resolve(null); return; }
        rootRef.current.measureInWindow((x, y) => resolve(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null));
      });
      return origin ? { x: origin.x + point[0], y: origin.y + point[1] } : null;
    };
    return () => { projector.current = null; };
  }, [projector]);
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
  const [glints, setGlints] = useState<{ latitude: number; longitude: number; seed: number }[]>([]);
  const [lampPoints, setLampPoints] = useState<GeoJSON.FeatureCollection>(EMPTY);
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
        setGlints(buildWaterGlints(water.features, { north, south, east, west }, zoom, 6));
        const lamps = buildLampPoints(roads.features, { north, south, east, west }, zoom);
        setLampPoints(lamps);
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
  // Camera zoom, for sizing the grab zone in metres (updated when a move settles).
  const [cameraZoom, setCameraZoom] = useState(FOLLOW_ZOOM);
  const followRef = useRef(true);
  followRef.current = focusedOnPlayer;
  useEffect(() => {
    if (!focusCoordinate || !Number.isFinite(focusCoordinate.latitude) ||
      !Number.isFinite(focusCoordinate.longitude)) return;
    setFocusedOnPlayer(false);
    followRef.current = false;
    cameraRef.current?.setCamera({ centerCoordinate: [focusCoordinate.longitude, focusCoordinate.latitude],
      heading: 0, zoomLevel: focusCoordinate.zoom ?? 17.9, animationDuration: reducedMotion ? 0 : 450, animationMode: reducedMotion ? 'moveTo' : 'easeTo' });
  // `covered`: a request made before the map first drew (a mount-time focus) is dropped by the
  // native camera, so it is applied again once the map is revealed.
  }, [focusCoordinate?.latitude, focusCoordinate?.longitude, focusCoordinate?.requestId, reducedMotion, covered]);
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

  const rangeRadius = pickupRange && location
    ? Math.max(24, Math.min(600, pickupRange.meters * pointsPerMeter(cameraZoom, location.latitude))) : 0;
  const playerShark = (
      <View style={styles.sharkMarkerContainer}>
        {pickupRange ? (
          // Grab zone: centred on the shark's ground point (50, 71.5 in this box).
          <View pointerEvents="none" style={[styles.grabZone, pickupRange.findInside && styles.grabZoneReady, {
            width: rangeRadius * 2, height: rangeRadius * 2, borderRadius: rangeRadius,
            left: 50 - rangeRadius, top: 71.5 - rangeRadius }]}>
            <View style={[styles.grabZoneTagSlot, grabTagSlotPosition(rangeRadius, pickupRange.tagAngle ?? 0)]}>
              <View style={[styles.grabZoneTag, pickupRange.findInside && styles.grabZoneTagReady]}>
                <Text style={[styles.grabZoneText, pickupRange.findInside && styles.grabZoneTextReady]}>GRAB ZONE</Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* Animated glow ring */}
            <Reanimated.View style={[styles.outerGlowRing, glowStyle]} />
            {/* Inner blue ring (ground indicator) */}
            <View style={styles.groundRing} />
          </>
        )}
        {/* Wake: sparkles spill from under the shark while it walks. */}
        <SharkWake moving={wake} />
        {/* Animated shadow — shrinks when shark bobs up */}
        <Reanimated.View style={[styles.shadowDisc, shadowStyle]} />
        {/* Directional indicator — only visible in heading mode */}
        {heading !== null && focusedOnPlayer && !pickupRange && <View style={styles.sharkDirectionCone} />}
        {/* Player's avatar — bobs, tilts, breathes */}
        <Reanimated.View style={[{ width: 60, height: 60 }, sharkStyle]}>
          {hasDressedShark(player?.inventory) ? (
            <View style={{ width: 60, height: 60, position: 'relative' }}>
              {/* Skin (or Alex's Classic) with no eyes, then the eyes layer */}
              {sharkBaseLayers(player?.inventory).map((source, index) => (
                <Image
                  key={`base-${index}`}
                  source={source}
                  style={{ width: 60, height: 60, position: 'absolute' }}
                  cachePolicy="memory-disk" transition={0}
                  contentFit="contain"
                />
              ))}
              {/* Equipped items layered on top, in the shared outfit order */}
              {outfitLayerUrls(player?.inventory).map((uri) => (
                <Image key={uri} source={{ uri }} style={{ width: 60, height: 60, position: 'absolute' }} cachePolicy="memory-disk" transition={0} contentFit="contain" />
              ))}
            </View>
          ) : (
            <Image
              source={require('../../assets/images/screens/explore/shark_player.gif')}
              autoplay={screenFocused && !reducedMotion}
              style={styles.sharkImage}
              contentFit="contain"
            />
          )}
        </Reanimated.View>
      </View>
  );

  return (
    <MapAliveProvider value={alive}>
    <View
      ref={rootRef}
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
        {extraControls}
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
          // The moment a finger moves the map, stop following: the shark becomes a
          // map marker at its real spot (it is at screen center right now, so the
          // swap is invisible) and slides with the map. Waiting for the gesture to
          // end let GPS and heading ticks yank the camera back mid-drag.
          if (followRef.current) {
            followRef.current = false;
            setFocusedOnPlayer(false);
          }
          onPress?.();
        }}
        onDidFinishRenderingMapFully={() => { refreshDecorations(); revealMap();
          void mapViewRef.current?.getZoom().then(zoom => {
            if (Number.isFinite(zoom)) { setCameraZoom(zoom); onZoomChange?.(zoom); }
          }).catch(() => undefined); }}
        onRegionDidChange={(feature) => {
          refreshDecorations();
          void projectGuide();
          const zoom = Number(feature.properties?.zoomLevel);
          if (Number.isFinite(zoom)) {
            onZoomChange?.(zoom);
            setCameraZoom(current => (Math.abs(current - zoom) < 0.02 ? current : zoom));
          }
          // A pinch or a tap that left the shark centered (within ~8 m) goes back
          // to following; a real pan stays put until the recenter button.
          if (!feature.properties?.isUserInteraction || followRef.current || !location) return;
          const [lng, lat] = feature.geometry.coordinates;
          if (Math.abs(lat - location.latitude) < 0.00007 && Math.abs(lng - location.longitude) < 0.00007) {
            followRef.current = true;
            setFocusedOnPlayer(true);
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
        {/* Time of day: one tint over the tiles only, so every pin stays bright on top. */}
        <ShapeSource id="tps-sky-tint" shape={WORLD}>
          <FillLayer id="tps-sky-tint" style={{ fillColor: light.tint.color, fillOpacity: light.tint.opacity,
            fillColorTransition: { duration: 4000, delay: 0 }, fillOpacityTransition: { duration: 4000, delay: 0 } }} />
        </ShapeSource>
        {/* Fin-ister Nights: night tint over the tiles, lanterns, reef critters (map anchored). */}
        {fright && <FrightMapSources input={fright} zoom={cameraZoom} mapRef={mapViewRef} />}
        {/* After sunset, warm lamps glow along the walkways (static GL circles). */}
        {light.lamps >= 0.05 && lampPoints.features.length > 0 && (
          <ShapeSource id="tps-lamps" shape={lampPoints}>
            <CircleLayer id="tps-lamp-glow" style={{ circleColor: '#ffc95e', circleBlur: 1,
              circleRadius: ['interpolate', ['exponential', 1.6], ['zoom'], 16, 7, 17, 13, 19, 34],
              circleOpacity: 0.7 * light.lamps, circlePitchAlignment: 'map' }} />
            <CircleLayer id="tps-lamp-core" style={{ circleColor: '#fff3c4', circleBlur: 0.4,
              circleRadius: ['interpolate', ['exponential', 1.6], ['zoom'], 16, 1, 17, 1.6, 19, 3.6],
              circleOpacity: 0.9 * light.lamps }} />
          </ShapeSource>
        )}
        {/* Crowd haze: static GL heatmap (no per-frame cost), warm where the lines are long. */}
        {crowdHaze && crowdHaze.features.length > 0 && (
          <ShapeSource id="tps-crowd-haze" shape={crowdHaze}>
            <HeatmapLayer id="tps-crowd-haze" style={{
              heatmapWeight: ['get', 'w'],
              heatmapIntensity: ['interpolate', ['linear'], ['zoom'], 15, 0.5, 19, 0.9],
              heatmapRadius: ['interpolate', ['exponential', 1.6], ['zoom'], 15, 16, 17, 38, 19, 100],
              // Barely there at the edge, a warm shimmer in the middle: air over a crowd, not a warning.
              heatmapColor: ['interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(255,214,120,0)', 0.3, 'rgba(255,214,120,0.06)', 0.6, 'rgba(255,186,96,0.16)',
                0.85, 'rgba(255,150,84,0.24)', 1, 'rgba(255,124,84,0.3)'],
              heatmapOpacity: 0.8,
              heatmapOpacityTransition: { duration: 1200, delay: 0 },
            }} />
          </ShapeSource>
        )}
        {guideTarget && location && pathShown && (
          <ShapeSource id="tps-guide" shape={guideLine(location, guideTarget)}>
            <LineLayer id="tps-guide-casing" style={{ lineColor: BRAND.navy, lineWidth: 7, lineCap: 'round', lineOpacity: 0.85 }} />
            <LineLayer id="tps-guide" style={{ lineColor: BRAND.gold, lineWidth: 4, lineCap: 'round', lineDasharray: [1.6, 1.4] }} />
          </ShapeSource>
        )}
        <WaterGlints spots={glints} />
        {/* Sparkles where the shark walked: on the ground, under the islands. */}
        <SharkTrail latitude={location?.latitude ?? null} longitude={location?.longitude ?? null} />
        <MapQueryContext.Provider value={mapQuery}>{children}</MapQueryContext.Provider>
        {/* Panned away: the shark stays pinned to its spot on the map. Markers draw in
            order, so it comes after the ride islands and is never hidden under one. */}
        {/* Both shark copies stay mounted and swap by opacity: remounting on every
            drag reloaded the outfit images and made the shark flash. */}
        {location && (
          <Marker coordinate={location} anchor={{ x: 0.5, y: 0.65 }}>
            <View style={{ opacity: focusedOnPlayer ? 0 : 1 }}>{playerShark}</View>
          </Marker>
        )}
      </MapView>
      {/* Light, cloud shadows, gulls and fireflies: above the map, under the controls and the shark. */}
      {viewSize && <MapLightOverlay width={viewSize.width} height={viewSize.height} />}
      {viewSize && <MapSkyOverlay width={viewSize.width} height={viewSize.height} />}
      {fright && viewSize && <FrightMapLayer input={fright} width={viewSize.width} height={viewSize.height} zoom={cameraZoom} />}
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
      {location && (
        <View pointerEvents="none" style={[styles.centerOverlay, { opacity: focusedOnPlayer ? 1 : 0 }]}>
          <View style={styles.centerShark}>{playerShark}</View>
        </View>
      )}
    </View>
    </MapAliveProvider>
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
  grabZone: { position: 'absolute', alignItems: 'center', borderWidth: 2.5, borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.95)', backgroundColor: 'rgba(124,198,245,0.10)' },
  grabZoneReady: { borderColor: BRAND.gold, borderStyle: 'solid', borderWidth: 3, backgroundColor: 'rgba(255,207,59,0.12)' },
  // A fixed box centred on the tag's spot on the circle; the tag centres inside it.
  grabZoneTagSlot: { position: 'absolute', width: GRAB_TAG_SIZE.width, height: GRAB_TAG_SIZE.height,
    alignItems: 'center', justifyContent: 'center' },
  grabZoneTag: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 9,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.blueBright },
  grabZoneTagReady: { backgroundColor: BRAND.gold, borderColor: BRAND.white },
  grabZoneText: { fontFamily: 'Knockout', fontSize: 10, letterSpacing: 0.5, color: BRAND.blue },
  grabZoneTextReady: { color: BRAND.navy },
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
