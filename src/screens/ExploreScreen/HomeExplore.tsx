import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import Map from '../../components/Map';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { PrepItemType } from '../../models/prep-item-type';
import { PlayerStatsType } from '../../models/player-stats-type';
import getPrepItems from '../../api/endpoints/me/prep-items';
import getCurrentPrepItem from '../../api/endpoints/me/prep-items/current';
import PrepItemMarker from './PrepItem';
import EnergyBar from '../../components/EnergyBar';
import StreakBadge from '../../components/StreakBadge';
import QuickAccessMenu from '../../components/QuickAccessMenu';

dayjs.extend(isBetween);

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
  const { location } = useContext(LocationContext);
  const { player, refreshPlayer } = useContext(AuthContext);

  // Load prep items
  const loadPrepItems = useCallback(async () => {
    if (!location?.latitude || !location?.longitude) return;

    try {
      const response = await getPrepItems(location.latitude, location.longitude);
      setPrepItems(response.data);
      setPlayerStats(response.player_stats);
      
      // Also refresh player data to sync currencies
      refreshPlayer();
    } catch (error) {
      console.error('Failed to load prep items:', error);
    } finally {
      setIsLoading(false);
    }
  }, [location?.latitude, location?.longitude, refreshPlayer]);

  // Initial load
  useEffect(() => {
    loadPrepItems();
  }, [loadPrepItems]);

  // Check for nearby prep items
  useEffect(() => {
    if (!location?.latitude || !location?.longitude || prepItems.length === 0) {
      return;
    }

    const checkNearby = async () => {
      try {
        const nearbyItem = await getCurrentPrepItem(
          location.latitude,
          location.longitude
        );

        if (nearbyItem && nearbyItem.prep_item) {
          onPrepItemNearby(nearbyItem.prep_item, nearbyItem.pivot_id);
        }
      } catch (error) {
        console.error('Failed to check nearby prep items:', error);
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
      {/* Stats overlay at top */}
      <View style={styles.statsOverlay}>
        {playerStats && (
          <>
            <EnergyBar
              current={playerStats.energy}
              max={playerStats.max_energy}
              secondsUntilNext={playerStats.seconds_until_next_energy}
            />
            <View style={styles.statsRow}>
              <View style={styles.ticketContainer}>
                <Text style={styles.ticketIcon}>🎟️</Text>
                <Text style={styles.ticketCount}>{playerStats.tickets}</Text>
              </View>
              <StreakBadge
                streak={playerStats.current_streak}
                multiplier={playerStats.streak_multiplier}
                atRisk={playerStats.streak_at_risk}
              />
            </View>
          </>
        )}
      </View>

      {/* Map with prep items */}
      <Map>
        {/* Player marker */}
        {location && (
          <Marker
            coordinate={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.playerMarker}>
              <Text style={styles.playerEmoji}>🦈</Text>
            </View>
          </Marker>
        )}

        {/* Prep item markers */}
        {activePrepItems.map((prepItem) => (
          <Marker
            key={prepItem.pivot_id || prepItem.id}
            coordinate={{
              latitude: prepItem.latitude!,
              longitude: prepItem.longitude!,
            }}
          >
            <PrepItemMarker prepItem={prepItem} onExpire={loadPrepItems} />
          </Marker>
        ))}
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
            No prep items nearby. Walk around to find more!
          </Text>
        </View>
      )}

      {/* Quick Access Menu */}
      <QuickAccessMenu position="left" />

      {/* Home mode indicator */}
      <View style={styles.homeBadge}>
        <Text style={styles.homeBadgeText}>🏠 Home Mode</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statsOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  ticketContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketIcon: {
    fontSize: 20,
    marginRight: 4,
  },
  ticketCount: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  playerEmoji: {
    fontSize: 24,
  },
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
  homeBadge: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  homeBadgeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
