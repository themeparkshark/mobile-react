import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  RefreshControl, Animated, Easing, AccessibilityInfo, useWindowDimensions,
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
import { scoreText, ratingCount, riderSharksCaption, COMPACT_COMMUNITY_LOGS, RIDE_DETAIL_HEADER } from './rideDetailModel';
import { plainRideName } from '../../helpers/plainRideName';

export { scoreText, COMPACT_COMMUNITY_LOGS, RIDE_DETAIL_HEADER } from './rideDetailModel';

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
// On: the full gold star. Saving pops it with a spring, a white ring flashes out of it and six gold
// stars burst out one after another, so the star itself says "saved" with zero reading and nothing
// ever covers the ride's name (it replaced a words banner that sat on long names). Taking it off
// shrinks it back into its slot. Native driver only; Reduce Motion shows the gold star with no burst.
const SPARKS = [0, 1, 2, 3, 4, 5].map(i => {
  const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
  // A slight stagger (every other star leaves a beat later), so the burst reads as a pop, not a blink.
  const start = (i % 2) * 0.1 + i * 0.015;
  return { x: Math.cos(a), y: Math.sin(a), start };
});
/** How long one save's burst lasts (the stars fly out and fade). */
export const STAR_BURST_MS = 680;
const FavoriteStar: React.FC<{ on: boolean; size: number }> = React.memo(({ on, size }) => {
  const pop = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedGameMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reducedMotion) return;
    pop.setValue(on ? 0.6 : 1.15);
    burst.setValue(0);
    const anim = Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }),
      ...(on ? [Animated.timing(burst, { toValue: 1, duration: STAR_BURST_MS, easing: Easing.linear, useNativeDriver: true })] : []),
    ]);
    anim.start();
    return () => anim.stop();
  }, [on, reducedMotion, pop, burst]);
  const inner = Math.round(size * 0.56);
  const spark = Math.round(size * 0.42);
  const reach = size * 1.2;
  const ring = Math.round(size * 1.1);
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale: pop }] }}>
      {on && !reducedMotion && (
        // The white ring flash: it opens out of the star and fades in the first third of the burst.
        <Animated.View pointerEvents="none" accessible={false}
          style={{
            position: 'absolute', left: (size - ring) / 2, top: (size - ring) / 2, width: ring, height: ring,
            borderRadius: ring / 2, borderWidth: 3, borderColor: B.white,
            opacity: burst.interpolate({ inputRange: [0, 0.05, 0.35, 1], outputRange: [0, 0.95, 0, 0] }),
            transform: [{ scale: burst.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.5, 1.45, 1.45] }) }],
          }} />
      )}
      {on && !reducedMotion && SPARKS.map((d, i) => {
        const t0 = d.start;
        const t1 = Math.min(1, t0 + 0.8);
        const span = t1 - t0;
        // An ease-out in plain points (native interpolation is piecewise linear).
        const fly = burst.interpolate({
          inputRange: [0, t0, t0 + span * 0.25, t0 + span * 0.5, t1, 1].map((v, k, a) => (k > 0 && v <= a[k - 1] ? a[k - 1] + 1e-4 : v)),
          outputRange: [0, 0, 0.44, 0.75, 1, 1],
        });
        return (
          <Animated.View key={i} pointerEvents="none" accessible={false}
            style={{
              position: 'absolute', left: (size - spark) / 2, top: (size - spark) / 2,
              opacity: burst.interpolate({ inputRange: [0, t0, t0 + 0.08, t0 + 0.55, t1, 1], outputRange: [0, 0, 1, 1, 0, 0] }),
              transform: [
                { translateX: Animated.multiply(fly, d.x * reach) },
                { translateY: Animated.multiply(fly, d.y * reach) },
                { scale: burst.interpolate({ inputRange: [0, t0, t0 + 0.2, t1, 1], outputRange: [0.4, 0.4, 1.1, 0.6, 0.6] }) },
                { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', i % 2 ? '-50deg' : '50deg'] }) },
              ],
            }}>
            <GameIcon name="star" size={spark} />
          </Animated.View>
        );
      })}
      {/* Both looks stay mounted and only swap opacity: a toggle never remounts the pictures, so a busy
          phone never shows an empty slot while the new star image decodes. */}
      <View style={{ position: 'absolute', left: 0, top: 0, opacity: on ? 0 : 1 }}>
        <GameIcon name="star" size={size} mono={B.white} />
        <GameIcon name="star" size={inner} mono={B.starSlot}
          style={{ position: 'absolute', left: (size - inner) / 2, top: (size - inner) / 2 + size * 0.03 }} />
      </View>
      <View style={{ opacity: on ? 1 : 0 }}><GameIcon name="star" size={size} /></View>
    </Animated.View>
  );
});
FavoriteStar.displayName = 'FavoriteStar';

