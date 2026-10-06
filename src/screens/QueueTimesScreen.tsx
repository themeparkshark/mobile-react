import { FlashList } from '@shopify/flash-list';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import getWikiTimes, { WikiLiveEntry } from '../api/endpoints/parks/queue-times/getWikiTimes';
import {
  CLOSED_COLOR,
  DOWN_COLOR,
  PARK_DISPLAY_ORDER,
  REFURB_COLOR,
  WAIT_COLOR_TIERS,
} from '../constants/parkWaitTimes';
import { LocationContext } from '../context/LocationProvider';
import { resolveRideContextOrOffline } from '../services/lineplay/resolveRide';
import { queuePlayPolicy } from '../services/lineplay/queuePlayPolicy';
import { compareQueueWaits, postedStandbyWait } from '../services/lineplay/queueWaitPresentation';

// --- Types ---
type SortMode = 'wait-desc' | 'wait-asc' | 'name';
type FilterMode = 'open' | 'all';

// --- Helpers (module level) ---
function getWaitColor(minutes: number) {
  for (const tier of WAIT_COLOR_TIERS) {
    if (minutes <= tier.max) return tier;
  }
  return WAIT_COLOR_TIERS[WAIT_COLOR_TIERS.length - 1];
}

function getBadgeInfo(entry: WikiLiveEntry) {
  const waitTime = postedStandbyWait(entry);
  if (entry.status === 'DOWN') {
    return { text: '!', color: DOWN_COLOR, statusText: 'Temporarily Down' };
  }
  if (entry.status === 'REFURBISHMENT') {
    return { text: '\u{1F527}', color: REFURB_COLOR, statusText: 'Refurbishment' };
  }
  if (entry.status === 'CLOSED') {
    return { text: '-', color: CLOSED_COLOR, statusText: 'Closed' };
  }
  // OPERATING
  if (waitTime === null) {
    return { text: '?', color: '#1687c9', statusText: 'Operating · wait not posted' };
  }
  const mins = waitTime;
  const tier = getWaitColor(mins);
  return { text: String(mins), color: tier.color, statusText: 'Operating' };
}

function formatReturnTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'Just now';
  const mins = Math.floor(diff / 60);
  return `${mins} min ago`;
}

// --- Components (module level) ---
const SkeletonCard = () => {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={[styles.badge, { backgroundColor: '#E5E7EB' }]} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ width: '70%', height: 16, backgroundColor: '#E5E7EB', borderRadius: 4 }} />
        <View style={{ width: '40%', height: 12, backgroundColor: '#F3F4F6', borderRadius: 4, marginTop: 6 }} />
      </View>
    </Animated.View>
  );
};

const RideCard = ({
  entry,
  onStartSession,
}: {
  entry: WikiLiveEntry;
  onStartSession: (entry: WikiLiveEntry) => void;
}) => {
  const badge = getBadgeInfo(entry);
  const ll = entry.queue?.RETURN_TIME;
  const hasLL = ll?.state === 'AVAILABLE';
  const returnTime = hasLL ? formatReturnTime(ll?.returnStart) : null;
  // A temporary stop can be the most boring part of a wait. Games stay available
  // there, but this session must never claim proximity-based Parts.
  const canStartSession = queuePlayPolicy(entry.status).canPlay;

  return (
    <View style={[styles.card, { borderLeftColor: badge.color, borderLeftWidth: 3, flexWrap: 'wrap' }]}>
      <View style={styles.cardRow}>
        <View style={[styles.badge, { backgroundColor: badge.color }]}>
          <Text style={styles.badgeText}>{badge.text}</Text>
        </View>
        <View style={styles.cardCenter}>
          <Text style={styles.rideName} numberOfLines={2}>{entry.name}</Text>
          <Text style={styles.statusText}>{badge.statusText}</Text>
          {canStartSession && (
            <Pressable
              onPress={() => onStartSession(entry)}
              accessibilityRole="button"
              accessibilityLabel={entry.status === 'DOWN'
                ? `Play line games for ${entry.name}. The ride is down right now, so no Ride Parts this time.`
                : `Start LinePlay for ${entry.name}`}
              style={({ pressed }) => [styles.sessionBtn, pressed && styles.sessionBtnPressed]}
              hitSlop={6}
            >
              <Text style={styles.sessionBtnText}>{entry.status === 'DOWN'
                ? '▶  GAMES · NO PARTS' : '▶  PLAY IN LINE'}</Text>
            </Pressable>
          )}
        </View>
        {hasLL && (
          <View style={styles.llBadge}>
            <Text style={styles.llText}>LL</Text>
            {returnTime && <Text style={styles.llTime}>{returnTime}</Text>}
          </View>
        )}
      </View>
    </View>
  );
};

