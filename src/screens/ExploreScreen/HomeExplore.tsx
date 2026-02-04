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
import RadialStatsMenu from '../../components/RadialStatsMenu';
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
      // Silently handle network errors - user can pull to refresh
      if (__DEV__) console.log('Prep items load error:', error);
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
        {activePrepItems.map((prepItem) => (
          <Marker
            key={prepItem.pivot_id || prepItem.id}
            coordinate={{
              latitude: prepItem.latitude!,
              longitude: prepItem.longitude!,
            }}
            onPress={() => {
              // Allow tapping markers for easier testing (and better UX)
              if (prepItem.pivot_id) {
                onPrepItemNearby(prepItem, prepItem.pivot_id);
              }
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
            No prep items yet — check back soon!
          </Text>
        </View>
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
});
