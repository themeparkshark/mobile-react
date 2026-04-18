import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
  RefreshControl, Alert, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { getPlayerRides, PlayerRideType } from '../../api/endpoints/player-rides';
import { getRide, RideType } from '../../api/endpoints/rides';
import { getCommunityStats, CommunityStats } from '../../api/endpoints/rides/communityStats';
import { toggleWishlist, getWishlist } from '../../api/endpoints/rides/wishlist';
import SharkRating from '../../components/RideTracker/SharkRating';
import ShareableRideCard from '../../components/RideTracker/ShareableRideCard';
import { Modal } from 'react-native';
import { PARK_DISPLAY_ORDER } from '../../constants/parkWaitTimes';

const { width: SCREEN_W } = Dimensions.get('window');

const PARK_NAME_MAP: Record<number, string> = Object.fromEntries(
  PARK_DISPLAY_ORDER.map(p => [p.id, p.name])
);

// ─── Brand ───
const B = {
  pageBg: '#e8f4fd',
  white: '#FFFFFF',
  navy: '#09268f',
  skyMid: '#38BDF8',
  skyDark: '#0EA5E9',
  gold: '#fec90e',
  goldDark: '#d4a70a',
  textDark: '#1a1a2e',
  textMid: '#475569',
  textLight: '#94a3b8',
};

// ─── Rating Distribution Bar ───
const RatingBar: React.FC<{ rating: number; count: number; maxCount: number }> = React.memo(({ rating, count, maxCount }) => (
  <View style={s.ratingBarRow}>
    <Text style={s.ratingBarLabel}>{rating}</Text>
    <View style={s.ratingBarTrack}>
      <LinearGradient
        colors={[B.skyMid, B.navy]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[s.ratingBarFill, { width: maxCount > 0 ? `${(count / maxCount) * 100}%` : '0%' }]}
      />
    </View>
    <Text style={s.ratingBarCount}>{count}</Text>
  </View>
));
RatingBar.displayName = 'RatingBar';

