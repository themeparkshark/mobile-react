import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  RefreshControl, Animated,
} from 'react-native';
import RideTrackerFrame from './RideTrackerFrame';
import { FOOTER_CLEARANCE } from '../../components/Wrapper';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { getPlayerRides, PlayerRideType } from '../../api/endpoints/player-rides';
import { getRide, RideType } from '../../api/endpoints/rides';
import { getCommunityStats, CommunityStats } from '../../api/endpoints/rides/communityStats';
import { toggleWishlist, getWishlist } from '../../api/endpoints/rides/wishlist';
import SharkRating from '../../components/RideTracker/SharkRating';
import ShareableRideCard from '../../components/RideTracker/ShareableRideCard';
import SharkReactionIcon from '../../components/RideTracker/SharkReactionIcon';
import { Modal } from 'react-native';
import { PARK_DISPLAY_ORDER } from '../../constants/parkWaitTimes';
import { GameButton, GameIcon, gameAlert, SharkLoader } from '../../ui';

/** Ride names this long or shorter are the header title; longer ones go big in the ride card. */
export const HEADER_TITLE_MAX = 16;

const PARK_NAME_MAP: Record<number, string> = Object.fromEntries(
  PARK_DISPLAY_ORDER.map(p => [p.id, p.name])
);

// ─── Brand ───
const B = {
  pageBg: '#e8f4fd',
  white: '#FFFFFF',
  navy: '#09268f',
  skyDark: '#0EA5E9',
  gold: '#fec90e',
  textDark: '#1a1a2e',
  textMid: '#475569',
  textLight: '#94a3b8',
};

