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
import { LinearGradient } from 'expo-linear-gradient';
import { getPlayerRides, PlayerRideType } from '../../api/endpoints/player-rides';
import { getWishlist, WishlistRide } from '../../api/endpoints/rides/wishlist';
import RideCard from '../../components/RideTracker/RideCard';
import ShareableRideCard from '../../components/RideTracker/ShareableRideCard';
import { colors } from '../../design-system';
import { PARK_DISPLAY_ORDER } from '../../constants/parkWaitTimes';
import { Modal } from 'react-native';

// ─── Short park names for filter chips ───
const SHORT_PARK_NAMES: Record<number, string> = {
  2: 'Magic Kingdom',
  4: 'EPCOT',
  5: 'Hollywood Studios',
  6: 'Animal Kingdom',
  8: 'Disneyland',
  13: 'DCA',
  3: 'Universal FL',
  7: 'Islands of Adv.',
  10: 'Epic Universe',
  9: 'Volcano Bay',
  1: 'Universal LA',
};

// ─── Helpers ───
function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

// ─── Tab Pill ───
interface TabPillProps {
  label: string;
  active: boolean;
  onPress: () => void;
}
const TabPill: React.FC<TabPillProps> = React.memo(({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.tabPill, active && styles.tabPillActive]}>
    <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{label}</Text>
  </Pressable>
));
TabPill.displayName = 'TabPill';

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
type TimeTab = 'today' | 'all';
const FAVORITES_FILTER_ID = -999; // sentinel for "Favorites" in park filter row

export default function RideHistoryScreen() {
  const navigation = useNavigation<any>();
  const [allRides, setAllRides] = useState<PlayerRideType[]>([]);
  const [rides, setRides] = useState<PlayerRideType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPark, setSelectedPark] = useState<number | null>(null);
  const [timeTab, setTimeTab] = useState<TimeTab>('today');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [shareRide, setShareRide] = useState<PlayerRideType | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Set<number>>(new Set());

  // Fetch wishlist ride IDs
  useEffect(() => {
    getWishlist()
      .then(list => setWishlistIds(new Set(list.map(w => w.id))))
      .catch(() => {});
  }, []);

  const fetchRides = useCallback(async (pageNum: number, parkId: number | null, append = false) => {
    try {
      const params: any = { page: pageNum, per_page: 20 };
      if (parkId && parkId !== FAVORITES_FILTER_ID) params.park_id = parkId;
      const result = await getPlayerRides(params);

      if (append) {
        setAllRides(prev => [...prev, ...result.data]);
      } else {
        setAllRides(result.data);
      }
      setHasMore(result.meta.current_page < result.meta.last_page);
    } catch (e) {
      console.error('Failed to fetch rides:', e);
    }
  }, []);

  // Filter rides based on time tab + favorites
  useEffect(() => {
    let filtered = allRides;
    if (selectedPark === FAVORITES_FILTER_ID) {
      filtered = filtered.filter(r => wishlistIds.has(r.ride_id));
    }
    if (timeTab === 'today') {
      filtered = filtered.filter(r => isToday(r.rode_at));
    }
    setRides(filtered);
  }, [allRides, timeTab, wishlistIds, selectedPark]);

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
    if (!hasMore || loadingMore || timeTab === 'today') return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchRides(nextPage, selectedPark, true);
    setLoadingMore(false);
  }, [hasMore, loadingMore, page, selectedPark, fetchRides, timeTab]);

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
      <LinearGradient colors={['#38BDF8', '#0EA5E9', '#09268f']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.title}>RIDE HISTORY</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* Time tabs */}
      <View style={styles.tabRow}>
        <TabPill label="Today" active={timeTab === 'today'} onPress={() => setTimeTab('today')} />
        <TabPill label="All Time" active={timeTab === 'all'} onPress={() => setTimeTab('all')} />
      </View>

      {/* Park filter */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ id: null, name: 'All' }, { id: FAVORITES_FILTER_ID, name: 'Favorites' }, ...PARK_DISPLAY_ORDER.map(p => ({ id: p.id, name: SHORT_PARK_NAMES[p.id] || p.name }))]}
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
        <ActivityIndicator size="large" color="#0EA5E9" style={{ marginTop: 60 }} />
      ) : rides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>
            {selectedPark === FAVORITES_FILTER_ID ? 'No favorite rides yet!' : timeTab === 'today' ? 'No rides today yet!' : 'No rides yet!'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {selectedPark === FAVORITES_FILTER_ID ? 'Star a ride to add it to favorites' : timeTab === 'today' ? 'Log a ride to see it here' : 'Head to a park and start tracking'}
          </Text>
          <Pressable
            onPress={() => navigation.navigate('RideLog')}
            style={styles.logBtn}
          >
            <Text style={styles.logBtnText}>Log a Ride</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0EA5E9" />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#0EA5E9" style={{ padding: 16 }} /> : null}
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
  container: { flex: 1, backgroundColor: '#e8f4fd' },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  tabPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabPillActive: {
    backgroundColor: '#0EA5E9',
    borderColor: '#0EA5E9',
    shadowColor: '#0EA5E9',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  tabPillText: { color: '#475569', fontSize: 14, fontWeight: '700' },
  tabPillTextActive: { color: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backChevron: { 
    color: '#FFFFFF', 
    fontSize: 24, 
    fontWeight: '600',
    marginLeft: -2,
  },
  title: { 
    color: '#FFFFFF', 
    fontSize: 20, 
    fontWeight: '700', 
    fontFamily: 'Shark',
    letterSpacing: 2,
  },
  filterContainer: { maxHeight: 50, backgroundColor: '#e8f4fd' },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10, paddingTop: 10 },
  filterChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  filterChipSelected: { 
    backgroundColor: '#FFFFFF', 
    borderColor: '#38BDF8',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  filterChipText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  filterChipTextSelected: { color: '#0EA5E9' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyEmoji: { fontSize: 60 },
  emptyTitle: { 
    color: '#1a1a2e', 
    fontSize: 22, 
    fontWeight: '700', 
    marginTop: 16, 
    fontFamily: 'Shark' 
  },
  emptySubtitle: { color: '#475569', fontSize: 15, marginTop: 8, textAlign: 'center' },
  logBtn: {
    backgroundColor: '#fec90e',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 24,
    shadowColor: '#fec90e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  logBtnText: { color: '#1a1a2e', fontSize: 16, fontWeight: '700' },
  // Share modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20,
  },
  modalContent: { maxHeight: '80%' },
  modalClose: {
    backgroundColor: '#FFFFFF', 
    borderRadius: 12, 
    paddingVertical: 14,
    alignItems: 'center', 
    marginTop: 12, 
    borderWidth: 1, 
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalCloseText: { color: '#1a1a2e', fontSize: 16, fontWeight: '600' },
});