// ─── Empty page pointer ───
/** A round blue arrow under LOG THIS RIDE, pointing up at it with a slow bob (still with Reduce Motion). */
function LogPointer() {
  const reducedMotion = useReducedGameMotion();
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) { bob.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, bob]);
  return (
    <Animated.View accessible={false} style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] }}>
      <View style={s.pointer}><GameIcon name="arrow" size={44} /></View>
    </Animated.View>
  );
}

/** Space above the waiting shark, and kept free under it inside the empty page. */
const EMPTY_ART_GAP = 14;
const EMPTY_BOTTOM = 12;
/** The waiting shark's size: the room left under the words (never bigger than 170, never under 72). */
export function emptySharkFor(screenHeight: number, room: number, words: number): number {
  if (screenHeight < 700 || room <= 0 || words <= 0) return 0;
  const left = Math.floor(room - words - EMPTY_ART_GAP - EMPTY_BOTTOM - 8);
  return left >= 72 ? Math.min(170, left) : 0;
}

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

  const handleWishlistToggle = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await toggleWishlist(rideId);
      setWishlisted(result.wishlisted);
      // The star's pop and burst say it on screen; VoiceOver hears it in words.
      AccessibilityInfo.announceForAccessibility(result.wishlisted ? 'Saved to favorites' : 'Taken off favorites');
    } catch (e) {
      gameAlert("Couldn't update your wishlist", 'Check your connection and try again.');
    }
  }, [rideId]);

  const avgRating = history.filter(h => h.rating).length > 0
    ? history.filter(h => h.rating).reduce((sum, h) => sum + (h.rating || 0), 0) / history.filter(h => h.rating).length
    : 0;
  const maxDistCount = community ? Math.max(...Object.values(community.rating_distribution), 1) : 1;
  const hasImage = ride?.image_url && ride.image_url.startsWith('http') && !imageError;

  const name = plainRideName(rideName || ride?.name || 'Ride');
  // A short phone (iPhone SE, 667 pt) gets a smaller waiting shark, so it never slides under the footer.
  const { height: screenHeight } = useWindowDimensions();
  // The waiting shark fills a tall empty page: it grows into the room left under the arrow and the
  // two lines (measured), so a Pro Max has no dead band above the footer. On a 667 pt phone (iPhone
  // SE) there is no room for it between LOG THIS RIDE and the footer compass (even at 84 pt it slid
  // under the compass), so the arrow and the two lines carry the page there.
  const [emptyRoom, setEmptyRoom] = useState(0);
  const [emptyWordsHeight, setEmptyWordsHeight] = useState(0);
  const emptySharkSize = emptySharkFor(screenHeight, emptyRoom, emptyWordsHeight);
  // One layout for every ride: the header always says RIDE TRACKER and the ride's name always
  // leads the white ride card (two lines for long names), so short and long names open the same way.
  const headerTitle = RIDE_DETAIL_HEADER;

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
      <FavoriteStar on={wishlisted} size={34} />
    </Pressable>
  );
  const meta = ride?.metadata;
  const hasFacts = !!(meta?.year_opened || meta?.speed || meta?.manufacturer || meta?.inversions);
  // The ride card, the same on every ride: its photo (when there is one), then the name, park and facts on white.
  const rideCard = (
    <View style={s.rideCard}><View style={s.rideCardClip}>
      {hasImage && (
        <Image source={{ uri: ride!.image_url! }} style={s.rideImage} contentFit="cover"
          onError={() => setImageError(true)} accessible={false} />
      )}
      <View style={s.rideBody}>
        <Text style={s.rideTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}
          maxFontSizeMultiplier={1.3} accessibilityRole="header">{name}</Text>
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
      <FlatList
        data={history}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => <HistoryEntry entry={item} onShare={setShareEntry} />}
        contentContainerStyle={[s.listContent, history.length === 0 && s.listContentEmpty]}
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
              {/* The same three tiles on every ride: with no ratings yet, Rider sharks says "?" (never a missing tile). */}
              {community?.avg_rating != null ? (
                <View style={s.statCard} accessible
                  accessibilityLabel={`Rider sharks: ${scoreText(community.avg_rating)}, ${riderSharksCaption(community)}`}>
                  <View style={s.statValRow}>
                    <View style={s.statIcon}><GameIcon name="shark" size={20} /></View>
                    <Text style={s.statVal}>{scoreText(community.avg_rating)}</Text>
                  </View>
                  <Text style={s.statLabel}>Rider sharks</Text>
                  <Text style={s.statCaption} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{withNumberFont(riderSharksCaption(community))}</Text>
                </View>
              ) : (
                <View style={s.statCard} accessible accessibilityLabel="Rider sharks: none yet">
                  <View style={s.statValRow}>
                    <View style={[s.statIcon, s.statIconEmpty]}><GameIcon name="shark" size={20} /></View>
                    <Text style={[s.statVal, s.statValEmpty]}>?</Text>
                  </View>
                  <Text style={s.statLabel}>Rider sharks</Text>
                </View>
              )}
            </View>

            {/* Community ratings: one row for a few logs, the five-bar chart once there are enough */}
            {/* With only a log or two, the Rider sharks tile says it all ("from 1 rider"): no card for one line. */}
            {community && ratingCount(community.rating_distribution) >= COMPACT_COMMUNITY_LOGS && (
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
          <View style={s.emptyWrap} onLayout={e => {
            const h = Math.round(e.nativeEvent.layout.height);
            setEmptyRoom(prev => (Math.abs(prev - h) > 1 ? h : prev));
          }}>
            {/* An arrow up at LOG THIS RIDE, then the shark: the empty page says what to do without reading. */}
            <View style={s.emptyWords} onLayout={e => {
              const h = Math.round(e.nativeEvent.layout.height);
              setEmptyWordsHeight(prev => (Math.abs(prev - h) > 1 ? h : prev));
            }}>
              <LogPointer />
              <Text style={s.emptyTitle}>You haven't ridden this yet!</Text>
              <Text style={s.emptyHint}>Rode it? Tap LOG THIS RIDE.</Text>
            </View>
            {/* The shark waits by the ride, so the empty page is not a blank sheet (the riders' chart fills it otherwise). */}
            {emptySharkSize > 0 && !(community && ratingCount(community.rating_distribution) >= COMPACT_COMMUNITY_LOGS) &&
              <View style={s.emptyArt} accessible={false}><GameIcon name="shark" size={emptySharkSize} /></View>}
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
  rideImage: { width: '100%', height: 170 },
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
  // No rides yet: the empty page fills the space under the button and centers in it (no blank third).
  listContentEmpty: { flexGrow: 1 },

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
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 0, paddingBottom: EMPTY_BOTTOM },
  emptyWords: { alignItems: 'center' },
  emptyArt: { marginTop: EMPTY_ART_GAP, opacity: 0.95 },
  emptyTitle: { color: '#05346e', fontSize: 18, fontFamily: 'Shark', marginTop: 8 },
  emptyHint: { color: B.textMid, fontSize: 15, fontFamily: 'Knockout', marginTop: 4 },
  pointer: { transform: [{ rotate: '-90deg' }] },

  // ─── Share modal ───
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5,52,110,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { maxHeight: '80%' },
  modalClose: { marginTop: 12 },
});
