import { Image } from 'expo-image';
import { createContext, type MutableRefObject, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackgroundLayer, Camera, CircleLayer, HeatmapLayer, Images, LineLayer, MapView, ShapeSource, SymbolLayer, type CameraRef, type MapViewRef } from '@maplibre/maplibre-react-native';
import { edgeArrow, GUIDE_PATH_MS, guideLine } from './map/guide';
import { PlayerSharkMarker } from './map/PlayerSharkMarker';
import { courseDeg, facingFor, strideHalfMs, wakeTurn } from './map/playerMotion';
import { glideDurationMs, glideMeters, nextFixGap } from './map/glide';
import { Animated, Linking, Pressable, Text, View, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import Reanimated, { cancelAnimation, Easing as REasing, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
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
import { FrightMapLayer, FrightMapSources, FrightNightTint, type FrightMapInput, type HudRect } from './map/fright';
import { nearestWaterPoint } from './map/water';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { useFocusEffect } from '@react-navigation/native';
import { canMirrorShark, hasDressedShark, outfitLayerUrls, sharkBaseLayers } from '../helpers/wardrobe';
import { DeclutterContext } from './map/declutter/Placed';
import useMapDeclutter, { type MapDeclutterInput } from './map/declutter/useMapDeclutter';
import type { InsetRect, LayoutItem, Rect } from './map/declutter/solver';
import { isOffline, onConnectivityChange } from '../services/connectivity';
import { catchShown, isCatchShown } from '../screens/ExploreScreen/catchPresence';

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
const FOLLOW_ZOOM = 17.6;
/** One empty collection (a stable prop: always-mounted sources show nothing without re-sending a shape). */
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
// Radial falloff texture: soft round shadows and light pools with no hard edge.
const GROUND_GLOW = require('../../assets/images/map/fx/glow.png');
/**
 * The shark's ground point (the middle of its blue ground ring) inside its
 * 100 x 110 box: the player's location sits exactly here, on the map marker and
 * at screen center while following. The declutter footprint (declutterPlayer,
 * 52 x 60 above this point) already assumed it.
 */
const SHARK_GROUND = { x: 50, y: 100 } as const;
/** The weak-GPS ring: drawn at most this wide (points), scaled down to the fix's accuracy circle. */
const WEAK_RING_MAX_PT = 200;
const WEAK_RING_MIN_PT = 110;
const WEAK_RING_MIN_M = 40;
/** The wake and stride stay up at least this long after a real step (then as long as the glide). */
const WAKE_MIN_HOLD_MS = 800;
/** At this accuracy (m) or worse the ring is at its widest and strongest. */
const WEAK_RING_FULL_M = 150;

/** Map points per metre at this zoom and latitude (MapLibre: 512-point world tiles). */
export function pointsPerMeter(zoom: number, latitude: number): number {
  const metersPerPoint = 40075016.686 * Math.cos(latitude * Math.PI / 180) / (512 * 2 ** zoom);
  return metersPerPoint > 0 ? 1 / metersPerPoint : 0;
}

/** Stable empty data for always-mounted sources that are off (never a new object per render). */
const NO_FEATURES: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export default function Map({ children, onPress, focusCoordinate, controlsTop = 72, onZoomChange, guideTarget, ambientPaused = false, ambientFrozen = false, crowdHaze = null, sunOverride, projector, snapshotter, extraControls, chromeHidden = false, fright = null, onUserPan, declutter = null }: {
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
  /** Stop the ambient clock without re-rendering or unmounting anything (a short cover, like a catch). */
  readonly ambientFrozen?: boolean;
  /** Park pulse: busy rides as weighted points; a soft warm haze gathers over them. */
  readonly crowdHaze?: GeoJSON.FeatureCollection | null;
  /** Development previews: pin the sun at this elevation (degrees) instead of the real sky. */
  readonly sunOverride?: number;
  /** Filled with a function that finds a map coordinate on screen (window points), for moments that leave the map. */
  readonly projector?: MutableRefObject<MapProjector | null>;
  /** Filled with a function that grabs a still of the map (a file URI), for a moment that blurs the map once instead of live. */
  readonly snapshotter?: MutableRefObject<(() => Promise<string | null>) | null>;
  /** More round buttons under the recenter button (the daily chest). */
  readonly extraControls?: ReactNode;
  /** Fin-ister Nights map takeover (src/components/map/fright); null is off. */
  readonly fright?: FrightMapInput | null;
  /** In-park marker declutter (src/components/map/declutter): footprints, insets and the placement store. */
  readonly declutter?: MapDeclutterInput | null;
  /** A full-screen moment owns the screen: hide the map buttons and the data credit (shown again after). */
  readonly chromeHidden?: boolean;
  /** A finger started moving the map. */
  readonly onUserPan?: () => void;
}) {
  const { location, gpsSignal } = useContext(LocationContext);
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
  const alive = useMapAliveEngine({ focused: screenFocused, paused: ambientPaused, frozen: ambientFrozen, light });

  // Player shark idle: swim bob, sway, breathe, shadow and glow, all on the UI
  // thread. Loops stop on unmount; reduced motion, and a frozen map (a catch on top, a still capture), hold it still.
  const idle = useSharedValue(0), sway = useSharedValue(0), glow = useSharedValue(0.5);
  const wake = useSharedValue(0);
  // The camera as the shark's UI-thread motion needs it: points per metre and bearing.
  const zoomPpm = useSharedValue(0);
  const mapBearing = useSharedValue(0);
  // Travel course (compass degrees) of the last real step; the wake streams opposite it.
  const travelCourse = useSharedValue(0);
  const wakeTrail = useDerivedValue(() => wakeTurn(travelCourse.value, mapBearing.value));
  useEffect(() => {
    if (reducedMotion || !screenFocused || ambientFrozen) { idle.value = 0; sway.value = 0; glow.value = 0.5; return; }
    const ease = REasing.inOut(REasing.sin);
    idle.value = withRepeat(withSequence(withTiming(1, { duration: 1000, easing: ease }), withTiming(0, { duration: 1000, easing: ease })), -1, false);
    sway.value = withRepeat(withSequence(withTiming(1, { duration: 1200, easing: ease }), withTiming(-1, { duration: 1200, easing: ease })), -1, false);
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1400, easing: ease }), withTiming(0, { duration: 1400, easing: ease })), -1, false);
    return () => { cancelAnimation(idle); cancelAnimation(sway); cancelAnimation(glow); };
  }, [reducedMotion, screenFocused, ambientFrozen, idle, sway, glow]);
  // Weak GPS: graded by the fix's accuracy (40 m small and faint, 150 m wide and stronger).
  const weak = useSharedValue(0);
  const weakAccuracy = useSharedValue(WEAK_RING_MIN_M);
  useEffect(() => {
    weak.value = withTiming(gpsSignal?.weak ? 1 : 0, { duration: 700 });
    if (gpsSignal?.accuracyMeters) weakAccuracy.value = withTiming(gpsSignal.accuracyMeters, { duration: 700 });
  }, [gpsSignal?.weak, gpsSignal?.accuracyMeters, weak, weakAccuracy]);
  // Walking: the shark faces its screen direction (art flips) and a quick stride bounce
  // rides on the idle bob while the wake is up; standing, both settle.
  // A shark wearing lettering (a TPS tee, a jersey) never mirrors: it leans into the turn instead.
  const mirrorOk = useSharedValue(1);
  const canMirror = canMirrorShark(player?.inventory);
  useEffect(() => { mirrorOk.value = canMirror ? 1 : 0; }, [canMirror, mirrorOk]);
  const facing = useSharedValue(1);
  const stride = useSharedValue(0);
  useAnimatedReaction(() => facingFor(travelCourse.value, mapBearing.value, facing.value > 0 ? 1 : -1), (next, prevSign) => {
    if (prevSign !== null && next !== prevSign) facing.value = withTiming(next, { duration: 260 });
  });
  // The stride runs only while walking, at the walking pace (a stroll waddles slower).
  const strideMs = useRef(0);
  const strideStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runStride = (speedMps: number, holdMs: number) => {
    if (reducedMotion || !screenFocused || ambientFrozen) return;
    const ms = strideHalfMs(speedMps);
    if (Math.abs(ms - strideMs.current) >= 20) {
      strideMs.current = ms;
      stride.value = withRepeat(withSequence(withTiming(1, { duration: ms }), withTiming(0, { duration: ms })), -1, false);
    }
    if (strideStop.current) clearTimeout(strideStop.current);
    strideStop.current = setTimeout(() => { strideMs.current = 0; cancelAnimation(stride); stride.value = withTiming(0, { duration: 200 }); }, holdMs);
  };
  useEffect(() => () => { if (strideStop.current) clearTimeout(strideStop.current); }, []);
  useEffect(() => {
    if (reducedMotion || !screenFocused || ambientFrozen) { strideMs.current = 0; cancelAnimation(stride); stride.value = 0; }
  }, [reducedMotion, screenFocused, ambientFrozen, stride]);
  const motion = { idle, sway, glow, wake, stride, facing, mirrorOk, weak, weakAccuracy };
  // One set of animated styles per drawn copy (follow view, two marker copies). A copy that is
  // not on screen holds still, so only the visible shark costs UI-thread work each frame.
  const overlayLive = useSharedValue(1);
  const slotActive = useSharedValue(0);
  const slotShown = useSharedValue(0);
  const slot0Live = useDerivedValue(() => (slotActive.value === 0 ? slotShown.value : 0));
  const slot1Live = useDerivedValue(() => (slotActive.value === 1 ? slotShown.value : 0));
  const overlayStyles = useSharkStyles(overlayLive, motion);
  const slot0Styles = useSharkStyles(slot0Live, motion);
  const slot1Styles = useSharkStyles(slot1Live, motion);

  const prevLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const glideRef = useRef(0);
  const lastFixAtRef = useRef(0);
  const fixGapRef = useRef(0);
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

    // The camera eases with the same glide as the panned-away marker (map/glide.ts):
    // 600 ms for a step, up to 1 s for a stride, a jump for a re-seat (out of the car).
    const prev = prevLocationRef.current;
    const distMeters = glideMeters(prev, location);
    const arrived = Date.now();
    const previousFixAt = lastFixAtRef.current;
    if (previousFixAt > 0) fixGapRef.current = nextFixGap(fixGapRef.current, arrived - previousFixAt);
    const glideDuration = reducedMotion ? 0 : glideDurationMs(prev, location, fixGapRef.current);
    lastFixAtRef.current = arrived;

    prevLocationRef.current = { latitude: location.latitude, longitude: location.longitude };
    glideRef.current = glideDuration;
    pushCamera(glideDuration);
    // A real step (not GPS wobble or a slow drift of the estimate) stirs the shark's wake,
    // turned to stream behind the travel direction, then it settles. Standing still: no wake.
    const sinceLastS = (arrived - previousFixAt) / 1000;
    const walking = distMeters >= 1 && distMeters < 60 && (previousFixAt === 0 || distMeters / Math.max(0.5, sinceLastS) >= 0.4);
    const course = courseDeg(prev, location);
    if (walking && course !== null) travelCourse.value = course;
    if (walking) {
      // Up for exactly as long as the shark moves (its glide fills the expected gap to the next
      // fix), so the wake and stride never run while the shark stands still.
      const hold = Math.max(WAKE_MIN_HOLD_MS, glideDuration + 200);
      wake.value = withSequence(withTiming(1, { duration: 200 }), withDelay(hold, withTiming(0, { duration: 700 })));
      runStride(distMeters / Math.max(0.5, sinceLastS), hold + 700);
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
  useEffect(() => {
    if (!snapshotter) return;
    snapshotter.current = async () => {
      try { return (await mapViewRef.current?.takeSnap(false)) ?? null; } catch { return null; }
    };
    return () => { snapshotter.current = null; };
  }, [snapshotter]);
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
  // The follow-view shark animates only while it is the one on screen.
  useEffect(() => { overlayLive.value = focusedOnPlayer ? 1 : 0; }, [focusedOnPlayer, overlayLive]);
  // Camera zoom, for sizing the grab zone in metres (updated when a move settles).
  const [cameraZoom, setCameraZoom] = useState(FOLLOW_ZOOM);
  const ppmLat = location ? Math.round(location.latitude * 100) / 100 : null;
  const noteCamera = (zoom: number, bearing: number) => {
    if (Number.isFinite(zoom) && ppmLat !== null) zoomPpm.value = pointsPerMeter(zoom, ppmLat);
    if (Number.isFinite(bearing)) mapBearing.value = bearing;
  };
  useEffect(() => { if (ppmLat !== null) zoomPpm.value = pointsPerMeter(cameraZoom, ppmLat); }, [cameraZoom, ppmLat, zoomPpm]);
  // The right-rail controls, so fright haunt chips keep clear of them.
  const [rail, setRail] = useState<HudRect | null>(null);
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

  // Declutter: the shark is an obstacle for chips (never for art you walk up to),
  // and the map's own button column is an inset no marker draws under.
  const declutterPlayer = useMemo<LayoutItem[]>(() => declutter && location ? [{ id: 'player', latitude: location.latitude,
    longitude: location.longitude, priority: 0, tagObstacleOnly: true, body: { x: -26, y: -52, w: 52, h: 60 } }] : [],
  [!!declutter, location?.latitude, location?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasExtraControls = !!extraControls;
  // Screen-space art over the map is an inset too: the Fin-ister moon (FrightMapLayer draws it
  // at 66 % across, 15 % down, 40 pt glow) and Explore's docked offline chip (OfflineBanner:
  // 44 pt, 16 pt from the right, 43 % down the window) while it shows.
  const [offline, setOffline] = useState(isOffline());
  useEffect(() => onConnectivityChange(setOffline), []);
  const [viewTop, setViewTop] = useState<number | null>(null);
  const windowHeight = window.height;
  const frightOn = !!fright?.active;
  const declutterControls = useMemo<InsetRect[]>(() => {
    if (!declutter || !viewSize) return [];
    const out: InsetRect[] = [{ x: viewSize.width - 16 - 54 - 6, y: controlsTop - 6, w: 54 + 12, h: 54 + (hasExtraControls ? 62 : 0) + 12 }];
    if (frightOn) out.push({ x: Math.round(viewSize.width * 0.66) - 44, y: Math.round(viewSize.height * 0.15) - 44, w: 88, h: 88, share: 0.2 });
    if (offline && viewTop !== null) out.push({ x: viewSize.width - 16 - 44 - 8, y: Math.round(windowHeight * 0.43) - viewTop - 8, w: 60, h: 60, share: 0.2 });
    return out;
  }, [!!declutter, viewSize?.width, viewSize?.height, controlsTop, hasExtraControls, frightOn, offline, viewTop, windowHeight]); // eslint-disable-line react-hooks/exhaustive-deps
  // Development overlay (EXPO_PUBLIC_DECLUTTER_DEBUG=1): every footprint and chip box the solver placed.
  const [debugRects, setDebugRects] = useState<Map<string, { body: Rect; tag: Rect | null }> | null>(null);
  const debugOn = __DEV__ && process.env.EXPO_PUBLIC_DECLUTTER_DEBUG === '1';
  const feedDeclutter = useMapDeclutter(declutter, viewSize, declutterPlayer, declutterControls, debugOn ? setDebugRects : undefined);
  // iOS draws a marker view whose point is off screen at the top-left corner: the
  // panned-away shark hides while its spot is off screen (checked as the map moves).
  const [playerOnScreen, setPlayerOnScreen] = useState(true);
  const checkPlayer = useCallback((bounds: unknown) => {
    const loc = locationRef.current;
    const b = bounds as number[][] | undefined;
    if (!loc || !Array.isArray(b) || b.length < 2) return;
    const [[east, north], [west, south]] = b;
    const pad = Math.abs(north - south) * 0.04;
    const inside = loc.latitude <= north + pad && loc.latitude >= south - pad &&
      (west <= east ? loc.longitude >= west - pad && loc.longitude <= east + pad : loc.longitude >= west - pad || loc.longitude <= east + pad);
    setPlayerOnScreen(current => (current === inside ? current : inside));
  }, []);
  const lastMoveFeed = useRef(0);
  const declutterSeeded = useRef(false);
  useEffect(() => {
    if (!declutter || declutterSeeded.current || !location) return;
    declutterSeeded.current = true;
    feedDeclutter({ latitude: location.latitude, longitude: location.longitude, zoom: FOLLOW_ZOOM, bearing: 0 });
  }, [declutter, location, feedDeclutter]);

  // One drawn copy of the player's shark, with that copy's own (freezable) styles.
  const sharkArt = (st: SharkStyles, live: SharedValue<number>, playing: boolean) => (
      <View style={styles.sharkMarkerContainer}>
        {/* Weak GPS: always mounted (faded out when the signal is good). */}
        <Reanimated.View pointerEvents="none" style={[styles.weakRing, st.weakRing]}>
          {/* A soft cool fill (the glow art) inside a thin bright rim: an accuracy circle, apart from the shadow. */}
          <Image source={GROUND_GLOW} tintColor="#4f95d6" style={styles.weakFill} contentFit="fill" />
          <View style={styles.weakRim} />
        </Reanimated.View>
        {/* A soft pool of light breathes under the shark, over a soft round ground shadow (one radial texture each). */}
        <Reanimated.View style={[styles.outerGlowRing, st.glow]}>
          {/* By day the light pool is half as strong (the navy core carries the shadow). */}
          <Image source={GROUND_GLOW} tintColor="#7cc6f5" style={[StyleSheet.absoluteFill, { opacity: light.lamps >= 0.05 ? 1 : 0.5 }]} contentFit="fill" />
        </Reanimated.View>
        <Image source={GROUND_GLOW} tintColor="#05143c" style={styles.groundRing} contentFit="fill" />
        {/* Wake: sparkles spill from under the shark while it walks. */}
        <SharkWake moving={wake} trail={wakeTrail} live={live} />
        {/* Contact shadow: tightens as the shark bobs up */}
        <Reanimated.View style={[styles.shadowDisc, st.shadow]}>
          <Image source={GROUND_GLOW} tintColor="#05143c" style={StyleSheet.absoluteFill} contentFit="fill" />
        </Reanimated.View>
        {/* Directional indicator — only visible in heading mode */}
        {heading !== null && focusedOnPlayer && <View style={styles.sharkDirectionCone} />}
        {/* Player's avatar — bobs, tilts, breathes */}
        <Reanimated.View style={[{ width: 60, height: 60 }, st.shark]}>
          {hasDressedShark(player?.inventory) ? (
            <View style={{ width: 60, height: 60, position: 'relative' }}>
              {/* Skin (or Alex's Classic) with no eyes, then the eyes layer */}
              {sharkBaseLayers(player?.inventory).map((source, index) => (
                <Image
                  key={`base-${index}`}
                  source={source}
                  // The eyes layer is an animated blink: pause it off-screen and
                  // under Reduce Motion, like the undressed shark_player.gif.
                  autoplay={playing && screenFocused && !reducedMotion}
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
              autoplay={playing && screenFocused && !reducedMotion}
              style={styles.sharkImage}
              contentFit="contain"
            />
          )}
        </Reanimated.View>
      </View>
  );

  const chromeOff = chromeHidden ? 1 : 0;
  const chromeStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.max(catchShown.value * 1.6, chromeOff)) }), [chromeOff]);

  return (
    <MapAliveProvider value={alive}>
    <View
      ref={rootRef}
      style={{
        position: 'relative',
        flex: 1,
      }}
      onLayout={event => {
        const size = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
        setViewSize(size);
        rootRef.current?.measureInWindow((_x, y) => { if (Number.isFinite(y)) setViewTop(y); });
      }}
    >
      {/* Map controls: hidden on the tap frame of a catch (UI thread), never over the viewfinder */}
      <Reanimated.View
        pointerEvents={chromeHidden ? 'none' : 'box-none'}
        style={[{
          position: 'absolute',
          top: controlsTop,
          right: 16,
          zIndex: 10,
          gap: 8,
        }, chromeStyle]}
        onLayout={event => {
          const { x, y, width, height } = event.nativeEvent.layout;
          setRail(prev => (prev && Math.abs(prev.x - x) < 1 && Math.abs(prev.y - y) < 1 && Math.abs(prev.height - height) < 1
            ? prev : { x, y, width, height }));
        }}
      >
        {/* Recenter: Alex's compass on a blue button; gold when you have panned away. */}
        <Pressable
          onPress={() => { if (isCatchShown()) return; haptic('tapLight'); recenterOnPlayer(); }}
          accessibilityRole="button"
          accessibilityLabel={focusedOnPlayer ? 'Following your shark' : 'Center the map on your shark'}
          hitSlop={6}
          style={({ pressed }) => [styles.recenter, !focusedOnPlayer && styles.recenterAway, pressed && styles.recenterPressed]}
        >
          <RecenterIcon away={!focusedOnPlayer} reducedMotion={reducedMotion} />
        </Pressable>
        {extraControls}
      </Reanimated.View>

      {/* Every marker inside the map (islands, finds, haunts) reads its placement from here. */}
      <DeclutterContext.Provider value={declutter?.store ?? null}>
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
          onUserPan?.();
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
        onRegionIsChanging={(feature) => {
          // While the map moves: held declutter passes (markers on screen stay put, art reaching the
          // HUD fades first), and the panned-away shark hides before iOS parks it in the corner.
          // Camera eases (following the walk, a tap-to-focus) get the same held passes, less often.
          noteCamera(Number(feature.properties?.zoomLevel), Number(feature.properties?.heading));
          const now = Date.now();
          if (now - lastMoveFeed.current < (feature.properties?.isUserInteraction ? 100 : 200)) return;
          lastMoveFeed.current = now;
          const [lng, lat] = feature.geometry?.coordinates ?? [];
          feedDeclutter({ latitude: Number(lat), longitude: Number(lng), zoom: Number(feature.properties?.zoomLevel),
            bearing: Number(feature.properties?.heading ?? 0) }, true);
          checkPlayer(feature.properties?.visibleBounds);
        }}
        onRegionDidChange={(feature) => {
          refreshDecorations();
          void projectGuide();
          const zoom = Number(feature.properties?.zoomLevel);
          noteCamera(zoom, Number(feature.properties?.heading));
          const [centerLng, centerLat] = feature.geometry?.coordinates ?? [];
          feedDeclutter({ latitude: Number(centerLat), longitude: Number(centerLng), zoom, bearing: Number(feature.properties?.heading ?? 0) });
          checkPlayer(feature.properties?.visibleBounds);
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
        {/* A background layer, not a GeoJSON fill: it covers the whole viewport, including tiles that
            have not drawn yet, so a camera jump never shows an untinted strip. */}
        <BackgroundLayer id="tps-sky-tint" style={{ backgroundColor: light.tint.color, backgroundOpacity: light.tint.opacity,
          backgroundColorTransition: { duration: 4000, delay: 0 }, backgroundOpacityTransition: { duration: 4000, delay: 0 } }} />
        {/* Fin-ister Nights night tint: always mounted (opacity 0 when off) so it never inserts mid-list. */}
        <FrightNightTint input={fright} />
        {/* After sunset, warm lamps glow along the walkways (static GL circles). */}
        {/* Always mounted (empty when off): a source mounting mid-list as lamps come and go
            crashes MapLibre's subview insert (-[MLRNMapView insertReactSubview:atIndex:]). */}
        {(
          <ShapeSource id="tps-lamps" shape={light.lamps >= 0.05 ? lampPoints : NO_FEATURES}>
            <CircleLayer id="tps-lamp-glow" style={{ circleColor: '#ffc95e', circleBlur: 1,
              circleRadius: ['interpolate', ['exponential', 1.6], ['zoom'], 16, 7, 17, 13, 19, 34],
              circleOpacity: 0.7 * light.lamps, circlePitchAlignment: 'map' }} />
            <CircleLayer id="tps-lamp-core" style={{ circleColor: '#fff3c4', circleBlur: 0.4,
              circleRadius: ['interpolate', ['exponential', 1.6], ['zoom'], 16, 1, 17, 1.6, 19, 3.6],
              circleOpacity: 0.9 * light.lamps }} />
          </ShapeSource>
        )}
        {/* Crowd haze: static GL heatmap (no per-frame cost), warm where the lines are long. */}
        {(
          <ShapeSource id="tps-crowd-haze" shape={crowdHaze ?? NO_FEATURES}>
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
        {(
          <ShapeSource id="tps-guide" shape={guideTarget && location && pathShown ? guideLine(location, guideTarget) : NO_FEATURES}>
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
        {/* Always mounted: with no location it parks hidden (opacity 0, no touch) instead of
            mounting mid-list when the first fix lands (MapLibre insertReactSubview crash class).
            Panned away, it glides between fixes instead of jumping. */}
        {/* Moves on the UI thread at the display rate and never changes layout (PlayerSharkMarker). */}
        <PlayerSharkMarker target={location ?? null} visible={!focusedOnPlayer && playerOnScreen} glide={!reducedMotion}
          zoomPpm={zoomPpm} bearingDeg={mapBearing} groundX={SHARK_GROUND.x} groundY={SHARK_GROUND.y}
          activeSlot={slotActive} shown={slotShown}
          renderArt={slot => (slot === 0 ? sharkArt(slot0Styles, slot0Live, !focusedOnPlayer) : sharkArt(slot1Styles, slot1Live, !focusedOnPlayer))} />
        {/* Fin-ister Nights markers (lanterns, reef critters, encounter): LAST, so the one-time
            mount appends instead of inserting mid-list, and a fixed set that never mounts or
            unmounts afterwards (MapLibre insertReactSubview crash). */}
        {fright && <FrightMapSources input={fright} zoom={cameraZoom} mapRef={mapViewRef} hud={rail} />}
      </MapView>
      </DeclutterContext.Provider>
      {/* Light, cloud shadows, gulls and fireflies: above the map, under the controls and the shark. */}
      {viewSize && <MapLightOverlay width={viewSize.width} height={viewSize.height} />}
      {viewSize && <MapSkyOverlay width={viewSize.width} height={viewSize.height} />}
      {fright && viewSize && <FrightMapLayer input={fright} width={viewSize.width} height={viewSize.height} zoom={cameraZoom} />}
      {arrow && <GuideArrow x={arrow.x} y={arrow.y} angle={arrow.angle} reducedMotion={reducedMotion} />}
      {debugOn && debugRects && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[...debugRects.entries()].map(([id, { body, tag }]) => <View key={id}>
          <View style={[styles.debugBody, { left: body.x, top: body.y, width: body.w, height: body.h }]} />
          {tag && <View style={[styles.debugTag, { left: tag.x, top: tag.y, width: tag.w, height: tag.h }]} />}
        </View>)}
      </View>}
      {/* Map data credit, in the game's own type instead of the stock (i) button. */}
      {/* Kept mounted; it fades with the controls on the catch's shared value and ignores taps under a catch. */}
      <Reanimated.View pointerEvents={chromeHidden ? 'none' : 'box-none'} style={[styles.attribution, chromeStyle]}>
        <Pressable accessibilityRole="link" accessibilityLabel="Map data from OpenStreetMap contributors"
          onPress={() => { if (isCatchShown()) return; void Linking.openURL('https://www.openstreetmap.org/copyright'); }}
          hitSlop={8}>
          <Text style={styles.attributionText}>© OpenStreetMap</Text>
        </Pressable>
      </Reanimated.View>
      {covered && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cover, {
          opacity: cover, transform: [{ scale: cover.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }] }]}>
          {/* The player's shark (drawn above) swims on the water until the map lands under it. */}
          <Image source={require('../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
      )}
      {location && (
        <View pointerEvents="none" style={[styles.centerOverlay, { opacity: focusedOnPlayer ? 1 : 0 }]}>
          <View style={styles.centerShark}>{sharkArt(overlayStyles, overlayLive, focusedOnPlayer)}</View>
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
  debugBody: { position: 'absolute', borderWidth: 1, borderColor: '#ff3df5', backgroundColor: 'rgba(255,61,245,0.08)' },
  debugTag: { position: 'absolute', borderWidth: 1, borderColor: '#3dffb0' },
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
  // Lift the 110 pt box so its ground point (SHARK_GROUND, the ring's middle) lands
  // exactly on the map center the camera is following.
  centerShark: { transform: [{ translateY: 55 - SHARK_GROUND.y }] },
  weakRing: { position: 'absolute', width: WEAK_RING_MAX_PT, height: WEAK_RING_MAX_PT,
    left: SHARK_GROUND.x - WEAK_RING_MAX_PT / 2, top: SHARK_GROUND.y - WEAK_RING_MAX_PT / 2 },
  weakFill: { ...StyleSheet.absoluteFillObject, opacity: 0.55 },
  weakRim: { ...StyleSheet.absoluteFillObject, margin: 14, borderRadius: WEAK_RING_MAX_PT / 2, borderWidth: 2.5,
    borderColor: 'rgba(170, 215, 255, 0.6)', backgroundColor: 'rgba(79, 149, 214, 0.08)' },
  sharkMarkerContainer: {
    width: 100,
    height: 110,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
  },
  // Player shark on the park map: a soft round shadow on the ground, not a
  // hard bar (each is the radial glow texture, tinted).
  outerGlowRing: {
    position: 'absolute',
    bottom: -6,
    width: 92,
    height: 34,
    opacity: 0.35,
  },
  groundRing: {
    position: 'absolute',
    bottom: -2,
    width: 70,
    height: 24,
    opacity: 0.55,
  },
  shadowDisc: {
    position: 'absolute',
    bottom: 3,
    width: 40,
    height: 14,
    opacity: 0.5,
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

type SharkMotion = {
  readonly idle: SharedValue<number>; readonly sway: SharedValue<number>; readonly glow: SharedValue<number>;
  readonly wake: SharedValue<number>; readonly stride: SharedValue<number>; readonly facing: SharedValue<number>;
  readonly mirrorOk: SharedValue<number>;
  readonly weak: SharedValue<number>; readonly weakAccuracy: SharedValue<number>;
};
type SharkStyles = ReturnType<typeof useSharkStyles>;

/**
 * The player shark's animated styles for one drawn copy. `live` is 1 while that copy is on
 * screen; at 0 every style returns a fixed value, so a hidden copy does no per-frame work.
 */
function useSharkStyles(live: SharedValue<number>, m: SharkMotion) {
  const shark = useAnimatedStyle(() => {
    if (live.value === 0) return { transform: [{ translateY: 0 }, { rotate: '0deg' }, { scale: 1 }, { scaleX: 1 }, { scaleY: 1 }] };
    const step = m.stride.value * m.wake.value;
    // The turn: never thinner than 35 % (a swim turn, not a card flip), a slight squash and a
    // lean into it. A shark wearing lettering keeps facing left and only leans.
    const f = m.facing.value;
    const mid = 1 - Math.abs(f);
    const sx = m.mirrorOk.value > 0 ? (f >= 0 ? 1 : -1) * Math.max(0.35, Math.abs(f)) : 1;
    const lean = (m.mirrorOk.value > 0 ? 7 * mid : 8 * (1 - f) / 2) * (f >= 0 ? -1 : 1);
    return {
      transform: [{ translateY: -8 * m.idle.value - 5 * step }, { rotate: `${3 * m.sway.value + 4 * (step - 0.5) * m.wake.value + lean}deg` },
        { scale: 1 + 0.04 * m.idle.value }, { scaleX: sx }, { scaleY: 1 - 0.06 * mid }],
    };
  });
  const shadow = useAnimatedStyle(() => {
    if (live.value === 0) return { transform: [{ scaleX: 1 }, { scaleY: 1 }] };
    return { transform: [{ scaleX: 1 - 0.15 * m.idle.value }, { scaleY: 1 - 0.15 * m.idle.value }] };
  });
  const glow = useAnimatedStyle(() => ({ opacity: live.value === 0 ? 0.5 : 0.3 + 0.4 * m.glow.value }));
  const weakRing = useAnimatedStyle(() => {
    if (live.value === 0 || m.weak.value === 0) return { opacity: 0, transform: [{ scale: WEAK_RING_MIN_PT / WEAK_RING_MAX_PT }] };
    // Graded by accuracy (not zoom): 40 m is a small faint ring, 150 m or worse a wide, stronger one.
    const k = Math.min(1, Math.max(0, (m.weakAccuracy.value - WEAK_RING_MIN_M) / (WEAK_RING_FULL_M - WEAK_RING_MIN_M)));
    const size = WEAK_RING_MIN_PT + (WEAK_RING_MAX_PT - WEAK_RING_MIN_PT) * k;
    return { opacity: m.weak.value * (0.45 + 0.25 * k + 0.2 * m.glow.value),
      transform: [{ scale: (size / WEAK_RING_MAX_PT) * (0.96 + 0.06 * m.glow.value) }] };
  });
  return { shark, shadow, glow, weakRing };
}