const ParkPill = ({
  park,
  selected,
  onPress,
}: {
  park: { id: number; name: string };
  selected: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    accessibilityLabel={`${park.name} wait times`}
    style={[styles.pill, selected && styles.pillSelected]}
  >
    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{park.name}</Text>
  </Pressable>
);

const SortButton = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
    style={[styles.sortBtn, active && styles.sortBtnActive]}>
    <Text style={[styles.sortBtnText, active && styles.sortBtnTextActive]}>{label}</Text>
  </Pressable>
);

// Park group center coordinates for proximity sorting
const PARK_GROUP_COORDS: Record<string, { latitude: number; longitude: number }> = {
  'Walt Disney World': { latitude: 28.3852, longitude: -81.5639 },
  'Disneyland Resort': { latitude: 33.8121, longitude: -117.9190 },
  'Universal Orlando': { latitude: 28.4722, longitude: -81.4677 },
  'Universal Hollywood': { latitude: 34.1381, longitude: -118.3534 },
};

function distanceBetween(
  lat1: number, lon1: number, lat2: number, lon2: number
): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Main Screen ---
export default function QueueTimesScreen({ route }: { route: any }) {
  const navigation = useNavigation();
  const { location } = useContext(LocationContext);
  const previewEntries: WikiLiveEntry[] | undefined = __DEV__ ? route.params?.previewEntries : undefined;
  const [attractions, setAttractions] = useState<WikiLiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPark, setSelectedPark] = useState<number>(route.params.park);
  const [sortMode, setSortMode] = useState<SortMode>('wait-desc');
  const [filterMode, setFilterMode] = useState<FilterMode>('open');
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [feedError, setFeedError] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchGeneration = useRef(0);

  const fetchData = useCallback(async (showLoading = false) => {
    const generation = ++fetchGeneration.current;
    if (showLoading) setLoading(true);
    setFeedError(false);
    try {
      const data = previewEntries ?? await getWikiTimes(selectedPark);
      if (generation !== fetchGeneration.current) return;
      setAttractions(data);
      setLastUpdated(Date.now());
      setCountdown(60);
    } catch (e) {
      if (generation === fetchGeneration.current) {
        setFeedError(true);
        console.warn('Failed to fetch wait times', e);
      }
    } finally {
      if (generation === fetchGeneration.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedPark, previewEntries]);

  // Initial load + park change
  useEffect(() => {
    setAttractions([]);
    setLastUpdated(0);
    void fetchData(true);
    return () => { fetchGeneration.current += 1; };
  }, [fetchData]);

  const selectPark = (parkId: number) => {
    if (parkId === selectedPark) return;
    fetchGeneration.current += 1;
    setAttractions([]);
    setLastUpdated(0);
    setFeedError(false);
    setLoading(true);
    setSelectedPark(parkId);
  };

  // Auto-refresh every 60s
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchData(false);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(false);
  }, [fetchData]);

  // Start a LinePlay session for a wait-times row. Resolves the numeric ride id
  // by name (queue-times entries are name-keyed) then navigates to LinePlay.
  const handleStartSession = useCallback(
    async (entry: WikiLiveEntry) => {
      if (previewEntries) return;
      const rideOperating = queuePlayPolicy(entry.status).canRequestParts;
      const postedWait = rideOperating ? postedStandbyWait(entry) : null;
      const ride = await resolveRideContextOrOffline(selectedPark, entry.name, postedWait,
        rideOperating ? lastUpdated || null : null, entry.id);
      (navigation as any).navigate('LinePlay', { ride: rideOperating
        ? ride : { ...ride, lineRewardsReady: false } });
    },
    [navigation, selectedPark, lastUpdated, previewEntries],
  );

  // Filter & sort
  const processedData = useMemo(() => {
    let data = [...attractions];

    if (filterMode === 'open') {
      data = data.filter((e) => e.status === 'OPERATING' || e.status === 'DOWN');
    }

    data.sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      return compareQueueWaits(a, b, sortMode);
    });

    return data;
  }, [attractions, filterMode, sortMode]);

  const openCount = attractions.filter((e) => e.status === 'OPERATING').length;
  const totalCount = attractions.length;
  // Group parks for display, sorted by proximity to user's location
  const groupedParks = useMemo(() => {
    const groups: { group: string; parks: typeof PARK_DISPLAY_ORDER }[] = [];
    let lastGroup = '';
    for (const p of PARK_DISPLAY_ORDER) {
      if (p.group !== lastGroup) {
        groups.push({ group: p.group, parks: [] });
        lastGroup = p.group;
      }
      groups[groups.length - 1].parks.push(p);
    }

    // Sort groups by distance to user — nearest park group shows first
    if (location) {
      groups.sort((a, b) => {
        const coordsA = PARK_GROUP_COORDS[a.group];
        const coordsB = PARK_GROUP_COORDS[b.group];
        if (!coordsA || !coordsB) return 0;
        const distA = distanceBetween(location.latitude, location.longitude, coordsA.latitude, coordsA.longitude);
        const distB = distanceBetween(location.latitude, location.longitude, coordsB.latitude, coordsB.longitude);
        return distA - distB;
      });
    }

    return groups;
  }, [location?.latitude, location?.longitude]);

  return (
    <Wrapper previewMode={Boolean(previewEntries)}>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>WAIT TIMES</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false}><View style={{ width: 35 }} /></TopbarColumn>
      </Topbar>
      <View style={styles.container}>

      {/* Park Selector */}
      <View style={styles.parkSelectorContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.parkScrollContent}
        >
          {groupedParks.map((group) => (
            <View key={group.group} style={styles.parkGroup}>
              <Text style={styles.groupLabel}>{group.group}</Text>
              <View style={styles.groupPills}>
                {group.parks.map((park) => (
                  <ParkPill
                    key={park.id}
                    park={park}
                    selected={park.id === selectedPark}
                    onPress={() => selectPark(park.id)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Status bar */}
      {!loading && attractions.length > 0 && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText2}>
            {openCount} of {totalCount} attractions open
          </Text>
          <View style={styles.statusRight}>
            <Text style={styles.updatedText}>
              {previewEntries ? 'SAMPLE DATA' : `${lastUpdated ? `Checked ${timeAgo(lastUpdated)}` : ''} · refresh ${countdown}s`}
            </Text>
          </View>
        </View>
      )}

      {!loading && feedError && attractions.length > 0 && (
        <Pressable onPress={() => void fetchData(false)} accessibilityRole="button"
          accessibilityLabel="Try loading wait times again. These may be old."
          style={styles.feedAlert}>
          <Text style={styles.feedAlertText}>Could not update wait times. These may be old. Tap to try again.</Text>
        </Pressable>
      )}

      {/* Sort & Filter */}
      {!loading && attractions.length > 0 && (
        <View style={styles.controlsRow}>
          <View style={styles.sortRow}>
            <SortButton label="Longest" active={sortMode === 'wait-desc'} onPress={() => setSortMode('wait-desc')} />
            <SortButton label="Shortest" active={sortMode === 'wait-asc'} onPress={() => setSortMode('wait-asc')} />
            <SortButton label="A-Z" active={sortMode === 'name'} onPress={() => setSortMode('name')} />
          </View>
          <View style={styles.sortRow}>
            <SortButton label="Open + Down" active={filterMode === 'open'} onPress={() => setFilterMode('open')} />
            <SortButton label="All" active={filterMode === 'all'} onPress={() => setFilterMode('all')} />
          </View>
        </View>
      )}

      {/* Main List */}
      {loading ? (
        <View style={styles.skeletonContainer}>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : attractions.length > 0 && processedData.length > 0 ? (
        <FlashList
          data={processedData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RideCard entry={item} onStartSession={handleStartSession} />}
          estimatedItemSize={80}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0EA5E9" />
          }
        />
      ) : attractions.length > 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>NO OPEN ATTRACTIONS</Text>
          <Text style={styles.emptyBody}>No ride wait times to show for this park right now. Check back later.</Text>
          <Pressable onPress={() => setFilterMode('all')} accessibilityRole="button"
            accessibilityLabel="Show all attractions" style={styles.retryButton}>
            <Text style={styles.retryText}>SHOW ALL</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{feedError ? 'NO WAIT TIMES RIGHT NOW' : 'NO TIMES POSTED'}</Text>
          <Text style={styles.emptyBody}>{feedError
            ? 'Wait times did not load. Check your internet or pick another park.'
            : 'This park has no wait times right now. Try another park or check back later.'}</Text>
          <Pressable onPress={() => void fetchData(true)} accessibilityRole="button"
            accessibilityLabel="Retry wait times" style={styles.retryButton}>
            <Text style={styles.retryText}>TRY AGAIN</Text>
          </Pressable>
        </View>
      )}
      </View>
    </Wrapper>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: -8,
    backgroundColor: '#d9f3ff',
  },
  parkSelectorContainer: {
    backgroundColor: '#e8f8ff',
    borderBottomColor: '#86cbee',
    borderBottomWidth: 2,
  },
  parkScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  parkGroup: {
    marginRight: 24,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#146397',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    fontFamily: 'Knockout',
  },
  groupPills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#abd9f1',
  },
  pillSelected: {
    backgroundColor: '#ffcf3e',
    borderColor: '#bc7f0b',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0a598f',
    fontFamily: 'Knockout',
  },
  pillTextSelected: {
    color: '#063e72',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: '#0d6faf',
  },
  feedAlert: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff3ca',
    borderColor: '#d69a18',
    borderWidth: 2,
    borderRadius: 10,
  },
  feedAlertText: { color: '#6b4a08', fontFamily: 'Knockout', fontSize: 14 },
  emptyCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderColor: '#ffca36',
    borderWidth: 3,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyTitle: { color: '#075691', fontFamily: 'Shark', fontSize: 21, textAlign: 'center' },
  emptyBody: { color: '#326881', fontFamily: 'Knockout', fontSize: 15,
    lineHeight: 21, textAlign: 'center', marginTop: 7 },
  retryButton: { backgroundColor: '#ffca36', borderColor: '#bf8613', borderWidth: 2,
    borderRadius: 10, paddingHorizontal: 22, paddingVertical: 9, marginTop: 14 },
  retryText: { color: '#074c83', fontFamily: 'Shark', fontSize: 16 },
  statusText2: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    fontFamily: 'Knockout',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  updatedText: {
    fontSize: 13,
    color: '#e4f5ff',
    fontWeight: '500',
    fontFamily: 'Knockout',
  },
  controlsRow: {
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 7,
  },
  sortBtn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#abd9f1',
  },
  sortBtnActive: {
    backgroundColor: '#ffcf3e',
    borderColor: '#bc7f0b',
  },
  sortBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0a598f',
    fontFamily: 'Knockout',
  },
  sortBtnTextActive: {
    color: '#063e72',
  },
  skeletonContainer: {
    padding: 16,
  },
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#b6def3',
    padding: 12,
    marginBottom: 9,
    shadowColor: '#075b93',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderColor: '#fff',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  cardCenter: {
    flex: 1,
    marginLeft: 16,
  },
  sessionBtn: {
    marginTop: 7,
    alignSelf: 'flex-start',
    backgroundColor: '#0b78bd',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ffcc3a',
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: 'center',
    minHeight: 36,
  },
  sessionBtnPressed: {
    opacity: 0.85,
  },
  sessionBtnText: {
    color: '#fec90e',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
    fontFamily: 'Knockout',
  },
  rideName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#083d70',
    lineHeight: 20,
    fontFamily: 'Shark',
  },
  statusText: {
    fontSize: 13,
    color: '#4b7892',
    marginTop: 4,
    fontWeight: '500',
    fontFamily: 'Knockout',
  },
  llBadge: {
    alignItems: 'center',
    backgroundColor: '#fec90e',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 12,
  },
  llText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#09268f',
  },
  llTime: {
    fontSize: 10,
    color: '#09268f',
    marginTop: 2,
    fontWeight: '600',
  },
});
