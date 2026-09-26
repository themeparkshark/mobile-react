import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
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
import PrepItemMarker from './PrepItem';
import RadialStatsMenu from '../../components/RadialStatsMenu';
import QuickAccessMenu from '../../components/QuickAccessMenu';
import TripGoalCard from './TripGoalCard';
import { shouldThrottleHomeRequest } from './homeRefresh';
import { nearestHomeHuntTarget } from './homeHuntTarget';
import HomeHuntCard from './HomeHuntCard';
import HomeMapStatusCard from './HomeMapStatusCard';
import HomeFocusCard from './HomeFocusCard';
import { HOME_PREP_PICKUP_RADIUS_METERS } from './homePickupRange';
import * as RootNavigation from '../../RootNavigation';


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



interface Props {
  onPrepItemNearby: (prepItem: PrepItemType, pivotId: number) => void;
  refreshVersion: number;
  homeLocationConfirmed: boolean;
}

/**
 * Home exploration view - shows prep items on map when not at a park.
 * This is the at-home gameplay experience.
 */
export default function HomeExplore({ onPrepItemNearby, refreshVersion, homeLocationConfirmed }: Props) {
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
          setPrepItems(cached.data);
          setPlayerStats(cached.player_stats);
          setIsLoading(false);
        }
      }

      try {
        const response = await getPrepItems(lat, lng, playerId);
        setPrepItems(response.data);
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

  // Returning from Collections may change the focused set. Refresh immediately
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

  return (
    <View style={styles.container}>
      {/* Map with prep items - player marker is handled by Map component */}
      <Map focusCoordinate={huntFocus}>
        {/* Prep item markers */}
        {homeLocationConfirmed && activePrepItems.map((prepItem) => {
          const isInRange =
            prepItem.latitude != null &&
            prepItem.longitude != null &&
            location?.latitude != null &&
            location?.longitude != null &&
            calculateDistance(
              location.latitude,
              location.longitude,
              prepItem.latitude,
              prepItem.longitude
            ) <= HOME_PREP_PICKUP_RADIUS_METERS;

          return (
            <Marker
              key={prepItem.pivot_id || prepItem.id}
              coordinate={{
                latitude: prepItem.latitude!,
                longitude: prepItem.longitude!,
              }}
              tracksViewChanges={isInRange && !loadError}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => {
                if (!loadError && prepItem.pivot_id) {
                  setSelectedHuntPivotId(prepItem.pivot_id);
                  if (!isInRange) return;
                  onPrepItemNearby(prepItem, prepItem.pivot_id);
                }
              }}
            >
              <PrepItemMarker prepItem={prepItem} onExpire={handlePrepItemExpire} inRange={isInRange && !loadError} />
            </Marker>
          );
        })}
      </Map>

      {homeLocationConfirmed && !isLoading && !loadError && huntTarget && (
        <HomeHuntCard target={huntTarget}
          findsUntilTicket={playerStats?.ticket_guarantee_in}
          onPress={() => {
            const item = huntTarget.item;
            if (huntTarget.distanceMeters <= HOME_PREP_PICKUP_RADIUS_METERS && item.pivot_id) {
              onPrepItemNearby(item, item.pivot_id);
            } else if (item.latitude != null && item.longitude != null) {
              setHuntFocus({ latitude: item.latitude, longitude: item.longitude,
                requestId: ++nextHuntFocusRequest.current });
            }
          }} />
      )}

      {/* Loading indicator */}
      {!homeLocationConfirmed && <HomeMapStatusCard mode="park_check" />}
      {homeLocationConfirmed && isLoading && (
        <HomeMapStatusCard mode="loading" />
      )}

      {/* Empty state */}
      {homeLocationConfirmed && !isLoading && activePrepItems.length === 0 && (
        <HomeMapStatusCard mode={loadError ? 'error' : 'empty'}
          onOpenCollections={() => RootNavigation.navigate('SetCollection',
            playerStats?.focused_prep_set?.slug ? { slug: playerStats.focused_prep_set.slug } : undefined)}
          onRetry={() => void loadPrepItems(true)} />
      )}

      {homeLocationConfirmed && !isLoading && loadError && activePrepItems.length > 0 && (
        <HomeMapStatusCard mode="saved" onRetry={() => void loadPrepItems(true)} />
      )}

      {homeLocationConfirmed && !isLoading && !loadError && playerStats?.focused_prep_set && (
        <HomeFocusCard set={playerStats.focused_prep_set} topOffset={76}
          onPress={() => RootNavigation.navigate('SetCollection', {
            slug: playerStats.focused_prep_set!.slug,
          })} />
      )}

      <TripGoalCard refreshVersion={refreshVersion} />

      {/* The parks, live: bosses to join from home, close fights to cheer. */}
      <HomeLive top={12} />

      {/* Quick Access Menu - hamburger on left */}
      <QuickAccessMenu position="left" />

      {/* Radial Stats Menu - shark avatar on right */}
      <RadialStatsMenu />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Removed conditionsBar - weather/time badges removed
  _placeholder: {
    // placeholder to maintain structure
    zIndex: 10,
    flexDirection: 'row',
    gap: 8,
  },
  // Player marker moved to Map component
});
