import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
  RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { getPlayerRides, PlayerRideType } from '../../api/endpoints/player-rides';
import { getRide, RideType } from '../../api/endpoints/rides';
import { getCommunityStats, CommunityStats } from '../../api/endpoints/rides/communityStats';
import { toggleWishlist, getWishlist } from '../../api/endpoints/rides/wishlist';
import SharkRating from '../../components/RideTracker/SharkRating';
import RideTypeIcon from '../../components/RideTracker/RideTypeIcon';
import ShareableRideCard from '../../components/RideTracker/ShareableRideCard';
import { colors, shadows, borderRadius } from '../../design-system';
import { Modal } from 'react-native';

// ─── Rating Distribution Bar ───
interface RatingBarProps {
  rating: number;
  count: number;
  maxCount: number;
}
const RatingBar: React.FC<RatingBarProps> = React.memo(({ rating, count, maxCount }) => (
  <View style={styles.ratingBarRow}>
    <Text style={styles.ratingBarLabel}>{rating}🦈</Text>
    <View style={styles.ratingBarTrack}>
      <View style={[styles.ratingBarFill, { width: maxCount > 0 ? `${(count / maxCount) * 100}%` : '0%' }]} />
    </View>
    <Text style={styles.ratingBarCount}>{count}</Text>
  </View>
));
RatingBar.displayName = 'RatingBar';