// ─── History Entry ───
const HistoryEntry: React.FC<{ entry: PlayerRideType; onShare?: (e: PlayerRideType) => void }> = React.memo(({ entry, onShare }) => {
  const date = new Date(entry.rode_at);
  return (
    <View style={s.entry}>
      <View style={s.entryLeft}>
        <Text style={s.entryDate}>
          {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </Text>
        <Text style={s.entryTime}>
          {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          {entry.wait_time_minutes != null ? `  ·  ${entry.wait_time_minutes} min wait` : ''}
        </Text>
        {entry.rating != null && entry.rating > 0 && (
          <View style={{ marginTop: 4 }}>
            <SharkRating rating={entry.rating} size={14} readonly />
          </View>
        )}
        {entry.note ? <Text style={s.entryNote}>"{entry.note}"</Text> : null}
      </View>
      <View style={s.entryRight}>
        {entry.reaction ? <Text style={s.entryReaction}>{entry.reaction}</Text> : null}
        {onShare && (
          <Pressable onPress={() => onShare(entry)} hitSlop={8} style={s.entryShareBtn}>
            <Text style={s.entryShareIcon}>Share</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});
HistoryEntry.displayName = 'HistoryEntry';

// ─── Metadata Pill ───
const MetaPill: React.FC<{ label: string }> = React.memo(({ label }) => (
  <View style={s.metaPill}>
    <Text style={s.metaPillText}>{label}</Text>
  </View>
));
MetaPill.displayName = 'MetaPill';

// ─── Main ───
export default function RideDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { rideId, rideName } = route.params;

  const [ride, setRide] = useState<RideType | null>(null);
  const [history, setHistory] = useState<PlayerRideType[]>([]);
  const [community, setCommunity] = useState<CommunityStats | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shareEntry, setShareEntry] = useState<PlayerRideType | null>(null);
  const [imageError, setImageError] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastY = useRef(new Animated.Value(10)).current;
  const [toastText, setToastText] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [rideData, historyData, communityData] = await Promise.all([
        getRide(rideId),
        getPlayerRides({ ride_id: rideId, per_page: 50 }),
        getCommunityStats(rideId).catch(() => null),
      ]);
      setRide(rideData);
      setHistory(historyData.data);
      if (communityData) setCommunity(communityData);
      try {
        const wishlist = await getWishlist();
        setWishlisted(wishlist.some(w => w.id === rideId));
      } catch (_) {}
    } catch (e) {
      console.error('Failed to load ride detail:', e);
    }
  }, [rideId]);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await fetchData(); setRefreshing(false);
  }, [fetchData]);

  const showToast = useCallback((text: string) => {
    setToastText(text);
    toastOpacity.setValue(0);
    toastY.setValue(10);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(toastY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(toastY, { toValue: -10, duration: 400, useNativeDriver: true }),
        ]).start();
      }, 1200);
    });
  }, [toastOpacity, toastY]);

  const handleWishlistToggle = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await toggleWishlist(rideId);
      setWishlisted(result.wishlisted);
      showToast(result.wishlisted ? 'Added to Favorites' : 'Removed from Favorites');
    } catch (e) {
      Alert.alert('Error', 'Failed to update wishlist');
    }
  }, [rideId, showToast]);

  const totalRides = history.length;
  const avgRating = history.filter(h => h.rating).length > 0
    ? history.filter(h => h.rating).reduce((sum, h) => sum + (h.rating || 0), 0) / history.filter(h => h.rating).length
    : 0;
  const maxDistCount = community ? Math.max(...Object.values(community.rating_distribution), 1) : 1;
  const hasImage = ride?.image_url && ride.image_url.startsWith('http') && !imageError;

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <LinearGradient colors={[B.skyMid, B.skyDark, B.navy]} style={s.heroGradient}>
          <View style={s.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={s.backBtn}>
              <Text style={s.backChevron}>{'<'}</Text>
            </Pressable>
            <View style={{ width: 40 }} />
          </View>
        </LinearGradient>
        <ActivityIndicator size="large" color={B.skyDark} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const heroContent = (
    <>
      <View style={s.headerRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={s.backBtn}>
          <Text style={s.backChevron}>{'<'}</Text>
        </Pressable>
        <Pressable onPress={handleWishlistToggle} hitSlop={12} style={s.starBtn}>
          <Text style={s.starIcon}>{wishlisted ? '★' : '☆'}</Text>
        </Pressable>
      </View>
      <View style={s.heroBody}>
        <Text style={s.heroTitle} numberOfLines={2}>{rideName || ride?.name}</Text>
        {(ride?.park_name || ride?.park_id) && (
          <Text style={s.heroPark}>{ride.park_name || PARK_NAME_MAP[ride!.park_id] || ''}</Text>
        )}
        {/* Metadata pills */}
        <View style={s.metaRow}>
          {ride?.metadata?.year_opened && <MetaPill label={`Est. ${ride.metadata.year_opened}`} />}
          {ride?.metadata?.speed && <MetaPill label={`${ride.metadata.speed} mph`} />}
          {ride?.metadata?.manufacturer && <MetaPill label={ride.metadata.manufacturer} />}
          {ride?.metadata?.inversions && <MetaPill label={`${ride.metadata.inversions} inversions`} />}
        </View>
      </View>
    </>
  );

  return (
    <SafeAreaView style={s.container}>
      <FlatList
        data={history}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => <HistoryEntry entry={item} onShare={setShareEntry} />}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.skyDark} />}
        ListHeaderComponent={
          <View>
            {/* Hero: image background or gradient */}
            {hasImage ? (
              <View style={s.heroImageWrap}>
                <Image
                  source={{ uri: ride!.image_url! }}
                  style={s.heroImage}
                  contentFit="cover"
                  onError={() => setImageError(true)}
                />
                <LinearGradient
                  colors={['rgba(9,38,143,0.3)', 'rgba(9,38,143,0.85)']}
                  style={s.heroImageOverlay}
                >
                  {heroContent}
                </LinearGradient>
              </View>
            ) : (
              <LinearGradient colors={[B.skyMid, B.skyDark, B.navy]} style={s.heroGradient}>
                {heroContent}
              </LinearGradient>
            )}

            {/* Stats row */}
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statVal}>{totalRides}</Text>
                <Text style={s.statLabel}>Rides</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statVal}>{avgRating ? avgRating.toFixed(1) : '--'}</Text>
                <Text style={s.statLabel}>Your Avg</Text>
              </View>
              {community?.avg_rating != null && (
                <View style={s.statCard}>
                  <Text style={s.statVal}>{community.avg_rating}</Text>
                  <Text style={s.statLabel}>Community</Text>
                </View>
              )}
            </View>

            {/* Community Rating Distribution */}
            {community && community.total_logs > 0 && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>COMMUNITY RATINGS</Text>
                <Text style={s.communitySubtitle}>
                  {community.total_logs} logs from {community.unique_riders} riders
                </Text>
                {[5, 4, 3, 2, 1].map(r => (
                  <RatingBar key={r} rating={r} count={community.rating_distribution[r] || 0} maxCount={maxDistCount} />
                ))}
                {community.top_reactions.length > 0 && (
                  <View style={s.topReactions}>
                    <Text style={s.topReactionsLabel}>Top reactions:</Text>
                    {community.top_reactions.slice(0, 3).map(r => (
                      <Text key={r.reaction} style={s.topReactionItem}>{r.reaction} {r.count}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Log a ride CTA */}
            <Pressable
              onPress={() => navigation.navigate('RideLog')}
              style={({ pressed }) => [s.logBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            >
              <LinearGradient colors={[B.gold, B.goldDark]} style={s.logBtnGrad}>
                <Text style={s.logBtnText}>Log This Ride</Text>
              </LinearGradient>
            </Pressable>

            {/* History header */}
            <Text style={s.sectionTitle}>YOUR RIDE HISTORY</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyTitle}>You haven't ridden this yet!</Text>
            <Text style={s.emptySub}>Tap "Log This Ride" above to start</Text>
          </View>
        }
      />

      {/* Share Modal */}
      <Modal visible={!!shareEntry} animationType="slide" transparent>
        <Pressable style={s.modalOverlay} onPress={() => setShareEntry(null)}>
          <Pressable style={s.modalContent} onPress={() => {}}>
            {shareEntry && (
              <>
                <ShareableRideCard ride={shareEntry} rideCount={totalRides} onShare={() => setShareEntry(null)} />
                <Pressable onPress={() => setShareEntry(null)} style={s.modalClose}>
                  <Text style={s.modalCloseText}>Close</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Favorite toast */}
      <Animated.View
        pointerEvents="none"
        style={[s.toast, { opacity: toastOpacity, transform: [{ translateY: toastY }] }]}
      >
        <Text style={s.toastText}>{toastText}</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: B.pageBg },

  // ─── Hero (gradient fallback) ───
  heroGradient: {
    paddingBottom: 24,
    paddingTop: 4,
  },
  heroImageWrap: {
    width: '100%',
    minHeight: 260,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingBottom: 24,
    paddingTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  backChevron: { color: '#fff', fontSize: 22, fontWeight: '600' },
  starBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  starIcon: { color: B.gold, fontSize: 24, fontWeight: '700' },
  heroBody: { paddingHorizontal: 20, paddingTop: 8 },
  heroTitle: {
    color: '#fff', fontSize: 32, fontWeight: '900', fontFamily: 'Shark',
    marginBottom: 2,
  },
  heroPark: {
    color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600',
    marginBottom: 10,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  metaPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaPillText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' },

  // ─── Content ───
  listContent: { paddingBottom: 60 },

  // ─── Stats Row ───
  statsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  statCard: {
    flex: 1, backgroundColor: B.white, borderRadius: 16,
    padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  statVal: { color: B.navy, fontSize: 26, fontWeight: '900', fontFamily: 'Shark' },
  statLabel: { color: B.textMid, fontSize: 11, marginTop: 2, fontWeight: '600' },

  // ─── Card ───
  card: {
    backgroundColor: B.white, borderRadius: 20, padding: 16,
    marginHorizontal: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  sectionTitle: {
    color: B.textDark, fontSize: 13, fontWeight: '800',
    letterSpacing: 1.5, fontFamily: 'Knockout',
    marginBottom: 10, marginHorizontal: 16,
  },
  communitySubtitle: { color: B.textLight, fontSize: 12, marginBottom: 12 },

  // ─── Rating bars ───
  ratingBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  ratingBarLabel: { color: B.textMid, fontSize: 13, fontWeight: '700', width: 16, textAlign: 'center' },
  ratingBarTrack: { flex: 1, height: 8, backgroundColor: B.pageBg, borderRadius: 4, overflow: 'hidden' },
  ratingBarFill: { height: '100%', borderRadius: 4 },
  ratingBarCount: { color: B.textLight, fontSize: 12, width: 28, textAlign: 'right' },
  topReactions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  topReactionsLabel: { color: B.textLight, fontSize: 12 },
  topReactionItem: { fontSize: 15 },

  // ─── Log CTA ───
  logBtn: {
    marginHorizontal: 16, marginBottom: 20, borderRadius: 16,
    shadowColor: B.gold, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  logBtnGrad: { borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  logBtnText: { color: B.textDark, fontSize: 16, fontWeight: '800' },

  // ─── History entries ───
  entry: {
    backgroundColor: B.white, borderRadius: 16, padding: 14,
    marginHorizontal: 16, marginBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  entryLeft: { flex: 1, marginRight: 8 },
  entryRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  entryDate: { color: B.textDark, fontSize: 14, fontWeight: '700' },
  entryTime: { color: B.textMid, fontSize: 12, marginTop: 2 },
  entryReaction: { fontSize: 22 },
  entryNote: { color: B.textMid, fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  entryShareBtn: {
    backgroundColor: B.pageBg, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  entryShareIcon: { color: B.skyDark, fontSize: 11, fontWeight: '700' },

  // ─── Empty ───
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { color: B.textMid, fontSize: 16, fontWeight: '700' },
  emptySub: { color: B.textLight, fontSize: 13, marginTop: 4 },

  // ─── Share modal ───
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { maxHeight: '80%' },
  modalClose: {
    backgroundColor: B.white, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  modalCloseText: { color: B.textDark, fontSize: 16, fontWeight: '600' },

  // ─── Toast ───
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: B.navy,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
