import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  RefreshControl, Animated, useWindowDimensions,
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
import { withNumberFont, NUMBER_FONT } from '../../ui/numberText';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { titleFitsHeader, scoreText, riderWords, COMPACT_COMMUNITY_LOGS } from './rideDetailModel';

export { HEADER_TITLE_MAX, titleFitsHeader, scoreText, COMPACT_COMMUNITY_LOGS } from './rideDetailModel';

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
  starSlot: '#0d6fc6',
  textDark: '#1a1a2e',
  textMid: '#475569',
  textLight: '#94a3b8',
};

// ─── Rating Distribution Bar ───
const RatingBar: React.FC<{ rating: number; count: number; maxCount: number }> = React.memo(({ rating, count, maxCount }) => (
  <View style={s.ratingBarRow} accessible accessibilityLabel={`${rating} sharks: ${count}`}>
    <View style={s.ratingBarLabelWrap}>
      <Text style={s.ratingBarLabel}>{rating}</Text>
      <GameIcon name="shark" size={14} />
    </View>
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
          {withNumberFont(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}
        </Text>
        <Text style={s.entryTime}>
          {withNumberFont(date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            + (entry.wait_time_minutes != null ? `  ·  ${entry.wait_time_minutes} min wait` : ''))}
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
    <Text style={s.metaPillText}>{withNumberFont(label)}</Text>
  </View>
));
MetaPill.displayName = 'MetaPill';

// ─── Favorite star ───
// Off: Alex's star drawn as a white rim around a darker blue middle (an empty slot to fill).
// On: the full gold star. It pops with a spring when you save the ride.
const FavoriteStar: React.FC<{ on: boolean; size: number }> = React.memo(({ on, size }) => {
  const pop = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedGameMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!on || reducedMotion) return;
    pop.setValue(0.7);
    const anim = Animated.spring(pop, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [on, reducedMotion, pop]);
  const inner = Math.round(size * 0.56);
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale: pop }] }}>
      {on ? <GameIcon name="star" size={size} /> : (
        <>
          <GameIcon name="star" size={size} mono={B.white} />
          <GameIcon name="star" size={inner} mono={B.starSlot}
            style={{ position: 'absolute', left: (size - inner) / 2, top: (size - inner) / 2 + size * 0.03 }} />
        </>
      )}
    </Animated.View>
  );
});
FavoriteStar.displayName = 'FavoriteStar';

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
      showToast(result.wishlisted ? 'SAVED TO FAVORITES' : 'TAKEN OFF FAVORITES');
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
  const { width: screenWidth } = useWindowDimensions();
  // Measured in the header's own font: wide letters (WEB SLINGERS) move to the card instead of shrinking tiny.
  const [titleWidth, setTitleWidth] = useState<number | null>(null);
  // Until the probe measures it (one frame), the header title stays blank and the card holds no
  // name, so a long name never shows in the header and then jumps to the card.
  const measured = titleWidth != null;
  const shortName = measured ? titleFitsHeader(titleWidth, screenWidth) : true;
  const titleProbe = (
    <Text style={s.titleProbe} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      maxFontSizeMultiplier={1.2}
      onTextLayout={e => { const w = e.nativeEvent.lines[0]?.width; if (w) setTitleWidth(w); }}>
      {name.toUpperCase()}
    </Text>
  );
  const headerTitle = !measured ? '' : shortName ? name : 'Ride';

  if (loading || loadError) {
    return (
      <RideTrackerFrame title={headerTitle} style={s.container}>
        {titleProbe}
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
      <FavoriteStar on={wishlisted} size={34} />
    </Pressable>
  );
  const meta = ride?.metadata;
  const hasFacts = !!(meta?.year_opened || meta?.speed || meta?.manufacturer || meta?.inversions);
  // The ride card: its photo (when there is one), then the name, park and facts on white.
  // With only the park to say, it is one line under the header instead of a mostly empty card.
  const rideCard = !hasImage && shortName && !hasFacts ? (
    !!parkName && <Text style={s.parkLine} maxFontSizeMultiplier={1.3}>{parkName}</Text>
  ) : (
    <View style={s.rideCard}><View style={s.rideCardClip}>
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
    </View></View>
  );

  return (
    <RideTrackerFrame title={headerTitle} right={starButton} style={s.container}>
      {titleProbe}
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
              <View style={s.statCard} accessible accessibilityLabel={`Your rides: ${totalRides}`}>
                <View style={s.statValRow}>
                  <View style={s.statIcon}><GameIcon name="ride" size={20} /></View>
                  <Text style={s.statVal}>{totalRides}</Text>
                </View>
                <Text style={s.statLabel}>Your rides</Text>
              </View>
              <View style={s.statCard} accessible
                accessibilityLabel={avgRating > 0 ? `Your sharks: ${scoreText(avgRating)}` : 'Your sharks: none yet'}>
                <View style={s.statValRow}>
                  <View style={[s.statIcon, !(avgRating > 0) && s.statIconEmpty]}><GameIcon name="shark" size={20} /></View>
                  <Text style={[s.statVal, !(avgRating > 0) && s.statValEmpty]}>{scoreText(avgRating)}</Text>
                </View>
                <Text style={s.statLabel}>Your sharks</Text>
              </View>
              {community?.avg_rating != null && (
                <View style={s.statCard} accessible
                  accessibilityLabel={`Rider sharks: ${scoreText(community.avg_rating)}, ${riderWords(community.unique_riders)}`}>
                  <View style={s.statValRow}>
                    <View style={s.statIcon}><GameIcon name="shark" size={20} /></View>
                    <Text style={s.statVal}>{scoreText(community.avg_rating)}</Text>
                  </View>
                  <Text style={s.statLabel}>Rider sharks</Text>
                  <Text style={s.statCaption}>{withNumberFont(riderWords(community.unique_riders))}</Text>
                </View>
              )}
            </View>

            {/* Community ratings: one row for a few logs, the five-bar chart once there are enough */}
            {/* With only a log or two, the Rider sharks tile says it all ("from 1 rider"): no card for one line. */}
            {community && community.total_logs >= COMPACT_COMMUNITY_LOGS && (
              <View style={s.card}>
                <Text style={[s.sectionTitle, s.cardTitle]}>WHAT RIDERS SAY</Text>
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

            {/* History header (only once there is history: an empty list is one line under the button) */}
            {history.length > 0 && <Text style={s.sectionTitle}>YOUR RIDE HISTORY</Text>}
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.emptyTitle}>You haven't ridden this yet!</Text>
            {/* The shark waits by the ride, so the empty page is not a blank sheet. */}
            <View style={s.emptyArt} accessible={false}><GameIcon name="shark" size={110} /></View>
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
        <GameIcon name="star" size={22} />
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
  // Same white card as the stat tiles: no border, the same soft shadow.
  rideCard: {
    marginHorizontal: 16, marginTop: 16, backgroundColor: B.white, borderRadius: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  rideCardClip: { borderRadius: 22, overflow: 'hidden' },
  // Off-screen copy of the header title, to measure its natural width in the header font.
  titleProbe: {
    position: 'absolute', left: -5000, top: 0, width: 4000, opacity: 0, textAlign: 'left',
    fontSize: 32, fontFamily: 'Shark', letterSpacing: 1.5,
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
    paddingHorizontal: 16, paddingVertical: 12,
  },
  statCard: {
    flex: 1, backgroundColor: B.white, borderRadius: 16,
    padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  statValRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Both tile icons sit on the same light sky badge, so the red ride car and the shark read as one set.
  statIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#dcefff', alignItems: 'center', justifyContent: 'center' },
  statIconEmpty: { opacity: 0.4 },
  statValEmpty: { color: B.textLight },
  statCaption: { color: B.textMid, fontSize: 11, fontFamily: 'Knockout' },
  statVal: { color: B.navy, fontSize: 26, fontFamily: NUMBER_FONT },
  statLabel: { color: B.textMid, fontSize: 11, fontFamily: 'Knockout', marginTop: 2 },

  // ─── Card ───
  card: {
    backgroundColor: B.white, borderRadius: 20, padding: 16,
    marginHorizontal: 16, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  sectionTitle: {
    // The app's one section heading: navy Shark, like Settings ('GENERAL', 'AUDIO').
    color: B.navy, fontSize: 17,
    letterSpacing: 0.5, fontFamily: 'Shark',
    marginBottom: 10, marginHorizontal: 16,
  },
  cardTitle: { marginHorizontal: 0 },

  // ─── Rating bars ───
  ratingBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  ratingBarLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 30 },
  ratingBarLabel: { color: B.navy, fontSize: 13, fontFamily: NUMBER_FONT, width: 10, textAlign: 'center' },
  ratingBarTrack: { flex: 1, height: 8, backgroundColor: B.pageBg, borderRadius: 4, overflow: 'hidden' },
  ratingBarFill: { height: '100%', borderRadius: 4, backgroundColor: B.navy },
  ratingBarCount: { color: B.textMid, fontSize: 12, fontFamily: NUMBER_FONT, width: 28, textAlign: 'right' },
  topReactions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  topReactionsLabel: { color: B.textLight, fontSize: 12, fontFamily: 'Knockout' },
  topReactionItem: { color: B.navy, fontSize: 15, fontFamily: NUMBER_FONT },

  // ─── Log CTA ───
  logBtn: { marginHorizontal: 16, marginBottom: 14 },

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
  emptyWrap: { alignItems: 'center', paddingTop: 4, paddingBottom: 12 },
  emptyArt: { marginTop: 18, opacity: 0.9 },
  emptyTitle: { color: '#05346e', fontSize: 18, fontFamily: 'Shark' },

  // ─── Share modal ───
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5,52,110,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { maxHeight: '80%' },
  modalClose: { marginTop: 12 },

  // ─── Toast ───
  toast: {
    position: 'absolute',
    bottom: FOOTER_CLEARANCE,
    alignSelf: 'center',
    // The game's own toast: a white card with a navy rim, a gold star and navy Shark words.
    backgroundColor: B.white,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: B.navy,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: { color: B.navy, fontSize: 16, fontFamily: 'Shark' },
});