// ─── History Entry ───
interface HistoryEntryProps { entry: PlayerRideType; }
const HistoryEntry: React.FC<HistoryEntryProps & { onShare?: (e: PlayerRideType) => void }> = React.memo(({ entry, onShare }) => {
  const date = new Date(entry.rode_at);
  return (
    <View style={styles.entry}>
      <View style={styles.entryHeader}>
        <Text style={styles.entryDate}>
          {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {' • '}
          {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </Text>
        {onShare && (
          <Pressable onPress={() => onShare(entry)} hitSlop={8} style={{ padding: 4 }}>
            <Text style={{ fontSize: 14 }}>📤</Text>
          </Pressable>
        )}
        {entry.reaction && <Text style={styles.entryReaction}>{entry.reaction}</Text>}
      </View>
      {entry.rating != null && entry.rating > 0 && (
        <SharkRating rating={entry.rating} size={16} readonly />
      )}
      {entry.wait_time_minutes != null && (
        <Text style={styles.entryWait}>{entry.wait_time_minutes} min wait</Text>
      )}
      {entry.note && <Text style={styles.entryNote}>"{entry.note}"</Text>}
    </View>
  );
});
HistoryEntry.displayName = 'HistoryEntry';

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
      // Check if ride is on wishlist
      try {
        const wishlist = await getWishlist();
        setWishlisted(wishlist.some(w => w.id === rideId));
      } catch (_) { /* wishlist check non-critical */ }
    } catch (e) {
      console.error('Failed to load ride detail:', e);
    }
  }, [rideId]);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await fetchData(); setRefreshing(false);
  }, [fetchData]);

  const handleWishlistToggle = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await toggleWishlist(rideId);
      setWishlisted(result.wishlisted);
    } catch (e) {
      Alert.alert('Error', 'Failed to update wishlist');
    }
  }, [rideId]);

  const totalRides = history.length;
  const avgRating = history.filter(h => h.rating).length > 0
    ? history.filter(h => h.rating).reduce((s, h) => s + (h.rating || 0), 0) / history.filter(h => h.rating).length
    : 0;

  const maxDistCount = community
    ? Math.max(...Object.values(community.rating_distribution), 1)
    : 1;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{rideName || ride?.name}</Text>
        <Pressable onPress={handleWishlistToggle} hitSlop={12}>
          <Text style={styles.wishlistBtn}>{wishlisted ? '⭐' : '☆'}</Text>
        </Pressable>
      </View>

      <FlatList
        data={history}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => <HistoryEntry entry={item} onShare={setShareEntry} />}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
        ListHeaderComponent={
          <View>
            {/* Ride Image */}
            {ride?.image_url && (
              <Image source={{ uri: ride.image_url }} style={styles.rideImage} contentFit="cover" />
            )}

            {/* Ride Info Card */}
            {ride && (
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <RideTypeIcon type={ride.type} size={28} showLabel />
                </View>
                {ride.metadata?.year_opened && (
                  <Text style={styles.infoDetail}>Opened {ride.metadata.year_opened}</Text>
                )}
                {ride.metadata?.speed && (
                  <Text style={styles.infoDetail}>Top speed: {ride.metadata.speed} mph</Text>
                )}
                {ride.metadata?.manufacturer && (
                  <Text style={styles.infoDetail}>By {ride.metadata.manufacturer}</Text>
                )}
                {ride.metadata?.inversions && (
                  <Text style={styles.infoDetail}>{ride.metadata.inversions} inversions</Text>
                )}
              </View>
            )}

            {/* Your Stats */}
            <View style={styles.statsRow}>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatVal}>{totalRides}</Text>
                <Text style={styles.miniStatLabel}>Times Ridden</Text>
              </View>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatVal}>{avgRating ? avgRating.toFixed(1) : '—'}</Text>
                <Text style={styles.miniStatLabel}>Your Avg</Text>
              </View>
              {community?.avg_rating && (
                <View style={styles.miniStat}>
                  <Text style={styles.miniStatVal}>{community.avg_rating}</Text>
                  <Text style={styles.miniStatLabel}>Community</Text>
                </View>
              )}
            </View>

            {/* Community Rating Distribution */}
            {community && community.total_logs > 0 && (
              <View style={styles.communitySection}>
                <Text style={styles.sectionTitle}>Community Ratings</Text>
                <Text style={styles.communitySubtitle}>
                  {community.total_logs} logs from {community.unique_riders} riders
                </Text>
                {[5, 4, 3, 2, 1].map(r => (
                  <RatingBar
                    key={r}
                    rating={r}
                    count={community.rating_distribution[r] || 0}
                    maxCount={maxDistCount}
                  />
                ))}
                {community.top_reactions.length > 0 && (
                  <View style={styles.topReactions}>
                    <Text style={styles.topReactionsLabel}>Top reactions:</Text>
                    {community.top_reactions.slice(0, 3).map(r => (
                      <Text key={r.reaction} style={styles.topReactionEmoji}>
                        {r.reaction} {r.count}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Log a ride button */}
            <Pressable
              onPress={() => navigation.navigate('RideLog')}
              style={({ pressed }) => [styles.logBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.logBtnText}>🎢 Log This Ride</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>Your Ride History</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>You haven't ridden this yet!</Text>
            <Text style={styles.emptySubtext}>Tap "Log This Ride" above to start</Text>
          </View>
        }
      />

      {/* Share Modal */}
      <Modal visible={!!shareEntry} animationType="slide" transparent>
        <Pressable style={styles.shareOverlay} onPress={() => setShareEntry(null)}>
          <Pressable style={styles.shareContent} onPress={() => {}}>
            {shareEntry && (
              <>
                <ShareableRideCard ride={shareEntry} rideCount={totalRides} onShare={() => setShareEntry(null)} />
                <Pressable onPress={() => setShareEntry(null)} style={styles.shareClose}>
                  <Text style={styles.shareCloseText}>Close</Text>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { color: colors.secondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', fontFamily: 'Shark', flex: 1, textAlign: 'center' },
  wishlistBtn: { fontSize: 24 },
  content: { padding: 16, paddingBottom: 60 },
  rideImage: { width: '100%', height: 200, borderRadius: 16, marginBottom: 16 },
  infoCard: {
    backgroundColor: colors.bgMedium, borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  infoDetail: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  miniStat: {
    flex: 1, backgroundColor: colors.bgMedium, borderRadius: 12, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  miniStatVal: { color: colors.textPrimary, fontSize: 28, fontWeight: '800', fontFamily: 'Shark' },
  miniStatLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 4, textAlign: 'center' },
  // Community section
  communitySection: {
    backgroundColor: colors.bgMedium, borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  communitySubtitle: { color: colors.textMuted, fontSize: 12, marginBottom: 12 },
  ratingBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  ratingBarLabel: { color: colors.textSecondary, fontSize: 12, width: 32 },
  ratingBarTrack: { flex: 1, height: 8, backgroundColor: colors.bgDark, borderRadius: 4, overflow: 'hidden' },
  ratingBarFill: { height: '100%', backgroundColor: colors.tertiary, borderRadius: 4 },
  ratingBarCount: { color: colors.textMuted, fontSize: 12, width: 24, textAlign: 'right' },
  topReactions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  topReactionsLabel: { color: colors.textMuted, fontSize: 12 },
  topReactionEmoji: { fontSize: 16 },
  // Log button
  logBtn: {
    backgroundColor: colors.secondary, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    marginBottom: 20, ...shadows.sm,
  },
  logBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sectionTitle: {
    color: colors.tertiary, fontSize: 14, fontWeight: '700', marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Shark',
  },
  entry: {
    backgroundColor: colors.bgMedium, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  entryDate: { color: colors.textSecondary, fontSize: 13 },
  entryReaction: { fontSize: 18 },
  entryWait: { color: colors.tertiary, fontSize: 12, marginTop: 4 },
  entryNote: { color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginTop: 6 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: colors.textMuted, fontSize: 15 },
  emptySubtext: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  // Share modal
  shareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  shareContent: { maxHeight: '80%' },
  shareClose: {
    backgroundColor: colors.bgMedium, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  shareCloseText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
});
