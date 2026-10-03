/**
 * Friends v2: three big tabs a 7-year-old can read by their pictures.
 *   Friends   your crew, each with their real shark and a heart to send
 *   Requests  who wants to be friends (Yes! / No) and who you asked (Asked)
 *   Find      search by name, or "Sharks to meet"
 * The Requests tab opens first when someone is waiting, and its red number
 * matches the dot on Profile. Every answer is instant (optimistic, shared with
 * the bell and profiles through the social store) and undone on failure.
 */
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { useTutorialWhenReady } from '../components/Tutorial';
import { AuthContext } from '../context/AuthProvider';
import { getFriendsPage, searchFriends } from '../api/endpoints/me/friends';
import getFriendRequests, { getSentFriendRequests } from '../api/endpoints/me/pending-requests';
import getFriendSuggestions from '../api/endpoints/me/getFriendSuggestions';
import searchPlayers from '../api/endpoints/players/search';
import updatePlayer from '../api/endpoints/me/update-player';
import { haptic } from '../gamekit/Haptics';
import { playSfx } from '../gamekit/SFX';
import type { PlayerType } from '../models/player-type';
import { GameIcon, SharkLoader } from '../ui';
import type { GameIconName } from '../ui/iconNames';
import { BRAND, FONT } from '../ui/tokens';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import PlayerRow, { ROW_HEIGHT } from './social/PlayerRow';
import SearchField from './social/SearchField';
import { CountBadge, INK, LeavingRow, Pill, SectionHeader, SocialBackdrop, SocialError, kit, useSquash } from './social/SocialKit';
import { GrownUpGate } from './social/GrownUpGate';
import { Burst } from './social/SocialFx';
import { effectiveStatus, initialTab, mergePage, searchHint, type FriendStatus, type FriendsTab } from './social/socialModel';
import { SurfaceContext, setPendingIncoming, useFriendOverrides, usePendingIncoming } from './social/socialStore';

const CREST = require('../../assets/images/screens/friends/noti.png');
const REQUEST_ART = require('../../assets/images/screens/friends/request_badge.png');
const ADD_ART = require('../../assets/images/screens/friends/add_friend.png');
const NOOP = () => undefined;
const APP_LINK = 'https://apps.apple.com/app/theme-park-shark/id6758812566';

type Row =
  | { readonly type: 'header'; readonly key: string; readonly label: string; readonly icon?: GameIconName; readonly count?: number }
  | { readonly type: 'player'; readonly key: string; readonly player: PlayerType; readonly fallback: FriendStatus;
      /** Leaving the list: drawn frozen in this state (a refused row never shows Add), then onGone drops it. */
      readonly leaving?: FriendStatus; readonly onGone?: () => void }
  | { readonly type: 'hint'; readonly key: string; readonly text: string };

type Load = 'loading' | 'ready' | 'error';

export default function FriendsScreen({ route }: NativeStackScreenProps<ParamListBase, 'Friends'>) {
  const { player } = useContext(AuthContext);
  const pendingStore = usePendingIncoming();
  const pending = pendingStore ?? player?.pending_friend_requests_count ?? 0;
  const [tab, setTab] = useState<FriendsTab>(() => initialTab((route.params as { tab?: unknown } | undefined)?.tab, pending));
  const [listReady, setListReady] = useState(false);
  useTutorialWhenReady('friends', listReady);

  const invite = useCallback(async () => {
    playSfx('tap');
    try {
      await Share.share({ message: `Play Theme Park Shark with me! Add me as a friend: ${player?.screen_name ?? ''}\n${APP_LINK}`, url: APP_LINK });
    } catch { /* closed */ }
  }, [player?.screen_name]);

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Friends</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false}><View style={{ width: 44 }} /></TopbarColumn>
      </Topbar>
      <SocialBackdrop>
        <Hero count={player?.friends_count ?? 0} onInvite={invite} />
        <Tabs tab={tab} pending={pending} onChange={next => { if (next !== tab) { playSfx('whoosh'); haptic('tickSelection'); setTab(next); } }} />
        {/* All three tabs stay mounted: switching keeps scroll and search text and never shows a spinner again. */}
        <View style={{ flex: 1 }}>
          <View style={[styles.pane, tab !== 'friends' && styles.hidden]} accessibilityElementsHidden={tab !== 'friends'} importantForAccessibility={tab === 'friends' ? 'auto' : 'no-hide-descendants'}>
            <SurfaceContext.Provider value="tab-friends"><FriendsTabView onReady={() => setListReady(true)} onFind={() => setTab('find')} total={player?.friends_count ?? 0} /></SurfaceContext.Provider>
          </View>
          <View style={[styles.pane, tab !== 'requests' && styles.hidden]} accessibilityElementsHidden={tab !== 'requests'} importantForAccessibility={tab === 'requests' ? 'auto' : 'no-hide-descendants'}>
            <SurfaceContext.Provider value="tab-requests"><RequestsTabView onFind={() => setTab('find')} /></SurfaceContext.Provider>
          </View>
          <View style={[styles.pane, tab !== 'find' && styles.hidden]} accessibilityElementsHidden={tab !== 'find'} importantForAccessibility={tab === 'find' ? 'auto' : 'no-hide-descendants'}>
            <SurfaceContext.Provider value="tab-find"><FindTabView active={tab === 'find'} onInvite={invite} /></SurfaceContext.Provider>
          </View>
        </View>
      </SocialBackdrop>
    </>
  );
}

