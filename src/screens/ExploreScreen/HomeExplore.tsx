import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Marker } from '../../components/map/Marker';
import dayjs from 'dayjs';
import { useFocusEffect } from '@react-navigation/native';
import isBetween from 'dayjs/plugin/isBetween';
import Map from '../../components/Map';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { PrepItemType } from '../../models/prep-item-type';
import { PlayerStatsType } from '../../models/player-stats-type';
import getPrepItems, { getCachedPrepItems } from '../../api/endpoints/me/prep-items';
import getCurrentPrepItem from '../../api/endpoints/me/prep-items/current';
import HomeLive from '../../components/home/HomeLive';
import PrepItemMarker, { PREP_MARKER_ANCHOR } from './PrepItem';
import RadialStatsMenu from '../../components/RadialStatsMenu';
import QuickAccessMenu from '../../components/QuickAccessMenu';
import TripGoalCard from './TripGoalCard';
import { shouldThrottleHomeRequest } from './homeRefresh';
import { nearestHomeHuntTarget } from './homeHuntTarget';
import HomeHuntCard from './HomeHuntCard';
import HomeMapStatusCard from './HomeMapStatusCard';
import HomeFocusCard from './HomeFocusCard';
import { HOME_PREP_PICKUP_RADIUS_METERS } from './homePickupRange';
import { isInPickupRange } from './homeFindCopy';
import HomeIntro, { useHomeIntroSeen } from './HomeIntro';
import getPrepItemSets from '../../api/endpoints/me/prep-item-sets';
import * as RootNavigation from '../../RootNavigation';
import { reportHomeSpot, type HuntReportReason } from '../../api/endpoints/me/homeHunt';
import { HOME_HUNT_COPY } from '../../constants/homeHuntCopy';
import { gameAlert } from '../../ui';
import { showToast } from '../../utils/toast';
import { homeHuntEnabled, loadHomeHuntWeek } from '../LeaderboardsScreen/homeHuntWeekCache';
import { REPORT_REASONS, SAFETY_LINE, huntRankLine, shouldShowSafetyLine } from './homeHuntMap';
import { getHomeHuntRankLine, setHomeHuntRankLine, subscribeHomeHuntRankLine } from './homeHuntRankStore';

// ── Layout: one grid for every home card ─────────────────────────────
// Top row: the live bar (only for a live boss, or the team race when the
// Home Hunt board is on), then the corner stack (park trip chip, focused set)
// level with the recenter button. Bottom slot: the find card or a status card,
// above the menu and shark buttons (bottom 100, 76 tall) with one gutter.
const EDGE = 16;
const TOP = 12;
const LIVE_BAR_ROW = 58; // bar (50) + gap
const RECENTER_COLUMN = 54 + 12;
const BOTTOM_SLOT = 100 + 76 + 14;


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
  onPrepItemNearby: (prepItem: PrepItemType, pivotId: number) => void;
  refreshVersion: number;
  homeLocationConfirmed: boolean;
  /** The screen's overlay queue allows the first-time intro right now. */
  introAllowed?: boolean;
  onIntroOpenChange?: (open: boolean) => void;
}

/**
 * Home exploration view - shows prep items on map when not at a park.
 * This is the at-home gameplay experience.
 */
