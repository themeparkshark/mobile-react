import { openExternal } from '../services/external';
import { Image } from 'expo-image';
import { createContext, type MutableRefObject, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackgroundLayer, Camera, CircleLayer, HeatmapLayer, Images, LineLayer, MapView, ShapeSource, SymbolLayer, type CameraRef, type MapViewRef } from '@maplibre/maplibre-react-native';
import { edgeArrow, GUIDE_PATH_MS, guideLine } from './map/guide';
import { PlayerSharkMarker } from './map/PlayerSharkMarker';
import { courseDeg, facingFor, strideHalfMs, wakeTurn } from './map/playerMotion';
import { glideMeters, newFixCadence } from './map/glide';
import { useFollowCamera } from './map/useFollowCamera';
import FollowButton from './map/FollowButton';
import MapSharkLook from './map/MapSharkLook';
import { SharkSparkles } from './map/SharkSparkles';
import { TrailBoxBadge, type MapTrail } from './map/TrailBoxBadge';
import { CHEER_REPEAT_MS, nextFidget, FIDGET_GAP_MS, tapTrick, type SharkMood } from './map/sharkLife';
import { useFxClock, useFxKick } from '../fx/FxStage';
import { useWalkSense } from '../gamekit/motion/useWalkSense';
import { wornFx } from '../fx/FxLayers';
import type { FollowMode } from './map/cameraFollow';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { useOneTimeTip } from './help/HelpProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { Animated, Pressable, Text, View, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import Reanimated, { cancelAnimation, Easing as REasing, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { haptic } from '../gamekit/Haptics';
import { BRAND, GameIcon, SHADOW } from '../ui';
import { AuthContext } from '../context/AuthProvider';
import { HeadingContext, HeadingControlContext, LocationContext } from '../context/LocationProvider';
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
import { canMirrorShark, hasDressedShark } from '../helpers/wardrobe';
import { DeclutterContext } from './map/declutter/Placed';
import useMapDeclutter, { type MapDeclutterInput } from './map/declutter/useMapDeclutter';
import type { InsetRect, LayoutItem, Rect } from './map/declutter/solver';
import { isOffline, onConnectivityChange } from '../services/connectivity';
import { catchShown, isCatchShown } from '../screens/ExploreScreen/catchPresence';
import { MOTION_PROBE, MotionProbeFrames, probeCamera, probeCount } from '../dev/motionProbe';

type LatLng = { latitude: number; longitude: number };

/** Where a map coordinate is on screen, in window points (null when off the map or not ready). */
export type MapProjector = (latitude: number, longitude: number) => Promise<{ x: number; y: number } | null>;

/** Lets map pins ask about the rendered map (e.g. where the nearest water is). */
export const MapQueryContext = createContext<{
  readonly findWater: (latitude: number, longitude: number, margin?: number) => Promise<LatLng | null>;
} | null>(null);

// While following, the shark is drawn at screen center and the cartoon map
// eases under it (Pokemon GO style); panned away, it becomes a map marker.
// The top-right compass picks how the map turns: with you (default) or north
// up; panned away, it brings the map back to the shark (FollowButton).
// The camera itself is driven by useFollowCamera (no React render per tick).

/** The player's choice of map up (heading or north), kept on the device. */
const FOLLOW_MODE_KEY = 'tps_map_follow_mode_v1';
/** Zoom kept across a recenter: the follow zoom the player last chose, inside these bounds. */
const FOLLOW_ZOOM_MIN = 14;
const FOLLOW_ZOOM_MAX = 20;
const WHOOSH = require('../../assets/sounds/whoosh.mp3');
/** Walk detection for the map: walking after 2 steps, standing 0.9 s after the last step. */
const WALK_SENSE_MAP = { startSteps: 2, stopAfterMs: 900 } as const;
const SHARK_TAP_SOUND = require('../../assets/sounds/inventory_item_tap.mp3');

const FALLBACK_CENTER = { latitude: 34.1381, longitude: -118.3534 };
const FOLLOW_ZOOM = 17.6;

// Radial falloff texture: soft round shadows and light pools with no hard edge.
const GROUND_GLOW = require('../../assets/images/map/fx/glow.png');
/** The heading beam: a soft fan from the shark's ground point toward where the phone points. */
const HEADING_BEAM = require('../../assets/images/map/heading-beam.png');
const BEAM_PT = 176;
/**
 * The shark's ground point (the middle of its blue ground ring) inside its
 * 100 x 110 box: the player's location sits exactly here, on the map marker and
 * at screen center while following. The declutter footprint (declutterPlayer,
 * 52 x 60 above this point) already assumed it.
 */