function Hero({ count, onInvite }: { readonly count: number; readonly onInvite: () => void }) {
  const reduced = useUiReducedMotion();
  const bounce = useSharedValue(0);
  const last = useRef(count);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (count > last.current) {
      setBurst(true);
      if (!reduced) bounce.value = withSequence(withTiming(1, { duration: 140 }), withSpring(0, { damping: 6, stiffness: 220 }));
    }
    last.current = count;
  }, [count, reduced, bounce]);
  const countStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.35 * bounce.value }, { translateY: -6 * bounce.value }] }));
  const endBurst = useCallback(() => setBurst(false), []);
  return (
    <View style={[kit.card, styles.hero]}>
      <View style={kit.gloss} pointerEvents="none" />
      <Image source={CREST} style={styles.crest} contentFit="contain" accessibilityIgnoresInvertColors />
      <View style={{ flex: 1 }} accessible accessibilityLabel={`${count} ${count === 1 ? 'friend' : 'friends'}`}>
        <Animated.Text style={[styles.heroCount, countStyle]} maxFontSizeMultiplier={1.2}>{count}</Animated.Text>
        <Text style={styles.heroLabel} maxFontSizeMultiplier={1.2}>{count === 1 ? 'Friend' : 'Friends'}</Text>
        {/* Beside the number, never over it. */}
        {burst && <Burst style={{ left: -44, top: 22 }} onDone={endBurst} />}
      </View>
      <Pill label="Invite" icon="arrow" tone="gold" onPress={onInvite} accessibilityLabel="Invite a friend to play" />
    </View>
  );
}

const TAB_LIST: readonly { key: FriendsTab; label: string; icon: GameIconName; image?: number }[] = [
  { key: 'friends', label: 'Friends', icon: 'heart' },
  { key: 'requests', label: 'Requests', icon: 'bell', image: REQUEST_ART },
  { key: 'find', label: 'Find', icon: 'search' },
];

function Tabs({ tab, pending, onChange }: { readonly tab: FriendsTab; readonly pending: number; readonly onChange: (tab: FriendsTab) => void }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {TAB_LIST.map(item => <TabChip key={item.key} label={item.label} icon={item.icon} image={item.image} active={tab === item.key} badge={item.key === 'requests' ? pending : 0} onPress={() => onChange(item.key)} />)}
    </View>
  );
}