export default function HomeExplore({ onPrepItemNearby, refreshVersion, homeLocationConfirmed,
  introAllowed = false, onIntroOpenChange }: Props) {
  const [prepItems, setPrepItems] = useState<PrepItemType[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [huntFocus, setHuntFocus] = useState<{
    latitude: number; longitude: number; requestId: number;
  } | null>(null);
  const [selectedHuntPivotId, setSelectedHuntPivotId] = useState<number | null>(null);
  const nextHuntFocusRequest = useRef(0);
  const { location } = useContext(LocationContext);
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
  const [setProgress, setSetProgress] = useState<Record<string, { collected: number; total: number }>>({});
  const [introSeen, markIntroSeen] = useHomeIntroSeen(player?.id);
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

  const reportSpot = useCallback((pivotId: number) => {
    const submit = (reason: HuntReportReason) => {
      reportHomeSpot(pivotId, reason)
        .then(() => showToast(HOME_HUNT_COPY.reportThanks, 'success'))
        .catch(() => showToast(HOME_HUNT_COPY.reportFailed, 'error'));
    };
    gameAlert(HOME_HUNT_COPY.reportTitle, 'What is wrong with this spot?', [
      ...REPORT_REASONS.map(option => ({ text: option.label, onPress: () => submit(option.reason) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, []);

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
          setPlayerStats(cached.player_stats);
          setIsLoading(false);
        }
      }

      try {
        const response = await getPrepItems(lat, lng, playerId);
        setPrepItems(Array.isArray(response.data) ? response.data : []);
        setPlayerStats(response.player_stats);
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
  const loadSetProgressRef = useRef<() => void>(() => {});
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

  // "Churro Collection: 3/40" on the find card. One small read on focus and
  // after each pickup, never on GPS ticks.
  const loadSetProgress = useCallback(() => {
    if (!homeLocationConfirmed || !player?.id) return;
    getPrepItemSets().then(sets => {
      const next: Record<string, { collected: number; total: number }> = {};
      for (const set of sets ?? []) {
        if (set?.slug && Number.isFinite(set.total_items) && set.total_items > 0) {
          next[set.slug] = { collected: set.collected_count ?? 0, total: set.total_items };
        }
      }
      setSetProgress(next);
    }).catch(() => undefined);
  }, [homeLocationConfirmed, player?.id]);
  loadSetProgressRef.current = loadSetProgress;
  useEffect(() => { loadSetProgress(); }, [loadSetProgress, refreshVersion]);

  // Returning from Collections may change the focused set. Refresh immediately
  // even when GPS has not moved and the current spawn batch has not expired.
  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    if (firstScreenFocus.current) {
      firstScreenFocus.current = false;
    } else {
      void loadPrepItemsRef.current(true);
      loadSetProgressRef.current();
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

    const checkNearby = async () => {
      try {
        recordFetch(lat, lng, lastNearbyLocation, lastNearbyTime);
        const nearbyItem = await getCurrentPrepItem(lat, lng);

        if (active && nearbyItem?.pivot_id) {
          onPrepItemNearby(nearbyItem, nearbyItem.pivot_id);
        }
      } catch (error) {
        // Silently handle - will retry on next location update
        if (__DEV__ && active) console.log('Nearby check error:', error instanceof Error ? error.message : String(error));
      }
    };

    let active = true;
    checkNearby();
    return () => { active = false; };
  }, [homeLocationConfirmed, location?.latitude, location?.longitude, prepItems, onPrepItemNearby, loadError]);

  // Filter to only show active items
  const activePrepItems = prepItems.filter((item) => {
    if (!item.active_from || !item.active_to) return true;
    return dayjs().isBetween(dayjs(item.active_from), dayjs(item.active_to));
  });
  const huntTarget = nearestHomeHuntTarget(activePrepItems, location, Date.now(), selectedHuntPivotId);
  const lat = location?.latitude;
  const lng = location?.longitude;
  const placed = useMemo(() => activePrepItems.map(item => {
    const distance = item.latitude != null && item.longitude != null && lat != null && lng != null
      ? calculateDistance(lat, lng, item.latitude, item.longitude) : null;
    return { item, distance, inRange: !loadError && isInPickupRange(distance) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [prepItems, lat, lng, loadError]);
  useEffect(() => {
    if (safetyLineShown || !homeLocationConfirmed) return;
    const top = activePrepItems.reduce((best, item) => Math.max(best, item.rarity ?? 0), 0);
    if (shouldShowSafetyLine(top, safetyLineShown)) {
      safetyLineShown = true;
      showToast(SAFETY_LINE, 'info', 6000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepItems, homeLocationConfirmed]);
  const findInRange = homeLocationConfirmed && placed.some(entry => entry.inRange);
  const pickupRange = useMemo(() => (homeLocationConfirmed
    ? { meters: HOME_PREP_PICKUP_RADIUS_METERS, findInside: findInRange } : null), [homeLocationConfirmed, findInRange]);
  const rowTop = TOP + (liveBar ? LIVE_BAR_ROW : 0);
  const focusedSet = playerStats?.focused_prep_set;
  const huntSlug = huntTarget?.item.set_slug ?? null;
  const huntProgress = huntSlug ? setProgress[huntSlug]
    ?? (focusedSet && focusedSet.slug === huntSlug && focusedSet.total_items
      ? { collected: focusedSet.collected_count ?? 0, total: focusedSet.total_items } : null) : null;
  // The find card already names its set and progress; the focus card only
  // earns the corner when it adds something (a different set, or a wait).
  const showFocusCard = homeLocationConfirmed && !isLoading && !loadError && !!focusedSet &&
    (!huntTarget || focusedSet.slug !== huntSlug || !focusedSet.available_now);

  let bottom: React.ReactNode = null;
  if (!homeLocationConfirmed) {
    bottom = <HomeMapStatusCard mode="park_check" inline />;
  } else if (isLoading) {
    bottom = <HomeMapStatusCard mode="loading" inline />;
  } else if (activePrepItems.length === 0) {
    bottom = <HomeMapStatusCard mode={loadError ? 'error' : 'empty'} inline rankLine={rankLine}
      onOpenStandings={() => RootNavigation.navigate('Leaderboard', { tab: 'home_hunt' })}
      onOpenCollections={() => RootNavigation.navigate('SetCollection',
        focusedSet?.slug ? { slug: focusedSet.slug } : undefined)}
      onRetry={() => void loadPrepItems(true)} />;
  } else if (loadError) {
    bottom = <HomeMapStatusCard mode="saved" inline rankLine={rankLine}
      onOpenStandings={() => RootNavigation.navigate('Leaderboard', { tab: 'home_hunt' })} onRetry={() => void loadPrepItems(true)} />;
  } else if (huntTarget) {
    bottom = <HomeHuntCard target={huntTarget} setProgress={huntProgress}
      findsUntilTicket={playerStats?.ticket_guarantee_in}
      ticketsCapped={playerStats?.home_tickets_capped === true}
      onPress={() => {
        const item = huntTarget.item;
        if (isInPickupRange(huntTarget.distanceMeters) && item.pivot_id) {
          onPrepItemNearby(item, item.pivot_id);
        } else if (item.latitude != null && item.longitude != null) {
          setHuntFocus({ latitude: item.latitude, longitude: item.longitude,
            requestId: ++nextHuntFocusRequest.current });
        }
      }} />;
  }

  return (
    <View style={styles.container}>
      {/* Map with prep items - player marker is handled by Map component */}
      <Map focusCoordinate={huntFocus} controlsTop={rowTop} pickupRange={pickupRange}>
        {homeLocationConfirmed && placed.map(({ item: prepItem, distance, inRange }) => (
          <Marker
            key={prepItem.pivot_id || prepItem.id}
            coordinate={{
              latitude: prepItem.latitude!,
              longitude: prepItem.longitude!,
            }}
            anchor={PREP_MARKER_ANCHOR}
            onLongPress={prepItem.pivot_id ? () => reportSpot(prepItem.pivot_id as number) : undefined}
            accessibilityLabel={inRange ? `${prepItem.name}. In range. Tap to grab.` : `${prepItem.name}, ${distance == null ? 'distance unknown' : `${Math.round(distance)} meters away`}`}
            onPress={() => {
              if (!loadError && prepItem.pivot_id) {
                setSelectedHuntPivotId(prepItem.pivot_id);
                if (!inRange) return;
                onPrepItemNearby(prepItem, prepItem.pivot_id);
              }
            }}
          >
            <PrepItemMarker prepItem={prepItem} onExpire={handlePrepItemExpire}
              inRange={inRange} distanceMeters={distance} />
          </Marker>
        ))}
      </Map>

      {/* Corner stack, level with the recenter button. */}
      <View style={[styles.corner, { top: rowTop }]} pointerEvents="box-none">
        <TripGoalCard refreshVersion={refreshVersion} compact />
        {showFocusCard && focusedSet && (
          <HomeFocusCard set={focusedSet}
            onPress={() => RootNavigation.navigate('SetCollection', { slug: focusedSet.slug })} />
        )}
      </View>

      {bottom && <View style={styles.bottomSlot} pointerEvents="box-none">{bottom}</View>}

      {/* Live bosses from home; the team race only when the Home Hunt board is on. */}
      <HomeLive top={TOP} onBarChange={setLiveBar} />

      {/* Quick Access Menu - hamburger on left */}
      <QuickAccessMenu position="left" />

      {/* Radial Stats Menu - shark avatar on right */}
      <RadialStatsMenu />

      {introOpen && <HomeIntro onDone={markIntroSeen} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  corner: { position: 'absolute', left: EDGE, right: EDGE + RECENTER_COLUMN, zIndex: 19,
    alignItems: 'flex-start', gap: 8 },
  bottomSlot: { position: 'absolute', left: EDGE, right: EDGE, bottom: BOTTOM_SLOT, zIndex: 12,
    alignItems: 'stretch', maxWidth: 420, alignSelf: 'center' },
});
