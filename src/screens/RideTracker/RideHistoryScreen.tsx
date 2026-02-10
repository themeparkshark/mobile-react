import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getPlayerRides, PlayerRideType } from '../../api/endpoints/player-rides';
import RideCard from '../../components/RideTracker/RideCard';
import ShareableRideCard from '../../components/RideTracker/ShareableRideCard';
import { colors } from '../../design-system';
import { PARK_DISPLAY_ORDER } from '../../constants/parkWaitTimes';
import { Modal } from 'react-native';

// ─── Park Filter Chip ───
interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}
const FilterChip: React.FC<FilterChipProps> = React.memo(({ label, selected, onPress }) => (
  <Pressable onPress={onPress} style={[styles.filterChip, selected && styles.filterChipSelected]}>
    <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{label}</Text>
  </Pressable>
));
FilterChip.displayName = 'FilterChip';

// ─── Main Screen ───
export default function RideHistoryScreen() {
  const navigation = useNavigation<any>();
  const [rides, setRides] = useState<PlayerRideType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPark, setSelectedPark] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [shareRide, setShareRide] = useState<PlayerRideType | null>(null);

  const fetchRides = useCallback(async (pageNum: number, parkId: number | null, append = false) => {
    try {
      const params: any = { page: pageNum, per_page: 20 };
      if (parkId) params.park_id = parkId;
      const result = await getPlayerRides(params);

      if (append) {
        setRides(prev => [...prev, ...result.data]);
      } else {
        setRides(result.data);
      }
      setHasMore(result.meta.current_page < result.meta.last_page);
    } catch (e) {
      console.error('Failed to fetch rides:', e);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchRides(1, selectedPark).finally(() => setLoading(false));
  }, [selectedPark, fetchRides]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await fetchRides(1, selectedPark);
    setRefreshing(false);
  }, [selectedPark, fetchRides]);

  const onEndReached = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchRides(nextPage, selectedPark, true);
    setLoadingMore(false);
  }, [hasMore, loadingMore, page, selectedPark, fetchRides]);

  const handleRidePress = useCallback((ride: PlayerRideType) => {
    navigation.navigate('RideDetail', { rideId: ride.ride_id, rideName: ride.ride_name });
  }, [navigation]);

  const handleShare = useCallback((ride: PlayerRideType) => {
    setShareRide(ride);
  }, []);

  const renderItem = useCallback(({ item }: { item: PlayerRideType }) => (
    <RideCard ride={item} onPress={() => handleRidePress(item)} onShare={handleShare} />
  ), [handleRidePress, handleShare]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Ride History</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Park filter */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ id: null, name: 'All Parks' }, ...PARK_DISPLAY_ORDER.map(p => ({ id: p.id, name: p.name }))]}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <FilterChip
            label={item.name}
            selected={selectedPark === item.id}
            onPress={() => setSelectedPark(item.id)}
          />
        )}
        contentContainerStyle={styles.filterRow}
        style={styles.filterContainer}
      />

      {loading ? (
        <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 60 }} />
      ) : rides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🦈</Text>
          <Text style={styles.emptyTitle}>No rides yet!</Text>
          <Text style={styles.emptySubtitle}>Head to a park and start tracking 🎢</Text>
          <Pressable
            onPress={() => navigation.navigate('RideLog')}
            style={styles.logBtn}
          >
            <Text style={styles.logBtnText}>Log Your First Ride</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.secondary} style={{ padding: 16 }} /> : null}
        />
      )}
      {/* Share Modal */}
      <Modal visible={!!shareRide} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setShareRide(null)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            {shareRide && (
              <>
                <ShareableRideCard ride={shareRide} onShare={() => setShareRide(null)} />
                <Pressable onPress={() => setShareRide(null)} style={styles.modalClose}>
                  <Text style={styles.modalCloseText}>Close</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { color: colors.secondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', fontFamily: 'Shark' },
  filterContainer: { maxHeight: 50 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  filterChip: {
    backgroundColor: colors.bgMedium,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterChipSelected: { backgroundColor: 'rgba(0,165,245,0.2)', borderColor: colors.secondary },
  filterChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  filterChipTextSelected: { color: colors.secondary },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 60 },
  emptyTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginTop: 16, fontFamily: 'Shark' },
  emptySubtitle: { color: colors.textSecondary, fontSize: 15, marginTop: 8, textAlign: 'center' },
  logBtn: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 24,
  },
  logBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Share modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20,
  },
  modalContent: { maxHeight: '80%' },
  modalClose: {
    backgroundColor: colors.bgMedium, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  modalCloseText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
});