// ─── Rating Distribution Bar ───
const RatingBar: React.FC<{ rating: number; count: number; maxCount: number }> = React.memo(({ rating, count, maxCount }) => (
  <View style={s.ratingBarRow}>
    <Text style={s.ratingBarLabel}>{rating}</Text>
    <View style={s.ratingBarTrack}>
      <View style={[s.ratingBarFill, { width: maxCount > 0 ? `${(count / maxCount) * 100}%` : '0%' }]} />
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
        {entry.reaction ? <SharkReactionIcon reaction={entry.reaction} size={30} /> : null}
        {onShare && (
          <Pressable onPress={() => onShare(entry)} hitSlop={8} style={s.entryShareBtn}
            accessibilityRole="button" accessibilityLabel={`Share your ${entry.ride_name} memory`}>
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
  const [totalRides, setTotalRides] = useState(0);
  const [community, setCommunity] = useState<CommunityStats | null>(null);
  const [wishlisted, setWishlisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shareEntry, setShareEntry] = useState<PlayerRideType | null>(null);
  const [imageError, setImageError] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastY = useRef(new Animated.Value(10)).current;
  const [toastText, setToastText] = useState('');
  const [loadError, setLoadError] = useState(false);
  const loadedOnce = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const [rideData, historyData, communityData] = await Promise.all([
        getRide(rideId),
        getPlayerRides({ ride_id: rideId, per_page: 50 }),
        getCommunityStats(rideId).catch(() => null),
      ]);
      setRide(rideData);
      loadedOnce.current = true;
      setHistory(historyData.data);
      setTotalRides(historyData.meta.total);
      if (communityData) setCommunity(communityData);
      try {
        const wishlist = await getWishlist();
        setWishlisted(wishlist.some(w => w.id === rideId));
      } catch (_) {}
      setLoadError(false);
    } catch (e) {
      // Never pass a failed load off as a ride you have not ridden.
      if (!loadedOnce.current) setLoadError(true);
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
      gameAlert("Couldn't update your wishlist", 'Check your connection and try again.');
    }
  }, [rideId, showToast]);

  const avgRating = history.filter(h => h.rating).length > 0
    ? history.filter(h => h.rating).reduce((sum, h) => sum + (h.rating || 0), 0) / history.filter(h => h.rating).length
    : 0;
  const maxDistCount = community ? Math.max(...Object.values(community.rating_distribution), 1) : 1;
  const hasImage = ride?.image_url && ride.image_url.startsWith('http') && !imageError;

  const name = rideName || ride?.name || 'Ride';
  const shortName = name.length <= HEADER_TITLE_MAX;
  const headerTitle = shortName ? name : 'Ride';

  if (loading || loadError) {
    return (
      <RideTrackerFrame title={headerTitle} style={s.container}>
        {loadError
          ? <SharkLoader state="error" onRetry={() => { setLoadError(false); setLoading(true); void fetchData().finally(() => setLoading(false)); }} />
          : <SharkLoader />}
      </RideTrackerFrame>
    );
  }

  const parkName = ride ? (ride.park_name || PARK_NAME_MAP[ride.park_id] || '') : '';
  const starButton = (
    <Pressable onPress={handleWishlistToggle} hitSlop={12} style={s.starBtn} accessibilityRole="button"
      accessibilityLabel={wishlisted ? 'Remove from favorites' : 'Add to favorites'}>
      <GameIcon name="star" size={34} style={wishlisted ? undefined : { opacity: 0.45 }} />
    </Pressable>
  );
  const meta = ride?.metadata;
  const hasFacts = !!(meta?.year_opened || meta?.speed || meta?.manufacturer || meta?.inversions);
  // The ride card: its photo (when there is one), then the name, park and facts on white.
  // With only the park to say, it is one line under the header instead of a mostly empty card.
  const rideCard = !hasImage && shortName && !hasFacts ? (
    !!parkName && <Text style={s.parkLine} maxFontSizeMultiplier={1.3}>{parkName}</Text>
  ) : (
    <View style={s.rideCard}>
      {hasImage && (
        <Image source={{ uri: ride!.image_url! }} style={s.rideImage} contentFit="cover"
          onError={() => setImageError(true)} accessible={false} />
      )}
      <View style={s.rideBody}>
        {!shortName && <Text style={s.rideTitle} numberOfLines={2} maxFontSizeMultiplier={1.3}>{name}</Text>}
        {!!parkName && <Text style={s.ridePark} maxFontSizeMultiplier={1.3}>{parkName}</Text>}
        <View style={s.metaRow}>
          {ride?.metadata?.year_opened && <MetaPill label={`Opened ${ride.metadata.year_opened}`} />}
          {ride?.metadata?.speed && <MetaPill label={`${ride.metadata.speed} mph`} />}
          {ride?.metadata?.manufacturer && <MetaPill label={ride.metadata.manufacturer} />}
          {ride?.metadata?.inversions && <MetaPill label={`Upside down ${ride.metadata.inversions} times`} />}
        </View>
      </View>
    </View>
  );

  return (
    <RideTrackerFrame title={headerTitle} right={starButton} style={s.container}>
      <FlatList
        data={history}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => <HistoryEntry entry={item} onShare={setShareEntry} />}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.skyDark} />}
        ListHeaderComponent={
          <View>
            {rideCard}

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
                <Text style={[s.sectionTitle, s.cardTitle]}>COMMUNITY RATINGS</Text>
                <Text style={s.communitySubtitle}>
                  {`${community.total_logs} ${community.total_logs === 1 ? 'log' : 'logs'} from ${community.unique_riders} ${community.unique_riders === 1 ? 'rider' : 'riders'}`}
                </Text>
                {[5, 4, 3, 2, 1].map(r => (
                  <RatingBar key={r} rating={r} count={community.rating_distribution[r] || 0} maxCount={maxDistCount} />
                ))}
                {community.top_reactions.length > 0 && (
                  <View style={s.topReactions}>
                    <Text style={s.topReactionsLabel}>Top reactions:</Text>
                    {community.top_reactions.slice(0, 3).map(r => (
                      <View key={r.reaction} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <SharkReactionIcon reaction={r.reaction} size={24} />
                        <Text style={s.topReactionItem}>{r.count}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Log a ride CTA */}
            <GameButton label="Log this ride" icon="ride" onPress={() => navigation.navigate('RideLog')} style={s.logBtn} />

            {/* History header */}
            <Text style={s.sectionTitle}>YOUR RIDE HISTORY</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyTitle}>You haven't ridden this yet!</Text>
            <Text style={s.emptySub}>Tap LOG THIS RIDE above to start.</Text>
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
                <GameButton label="Close" variant="secondary" onPress={() => setShareEntry(null)} style={s.modalClose} />
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
    </RideTrackerFrame>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: B.pageBg },

  // ─── Header star ───
  starBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },

  // ─── Ride card ───
  rideCard: {
    marginHorizontal: 16, marginTop: 16, backgroundColor: B.white, borderRadius: 22,
    borderWidth: 2, borderColor: '#abd9f1', overflow: 'hidden',
  },
  rideImage: { width: '100%', height: 170 },
  parkLine: { color: '#05346e', fontSize: 18, fontFamily: 'Knockout', textAlign: 'center', marginTop: 16 },
  rideBody: { paddingHorizontal: 16, paddingVertical: 14 },
  rideTitle: { color: '#05346e', fontSize: 26, fontFamily: 'Shark', marginBottom: 2 },
  ridePark: { color: '#2c5a85', fontSize: 16, fontFamily: 'Knockout', marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: {
    backgroundColor: B.pageBg,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaPillText: { color: B.navy, fontSize: 13, fontFamily: 'Knockout' },

  // ─── Content ───
  listContent: { paddingBottom: FOOTER_CLEARANCE },

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
  statVal: { color: B.navy, fontSize: 26, fontFamily: 'Shark' },
  statLabel: { color: B.textMid, fontSize: 11, fontFamily: 'Knockout', marginTop: 2 },

  // ─── Card ───
  card: {
    backgroundColor: B.white, borderRadius: 20, padding: 16,
    marginHorizontal: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  sectionTitle: {
    color: B.textDark, fontSize: 13,
    letterSpacing: 1.5, fontFamily: 'Knockout',
    marginBottom: 10, marginHorizontal: 16,
  },
  cardTitle: { marginHorizontal: 0 },
  communitySubtitle: { color: '#2c5a85', fontSize: 13, fontFamily: 'Knockout', marginBottom: 12 },

  // ─── Rating bars ───
  ratingBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  ratingBarLabel: { color: B.textMid, fontSize: 13, fontFamily: 'Knockout', width: 16, textAlign: 'center' },
  ratingBarTrack: { flex: 1, height: 8, backgroundColor: B.pageBg, borderRadius: 4, overflow: 'hidden' },
  ratingBarFill: { height: '100%', borderRadius: 4, backgroundColor: B.navy },
  ratingBarCount: { color: B.textLight, fontSize: 12, fontFamily: 'Knockout', width: 28, textAlign: 'right' },
  topReactions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  topReactionsLabel: { color: B.textLight, fontSize: 12, fontFamily: 'Knockout' },
  topReactionItem: { fontSize: 15, fontFamily: 'Knockout' },

  // ─── Log CTA ───
  logBtn: { marginHorizontal: 16, marginBottom: 20 },

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
  entryDate: { color: B.textDark, fontSize: 14, fontFamily: 'Knockout' },
  entryTime: { color: B.textMid, fontSize: 12, fontFamily: 'Knockout', marginTop: 2 },
  entryReaction: { fontSize: 22, fontFamily: 'Knockout' },
  entryNote: { color: B.textMid, fontSize: 12, fontFamily: 'Knockout', fontStyle: 'italic', marginTop: 4 },
  entryShareBtn: {
    backgroundColor: B.pageBg, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  entryShareIcon: { color: B.skyDark, fontSize: 11, fontFamily: 'Knockout' },

  // ─── Empty ───
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { color: '#05346e', fontSize: 18, fontFamily: 'Shark' },
  emptySub: { color: '#2c5a85', fontSize: 15, fontFamily: 'Knockout', marginTop: 4 },

  // ─── Share modal ───
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5,52,110,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { maxHeight: '80%' },
  modalClose: { marginTop: 12 },

  // ─── Toast ───
  toast: {
    position: 'absolute',
    bottom: FOOTER_CLEARANCE,
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
  toastText: { color: '#fff', fontSize: 14, fontFamily: 'Knockout' },
});