function TabChip({ label, icon, image, active, badge, onPress }: { readonly label: string; readonly icon: GameIconName; readonly image?: number; readonly active: boolean; readonly badge: number; readonly onPress: () => void }) {
  const squash = useSquash();
  return (
    <Pressable onPress={onPress} onPressIn={squash.onPressIn} onPressOut={squash.onPressOut} style={{ flex: 1 }}
      accessibilityRole="tab" accessibilityState={{ selected: active }}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} waiting` : label}>
      <Animated.View style={[styles.tab, active && styles.tabActive, squash.style]}>
        {image ? <Image source={image} style={{ width: 30, height: 30 }} contentFit="contain" /> : <GameIcon name={icon} size={26} />}
        <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1} maxFontSizeMultiplier={1.15}>{label}</Text>
      </Animated.View>
      <CountBadge count={badge} style={styles.tabBadge} />
    </Pressable>
  );
}

// ---- Shared list ------------------------------------------------------------

function SocialList({ rows, refreshing, onRefresh, onEndReached, footer, empty, header, listRef }: {
  readonly listRef?: React.RefObject<FlashList<Row>>;
  readonly rows: readonly Row[];
  readonly header?: React.ReactElement | null;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
  readonly onEndReached?: () => void;
  readonly footer?: React.ReactElement | null;
  readonly empty?: React.ReactElement | null;
}) {
  const overrides = useFriendOverrides();
  const reduced = useUiReducedMotion();
  const first = useRef(true);
  useEffect(() => { const t = setTimeout(() => { first.current = false; }, 900); return () => clearTimeout(t); }, []);
  return (
    <FlashList
      ref={listRef}
      data={rows as Row[]}
      extraData={overrides}
      keyExtractor={row => row.key}
      getItemType={row => row.type}
      estimatedItemSize={ROW_HEIGHT}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReachedThreshold={1.5}
      onEndReached={onEndReached}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={empty}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" /> : undefined}
      renderItem={({ item, index }) => {
        if (item.type === 'header') return <SectionHeader label={item.label} icon={item.icon} count={item.count} />;
        if (item.type === 'hint') return <Text style={styles.hint} maxFontSizeMultiplier={1.3}>{item.text}</Text>;
        const row = item.leaving
          ? <LeavingRow leaving onGone={item.onGone ?? NOOP}><PlayerRow player={item.player} status={item.leaving} /></LeavingRow>
          : <PlayerRow player={item.player} status={effectiveStatus(item.player, overrides, item.fallback)} />;
        return <Animated.View entering={first.current && !reduced && index < 8 ? FadeInDown.delay(index * 40).springify().damping(16) : undefined}>{row}</Animated.View>;
      }}
    />
  );
}

function Empty({ title, message, onFind }: { readonly title: string; readonly message: string; readonly onFind?: () => void }) {
  return (
    <Animated.View entering={FadeIn} style={styles.empty}>
      <Image source={CREST} style={styles.emptyArt} contentFit="contain" />
      <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.2}>{title}</Text>
      <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>{message}</Text>
      {onFind && <Pill label="Find friends" icon="search" tone="gold" onPress={onFind} style={{ marginTop: 14 }} />}
    </Animated.View>
  );
}

// ---- Friends tab ------------------------------------------------------------

/** Search my friends only once the list is long enough to need it. */
export const FRIEND_SEARCH_MIN = 12;

function FriendsTabView({ onReady, onFind, total }: { readonly onReady: () => void; readonly onFind: () => void; readonly total: number }) {
  const [friends, setFriends] = useState<PlayerType[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [paging, setPaging] = useState<'idle' | 'busy' | 'error'>('idle');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerType[] | null>(null);
  const searchSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const first = useCallback(async () => {
    const { items, hasMore: more } = await getFriendsPage(1);
    setFriends(items);
    setHasMore(more);
    setPage(1);
  }, []);

  useEffect(() => {
    first().then(() => setLoad('ready')).catch(() => setLoad('error')).finally(onReady);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A Yes or a Remove anywhere shows up here without a spinner.
  const overrides = useFriendOverrides();
  const friendSig = useMemo(() => [...overrides].filter(([, v]) => v === 'friends' || v === 'none').map(([k, v]) => `${k}${v}`).join(','), [overrides]);
  const firstSig = useRef(friendSig);
  useEffect(() => {
    if (friendSig === firstSig.current) return;
    firstSig.current = friendSig;
    // Debounced: a burst of answers costs one refetch.
    const t = setTimeout(() => { void first().catch(() => undefined); }, 500);
    return () => clearTimeout(t);
  }, [friendSig, first]);

  const more = useCallback(() => {
    if (!hasMore || paging === 'busy' || query) return;
    setPaging('busy');
    getFriendsPage(page + 1)
      .then(({ items, hasMore: next }) => { setFriends(list => mergePage(list, items)); setHasMore(next); setPage(p => p + 1); setPaging('idle'); })
      .catch(() => setPaging('error'));
  }, [hasMore, paging, page, query]);

  const search = useCallback((text: string) => {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    const q = text.trim();
    const seq = ++searchSeq.current;
    if (!q) { setResults(null); return; }
    timer.current = setTimeout(() => {
      searchFriends(q).then(list => { if (seq === searchSeq.current) setResults(list); })
        .catch(() => { if (seq === searchSeq.current) setResults([]); });
    }, 300);
  }, []);

  const shown = results ?? friends;
  const rows = useMemo<Row[]>(() => shown.map(p => ({ type: 'player', key: `f${p.id}`, player: p, fallback: 'friends' })), [shown]);

  if (load === 'loading') return <SharkLoader state="loading" tone="onBlue" title="Finding your friends" />;
  if (load === 'error') return <SocialError title="Friends didn't load" onRetry={() => { setLoad('loading'); first().then(() => setLoad('ready')).catch(() => setLoad('error')); }} />;

  return (
    <View style={{ flex: 1 }}>
      {Math.max(total, friends.length) > FRIEND_SEARCH_MIN && <SearchField placeholder="Search my friends" accessibilityLabel="Search my friends" onChangeText={search} />}
      <SocialList
        rows={rows}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); first().catch(() => undefined).finally(() => setRefreshing(false)); }}
        onEndReached={more}
        footer={paging === 'error'
          ? <View style={styles.footer}><Pill compact tone="white" icon="retry" label="Try again" onPress={more} /></View>
          : paging === 'busy' ? <SharkLoader state="loading" tone="onBlue" compact /> : null}
        empty={query
          ? <Empty title="No match" message={`No friend called "${query.trim()}"`} />
          : <Empty title="No friends yet" message="Add sharks you meet and they show up here." onFind={onFind} />}
      />
    </View>
  );
}

// ---- Requests tab -----------------------------------------------------------

function RequestsTabView({ onFind }: { readonly onFind: () => void }) {
  const [incoming, setIncoming] = useState<PlayerType[]>([]);
  const [sent, setSent] = useState<PlayerType[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const overrides = useFriendOverrides();

  const fetchAll = useCallback(async () => {
    const [ask, mine] = await Promise.all([getFriendRequests(), getSentFriendRequests().catch(() => [] as PlayerType[])]);
    setIncoming(ask);
    setSent(mine);
    setPendingIncoming(ask.length);
  }, []);

  useEffect(() => { fetchAll().then(() => setLoad('ready')).catch(() => setLoad('error')); }, [fetchAll]);

  // A Yes turns the row green ("New friend!") for a moment, then it leaves Requests.
  const [settled, setSettled] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    const fresh = incoming.filter(p => overrides.get(p.id) === 'friends' && !settled.has(p.id)).map(p => p.id);
    if (!fresh.length) return;
    const timer = setTimeout(() => setSettled(prev => new Set([...prev, ...fresh])), 1600);
    return () => clearTimeout(timer);
  }, [incoming, overrides, settled]);

  // An answered "No", a block, a taken-back ask, or a settled Yes leaves
  // through LeavingRow (fade plus height to 0 in the cell), then the data goes.
  const [away, setAway] = useState<ReadonlySet<number>>(() => new Set());
  const drop = useCallback((id: number) => setAway(prev => new Set(prev).add(id)), []);
  const rows = useMemo<Row[]>(() => {
    const leavingAs = (p: PlayerType, was: FriendStatus): FriendStatus | undefined => {
      const st = overrides.get(p.id);
      if (st === 'none' || st === 'blocked') return was; // frozen as it was: never flashes Add
      if (st === 'friends' && settled.has(p.id)) return 'friends';
      return undefined;
    };
    const ask = incoming.filter(p => !away.has(p.id));
    const mine = sent.filter(p => !away.has(p.id));
    const out: Row[] = [];
    if (ask.length) {
      out.push({ type: 'header', key: 'h-ask', label: 'Want to be friends', icon: 'heart', count: ask.filter(p => effectiveStatus(p, overrides, 'incoming') === 'incoming').length });
      for (const p of ask) out.push({ type: 'player', key: `i${p.id}`, player: p, fallback: 'incoming', leaving: leavingAs(p, 'incoming'), onGone: () => drop(p.id) });
    }
    if (mine.length) {
      out.push({ type: 'header', key: 'h-sent', label: 'You asked', icon: 'timer' });
      for (const p of mine) out.push({ type: 'player', key: `o${p.id}`, player: p, fallback: 'outgoing', leaving: leavingAs(p, 'outgoing'), onGone: () => drop(p.id) });
    }
    return out;
  }, [incoming, sent, overrides, away, settled, drop]);

  if (load === 'loading') return <SharkLoader state="loading" tone="onBlue" title="Checking requests" />;
  if (load === 'error') return <SocialError title="Requests didn't load" onRetry={() => { setLoad('loading'); fetchAll().then(() => setLoad('ready')).catch(() => setLoad('error')); }} />;

  return (
    <SocialList
      rows={rows}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); fetchAll().catch(() => undefined).finally(() => setRefreshing(false)); }}
      empty={<Empty title="No requests" message="When a shark asks to be your friend, it shows up here." onFind={onFind} />}
    />
  );
}

// ---- Find tab ---------------------------------------------------------------

function FindTabView({ active, onInvite }: { readonly active: boolean; readonly onInvite: () => void }) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const [suggested, setSuggested] = useState<PlayerType[]>([]);
  const [load, setLoad] = useState<Load | 'idle'>('idle');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerType[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [findMe, setFindMe] = useState<boolean>(!!player?.discoverable);
  const [refreshing, setRefreshing] = useState(false);
  const seqRef = useRef(0);
  const overrides = useFriendOverrides();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setFindMe(!!player?.discoverable); }, [player?.discoverable]);

  const fetchSuggested = useCallback(() => {
    setLoad('loading');
    getFriendSuggestions().then(list => { setSuggested(list); setLoad('ready'); }).catch(() => setLoad('error'));
  }, []);
  // Loads the first time the tab is opened, then stays.
  useEffect(() => { if (active && load === 'idle') fetchSuggested(); }, [active, load, fetchSuggested]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Turning discovery ON needs the grown-up gate (hold plus a sum in words);
  // the server also refuses it without grown_up_confirmed. Taps while a save
  // is in flight are ignored; the server's answer wins.
  const saving = useRef(false);
  const [gate, setGate] = useState(false);
  const save = useCallback(async (next: boolean) => {
    saving.current = true;
    setFindMe(next);
    playSfx(next ? 'star' : 'tap');
    haptic('tickSelection');
    try {
      const me = await updatePlayer(next ? { discoverable: true, grown_up_confirmed: true } : { discoverable: false });
      if (typeof me?.discoverable === 'boolean') setFindMe(me.discoverable);
      void refreshPlayer?.().catch(() => undefined);
    } catch {
      setFindMe(!next);
      playSfx('fail');
    } finally {
      saving.current = false;
    }
  }, [refreshPlayer]);
  const toggleFindMe = useCallback(() => {
    if (saving.current) return;
    if (findMe) void save(false);
    else setGate(true);
  }, [findMe, save]);

  const search = useCallback((text: string) => {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    const q = text.trim();
    const seq = ++seqRef.current;
    if (q.length < 3) { setResults(null); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(() => {
      searchPlayers(q)
        .then(list => { if (seq === seqRef.current) setResults(list); })
        .catch(() => { if (seq === seqRef.current) setResults([]); })
        .finally(() => { if (seq === seqRef.current) setSearching(false); });
    }, 350);
  }, []);

  const hint = searchHint(query);
  const rows = useMemo<Row[]>(() => {
    if (hint) return [{ type: 'hint', key: 'hint', text: hint }];
    if (results) {
      return results.length
        ? [{ type: 'header', key: 'h-res', label: 'Found', icon: 'search', count: results.length },
          ...results.map(p => ({ type: 'player' as const, key: `r${p.id}`, player: p, fallback: 'none' as FriendStatus }))]
        : [];
    }
    const shownSuggested = suggested.filter(p => overrides.get(p.id) !== 'blocked');
    if (!shownSuggested.length) return [];
    return [{ type: 'header', key: 'h-sug', label: 'Sharks you may know', icon: 'star' },
      ...shownSuggested.map(p => ({ type: 'player' as const, key: `s${p.id}`, player: p, fallback: 'none' as FriendStatus }))];
  }, [hint, results, suggested, overrides]);

  const cards = !query && (
    <View>
      <MyNameCard name={player?.screen_name ?? ''} onInvite={onInvite} />
      <FindMeCard on={findMe} onToggle={toggleFindMe} />
      <GrownUpGate visible={gate} onDone={passed => { setGate(false); if (passed) void save(true); }} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <SearchField placeholder="Type a friend's shark name" accessibilityLabel="Search players by shark name" onChangeText={search} />
      {load === 'error' && !query
        ? <SocialError title="Couldn't load sharks you may know" onRetry={fetchSuggested} />
        : (load === 'loading' || load === 'idle') && !query
          ? <SharkLoader state="loading" tone="onBlue" title="Looking for sharks" />
          : (
            <SocialList
              rows={rows}
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); getFriendSuggestions().then(setSuggested).catch(() => undefined).finally(() => setRefreshing(false)); }}
              header={cards || null}
              footer={searching ? <SharkLoader state="loading" tone="onBlue" compact /> : null}
              empty={searching ? null : query
                ? (results ? <Empty title="No sharks found" message="Check the spelling, or ask your friend for their exact shark name." /> : null)
                : <Empty title="Share your shark name!" message="Tell a friend your shark name, or tap Share, so they can add you." />}
            />
          )}
    </View>
  );
}

/** The kid's own shark name works like a friend code: say it, share it. */
function MyNameCard({ name, onInvite }: { readonly name: string; readonly onInvite: () => void }) {
  return (
    <View style={[kit.card, styles.findCard]}>
      <View style={kit.gloss} pointerEvents="none" />
      <Image source={ADD_ART} style={styles.findArt} contentFit="contain" />
      <View style={{ flex: 1 }}>
        <Text style={styles.findLabel} maxFontSizeMultiplier={1.2}>My shark name</Text>
        <Text style={styles.findName} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>{name}</Text>
        <Text style={styles.findText} maxFontSizeMultiplier={1.3}>Friends type it here to add you.</Text>
      </View>
      <Pill compact label="Share" icon="arrow" tone="gold" onPress={onInvite} accessibilityLabel="Share my shark name with a friend" />
    </View>
  );
}

/** "Let sharks find me": off by default (kid safety). */
function FindMeCard({ on, onToggle }: { readonly on: boolean; readonly onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }}
      accessibilityLabel="Let sharks find me" accessibilityHint={on ? 'On: sharks can find you by part of your name. Tap to turn off.' : "Off: sharks can't search for you, but a shark who knows your exact name or taps you on a leaderboard or post can still ask. Turning it on needs a grown-up."}>
      <View style={[kit.card, styles.findCard, styles.findMe]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.findLabel} maxFontSizeMultiplier={1.2}>Let sharks find me</Text>
          <Text style={styles.findText} maxFontSizeMultiplier={1.3}>{on ? 'Sharks can find you by part of your name.' : "Sharks can't search for you. A shark who knows your exact name, or taps you on a leaderboard or post, can still ask. You pick Yes or No."}</Text>
        </View>
        <View style={[styles.switch, on && styles.switchOn]}>
          <View style={[styles.knob, on && styles.knobOn]} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: 14, marginTop: 14, flexDirection: 'row', alignItems: 'center', padding: 10, paddingRight: 12, gap: 10, backgroundColor: BRAND.cream },
  crest: { width: 68, height: 68 },
  heroCount: { fontFamily: FONT.display, fontSize: 34, color: INK, lineHeight: 36, includeFontPadding: false },
  heroLabel: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navySoft, textTransform: 'uppercase' },
  tabs: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 12, marginBottom: 10 },
  tab: {
    height: 58, borderRadius: 18, borderWidth: 3, borderBottomWidth: 5, borderColor: INK, backgroundColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 6,
  },
  tabActive: { backgroundColor: BRAND.gold, borderBottomColor: BRAND.goldLip },
  tabText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navySoft, textTransform: 'uppercase', includeFontPadding: false },
  tabTextActive: { color: INK },
  tabBadge: { position: 'absolute', top: -8, right: -4 },
  pane: { ...StyleSheet.absoluteFillObject },
  hidden: { display: 'none' },
  hint: { fontFamily: FONT.display, fontSize: 18, color: '#FFFFFF', textAlign: 'center', paddingTop: 24, textShadowColor: INK, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  footer: { alignItems: 'center', paddingVertical: 12 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 36 },
  emptyArt: { width: 120, height: 120 },
  findCard: { marginHorizontal: 14, marginTop: 4, marginBottom: 10, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, backgroundColor: BRAND.cream },
  findMe: { backgroundColor: '#FFFFFF' },
  findArt: { width: 56, height: 56 },
  findLabel: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navySoft, textTransform: 'uppercase' },
  findName: { fontFamily: FONT.display, fontSize: 24, color: INK, textTransform: 'uppercase' },
  findText: { fontFamily: FONT.body, fontSize: 16, color: BRAND.navySoft },
  switch: { width: 64, height: 38, borderRadius: 19, borderWidth: 3, borderColor: INK, backgroundColor: '#C9D8EA', justifyContent: 'center', padding: 3 },
  switchOn: { backgroundColor: '#4CC96A' },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: INK },
  knobOn: { alignSelf: 'flex-end' },
  emptyTitle: { fontFamily: FONT.display, fontSize: 24, color: '#FFFFFF', textTransform: 'uppercase', marginTop: 8, textShadowColor: INK, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  emptyText: { fontFamily: FONT.body, fontSize: 18, color: '#FFFFFF', textAlign: 'center', marginTop: 4, textShadowColor: 'rgba(5,52,110,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
