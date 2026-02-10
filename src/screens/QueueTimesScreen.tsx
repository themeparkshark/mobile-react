import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import getWikiTimes, { WikiLiveEntry } from '../api/endpoints/parks/queue-times/getWikiTimes';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import {
  CLOSED_COLOR,
  DOWN_COLOR,
  PARK_DISPLAY_ORDER,
  REFURB_COLOR,
  WAIT_COLOR_TIERS,
} from '../constants/parkWaitTimes';

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
  const waitTime = entry.queue?.STANDBY?.waitTime;
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
  const mins = waitTime ?? 0;
  const tier = getWaitColor(mins);
  return { text: String(mins), color: tier.color, statusText: 'Operating' };
}

function formatReturnTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  } catch {
    return null;
  }
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

const RideCard = ({ entry }: { entry: WikiLiveEntry }) => {
  const badge = getBadgeInfo(entry);
  const ll = entry.queue?.RETURN_TIME;
  const hasLL = ll?.state === 'AVAILABLE';
  const returnTime = hasLL ? formatReturnTime(ll?.returnStart) : null;

  return (
    <View style={[styles.card, { borderLeftColor: badge.color, borderLeftWidth: 3 }]}>
      <View style={[styles.badge, { backgroundColor: badge.color }]}>
        <Text style={styles.badgeText}>{badge.text}</Text>
      </View>
      <View style={styles.cardCenter}>
        <Text style={styles.rideName} numberOfLines={2}>{entry.name}</Text>
        <Text style={styles.statusText}>{badge.statusText}</Text>
      </View>
      {hasLL && (
        <View style={styles.llBadge}>
          <Text style={styles.llText}>LL</Text>
          {returnTime && <Text style={styles.llTime}>{returnTime}</Text>}
        </View>
      )}
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
  <Pressable onPress={onPress} style={[styles.sortBtn, active && styles.sortBtnActive]}>
    <Text style={[styles.sortBtnText, active && styles.sortBtnTextActive]}>{label}</Text>
  </Pressable>
);

// --- Main Screen ---
export default function QueueTimesScreen({ route }: { route: any }) {
  const [attractions, setAttractions] = useState<WikiLiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPark, setSelectedPark] = useState<number>(route.params.park);
  const [sortMode, setSortMode] = useState<SortMode>('wait-desc');
  const [filterMode, setFilterMode] = useState<FilterMode>('open');
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [countdown, setCountdown] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await getWikiTimes(selectedPark);
      setAttractions(data);
      setLastUpdated(Date.now());
      setCountdown(60);
    } catch (e) {
      console.warn('Failed to fetch wait times', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPark]);

  // Initial load + park change
  useEffect(() => {
    setAttractions([]);
    fetchData(true);
  }, [selectedPark]);

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

  // Filter & sort
  const processedData = useMemo(() => {
    let data = [...attractions];

    if (filterMode === 'open') {
      data = data.filter((e) => e.status === 'OPERATING' || e.status === 'DOWN');
    }

    data.sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      const aWait = a.queue?.STANDBY?.waitTime ?? (a.status === 'OPERATING' ? 0 : -1);
      const bWait = b.queue?.STANDBY?.waitTime ?? (b.status === 'OPERATING' ? 0 : -1);
      return sortMode === 'wait-desc' ? bWait - aWait : aWait - bWait;
    });

    return data;
  }, [attractions, filterMode, sortMode]);

  const openCount = attractions.filter((e) => e.status === 'OPERATING' || e.status === 'DOWN').length;
  const totalCount = attractions.length;
  const currentParkName = PARK_DISPLAY_ORDER.find((p) => p.id === selectedPark)?.name ?? 'Park';

  // Group parks for display
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
    return groups;
  }, []);

  return (
    <View style={styles.container}>
      <Topbar>
        <BackButton />
        <TopbarColumn>
          <TopbarText>Wait Times</TopbarText>
        </TopbarColumn>
      </Topbar>

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
                    onPress={() => setSelectedPark(park.id)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Status bar */}
      {!loading && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText2}>
            {openCount} of {totalCount} attractions open
          </Text>
          <View style={styles.statusRight}>
            <Text style={styles.updatedText}>
              {lastUpdated ? timeAgo(lastUpdated) : ''} · {countdown}s
            </Text>
          </View>
        </View>
      )}

      {/* Sort & Filter */}
      {!loading && (
        <View style={styles.controlsRow}>
          <View style={styles.sortRow}>
            <SortButton label="By Wait" active={sortMode === 'wait-desc'} onPress={() => setSortMode('wait-desc')} />
            <SortButton label="Shortest" active={sortMode === 'wait-asc'} onPress={() => setSortMode('wait-asc')} />
            <SortButton label="A-Z" active={sortMode === 'name'} onPress={() => setSortMode('name')} />
          </View>
          <View style={styles.sortRow}>
            <SortButton label="Open Only" active={filterMode === 'open'} onPress={() => setFilterMode('open')} />
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
      ) : (
        <FlashList
          data={processedData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RideCard entry={item} />}
          estimatedItemSize={80}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
          }
        />
      )}
    </View>
  );
}

// --- Styles ---
const PRIMARY_BLUE = '#3B82F6';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  parkSelectorContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  parkScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  parkGroup: {
    marginRight: 20,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  groupPills: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  pillSelected: {
    backgroundColor: PRIMARY_BLUE,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  statusText2: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  updatedText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sortRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  sortBtnActive: {
    backgroundColor: PRIMARY_BLUE,
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  sortBtnTextActive: {
    color: '#FFFFFF',
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
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  cardCenter: {
    flex: 1,
    marginLeft: 12,
  },
  rideName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  statusText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  llBadge: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  llText: {
    fontSize: 11,
    fontWeight: '700',
    color: PRIMARY_BLUE,
  },
  llTime: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
  },
});
