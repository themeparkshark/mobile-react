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
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
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
import { haptic } from '../gamekit/Haptics';
import { playSfx } from '../gamekit/SFX';
import type { PlayerType } from '../models/player-type';
import { GameIcon, SharkLoader } from '../ui';
import type { GameIconName } from '../ui/iconNames';
import { BRAND, FONT } from '../ui/tokens';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import PlayerRow, { ROW_HEIGHT } from './social/PlayerRow';
import SearchField from './social/SearchField';
import { CountBadge, INK, Pill, SectionHeader, SocialBackdrop, kit, useSquash } from './social/SocialKit';
import { effectiveStatus, initialTab, mergePage, searchHint, type FriendStatus, type FriendsTab } from './social/socialModel';
import { setPendingIncoming, useFriendOverrides, usePendingIncoming } from './social/socialStore';

const CREST = require('../../assets/images/screens/friends/noti.png');
const APP_LINK = 'https://apps.apple.com/app/theme-park-shark/id6758812566';

type Row =
  | { readonly type: 'header'; readonly key: string; readonly label: string; readonly icon?: GameIconName; readonly count?: number }
  | { readonly type: 'player'; readonly key: string; readonly player: PlayerType; readonly fallback: FriendStatus }
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
        <View style={{ flex: 1 }}>
          {tab === 'friends' && <FriendsTabView onReady={() => setListReady(true)} onFind={() => setTab('find')} />}
          {tab === 'requests' && <RequestsTabView onFind={() => setTab('find')} />}
          {tab === 'find' && <FindTabView />}
        </View>
        <RequestsCounter />
      </SocialBackdrop>
    </>
  );
}

