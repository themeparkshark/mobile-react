import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import Map from '../../components/Map';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { PrepItemType } from '../../models/prep-item-type';
import { PlayerStatsType } from '../../models/player-stats-type';
import getPrepItems, { getCachedPrepItems } from '../../api/endpoints/me/prep-items';
import getCurrentPrepItem from '../../api/endpoints/me/prep-items/current';
import { getMyTeam, TeamInfo } from '../../api/endpoints/gym-battle';
import PrepItemMarker from './PrepItem';
import RadialStatsMenu from '../../components/RadialStatsMenu';
import QuickAccessMenu from '../../components/QuickAccessMenu';

const TEAM_COLORS: Record<string, string> = {
  mouse: '#F59E0B',
  globe: '#22C55E',
  shark: '#3B82F6',
};
const TEAM_EMOJIS: Record<string, string> = {
  mouse: '🐭',
  globe: '🌍',
  shark: '🦈',
};

const PREP_ITEM_RANGE_METERS = 28;

// ── Throttle thresholds ──────────────────────────────────────────────
const LOAD_MIN_DISTANCE_M = 15; // meters moved before re-fetching prep items
const LOAD_MIN_INTERVAL_MS = 10_000; // minimum 10s between API calls
const NEARBY_MIN_DISTANCE_M = 5; // meters for pickup detection
const NEARBY_MIN_INTERVAL_MS = 3_000; // 3s between nearby checks

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

const TEAM_NAMES: Record<string, string> = {
  mouse: 'Mouse',
  globe: 'Globe',
  shark: 'Shark',
};