const SHARK_GROUND = { x: 50, y: 100 } as const;
/**
 * The following shark's footprint for the declutter (from its ground point): the 60 pt art with
 * its idle bob, a hop, the fin and worn pieces on top (a hat, a jetpack). Cards and chips keep out.
 */
export const PLAYER_BODY = { x: -38, y: -96, w: 76, h: 102 } as const;
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

export default function Map({ children, onPress, focusCoordinate, controlsTop = 72, hintReady = false, sharkCheer = false, trail = null, onZoomChange, guideTarget, ambientPaused = false, ambientFrozen = false, crowdHaze = null, sunOverride, projector, snapshotter, extraControls, chromeHidden = false, fright = null, onUserPan, declutter = null }: {
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
  /** In-park marker declutter (src/components/map/declutter): footprints, insets and the placement store. */
  readonly declutter?: MapDeclutterInput | null;
  /** A full-screen moment owns the screen: hide the map buttons and the data credit (shown again after). */
  readonly chromeHidden?: boolean;
  /** Fin-ister Nights map takeover (src/components/map/fright); null is off. */
  readonly fright?: FrightMapInput | null;
  /** A finger started moving the map. */
  readonly onUserPan?: () => void;
  /** The screen says the player is free (no dialog, chest, lesson or game): the compass may show its one-time hint. */
  readonly hintReady?: boolean;
  /** Something to catch right here (a ride coin in range): the shark perks up and cheers now and then. */
  readonly sharkCheer?: boolean;
  /** Trail Boxes (steps stream): the box filling as you walk rides on the shark; it hops when one is ready. */
  readonly trail?: MapTrail | null;
}) {
  if (__DEV__) probeCount('mapRender');
  const { location, gpsSignal } = useContext(LocationContext);
  // Only the stable half of the compass context: a compass reading never re-renders the map.
  const { setHeadingEnabled, subscribeHeading } = useContext(HeadingControlContext);
  const { playSound } = useContext(SoundEffectContext);
  const { player } = useContext(AuthContext);
  const reducedMotion = useReducedGameMotion();
  // A map on a tab the player left stays mounted. Its compass, camera pushes
  // and idle loops would keep the GPU and sensors busy, so pause them off screen.
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    return () => setScreenFocused(false);
  }, []));
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);
  // The compass runs only while this map is on screen and the app is in front (the app keeps
  // location in the background for ride detection; the compass has no reason to).
  const compassOn = screenFocused && appActive;
  useEffect(() => {
    if (!compassOn) return;
    setHeadingEnabled(true);
    return () => setHeadingEnabled(false);
  }, [compassOn, setHeadingEnabled]);
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
  // Reactions on top of the idle loop: a hop (0..1), a land squash, a wiggle (degrees) and a twirl (scaleX, 1 is none).
  const hop = useSharedValue(0), squash = useSharedValue(0), wiggle = useSharedValue(0), twirl = useSharedValue(1);
  // The phone's turn speed (from the follow camera, below): the shark leans into the turn before the map swings.
  const turnLean = useSharedValue(0);
  const motion = { idle, sway, glow, wake, stride, facing, mirrorOk, weak, weakAccuracy, hop, squash, wiggle, twirl, turnLean };
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
  const lastFixAtRef = useRef(0);
  // The shark marker's fix-cadence estimate (PlayerSharkMarker, panned away).
  const cadenceRef = useRef(newFixCadence());
  const locationRef = useRef(location);
  locationRef.current = location;
  const cameraRef = useRef<CameraRef>(null);
  const followRef = useRef(true);
  // The follow camera: a short linear move about ten times a second while the shark swims or the
  // compass turns, nothing while both are still (map/useFollowCamera.ts, map/cameraFollow.ts).
  const cam = useFollowCamera({ cameraRef, followRef, reducedMotion });
  // No compass (some phones, a simulator): the map stays north up and the button says so.
  const [haveHeading, setHaveHeading] = useState(false);
  const haveHeadingRef = useRef(false);
  useEffect(() => subscribeHeading((deg, at) => {
    if (!haveHeadingRef.current) { haveHeadingRef.current = true; setHaveHeading(true); }
    cam.onHeading(deg, at);
  }), [subscribeHeading, cam.onHeading]); // eslint-disable-line react-hooks/exhaustive-deps
  // The lean reads the camera's turn speed on the UI thread (no JS per frame).
  useAnimatedReaction(() => cam.turn.value, v => { turnLean.value = v; });
  // The heading beam turns with the phone on the UI thread; it fades in once the compass reports.
  // One style per drawn copy: a hidden copy returns a fixed value, so only the visible beam turns.
  const useBeam = (live: SharedValue<number>) => useAnimatedStyle(() => (live.value === 0
    ? { opacity: 0, transform: [{ rotate: '0deg' }] }
    : { opacity: 0.8 * cam.headingKnown.value, transform: [{ rotate: `${cam.facing.value}deg` }] }));
  const overlayBeam = useBeam(overlayLive), slot0Beam = useBeam(slot0Live), slot1Beam = useBeam(slot1Live);
  // The camera loop rests while the map is off screen or the app is in the background.
  useEffect(() => { cam.setRunning(screenFocused && appActive); }, [screenFocused, appActive, cam.setRunning]); // eslint-disable-line react-hooks/exhaustive-deps
  // The step sensor: the shark sets off the moment you do and settles the moment you stop (the GPS
  // only reports every few metres). Accelerometer at 25 Hz, only while this map is on screen.
  useWalkSense({ active: compassOn && !!location, intervalMs: 40, config: WALK_SENSE_MAP,
    onWalkChange: walking => {
      cam.onWalk(walking);
      // Setting off: the waddle and wake start with your first steps, not at the next GPS fix.
      if (walking && !reducedMotion) { wake.value = withTiming(1, { duration: 250 }); runStride(1.2, 60_000); }
      if (!walking && !reducedMotion) {
        // Stopped: the wake and the waddle wind down with the shark, not at the next fix.
        if (strideStop.current) clearTimeout(strideStop.current);
        strideMs.current = 0; cancelAnimation(stride); stride.value = withTiming(0, { duration: 250 });
        wake.value = withTiming(0, { duration: 500 });
      }
    } });
  // Fin-ister layers place chips with the map's bearing (it used to be the compass, back when the map always turned with it).
  const frightBearing = useRef(createBearingStore()).current;

  useEffect(() => {
    if (!location) return;
    if (__DEV__) probeCount('fix');

    // The camera's path to this fix: from where the shark is, at walking pace (a jump for a re-seat).
    const glideDuration = cam.onFix({ latitude: location.latitude, longitude: location.longitude });
    if (!prevLocationRef.current) {
      prevLocationRef.current = { latitude: location.latitude, longitude: location.longitude };
      return;
    }
    const prev = prevLocationRef.current;
    const distMeters = glideMeters(prev, location);
    const arrived = Date.now();
    const previousFixAt = lastFixAtRef.current;
    lastFixAtRef.current = arrived;
    prevLocationRef.current = { latitude: location.latitude, longitude: location.longitude };
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
  const [decorations, setDecorations] = useState<GeoJSON.FeatureCollection>(NO_FEATURES);
  const [glints, setGlints] = useState<{ latitude: number; longitude: number; seed: number }[]>([]);
  const [lampPoints, setLampPoints] = useState<GeoJSON.FeatureCollection>(NO_FEATURES);
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
  const lastNoted = useRef({ zoom: NaN, bearing: NaN });
  const noteCamera = (zoom: number, bearing: number) => {
    // Called for every camera frame while the map moves: write only what changed.
    if (Number.isFinite(zoom) && ppmLat !== null && !(Math.abs(zoom - lastNoted.current.zoom) <= 0.002)) { lastNoted.current.zoom = zoom; zoomPpm.value = pointsPerMeter(zoom, ppmLat); }
    if (Number.isFinite(bearing) && !(Math.abs(bearing - lastNoted.current.bearing) <= 0.05)) { lastNoted.current.bearing = bearing; mapBearing.value = bearing; cam.noteFreeBearing(bearing); if (frightOn) frightBearing.set(bearing); }
  };
  useEffect(() => { if (ppmLat !== null) zoomPpm.value = pointsPerMeter(cameraZoom, ppmLat); }, [cameraZoom, ppmLat, zoomPpm]);
  // The right-rail controls, so fright haunt chips keep clear of them.
  const [rail, setRail] = useState<HudRect | null>(null);
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
  // How the map turns while following: with you (default) or north up. Kept on the device.
  const [followMode, setFollowMode] = useState<FollowMode>('heading');
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(FOLLOW_MODE_KEY).then(saved => {
      if (!live || (saved !== 'north' && saved !== 'heading')) return;
      setFollowMode(saved);
      cam.setMode(saved);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The zoom the player last chose while following; a recenter keeps it.
  const followZoomRef = useRef(FOLLOW_ZOOM);
  // A pinch that began while following keeps the button in its mode (no gold flash): see onRegionIsChanging.
  const [followHold, setFollowHold] = useState(false);
  const followHoldRef = useRef(false);
  followHoldRef.current = followHold;
  /** Zoom when a gesture began while following (NaN otherwise), to tell a pinch from a pan. */
  const gestureZoomRef = useRef(NaN);

  // Back to following the shark (the gold button, panned away).
  const recenterOnPlayer = () => {
    setFocusedOnPlayer(true);
    followRef.current = true;
    cam.recenter(followZoomRef.current);
  };
  const shownMode: FollowMode = haveHeading ? followMode : 'north';
  const [noCompassFlash, setNoCompassFlash] = useState(0);
  const toggleFollowMode = () => {
    if (!haveHeading) { setNoCompassFlash(n => n + 1); return; }
    const next: FollowMode = followMode === 'heading' ? 'north' : 'heading';
    setFollowMode(next);
    cam.setMode(next);
    void AsyncStorage.setItem(FOLLOW_MODE_KEY, next).catch(() => undefined);
  };
  const onFollowButton = () => {
    if (isCatchShown()) return;
    haptic(focusedOnPlayer ? 'hitSoft' : 'tapLight');
    if (!reducedMotion) playSound?.(WHOOSH, { volume: 0.28, rate: focusedOnPlayer ? 1.35 : 1.6 });
    if (focusedOnPlayer) toggleFollowMode(); else recenterOnPlayer();
  };

  // Declutter: the shark is an obstacle for chips (never for art you walk up to),
  // and the map's own button column is an inset no marker draws under.
  const declutterPlayer = useMemo<LayoutItem[]>(() => declutter && location ? [{ id: 'player', latitude: location.latitude,
    longitude: location.longitude, priority: 0, tagObstacleOnly: true, body: PLAYER_BODY }] : [],
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
    // The compass (and chest) column: a hard inset with a 6 pt gap (share 0: no art under a button).
    const out: InsetRect[] = [{ x: viewSize.width - 16 - 54 - 6, y: controlsTop - 6, w: 54 + 12, h: 54 + (hasExtraControls ? 62 : 0) + 12, share: 0 }];
    if (frightOn) out.push({ x: Math.round(viewSize.width * 0.66) - 44, y: Math.round(viewSize.height * 0.15) - 44, w: 88, h: 88, share: 0.2 });
    if (offline && viewTop !== null) out.push({ x: viewSize.width - 16 - 44 - 8, y: Math.round(windowHeight * 0.43) - viewTop - 8, w: 60, h: 60, share: 0.2 });
    return out;
  }, [!!declutter, viewSize?.width, viewSize?.height, controlsTop, hasExtraControls, frightOn, offline, viewTop, windowHeight]); // eslint-disable-line react-hooks/exhaustive-deps
  // Development overlay (EXPO_PUBLIC_DECLUTTER_DEBUG=1): every footprint and chip box the solver placed.
  const [debugRects, setDebugRects] = useState<Map<string, { body: Rect; tag: Rect | null; point?: { x: number; y: number } }> | null>(null);
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
  const sharkArt = (st: SharkStyles, live: SharedValue<number>, playing: boolean, animateLook = false) => (
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
        {/* Which way the phone points: a soft beam under the shark (UI thread, eased like the camera). */}
        <Reanimated.View pointerEvents="none" style={[styles.beam, live === overlayLive ? overlayBeam : live === slot0Live ? slot0Beam : slot1Beam]}>
          <Image source={HEADING_BEAM} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
        </Reanimated.View>
        {/* Player's avatar — bobs, tilts, breathes */}
        <Reanimated.View style={[{ width: 60, height: 60 }, st.shark]}>
          {hasDressedShark(lookInventory) ? (
            // The follow-view copy plays worn Secret pieces (their rigs); the marker copies draw rest frames.
            <MapSharkLook inventory={lookInventory} t={fxClock} kick={fxKick} animate={animateLook}
              playing={playing && screenFocused && !reducedMotion} />
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

  // ── The living shark (Dustin, Oct 8: "take the shark on the map to the next level") ──
  // Worn Secret pieces move on the follow-view shark, on one clock that runs only while it is on screen.
  // Development captures (EXPO_PUBLIC_DEV_MAP_LOOK=jetpack,propeller_hat): wear those Secret pieces on the map shark.
  const lookInventory = useMemo(() => (__DEV__ && process.env.EXPO_PUBLIC_DEV_MAP_LOOK
    ? require('../dev/devMapLook').devMapLook(player?.inventory, process.env.EXPO_PUBLIC_DEV_MAP_LOOK) : player?.inventory), [player?.inventory]);
  const fxWorn = useMemo(() => wornFx(lookInventory), [lookInventory]);
  const lifeOn = focusedOnPlayer && screenFocused && appActive && !reducedMotion && !ambientFrozen;
  const fxClock = useFxClock(lifeOn && fxWorn.rigs.length > 0, 0, 2);
  const fxKick = useFxKick();
  const sparkleBurst = useSharedValue(0);
  const lastReact = useRef(0);
  const tapCount = useRef(0);
  const react = useCallback((m: SharkMood) => {
    if (reducedMotion) return;
    // A lettered outfit never mirrors, so its look-around is a wiggle.
    const mood: SharkMood = m === 'look' && mirrorOk.value === 0 ? 'wiggle' : m;
    const now = Date.now();
    if (now - lastReact.current < 450) return;
    lastReact.current = now;
    const up = mood === 'tap' ? 1 : mood === 'cheer' ? 0.55 : mood === 'hop' ? 0.35 : 0;
    if (up > 0) {
      // Anticipation squash, the hop, a squash on landing.
      squash.value = withSequence(withTiming(0.8, { duration: 80 }), withTiming(0, { duration: 120 }), withDelay(up > 0.5 ? 260 : 170, withSequence(withTiming(0.7, { duration: 70 }), withSpring(0, { damping: 7, stiffness: 260 }))));
      hop.value = withDelay(80, withSequence(withTiming(up, { duration: up > 0.5 ? 200 : 150, easing: REasing.out(REasing.quad) }),
        withTiming(0, { duration: up > 0.5 ? 230 : 170, easing: REasing.in(REasing.quad) })));
    }
    // Taps take turns between three tricks, so the tenth tap still surprises (tapTrick in sharkLife.ts).
    const trick = mood === 'tap' ? tapTrick(tapCount.current++, mirrorOk.value > 0) : null;
    if (trick === 'twirl') {
      // A quick twirl in the air (a swim turn and back).
      twirl.value = withDelay(110, withSequence(withTiming(-1, { duration: 190 }), withTiming(1, { duration: 190 })));
    } else if (trick === 'flip') {
      // A full loop in the air, then a settle.
      wiggle.value = withSequence(withTiming(0, { duration: 90 }), withTiming(-360, { duration: 420, easing: REasing.inOut(REasing.quad) }),
        withTiming(0, { duration: 0 }));
    } else if (trick === 'bounce') {
      // A second, smaller hop right after the first.
      hop.value = withDelay(80, withSequence(withTiming(0.7, { duration: 170, easing: REasing.out(REasing.quad) }), withTiming(0, { duration: 170, easing: REasing.in(REasing.quad) }),
        withTiming(0.4, { duration: 130, easing: REasing.out(REasing.quad) }), withTiming(0, { duration: 140, easing: REasing.in(REasing.quad) })));
    }
    if (mood === 'wiggle' || trick === 'wiggle' || mood === 'cheer') {
      wiggle.value = withSequence(withTiming(-9, { duration: 90 }), withTiming(9, { duration: 120 }), withTiming(-6, { duration: 110 }), withSpring(0, { damping: 8, stiffness: 220 }));
    }
    if (mood === 'look') {
      // A look over the shoulder and back: a turn of the head the way a curious pet does.
      const back = facing.value;
      facing.value = withSequence(withTiming(-back, { duration: 240 }), withDelay(650, withTiming(back, { duration: 240 })));
    }
    if (mood === 'tap' || mood === 'cheer') sparkleBurst.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: mood === 'tap' ? 650 : 520, easing: REasing.out(REasing.quad) }), withTiming(0, { duration: 0 }));
    // Worn Secret pieces show off their moment on a tap (and now and then on their own).
    if ((mood === 'tap' || mood === 'show') && fxWorn.rigs.length > 0) fxKick.value = fxClock.value + 120;
  }, [reducedMotion, fxWorn]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSharkTap = () => {
    if (isCatchShown()) return;
    haptic('tapLight');
    playSound?.(SHARK_TAP_SOUND, { volume: 0.5, rate: 1.15 });
    react('tap');
  };
  // Idle life: every so often a standing shark looks around, hops or wiggles (and worn pieces show off).
  // A walking shark is busy swimming; a hidden one rests. Timers only, nothing per frame.
  useEffect(() => {
    if (!lifeOn) return;
    let timer: ReturnType<typeof setTimeout>;
    let n = 0;
    const next = () => {
      timer = setTimeout(() => {
        if (wake.value < 0.05) react(nextFidget(n++, fxWorn.rigs.length > 0));
        next();
      }, FIDGET_GAP_MS[0] + Math.random() * (FIDGET_GAP_MS[1] - FIDGET_GAP_MS[0]));
    };
    next();
    return () => clearTimeout(timer);
  }, [lifeOn, react, fxWorn]); // eslint-disable-line react-hooks/exhaustive-deps
  // A ride coin in range: the shark perks up and cheers every few seconds until you play it.
  useEffect(() => {
    if (!lifeOn || !sharkCheer) return;
    react('cheer');
    // One cheer when you arrive, then only now and then (a long line is not a pep rally).
    const timer = setInterval(() => react('cheer'), CHEER_REPEAT_MS);
    return () => clearInterval(timer);
  }, [lifeOn, sharkCheer, react]);

  // Development captures (EXPO_PUBLIC_DEV_MAP_TRAIL=gold:0.6): a walking box on the shark.
  const devTrail = useMemo<MapTrail | null>(() => {
    const raw = __DEV__ ? process.env.EXPO_PUBLIC_DEV_MAP_TRAIL : undefined;
    if (!raw) return null;
    const [tier, p] = raw.split(':');
    return { walking: true, tier: (tier === 'red' || tier === 'gold' ? tier : 'blue'), progress: Number(p) || 0.5, readyCount: 0 };
  }, []);
  // A Trail Box became ready: one happy hop with sparkles.
  const readySeen = useRef(trail?.readyCount ?? 0);
  useEffect(() => {
    const n = trail?.readyCount ?? 0;
    if (n > readySeen.current) react('cheer');
    readySeen.current = n;
  }, [trail?.readyCount, react]);

  // One-time hint on the compass, once the map is up and calm (useOneTimeTip: one tip at a time).
  const compassTip = useOneTimeTip('map_compass', hintReady && screenFocused && appActive && focusedOnPlayer && !covered && !chromeHidden);
  // Development captures (EXPO_PUBLIC_DEV_COMPASS_HINT=1): show the hint every launch.
  const [devHint, setDevHint] = useState(__DEV__ && process.env.EXPO_PUBLIC_DEV_COMPASS_HINT === '1');
  const compassHint = devHint ? { visible: !covered, dismiss: () => setDevHint(false) } : compassTip;
  const compassHintRef = useRef<(() => void) | null>(null);
  compassHintRef.current = compassHint.visible ? compassHint.dismiss : null;
  const chromeOff = chromeHidden ? 1 : 0;
  const chromeStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.max(catchShown.value * 1.6, chromeOff)) }), [chromeOff]);

  return (
    <MapAliveProvider value={alive}>
    {/* The Fin-ister layers read the map's bearing through the heading context (FrightBearing). */}
    <FrightBearing store={frightBearing}>
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
        {/* The compass: how the map turns (with you, or north up); panned away, back to the shark. */}
        <FollowButton state={focusedOnPlayer || followHold ? shownMode : 'away'} bearing={cam.bearing} onPress={onFollowButton}
          reducedMotion={reducedMotion} hint={compassHint.visible && haveHeading} onHintDone={compassHint.dismiss}
          noCompassFlash={noCompassFlash}
          awayArt={hasDressedShark(lookInventory) ? <View style={styles.awaySharkScale}><MapSharkLook inventory={lookInventory} t={fxClock} kick={fxKick} animate={false} playing={false} /></View> : undefined} />
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
        // Two-finger rotate only when panned away: while following, the compass button owns the bearing.
        rotateEnabled={!focusedOnPlayer && !followHold}
        pitchEnabled={false}
        regionWillChangeDebounceTime={0}
        onRegionWillChange={(feature) => {
          if (!feature.properties?.isUserInteraction) return;
          onUserPan?.();
          if (compassHintRef.current) compassHintRef.current();
          if (followRef.current) {
            gestureZoomRef.current = Number(feature.properties?.zoomLevel);
            // Until the gesture shows itself a pan, the button keeps its mode (a pinch is not "panned away").
            setFollowHold(true);
          }
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
        onDidFinishRenderingMapFully={() => { refreshDecorations(); revealMap(); cam.resync();
          void mapViewRef.current?.getZoom().then(zoom => {
            if (Number.isFinite(zoom)) { setCameraZoom(zoom); onZoomChange?.(zoom); }
          }).catch(() => undefined); }}
        onRegionIsChanging={(feature) => {
          // While the map moves: held declutter passes (markers on screen stay put, art reaching the
          // HUD fades first), and the panned-away shark hides before iOS parks it in the corner.
          // Camera eases (following the walk, a tap-to-focus) get the same held passes, less often.
          noteCamera(Number(feature.properties?.zoomLevel), Number(feature.properties?.heading));
          // A gesture that began while following: no zoom change yet and the map has slid = a pan.
          if (feature.properties?.isUserInteraction && Number.isFinite(gestureZoomRef.current) && followHoldRef.current) {
            const z = Number(feature.properties?.zoomLevel);
            const [gx, gy] = feature.geometry?.coordinates ?? [];
            const loc = locationRef.current;
            if (loc && Math.abs(z - gestureZoomRef.current) < 0.02
              && glideMeters(loc, { latitude: Number(gy), longitude: Number(gx) }) * pointsPerMeter(z, loc.latitude) > 14) setFollowHold(false);
          }
          if (__DEV__ && MOTION_PROBE) { const [cx, cy] = feature.geometry?.coordinates ?? []; probeCamera(Number(feature.properties?.heading), Number(cx), Number(cy), Number(feature.properties?.zoomLevel)); }
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
          if (followRef.current && Number.isFinite(zoom)) followZoomRef.current = Math.min(FOLLOW_ZOOM_MAX, Math.max(FOLLOW_ZOOM_MIN, zoom));
          // A pinch or a tap that left the shark centered (within ~8 m) goes back
          // to following; a real pan stays put until the recenter button.
          if (!feature.properties?.isUserInteraction || followRef.current || !location) return;
          const startZoom = gestureZoomRef.current;
          gestureZoomRef.current = NaN;
          setFollowHold(false);
          // The zoom a player pinched to is the zoom a recenter comes back to, even if the pinch also slid the map.
          if (Number.isFinite(startZoom) && Math.abs(zoom - startZoom) >= 0.12) followZoomRef.current = Math.min(FOLLOW_ZOOM_MAX, Math.max(FOLLOW_ZOOM_MIN, zoom));
          const [lng, lat] = feature.geometry.coordinates;
          if (Math.abs(lat - location.latitude) < 0.00007 && Math.abs(lng - location.longitude) < 0.00007) {
            followRef.current = true;
            setFocusedOnPlayer(true);
            return;
          }
          // A pinch that began while following (the zoom changed and the shark is still near the middle):
          // keep the new zoom and slide back onto the shark, the way Pokemon GO zooms about your avatar.
          const bounds = feature.properties?.visibleBounds as number[][] | undefined;
          if (Number.isFinite(startZoom) && Math.abs(zoom - startZoom) >= 0.12 && pinchKeepsFollow(location, bounds)) {
            followRef.current = true;
            setFocusedOnPlayer(true);
            followZoomRef.current = Math.min(FOLLOW_ZOOM_MAX, Math.max(FOLLOW_ZOOM_MIN, zoom));
            cam.recenter(followZoomRef.current);
          }
        }}
        onPress={() => {
          // Any tap on the map closes the compass hint.
          if (compassHint.visible) compassHint.dismiss();
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
          activeSlot={slotActive} shown={slotShown} cadence={cadenceRef.current}
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
        {[...debugRects.entries()].map(([id, { body, tag, point }]) => <View key={id}>
          {point && <View style={[styles.debugPoint, { left: point.x - 3, top: point.y - 3 }]} />}
          <View style={[styles.debugBody, { left: body.x, top: body.y, width: body.w, height: body.h }]}>
            <Text style={styles.debugLabel} numberOfLines={2}>{id}</Text>
          </View>
          {tag && <View style={[styles.debugTag, { left: tag.x, top: tag.y, width: tag.w, height: tag.h }]} />}
        </View>)}
      </View>}
      {/* Map data credit, in the game's own type instead of the stock (i) button. */}
      {/* Kept mounted; it fades with the controls on the catch's shared value and ignores taps under a catch. */}
      <Reanimated.View pointerEvents={chromeHidden ? 'none' : 'box-none'} style={[styles.attribution, chromeStyle]}>
        <Pressable accessibilityRole="link" accessibilityLabel="Map data from OpenStreetMap contributors"
          onPress={() => { if (isCatchShown()) return; void openExternal('https://www.openstreetmap.org/copyright'); }}
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
      {__DEV__ && MOTION_PROBE && <MotionProbeFrames />}
      {location && (
        <View pointerEvents={focusedOnPlayer ? 'box-none' : 'none'} style={[styles.centerOverlay, { opacity: focusedOnPlayer ? 1 : 0 }]}>
          <View style={styles.centerShark} pointerEvents="box-none">
            {sharkArt(overlayStyles, overlayLive, focusedOnPlayer, true)}
            <SharkSparkles burst={sparkleBurst} />
            <TrailBoxBadge trail={trail ?? devTrail} live={lifeOn} />
            {/* Tap your shark: it hops, twirls and shows off what it is wearing. */}
            <Pressable style={styles.sharkTap} onPress={onSharkTap} disabled={!focusedOnPlayer}
              accessibilityRole="button" accessibilityLabel="Your shark. Tap to say hi." />
          </View>
        </View>
      )}
    </View>
    </FrightBearing>
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

/**
 * After a pinch that started while following: the shark's spot is still inside the middle
 * 60 % of the view (the visible bounds, [[east, north], [west, south]]), so it was a zoom, not a pan.
 */
export function pinchKeepsFollow(loc: { latitude: number; longitude: number }, bounds: number[][] | undefined): boolean {
  if (!Array.isArray(bounds) || bounds.length < 2) return false;
  const [[east, north], [west, south]] = bounds;
  const fy = (north - loc.latitude) / (north - south);
  const fx = (loc.longitude - west) / (east - west);
  return Number.isFinite(fx) && Number.isFinite(fy) && fx > 0.2 && fx < 0.8 && fy > 0.2 && fy < 0.8;
}

/** A coarse copy of the map's bearing (2 degree steps, at most 3 times a second) for layers that place chips by it. */
function createBearingStore() {
  let value = 0, sent = 0, at = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(v: number) => void>();
  const flush = () => { timer = null; at = Date.now(); sent = value; listeners.forEach(l => l(value)); };
  return {
    set(deg: number) {
      const q = Math.round((((deg % 360) + 360) % 360) / 2) * 2 % 360;
      if (q === value) return;
      value = q;
      if (timer || q === sent) return;
      timer = setTimeout(flush, Math.max(0, at + 330 - Date.now()));
    },
    get: () => sent,
    subscribe(l: (v: number) => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}
type BearingStore = ReturnType<typeof createBearingStore>;

/** Gives the Fin-ister layers the map's bearing through the heading context they read. */
function FrightBearing({ store, children }: { readonly store: BearingStore; readonly children: ReactNode }) {
  const control = useContext(HeadingControlContext);
  const [bearing, setBearing] = useState(store.get);
  useEffect(() => store.subscribe(setBearing), [store]);
  const value = useMemo(() => ({ ...control, heading: bearing, headingEnabled: true }), [control, bearing]);
  return <HeadingContext.Provider value={value}>{children}</HeadingContext.Provider>;
}

const styles = StyleSheet.create({
  debugBody: { position: 'absolute', borderWidth: 1, borderColor: '#ff3df5', backgroundColor: 'rgba(255,61,245,0.08)' },
  debugTag: { position: 'absolute', borderWidth: 1, borderColor: '#3dffb0' },
  debugPoint: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#00e5ff' },
  debugLabel: { fontSize: 8, lineHeight: 9, color: '#ffffff', backgroundColor: 'rgba(160,0,150,0.8)', alignSelf: 'flex-start', paddingHorizontal: 1 },
  guideArrow: { position: 'absolute', left: 0, top: 0, width: 48, height: 48, zIndex: 9 },
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
  // The player's shark on the panned-away button (MapSharkLook draws 60 pt; the button shows 44).
  awaySharkScale: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 44 / 60 }] },
  // The shark's body in its 100 x 110 box (the 60 pt art sits on the ground point).
  sharkTap: { position: 'absolute', left: 18, top: 28, width: 64, height: 76 },
  // Centered on the ground point (SHARK_GROUND), so it turns about where you stand.
  beam: { position: 'absolute', width: BEAM_PT, height: BEAM_PT, left: SHARK_GROUND.x - BEAM_PT / 2, top: SHARK_GROUND.y - BEAM_PT / 2 },
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
  readonly hop: SharedValue<number>; readonly squash: SharedValue<number>; readonly wiggle: SharedValue<number>; readonly twirl: SharedValue<number>;
  readonly turnLean: SharedValue<number>;
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
    // A lettered outfit cannot mirror: it holds still facing left (leaning toward the walk read as a moonwalk).
    const lean = m.mirrorOk.value > 0 ? 7 * mid * (f >= 0 ? -1 : 1) : 0;
    // Reactions: a hop up with a squash on the way down and on landing, a wiggle, a twirl.
    const sq = m.squash.value;
    return {
      transform: [{ translateY: -8 * m.idle.value - 5 * step - 30 * m.hop.value + 4 * sq },
        { rotate: `${3 * m.sway.value + 4 * (step - 0.5) * m.wake.value + lean + m.wiggle.value + Math.max(-7, Math.min(7, 0.06 * m.turnLean.value))}deg` },
        { scale: 1 + 0.04 * m.idle.value + 0.06 * m.hop.value }, { scaleX: sx * m.twirl.value * (1 + 0.12 * sq) }, { scaleY: (1 - 0.06 * mid) * (1 - 0.14 * sq) }],
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
