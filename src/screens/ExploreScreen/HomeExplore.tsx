import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import dayjs from 'dayjs';
import { useFocusEffect } from '@react-navigation/native';
import isBetween from 'dayjs/plugin/isBetween';
import Map, { pointsPerMeter, type MapProjector } from '../../components/Map';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { PrepItemType } from '../../models/prep-item-type';
import getPrepItems, { getCachedPrepItems } from '../../api/endpoints/me/prep-items';
import getCurrentPrepItem from '../../api/endpoints/me/prep-items/current';
import HomeLive from '../../components/home/HomeLive';
import HomeFindMarker from './HomeFindMarker';
import RadialStatsMenu from '../../components/RadialStatsMenu';
import QuickAccessMenu from '../../components/QuickAccessMenu';
import { useMenuCardFade } from './menuCardFade';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { shouldThrottleHomeRequest } from './homeRefresh';
import { isInPickupRange } from './homeFindCopy';
import HomeIntro, { useHomeIntroSeen } from './HomeIntro';
import HomeHuntChip, { chipWidthFor, type HuntChipMessage } from './HomeHuntChip';
import HomeHudChips, { type ParkStoryChip } from './HomeHudChips';
import HomeCatchMoment, { type CatchRequest, type HomeCatchHandle } from './HomeCatchMoment';
import { pickupFix } from './homeCatch';
import { rideSpec } from './ridePhoto';
import { preloadRidePhoto } from './ridePhoto/rideAssets';
import { useCatchOpen, catchShown } from './catchPresence';
import FindEdgeArrows, { type EdgeFind } from './FindEdgeArrows';
import { bannerCovers, clusterFinds, edgeArrowPlacement, findFootprint, hudRowTop, peekBottom, sharkFootprint, type Rect } from './findEdges';
import type { FingerSide } from './PrepItem';
import { mapStatusLine, peekLine, screenBearing } from './findPresentation';
import { nearestFind } from './nearestFind';
import { catchSound } from './ridePhoto/catchAudio';
import { queueHaptic } from '../../gamekit/Haptics';
import type { RedeemPrepItemResponseType } from '../../models/redeem-prep-item-response-type';
import * as RootNavigation from '../../RootNavigation';
import { showToast } from '../../utils/toast';
import { homeHuntEnabled, loadHomeHuntWeek } from '../LeaderboardsScreen/homeHuntWeekCache';
import { SAFETY_LINE, huntRankLine, shouldShowSafetyLine } from './homeHuntMap';
import { getHomeHuntRankLine, setHomeHuntRankLine, subscribeHomeHuntRankLine } from './homeHuntRankStore';

// ── Layout ───────────────────────────────────────────────────────────
// Home Hunt v3: the map is the screen. Top row: the live bar (only for a live
// boss, or the team race when the Home Hunt board is on). Bottom slot, above
// the menu and shark buttons (bottom 100, 76 tall): a status card only while
// there are no finds, otherwise at most one slim chip, and the catch badge.
const EDGE = 16;
const TOP = 12;
const LIVE_BAR_ROW = 58; // bar (50) + gap
const BOTTOM_SLOT = 100 + 76 + 14;
/** A tapped find's one-line peek stays this long, then leaves on its own. */
const PEEK_TTL_MS = 5000;
const noop = () => undefined;



// ── Throttle thresholds ──────────────────────────────────────────────
const LOAD_MIN_DISTANCE_M = 15; // meters moved before re-fetching prep items
const LOAD_MIN_INTERVAL_MS = 10_000; // minimum 10s between API calls
const NEARBY_MIN_DISTANCE_M = 5; // meters for pickup detection
const NEARBY_MIN_INTERVAL_MS = 3_000; // 3s between nearby checks
// Foreground-only check so sunset or verified rain can reveal a gated find
// while the guest is stationary; the backend still controls spawn cadence.
const LOAD_MAX_IDLE_MS = 2 * 60_000;
const NEARBY_MAX_IDLE_MS = 15_000;
const ERROR_RETRY_MS = 30_000;

/** Haversine distance in meters */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

dayjs.extend(isBetween);

// The first rare or better find on the map says the safety line once per app session.
let safetyLineShown = false;