/** Keeps the Requests badge true even when that tab was never opened. */
function RequestsCounter() {
  useEffect(() => {
    let live = true;
    getFriendRequests().then(list => { if (live) setPendingIncoming(list.length); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return null;
}

function Hero({ count, onInvite }: { readonly count: number; readonly onInvite: () => void }) {
  return (
    <View style={[kit.card, styles.hero]}>
      <View style={kit.gloss} pointerEvents="none" />
      <Image source={CREST} style={styles.crest} contentFit="contain" accessibilityIgnoresInvertColors />
      <View style={{ flex: 1 }} accessible accessibilityLabel={`${count} ${count === 1 ? 'friend' : 'friends'}`}>
        <Text style={styles.heroCount} maxFontSizeMultiplier={1.2}>{count}</Text>
        <Text style={styles.heroLabel} maxFontSizeMultiplier={1.2}>{count === 1 ? 'Friend' : 'Friends'}</Text>
      </View>
      <Pill label="Invite" icon="gift" tone="gold" onPress={onInvite} accessibilityLabel="Invite a friend to play" />
    </View>
  );
}

const TAB_LIST: readonly { key: FriendsTab; label: string; icon: GameIconName }[] = [
  { key: 'friends', label: 'Friends', icon: 'heart' },
  { key: 'requests', label: 'Requests', icon: 'shark' },
  { key: 'find', label: 'Find', icon: 'search' },
];

function Tabs({ tab, pending, onChange }: { readonly tab: FriendsTab; readonly pending: number; readonly onChange: (tab: FriendsTab) => void }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {TAB_LIST.map(item => <TabChip key={item.key} label={item.label} icon={item.icon} active={tab === item.key} badge={item.key === 'requests' ? pending : 0} onPress={() => onChange(item.key)} />)}
    </View>
  );
}

function TabChip({ label, icon, active, badge, onPress }: { readonly label: string; readonly icon: GameIconName; readonly active: boolean; readonly badge: number; readonly onPress: () => void }) {
  const squash = useSquash();
  return (
    <Pressable onPress={onPress} onPressIn={squash.onPressIn} onPressOut={squash.onPressOut} style={{ flex: 1 }}
      accessibilityRole="tab" accessibilityState={{ selected: active }}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} waiting` : label}>
      <Animated.View style={[styles.tab, active && styles.tabActive, squash.style]}>
        <GameIcon name={icon} size={26} />
        <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1} maxFontSizeMultiplier={1.15}>{label}</Text>
      </Animated.View>
      <CountBadge count={badge} style={styles.tabBadge} />
    </Pressable>
  );
}

// ---- Shared list ------------------------------------------------------------

function SocialList({ rows, refreshing, onRefresh, onEndReached, footer, empty }: {
  readonly rows: readonly Row[];
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
      data={rows as Row[]}
      extraData={overrides}
      keyExtractor={row => row.key}
      getItemType={row => row.type}
      estimatedItemSize={ROW_HEIGHT}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReachedThreshold={0.6}
      onEndReached={onEndReached}
      ListFooterComponent={footer}
      ListEmptyComponent={empty}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" /> : undefined}
      renderItem={({ item, index }) => {
        if (item.type === 'header') return <SectionHeader label={item.label} icon={item.icon} count={item.count} />;
        if (item.type === 'hint') return <Text style={styles.hint} maxFontSizeMultiplier={1.3}>{item.text}</Text>;
        const row = <PlayerRow player={item.player} status={effectiveStatus(item.player, overrides, item.fallback)} />;
        return first.current && !reduced && index < 8
          ? <Animated.View entering={FadeInDown.delay(index * 40).springify().damping(16)}>{row}</Animated.View>
          : row;
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

function FriendsTabView({ onReady, onFind }: { readonly onReady: () => void; readonly onFind: () => void }) {
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
  if (load === 'error') return <SharkLoader state="error" tone="onBlue" title="Friends didn't load" onRetry={() => { setLoad('loading'); first().then(() => setLoad('ready')).catch(() => setLoad('error')); }} />;

  return (
    <View style={{ flex: 1 }}>
      {friends.length > 0 && <SearchField placeholder="Find a friend" accessibilityLabel="Search your friends" onChangeText={search} />}
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

  // An answered "No", a block or a taken-back ask leaves the list; a "Yes" stays as a friend row until the next visit.
  const rows = useMemo<Row[]>(() => {
    const gone = (status: FriendStatus) => status === 'none' || status === 'blocked';
    const ask = incoming.filter(p => !gone(effectiveStatus(p, overrides, 'incoming')));
    const mine = sent.filter(p => !gone(effectiveStatus(p, overrides, 'outgoing')));
    const out: Row[] = [];
    if (ask.length) {
      out.push({ type: 'header', key: 'h-ask', label: 'Want to be friends', icon: 'shark', count: ask.filter(p => effectiveStatus(p, overrides, 'incoming') === 'incoming').length });
      for (const p of ask) out.push({ type: 'player', key: `i${p.id}`, player: p, fallback: 'incoming' });
    }
    if (mine.length) {
      out.push({ type: 'header', key: 'h-sent', label: 'You asked', icon: 'timer' });
      for (const p of mine) out.push({ type: 'player', key: `o${p.id}`, player: p, fallback: 'outgoing' });
    }
    return out;
  }, [incoming, sent, overrides]);

  if (load === 'loading') return <SharkLoader state="loading" tone="onBlue" title="Checking requests" />;
  if (load === 'error') return <SharkLoader state="error" tone="onBlue" title="Requests didn't load" onRetry={() => { setLoad('loading'); fetchAll().then(() => setLoad('ready')).catch(() => setLoad('error')); }} />;

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

function FindTabView() {
  const [suggested, setSuggested] = useState<PlayerType[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerType[] | null>(null);
  const [searching, setSearching] = useState(false);
  const seqRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggested = useCallback(() => {
    setLoad('loading');
    getFriendSuggestions().then(list => { setSuggested(list); setLoad('ready'); }).catch(() => setLoad('error'));
  }, []);
  useEffect(() => { fetchSuggested(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [fetchSuggested]);

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
    if (!suggested.length) return [];
    return [{ type: 'header', key: 'h-sug', label: 'Sharks to meet', icon: 'star' },
      ...suggested.map(p => ({ type: 'player' as const, key: `s${p.id}`, player: p, fallback: 'none' as FriendStatus }))];
  }, [hint, results, suggested]);

  return (
    <View style={{ flex: 1 }}>
      <SearchField placeholder="Type a shark's name" accessibilityLabel="Search all players by name" onChangeText={search} />
      {load === 'error' && !query
        ? <SharkLoader state="error" tone="onBlue" title="Couldn't load sharks to meet" onRetry={fetchSuggested} />
        : load === 'loading' && !query
          ? <SharkLoader state="loading" tone="onBlue" title="Looking for sharks" />
          : (
            <SocialList
              rows={rows}
              footer={searching ? <SharkLoader state="loading" tone="onBlue" compact /> : null}
              empty={searching ? null : results
                ? <Empty title="No sharks found" message={`Nobody called "${query.trim()}". Check the spelling!`} />
                : <Empty title="Find friends" message="Type a friend's shark name to find them." />}
            />
          )}
    </View>
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
  hint: { fontFamily: FONT.display, fontSize: 18, color: '#FFFFFF', textAlign: 'center', paddingTop: 24, textShadowColor: INK, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  footer: { alignItems: 'center', paddingVertical: 12 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 36 },
  emptyArt: { width: 120, height: 120 },
  emptyTitle: { fontFamily: FONT.display, fontSize: 24, color: '#FFFFFF', textTransform: 'uppercase', marginTop: 8, textShadowColor: INK, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  emptyText: { fontFamily: FONT.body, fontSize: 18, color: '#FFFFFF', textAlign: 'center', marginTop: 4, textShadowColor: 'rgba(5,52,110,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