function TeamBadge({ team }: { team: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const calloutOpacity = useRef(new Animated.Value(0)).current;
  const calloutTranslateY = useRef(new Animated.Value(6)).current;
  const [showCallout, setShowCallout] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePress = () => {
    // Bounce
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 3, tension: 300, useNativeDriver: true }),
    ]).start();

    // Show callout
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowCallout(true);
    Animated.parallel([
      Animated.timing(calloutOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(calloutTranslateY, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();

    // Auto-hide after 2s
    hideTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(calloutOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(calloutTranslateY, { toValue: 6, duration: 200, useNativeDriver: true }),
      ]).start(() => setShowCallout(false));
    }, 2000);
  };

  const emoji = TEAM_EMOJIS[team] || '🦈';
  const name = TEAM_NAMES[team] || team.charAt(0).toUpperCase() + team.slice(1);

  return (
    <View style={styles.teamBadge}>
      {/* Badge */}
      <Pressable onPress={handlePress}>
        <Animated.View style={[styles.teamBadgeInner, { backgroundColor: TEAM_COLORS[team] || '#3B82F6', transform: [{ scale }] }]}>
          <Text style={styles.teamEmoji}>{emoji}</Text>
          <Text style={styles.teamText}>TEAM</Text>
        </Animated.View>
      </Pressable>
      {/* Callout tooltip — below badge */}
      {showCallout && (
        <Animated.View style={[styles.teamCallout, { opacity: calloutOpacity, transform: [{ translateY: calloutTranslateY }] }]}>
          <View style={styles.teamCalloutArrow} />
          <View style={styles.teamCalloutBubble}>
            <Text style={styles.teamCalloutText}>You are Team {name}! {emoji}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

interface Props {
  onPrepItemNearby: (prepItem: PrepItemType, pivotId: number) => void;
}

/**
 * Home exploration view - shows prep items on map when not at a park.
 * This is the at-home gameplay experience.
 */
export default function HomeExplore({ onPrepItemNearby }: Props) {
  const [prepItems, setPrepItems] = useState<PrepItemType[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const { location } = useContext(LocationContext);
  const { player, refreshPlayer } = useContext(AuthContext);

  // ── Throttle refs ────────────────────────────────────────────────
  const lastFetchLocation = useRef<{ lat: number; lng: number } | null>(null);
  const lastFetchTime = useRef<number>(0);
  const lastNearbyLocation = useRef<{ lat: number; lng: number } | null>(null);
  const lastNearbyTime = useRef<number>(0);

  /** Check whether enough distance/time has elapsed to allow a fetch */
  const shouldThrottle = (
    lat: number,
    lng: number,
    lastLoc: React.MutableRefObject<{ lat: number; lng: number } | null>,
    lastTime: React.MutableRefObject<number>,
    minDistM: number,
    minIntervalMs: number
  ): boolean => {
    const now = Date.now();
    if (now - lastTime.current < minIntervalMs) return true;
    if (lastLoc.current) {
      const dist = calculateDistance(lastLoc.current.lat, lastLoc.current.lng, lat, lng);
      if (dist < minDistM) return true;
    }
    return false;
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
      if (!location?.latitude || !location?.longitude) return;

      const lat = location.latitude;
      const lng = location.longitude;

      // Throttle unless forced (e.g. pull-to-refresh)
      if (!force && shouldThrottle(lat, lng, lastFetchLocation, lastFetchTime, LOAD_MIN_DISTANCE_M, LOAD_MIN_INTERVAL_MS)) {
        return;
      }

      // Show cached data instantly on first load
      if (isLoading) {
        const cached = await getCachedPrepItems(lat, lng);
        if (cached) {
          setPrepItems(cached.data);
          setPlayerStats(cached.player_stats);
          setIsLoading(false);
        }
      }

      try {
        const response = await getPrepItems(lat, lng);
        setPrepItems(response.data);
        setPlayerStats(response.player_stats);
        recordFetch(lat, lng, lastFetchLocation, lastFetchTime);

        // Also refresh player data to sync currencies
        refreshPlayer();
      } catch (error) {
        // Silently handle network errors - user can pull to refresh
        if (__DEV__) console.log('Prep items load error:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [location?.latitude, location?.longitude, refreshPlayer]
  );

  // Initial load
  useEffect(() => {
    loadPrepItems(true); // force on mount
    getMyTeam().then(setTeamInfo).catch(() => {});
  }, [loadPrepItems]);

  // Check for nearby prep items (with tighter throttle for pickup detection)
  useEffect(() => {
    if (!location?.latitude || !location?.longitude || prepItems.length === 0) {
      return;
    }

    const lat = location.latitude;
    const lng = location.longitude;

    // Throttle nearby checks (5m / 3s)
    if (shouldThrottle(lat, lng, lastNearbyLocation, lastNearbyTime, NEARBY_MIN_DISTANCE_M, NEARBY_MIN_INTERVAL_MS)) {
      return;
    }

    const checkNearby = async () => {
      try {
        recordFetch(lat, lng, lastNearbyLocation, lastNearbyTime);
        const nearbyItem = await getCurrentPrepItem(lat, lng);

        if (nearbyItem && nearbyItem.prep_item) {
          onPrepItemNearby(nearbyItem.prep_item, nearbyItem.pivot_id);
        }
      } catch (error) {
        // Silently handle - will retry on next location update
        if (__DEV__) console.log('Nearby check error:', error);
      }
    };

    checkNearby();
  }, [location?.latitude, location?.longitude, prepItems, onPrepItemNearby]);

  // Filter to only show active items
  const activePrepItems = prepItems.filter((item) => {
    if (!item.active_from || !item.active_to) return true;
    return dayjs().isBetween(dayjs(item.active_from), dayjs(item.active_to));
  });

  return (
    <View style={styles.container}>
      {/* Map with prep items - player marker is handled by Map component */}
      <Map>
        {/* Prep item markers */}
        {activePrepItems.map((prepItem) => {
          const isInRange =
            !!prepItem.latitude &&
            !!prepItem.longitude &&
            !!location?.latitude &&
            !!location?.longitude &&
            calculateDistance(
              location.latitude,
              location.longitude,
              prepItem.latitude,
              prepItem.longitude
            ) <= PREP_ITEM_RANGE_METERS;

          return (
            <Marker
              key={prepItem.pivot_id || prepItem.id}
              coordinate={{
                latitude: prepItem.latitude!,
                longitude: prepItem.longitude!,
              }}
              tracksViewChanges={isInRange}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => {
                if (prepItem.pivot_id) {
                  onPrepItemNearby(prepItem, prepItem.pivot_id);
                }
              }}
            >
              <PrepItemMarker prepItem={prepItem} onExpire={loadPrepItems} inRange={isInRange} />
            </Marker>
          );
        })}
      </Map>

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Finding nearby items...</Text>
        </View>
      )}

      {/* Empty state */}
      {!isLoading && activePrepItems.length === 0 && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>
            No prep items yet — check back soon!
          </Text>
        </View>
      )}

      {/* Team badge — always visible */}
      {teamInfo?.has_team && teamInfo.team && (
        <TeamBadge team={teamInfo.team} />
      )}

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
  loadingOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 14,
  },
  emptyOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  emptyText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
  teamBadge: {
    position: 'absolute',
    top: 60,
    left: 16,
    zIndex: 20,
    alignItems: 'flex-start',
  },
  teamCallout: {
    marginTop: 6,
    alignItems: 'flex-start',
  },
  teamCalloutBubble: {
    backgroundColor: 'rgba(30, 34, 42, 0.92)',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  teamCalloutText: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#fff',
  },
  teamCalloutArrow: {
    width: 0,
    height: 0,
    marginLeft: 16,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(30, 34, 42, 0.92)',
  },
  teamBadgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  teamEmoji: {
    fontSize: 16,
    marginRight: 4,
  },
  teamText: {
    fontFamily: 'Shark',
    fontSize: 14,
    color: 'white',
    fontWeight: '700',
    letterSpacing: 1,
  },
});