interface Props {
  /**
   * A find to catch. `auto` is the server's nearby check: only the tutorial
   * takes it (Finn's first find); otherwise the find just glows on the map
   * until the guest taps it.
   */
  onPrepItemNearby: (prepItem: PrepItemType, pivotId: number, source?: 'tap' | 'auto') => void;
  /** The find the parent cleared for a catch (in range, no tutorial). Plays the catch moment. */
  catching?: { readonly item: PrepItemType; readonly pivotId: number } | null;
  onCatchCollected?: (data: RedeemPrepItemResponseType['data']) => void;
  onCatchUnavailable?: () => void;
  /** The catch moment finished (caught or not); the parent closes the find. */
  onCatchDone?: (caught: boolean) => void;
  refreshVersion: number;
  homeLocationConfirmed: boolean;
  /** The screen's overlay queue allows the first-time intro right now. */
  introAllowed?: boolean;
  /**
   * The intro could show if no find were open. While it is unseen and eligible,
   * finds do not auto-open, so a first-time player reads how finds work before
   * the first find pops up (the find used to win the race and the intro waited).
   */
  introEligible?: boolean;
  onIntroOpenChange?: (open: boolean) => void;
  /** The daily chest button, under the recenter button while today's chest is unclaimed. */
  chestButton?: ReactNode;
  /** The park story, as a small chip in the top HUD row. */
  parkStory?: ParkStoryChip | null;
  /**
   * How to Play's "Let's go!" sends `highlightNearestFind` (a timestamp) with
   * Explore: each new value glides the camera to the nearest find once.
   */
  highlightNearestFind?: number | null;
}

/**
 * Home exploration view - shows prep items on map when not at a park.
 * This is the at-home gameplay experience.
 */
export default function HomeExplore({ onPrepItemNearby, catching = null, onCatchCollected, onCatchUnavailable,
  onCatchDone, refreshVersion, homeLocationConfirmed,
  introAllowed = false, introEligible = false, onIntroOpenChange, chestButton, highlightNearestFind = null, parkStory = null }: Props) {
  const [prepItems, setPrepItems] = useState<PrepItemType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { location, latestLocationSampleRef } = useContext(LocationContext);
  const { player, refreshPlayer } = useContext(AuthContext);

  // ── Throttle refs ────────────────────────────────────────────────
  const lastFetchLocation = useRef<{ lat: number; lng: number } | null>(null);
  const lastFetchTime = useRef<number>(0);
  const lastNearbyLocation = useRef<{ lat: number; lng: number } | null>(null);
  const lastNearbyTime = useRef<number>(0);
  const firstLocationLoad = useRef(true);
  const loadInFlight = useRef(false);
  const forceReloadAfterFlight = useRef(false);
  const loadPrepItemsRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const cacheReadOnce = useRef(false);
  const firstScreenFocus = useRef(true);
  const screenFocused = useRef(false);
  const [rankLine, setRankLine] = useState<string | null>(getHomeHuntRankLine());
  const [liveBar, setLiveBar] = useState<'raid' | 'teams' | null>(null);
  const [introSeen, markIntroSeen] = useHomeIntroSeen(player?.id);
  const projector = useRef<MapProjector | null>(null);
  // The map has rendered and settled once: only then may a native map view be
  // asked where a point is (MapLibre raises "Invalid react tag" before that).
  const [mapSettled, setMapSettled] = useState(0);
  const onMapSettled = useCallback(() => { setMapSettled(version => version + 1); }, []);
  const containerRef = useRef<View>(null);
  const [chip, setChip] = useState<HuntChipMessage | null>(null);
  const [footprints, setFootprints] = useState<readonly Rect[]>([]);
  const [hudWidth, setHudWidth] = useState(0);
  // A finger moving the map means "done with that line": the peek leaves (status lines stay).
  const onUserPan = useCallback(() => setChip(null), []);
  const dismissChip = useCallback(() => setChip(null), []);
  // The free-Ticket countdown from the finds response (a small top-HUD chip, never a card).
  const [ticket, setTicket] = useState<{ until: number | null; capped: boolean }>({ until: null, capped: false });
  const takeStats = useCallback((stats: { ticket_guarantee_in?: number; home_tickets_capped?: boolean } | null | undefined) => {
    const until = stats?.ticket_guarantee_in ?? null, capped = stats?.home_tickets_capped === true;
    setTicket(current => (current.until === until && current.capped === capped ? current : { until, capped }));
  }, []);
  const showTicketLine = useCallback((line: string) => setChip({ key: `ticket-${Date.now()}`, text: line, ttlMs: PEEK_TTL_MS }), []);
  const [catchRequest, setCatchRequest] = useState<CatchRequest | null>(null);
  const catchRef = useRef<HomeCatchHandle>(null);
  const snapshotter = useRef<(() => Promise<string | null>) | null>(null);
  const catchOpen = useCatchOpen();
  // Floating cards leave (opacity 0, no touches) while the quick menu is open, and on a catch's tap frame.
  const cardFade = useMenuCardFade();
  // Menus, edge arrows and chips leave on the tap frame (UI thread), never showing through the viewfinder's fade.
  const chromeFade = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - catchShown.value * 1.6) }));
  // Where each find is on screen, re-measured when the map settles, so a tap opens the catch from the find on that frame.
  const findPoints = useRef(new globalThis.Map<number, { x: number; y: number }>());
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [edgeFinds, setEdgeFinds] = useState<EdgeFind[]>([]);
  const [findSides, setFindSides] = useState<Record<number, FingerSide>>({});
  const [cascadeOn, setCascadeOn] = useState(false);
  const [findGroups, setFindGroups] = useState<ReturnType<typeof clusterFinds>>({ counts: {}, hidden: [], chromeless: [] });
  // The catch reads GPS through a ref, so it never re-renders on a fix.
  const fixRef = useRef({ latestLocationSampleRef, location });
  fixRef.current = { latestLocationSampleRef, location };
  const getFix = useCallback(() => pickupFix(fixRef.current.latestLocationSampleRef.current, fixRef.current.location, Date.now()), []);
  // One still of the map, taken when a Ride Photo find comes in range (never on the tap), for the catch's open and close edges.
  const [mapStill, setMapStill] = useState<string | null>(null);
  const catchAttempt = useRef(0);
  // One "a find is close" ping per find, so standing still never repeats it.
  const pingedPivots = useRef(new Set<number>());
  const introOpen = introSeen === false && introAllowed && homeLocationConfirmed;
  useEffect(() => { onIntroOpenChange?.(introOpen); }, [introOpen, onIntroOpenChange]);

  // Home Hunt rank line: only when the server flag is on and sends a line.
  useEffect(() => subscribeHomeHuntRankLine(setRankLine), []);
  useEffect(() => {
    if (!player?.id) return;
    let live = true;
    void loadHomeHuntWeek(player.id).then(week => {
      if (live && homeHuntEnabled(week)) setHomeHuntRankLine(huntRankLine(week));
    });
    return () => { live = false; };
  }, [player?.id]);

  /** Check whether enough distance/time has elapsed to allow a fetch */
  const shouldThrottle = (
    lat: number,
    lng: number,
    lastLoc: React.MutableRefObject<{ lat: number; lng: number } | null>,
    lastTime: React.MutableRefObject<number>,
    minDistM: number,
    minIntervalMs: number,
    maxIdleMs: number
  ): boolean => {
    return shouldThrottleHomeRequest({ lat, lng }, lastLoc.current, lastTime.current,
      Date.now(), minDistM, minIntervalMs, maxIdleMs);
  };

  /** Record that a fetch just happened */
  const recordFetch = (
    lat: number,
    lng: number,
    locRef: React.MutableRefObject<{ lat: number; lng: number } | null>,
    timeRef: React.MutableRefObject<number>
  ) => {
    locRef.current = { lat, lng };
    timeRef.current = Date.now();
  };

  // Load prep items with cache + throttle
  const loadPrepItems = useCallback(
    async (force = false) => {
      if (!homeLocationConfirmed || !player?.id || location?.latitude == null || location?.longitude == null) return;
      if (loadInFlight.current) {
        if (force) forceReloadAfterFlight.current = true;
        return;
      }

      const lat = location.latitude;
      const lng = location.longitude;
      const playerId = player.id;

      // Throttle unless forced (e.g. pull-to-refresh)
      if (!force && (loadError
        ? Date.now() - lastFetchTime.current < ERROR_RETRY_MS
        : shouldThrottle(lat, lng, lastFetchLocation, lastFetchTime,
            LOAD_MIN_DISTANCE_M, LOAD_MIN_INTERVAL_MS, LOAD_MAX_IDLE_MS))) {
        return;
      }

      loadInFlight.current = true;
      lastFetchTime.current = Date.now();

      // Show cached data instantly on first load
      if (!cacheReadOnce.current) {
        cacheReadOnce.current = true;
        const cached = await getCachedPrepItems(lat, lng, playerId);
        if (cached) {
          setPrepItems(Array.isArray(cached.data) ? cached.data : []);
          takeStats(cached.player_stats);
          setIsLoading(false);
        }
      }

      try {
        const response = await getPrepItems(lat, lng, playerId);
        setPrepItems(Array.isArray(response.data) ? response.data : []);
        takeStats(response.player_stats);
        setLoadError(false);
        recordFetch(lat, lng, lastFetchLocation, lastFetchTime);

        // Also refresh player data to sync currencies
        void refreshPlayer().catch(() => undefined);
      } catch (error) {
        setLoadError(true);
        if (__DEV__) console.log('Prep items load error:', error instanceof Error ? error.message : String(error));
      } finally {
        loadInFlight.current = false;
        setIsLoading(false);
        if (forceReloadAfterFlight.current) {
          forceReloadAfterFlight.current = false;
          setTimeout(() => void loadPrepItemsRef.current(true), 0);
        }
      }
    },
    [homeLocationConfirmed, location?.latitude, location?.longitude, player?.id, refreshPlayer, loadError]
  );
  loadPrepItemsRef.current = loadPrepItems;
  const handlePrepItemExpire = useCallback(() => {
    void loadPrepItemsRef.current(true);
  }, []);

  // Location changes use the distance/time throttle. Only the first location
  // and an explicit collection refresh bypass it.
  useEffect(() => {
    if (!homeLocationConfirmed || location?.latitude == null || location?.longitude == null) return;
    void loadPrepItems(firstLocationLoad.current);
    firstLocationLoad.current = false;
  }, [loadPrepItems]);

  // GPS can be stationary while a spawn batch expires. Refresh only while the
  // screen is active, and recheck once when the app returns to foreground.
  useEffect(() => {
    const check = () => {
      if (screenFocused.current && AppState.currentState === 'active') void loadPrepItemsRef.current();
    };
    const interval = setInterval(check, 60_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') check();
    });
    return () => { clearInterval(interval); subscription.remove(); };
  }, []);

  useEffect(() => {
    if (refreshVersion > 0) void loadPrepItems(true);
  }, [refreshVersion]);

  // Returning from Collections may change what spawns. Refresh immediately
  // even when GPS has not moved and the current spawn batch has not expired.
  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    if (firstScreenFocus.current) {
      firstScreenFocus.current = false;
    } else {
      void loadPrepItemsRef.current(true);
    }
    return () => { screenFocused.current = false; };
  }, []));

  // Check for nearby prep items (with tighter throttle for pickup detection)
  useEffect(() => {
    if (!homeLocationConfirmed || loadError || location?.latitude == null || location?.longitude == null || prepItems.length === 0) {
      return;
    }

    const lat = location.latitude;
    const lng = location.longitude;

    // Throttle nearby checks (5m / 3s)
    if (shouldThrottle(lat, lng, lastNearbyLocation, lastNearbyTime,
      NEARBY_MIN_DISTANCE_M, NEARBY_MIN_INTERVAL_MS, NEARBY_MAX_IDLE_MS)) {
      return;
    }

    // Never auto-open a find for a map that is off screen or backgrounded.
    if (!screenFocused.current || AppState.currentState !== 'active') return;
    // The first-time intro goes first; this re-runs once it is seen.
    if (introSeen !== true && introEligible) return;

    const checkNearby = async () => {
      try {
        recordFetch(lat, lng, lastNearbyLocation, lastNearbyTime);
        const nearbyItem = await getCurrentPrepItem(lat, lng);

        if (active && nearbyItem?.pivot_id) {
          // Finn's first find still opens on its own; otherwise the find glows
          // and hops on the map and one slim chip says so, once per find.
          onPrepItemNearby(nearbyItem, nearbyItem.pivot_id, 'auto');
          if (!pingedPivots.current.has(nearbyItem.pivot_id)) {
            pingedPivots.current.add(nearbyItem.pivot_id);
            queueHaptic('tickSelection', 1);
            setChip(current => current ?? { key: `near-${nearbyItem.pivot_id}`, text: 'A find is close! Tap it to catch.' });
          }
        }
      } catch (error) {
        // Silently handle - will retry on next location update
        if (__DEV__ && active) console.log('Nearby check error:', error instanceof Error ? error.message : String(error));
      }
    };

    let active = true;
    checkNearby();
    return () => { active = false; };
  }, [homeLocationConfirmed, location?.latitude, location?.longitude, prepItems, onPrepItemNearby, loadError,
    introSeen, introEligible]);

  // Filter to only show active items
  const activePrepItems = prepItems.filter((item) => {
    if (!item.active_from || !item.active_to) return true;
    return dayjs().isBetween(dayjs(item.active_from), dayjs(item.active_to));
  });
  const lat = location?.latitude;
  const lng = location?.longitude;
  const placed = useMemo(() => activePrepItems.map(item => {
    const distance = item.latitude != null && item.longitude != null && lat != null && lng != null
      ? calculateDistance(lat, lng, item.latitude, item.longitude) : null;
    return { item, distance, inRange: !loadError && isInPickupRange(distance) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [prepItems, lat, lng, loadError]);
  // How to Play hand-off: glide to the nearest find once per request (waits for the first finds to load).
  const [findFocus, setFindFocus] = useState<{ latitude: number; longitude: number; requestId: number } | null>(null);
  const handledHighlight = useRef<number | null>(null);
  const [pulse, setPulse] = useState<{ pivot: number; key: number } | null>(null);
  useEffect(() => {
    if (highlightNearestFind == null || handledHighlight.current === highlightNearestFind || !homeLocationConfirmed) return;
    const nearest = nearestFind(placed);
    if (!nearest) return;
    handledHighlight.current = highlightNearestFind;
    setFindFocus({ latitude: nearest.latitude, longitude: nearest.longitude, requestId: highlightNearestFind });
    queueHaptic('tickSelection', 1);
    // ...and the find itself pulses once with a soft sound as the camera arrives (no motion under Reduce Motion).
    const target = placed.find(entry => entry.item.latitude === nearest.latitude && entry.item.longitude === nearest.longitude);
    if (target?.item.pivot_id != null) {
      const pivot = target.item.pivot_id;
      const key = highlightNearestFind;
      setTimeout(() => { setPulse({ pivot, key }); catchSound('tick', { volume: 0.55, pitch: 7 }); }, 650);
    }
  }, [highlightNearestFind, placed, homeLocationConfirmed]);
  useEffect(() => {
    if (safetyLineShown || !homeLocationConfirmed) return;
    const top = activePrepItems.reduce((best, item) => Math.max(best, item.rarity ?? 0), 0);
    if (shouldShowSafetyLine(top, safetyLineShown)) {
      safetyLineShown = true;
      showToast(SAFETY_LINE, 'info', 6000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepItems, homeLocationConfirmed]);

  /** A map coordinate in this view's own points (the catch layer's space), or null. */
  const toLocal = useCallback(async (latitude: number, longitude: number) => {
    const project = projector.current;
    // Only once the map has settled: asking an unmounted native map view for a point raises "Invalid react tag".
    if (!project || mapSettled === 0) return null;
    const [point, origin] = await Promise.all([
      project(latitude, longitude).catch(() => null),
      new Promise<{ x: number; y: number } | null>(resolve => {
        if (!containerRef.current) { resolve(null); return; }
        containerRef.current.measureInWindow((x, y) => resolve(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null));
      }),
    ]);
    return point && origin ? { x: point.x - origin.x, y: point.y - origin.y } : null;
  }, [mapSettled]);

  // Out of range: a tiny nudge with an arrow toward the find, gone on its own.
  // Reads GPS through a ref, so it (and every marker's tap handler) stays stable across fixes.
  const nudge = useCallback(async (item: PrepItemType, distance: number | null) => {
    queueHaptic('tapLight', 1);
    const key = `far-${item.pivot_id ?? item.id}-${Date.now()}`;
    setChip({ key, text: peekLine(item.name, distance), ttlMs: PEEK_TTL_MS });
    const here = fixRef.current.location;
    if (here?.latitude == null || here?.longitude == null || item.latitude == null || item.longitude == null) return;
    const [shark, find] = await Promise.all([toLocal(here.latitude, here.longitude), toLocal(item.latitude, item.longitude)]);
    const arrowDeg = screenBearing(shark, find);
    if (arrowDeg != null) setChip(current => (current?.key === key ? { ...current, arrowDeg } : current));
  }, [toLocal]);

  // The parent cleared a find for a catch: measure where it is and play the moment.
  useEffect(() => {
    if (!catching) return;
    let alive = true;
    const { item, pivotId } = catching;
    setChip(null);
    void (async () => {
      const from = findPoints.current.get(pivotId)
        ?? (item.latitude != null && item.longitude != null ? await toLocal(item.latitude, item.longitude) : null);
      if (!alive) return;
      setCatchRequest({ item, pivotId, from, attempt: ++catchAttempt.current });
    })();
    return () => { alive = false; };
  // Only a new find (or a new open of the same one) starts a catch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catching]);

  const catchingPivot = catchRequest?.pivotId ?? catching?.pivotId ?? null;

  // Battery: full motion only for finds in range and the 3 nearest; the rest sit still.
  const animatedPivots = useMemo(() => new Set(placed.filter(entry => entry.distance != null)
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, 3).map(entry => entry.item.pivot_id)
    .concat(placed.filter(entry => entry.inRange).map(entry => entry.item.pivot_id))), [placed]);
  // The nearest Ride Photo find in range has its viewfinder mounted and warm before the tap.
  const stageItem = useMemo(() => placed.filter(entry => entry.inRange && rideSpec(entry.item.rarity).style === 'ride_photo')
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))[0]?.item ?? null, [placed]);
  // Every in-range Ride Photo find has its ride built in idle time, so no tap pays for it.
  const warmFinds = useMemo(() => placed.filter(entry => entry.inRange && rideSpec(entry.item.rarity).style === 'ride_photo')
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)).slice(0, 3).map(entry => ({ item: entry.item })), [placed]);
  // While the reward banner is up, finds whose spot sits under it (banner, grade chip, rides row) drop their tags.
  const underBanner = (pivot: number | null | undefined) => {
    const point = pivot != null ? findPoints.current.get(pivot) : null;
    if (!point || containerSize.width === 0) return false;
    return bannerCovers(point, containerSize, BOTTOM_SLOT);
  };
  // One finger cue on the map at a time: the nearest find in range.
  const fingerPivot = useMemo(() => placed.filter(entry => entry.inRange)
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))[0]?.item.pivot_id ?? null, [placed]);
  const fingerRef = useRef<number | null>(null);
  fingerRef.current = fingerPivot;
  const ridePhotoArt = placed.filter(entry => rideSpec(entry.item.rarity).style === 'ride_photo')
    .map(entry => entry.item.icon_url).filter((url): url is string => !!url).join('|');
  useEffect(() => {
    if (ridePhotoArt) void preloadRidePhoto(ridePhotoArt.split('|'));
  }, [ridePhotoArt]);

  // Measure finds on screen after each settle: tap-to-open origins and edge arrows for finds off screen.
  useEffect(() => {
    if (mapSettled === 0 || containerSize.width === 0) return;
    let alive = true;
    void (async () => {
      const next = new globalThis.Map<number, { x: number; y: number }>();
      const edges: EdgeFind[] = [];
      for (const { item, distance } of placed) {
        if (item.pivot_id == null || item.latitude == null || item.longitude == null) continue;
        const point = await toLocal(item.latitude, item.longitude);
        if (!alive) return;
        if (!point) continue;
        next.set(item.pivot_id, point);
        const off = point.x < 0 || point.y < 0 || point.x > containerSize.width || point.y > containerSize.height;
        if (off) edges.push({ item, point, distance });
      }
      findPoints.current = next;
      // The finger cue goes on the side away from the player's shark (screen centre while following).
      const sides: Record<number, FingerSide> = {};
      // Below the shark, the finger hangs under the find, so it never lands on the shark's board.
      next.forEach((point, pivot) => {
        const side = point.x < containerSize.width / 2 ? 'left' : 'right';
        sides[pivot] = point.y > containerSize.height / 2 ? (side === 'left' ? 'below-left' : 'below-right') : side;
      });
      setFindSides(current => (JSON.stringify(current) === JSON.stringify(sides) ? current : sides));
      const distances = new globalThis.Map(placed.map(entry => [entry.item.pivot_id, entry.distance] as const));
      const groups = clusterFinds([...next.entries()].map(([pivot, point]) => ({ pivot, x: point.x, y: point.y, distance: distances.get(pivot) ?? null })));
      setFindGroups(current => (JSON.stringify(current) === JSON.stringify(groups) ? current : groups));
      // What each visible find occupies on screen: the HUD row and the peek keep clear of these.
      const prints = [...next.entries()].filter(([pivot, p]) => !groups.hidden.includes(pivot)
        && p.x > -40 && p.y > -40 && p.x < containerSize.width + 40 && p.y < containerSize.height + 40)
        .map(([pivot, p]) => findFootprint(p, pivot === fingerRef.current));
      const here = fixRef.current.location;
      const shark = here?.latitude != null && here?.longitude != null ? await toLocal(here.latitude, here.longitude) : null;
      if (!alive) return;
      if (shark) prints.push(sharkFootprint(shark));
      setFootprints(current => (JSON.stringify(current) === JSON.stringify(prints) ? current : prints));
      setEdgeFinds(edges.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)).slice(0, 4));
    })();
    return () => { alive = false; };
  }, [mapSettled, placed, containerSize.width, containerSize.height, toLocal]);

  // Stable callbacks for the catch (refs, so memo holds across renders).
  const callbacks = useRef({ onCatchCollected, onCatchUnavailable, onCatchDone, onPrepItemNearby, catchRequest });
  callbacks.current = { onCatchCollected, onCatchUnavailable, onCatchDone, onPrepItemNearby, catchRequest };
  const onCollectedStable = useCallback((data: RedeemPrepItemResponseType['data']) => callbacks.current.onCatchCollected?.(data), []);
  const onUnavailableStable = useCallback(() => callbacks.current.onCatchUnavailable?.(), []);
  const onFailedStable = useCallback((line: string, retryable: boolean) => {
    const failed = callbacks.current.catchRequest;
    setChip({ key: `fail-${Date.now()}`, text: line, tone: 'error', ttlMs: 4000,
      onPress: retryable && failed ? () => {
        setChip(null);
        callbacks.current.onPrepItemNearby(failed.item, failed.pivotId, 'tap');
      } : undefined });
  }, []);
  const onDoneStable = useCallback((caught: boolean) => {
    setCatchRequest(null);
    callbacks.current.onCatchDone?.(caught);
  }, []);
  const onEdgePress = useCallback((entry: EdgeFind) => void nudge(entry.item, entry.distance), [nudge]);
  // A still of the map for the catch's edges, taken once when a Ride Photo find comes in range.
  useEffect(() => {
    if (!stageItem?.pivot_id || mapSettled === 0) return;
    let alive = true;
    const timer = setTimeout(() => {
      void snapshotter.current?.().then(uri => { if (alive && uri) setMapStill(uri); });
    }, 800);
    return () => { alive = false; clearTimeout(timer); };
  }, [stageItem?.pivot_id, mapSettled > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable for the life of the screen (reads the latest state from a ref), so no find marker
  // re-renders when a catch opens or finishes.
  const tapState = useRef({ loadError, catchingPivot, nudge, onPrepItemNearby });
  tapState.current = { loadError, catchingPivot, nudge, onPrepItemNearby };
  const tapFind = useCallback((prepItem: PrepItemType, distance: number | null, inRange: boolean) => {
    const state = tapState.current;
    if (state.loadError || !prepItem.pivot_id || state.catchingPivot != null) return;
    if (!inRange) { void state.nudge(prepItem, distance); return; }
    // Ride Photo opens on this frame, from the find's own spot.
    catchRef.current?.primeRide(prepItem, findPoints.current.get(prepItem.pivot_id) ?? null);
    state.onPrepItemNearby(prepItem, prepItem.pivot_id, 'tap');
  }, []);
  const rowTop = TOP + (liveBar ? LIVE_BAR_ROW : 0);
  // Edge tokens (48 pt) centre below the chip row's home row, so a live boss bar pushes both down together.
  const edgeTop = rowTop + 30 + 8 + 24;
  const tokens = useMemo(() => edgeFinds.map(edge => {
    const at = edgeArrowPlacement(edge.point, containerSize, { top: edgeTop, bottom: 190, side: 30 });
    return { x: at.x - 28, y: at.y - 28, w: 56, h: 56 };
  }), [edgeFinds, containerSize, edgeTop]);
  const obstacles = useMemo(() => footprints.concat(tokens), [footprints, tokens]);
  // The chip row drops a row when a find (or an edge token) sits under it, so a tap there reaches the find.
  const hudTop = useMemo(() => (hudWidth > 0 ? hudRowTop(obstacles, rowTop, hudWidth) : rowTop), [obstacles, rowTop, hudWidth]);
  // A tapped find's peek docks low, or higher until it covers no find (never another find's timer).
  const slotBottom = chip && containerSize.width > 0 ? peekBottom(obstacles, containerSize, BOTTOM_SLOT, hudTop + 30 + 8, chipWidthFor(chip)) : BOTTOM_SLOT;

  // Map states are one-line chips too: nothing over the map is ever a card.
  const status = mapStatusLine({ homeLocationConfirmed, isLoading, empty: activePrepItems.length === 0, loadError, rankLine });
  const statusChip = useMemo<HuntChipMessage | null>(() => {
    if (!status) return null;
    const retry = () => void loadPrepItems(true);
    const onPress = status.action === 'retry' ? retry
      : status.action === 'collections' ? () => RootNavigation.navigate('SetCollection')
        : status.action === 'standings' ? () => RootNavigation.navigate('Leaderboard', { tab: 'home_hunt' }) : undefined;
    return { key: `status-${status.text}`, text: status.text, tone: status.tone, ttlMs: 0, onPress };
  }, [status?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const bottom: React.ReactNode = catchRequest ? null
    : <HomeHuntChip message={chip ?? statusChip} onDismiss={chip ? dismissChip : noop} />;

  return (
    <View ref={containerRef} collapsable={false} style={styles.container}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setContainerSize(current => (current.width === width && current.height === height ? current : { width, height }));
      }}>
      {/* Map with prep items - player marker is handled by Map component */}
      <Map controlsTop={rowTop} projector={projector} snapshotter={snapshotter} onZoomChange={onMapSettled} focusCoordinate={findFocus}
        extraControls={chestButton} ambientFrozen={catchOpen} chromeHidden={catchOpen} onUserPan={onUserPan}>
        {homeLocationConfirmed && placed.map(({ item: prepItem, distance, inRange }) => (
          <HomeFindMarker key={prepItem.pivot_id || prepItem.id} item={prepItem}
            // Rounded so GPS jitter does not re-render every marker.
            distance={distance == null ? null : Math.round(distance / 5) * 5} inRange={inRange}
            animated={animatedPivots.has(prepItem.pivot_id)}
            hidden={catchingPivot === prepItem.pivot_id || findGroups.hidden.includes(prepItem.pivot_id ?? -1)}
            count={findGroups.counts[prepItem.pivot_id ?? -1] ?? 1}
            chromeless={findGroups.chromeless.includes(prepItem.pivot_id ?? -1) || (cascadeOn && underBanner(prepItem.pivot_id))}
            onTap={tapFind} onExpire={handlePrepItemExpire}
            fingerSide={(findSides[prepItem.pivot_id ?? -1] ?? 'right')} showFinger={prepItem.pivot_id === fingerPivot}
            pulseKey={pulse && pulse.pivot === prepItem.pivot_id ? pulse.key : null} />
        ))}
      </Map>
      {/* Kept mounted (no blank remount on return); hidden and inert during a catch. */}
      <Animated.View style={[StyleSheet.absoluteFill, chromeFade]} pointerEvents={catchOpen ? 'none' : 'box-none'}>
        <FindEdgeArrows finds={edgeFinds} size={containerSize} onPress={onEdgePress} insetTop={edgeTop} />
      </Animated.View>

      {bottom && <Animated.View style={[styles.bottomSlot, { bottom: slotBottom }, cardFade.style]} pointerEvents={cardFade.pointerEvents}>{bottom}</Animated.View>}

      {/* Live bosses from home; the team race only when the Home Hunt board is on. */}
      <HomeLive top={TOP} onBarChange={setLiveBar} />

      {homeLocationConfirmed && (
        <Animated.View style={[StyleSheet.absoluteFill, chromeFade]} pointerEvents={catchOpen ? 'none' : 'box-none'}>
          <HomeHudChips top={hudTop} onWidth={setHudWidth} findsUntilTicket={ticket.until} ticketsCapped={ticket.capped} onTicketPress={showTicketLine}
            parkStory={parkStory} />
        </Animated.View>
      )}

      {/* Menus step back (dimmed, not tappable) while a catch is open. */}
      <Animated.View style={[StyleSheet.absoluteFill, chromeFade]} pointerEvents={catchOpen ? 'none' : 'box-none'}>
        {/* Quick Access Menu - hamburger on left */}
        <QuickAccessMenu position="left" />

        {/* Radial Stats Menu - shark avatar on right */}
        <RadialStatsMenu />
      </Animated.View>

      {/* The catch, above the menus: the Ride Photo viewfinder owns the screen while it is open. */}
      <HomeCatchMoment ref={catchRef} request={catchRequest} stageItem={stageItem} badgeBottom={BOTTOM_SLOT}
        getFix={getFix} mapStill={mapStill}
        onCollected={onCollectedStable} onUnavailable={onUnavailableStable} onFailed={onFailedStable} onDone={onDoneStable}
        warm={warmFinds} onCascade={setCascadeOn} />


      {introOpen && <HomeIntro onDone={markIntroSeen} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dimmed: { opacity: 0.3 },
  hidden: { opacity: 0 },
  bottomSlot: { position: 'absolute', left: EDGE, right: EDGE, bottom: BOTTOM_SLOT, zIndex: 12,
    alignItems: 'stretch', maxWidth: 420, alignSelf: 'center' },
});
