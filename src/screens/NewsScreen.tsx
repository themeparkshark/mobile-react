/**
 * News v2: the Theme Park Shark news desk inside the game.
 *
 * - First paint from the copy saved on the phone (instant, offline-proof),
 *   then the game server's cached feed, then WordPress for older pages,
 *   park filters and search (see NewsScreen/newsFeed.ts).
 * - A lead story, then rows grouped Today / Yesterday / Earlier, a big photo
 *   story every few rows, endless paging, and themeparkshark.com at the end.
 * - Park chips filter instantly from what is loaded while the full list loads.
 * - Tapping a story opens the reader, which swipes through this same list.
 */
import { useFocusEffect } from '@react-navigation/native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, Keyboard, Pressable, RefreshControl, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as RootNavigation from '../RootNavigation';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper, { BOTTOM_BAR_OVERHANG } from '../components/Wrapper';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { openExternal } from '../services/external';
import { BRAND, GameIcon, RADIUS, SharkLoader } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { onTabReselect } from '../utils/tabReselect';
import {
  DayDivider,
  FeatureCard,
  FeedSkeleton,
  HeroCard,
  InfoRow,
  SheetTop,
  SiteCard,
  SkeletonRow,
  StoryRow,
} from './NewsScreen/NewsCards';
import NewsFilterBar from './NewsScreen/NewsFilterBar';
import {
  fetchCategories,
  fetchNewsPage,
  loadSaved,
  markRead,
  readNow,
  readStories,
  saveFeed,
  setLastViewed,
  rememberEntries,
  takeLastViewed,
} from './NewsScreen/newsFeed';
import {
  filterByKey,
  matchesFilter,
  mergeEntries,
  searchLocal,
  type NewsEntry,
  type NewsFilterKey,
} from './NewsScreen/newsModel';
import { buildFeedRows, type FeedRow } from './NewsScreen/feedRows';

const tapSound = require('../../assets/sounds/tap.mp3');
const SITE = 'https://themeparkshark.com/';

type ListState = {
  readonly entries: NewsEntry[];
  readonly page: number;
  readonly hasMore: boolean;
  readonly loading: 'idle' | 'first' | 'more';
  readonly failed: boolean;
};
const EMPTY: ListState = { entries: [], page: 0, hasMore: true, loading: 'idle', failed: false };

function keyOf(filter: NewsFilterKey, park: string | null, search: string): string {
  return search ? `search:${search.toLowerCase()}` : `${filter}:${park ?? ''}`;
}

export default function NewsScreen() {
  const { playSound } = useContext(SoundEffectContext);
  const reduced = useUiReducedMotion();
  const [filter, setFilter] = useState<NewsFilterKey>('all');
  const [park, setPark] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [lists, setLists] = useState<Record<string, ListState>>({});
  const [saved, setSaved] = useState<NewsEntry[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [read, setRead] = useState<ReadonlySet<number>>(readNow());
  const [showTop, setShowTop] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** Categories filled in for stories from the live v1 server (by story id). */
  const [cats, setCats] = useState<Readonly<Record<number, number[]>>>({});
  const listRef = useRef<FlashList<FeedRow>>(null);
  const showTopRef = useRef(false);
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const inflight = useRef(new Set<string>());

  const key = keyOf(filter, park, search);
  const top = lists['all:'] ?? EMPTY;

  const patch = useCallback((k: string, next: Partial<ListState>) => {
    setLists(prev => ({ ...prev, [k]: { ...(prev[k] ?? EMPTY), ...next } }));
  }, []);

  /** Loads the next page (or page 1 again on refresh) for one list. */
  const load = useCallback(async (f: NewsFilterKey, p: string | null, s: string, mode: 'first' | 'more' | 'refresh') => {
    const k = keyOf(f, p, s);
    const flight = `${k}:${mode}`;
    if (inflight.current.has(flight)) return;
    const current = listsRef.current[k] ?? EMPTY;
    if (mode === 'more' && (!current.hasMore || current.loading !== 'idle' || current.page === 0)) return;
    inflight.current.add(flight);
    const page = mode === 'more' ? current.page + 1 : 1;
    patch(k, { loading: mode === 'more' ? 'more' : 'first', failed: false });
    try {
      const result = await fetchNewsPage({ filter: f, park: p, search: s || undefined, page });
      setLists(prev => {
        const base = mode === 'more' ? (prev[k] ?? EMPTY).entries : [];
        // Search keeps WordPress's relevance order; everything else is newest first.
        const entries = s ? [...base, ...result.entries.filter(e => !base.some(b => b.id === e.id))] : mergeEntries(base, result.entries);
        return { ...prev, [k]: { ...(prev[k] ?? EMPTY), entries, page, hasMore: result.hasMore && result.entries.length > 0, loading: 'idle', failed: false } };
      });
      if (k === 'all:') {
        setOffline(false);
        if (page === 1) saveFeed(result.entries);
        // The live server sends no categories yet: one small call fills them in.
        const missing = result.entries.filter(e => !e.categories).map(e => e.id);
        if (missing.length) {
          fetchCategories(missing).then(map => {
            if (!map.size) return;
            setCats(prev => {
              const next = { ...prev };
              map.forEach((ids, id) => { next[id] = ids; });
              return next;
            });
                    }).catch(() => undefined);
        }
      }
    } catch {
      patch(k, { loading: 'idle', failed: true });
      if (k === 'all:') setOffline(true);
    } finally {
      inflight.current.delete(flight);
    }
  }, [patch]);

  // Saved copy first, then the network.
  useEffect(() => {
    let alive = true;
    readStories().then(ids => alive && setRead(new Set(ids)));
    loadSaved().then(list => { if (alive) setSaved(list); });
    void load('all', null, '', 'first');
    return () => { alive = false; };
  }, [load]);

  // A filter or search loads its own list the first time it is picked.
  useEffect(() => {
    if (key === 'all:') return;
    if (search && search.length < 2) return;
    const state = listsRef.current[key];
    if (!state || (state.page === 0 && state.loading === 'idle' && !state.failed)) void load(filter, park, search, 'first');
  }, [key, filter, park, search, load]);

  // Typing settles for a moment before searching.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim().length >= 2 ? query.trim() : ''), 450);
    return () => clearTimeout(id);
  }, [query]);

  // Coming back from the reader: refresh Read marks, ages, and bring the last story into view.
  useFocusEffect(useCallback(() => {
    setRead(new Set(readNow()));
    setNow(Date.now());
    const id = takeLastViewed();
    if (id == null) return;
    const index = rowsRef.current.findIndex(r => 'entry' in r && r.entry.id === id);
    if (index > 0) requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: false }));
  }, []));

  // Tapping News in the footer while here: back to the top.
  useEffect(() => onTabReselect('News', () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: !reduced });
  }), [reduced]);

  const withCats = useCallback((list: readonly NewsEntry[]) => list.map(e => (!e.categories && cats[e.id] ? { ...e, categories: cats[e.id] } : e)), [cats]);
  const topEntries = useMemo(() => withCats(top.entries.length ? top.entries : saved ?? []), [top.entries, saved, withCats]);
  const allLoaded = useMemo(
    () => mergeEntries(topEntries, ...Object.values(lists).map(l => withCats(l.entries))),
    [topEntries, lists, withCats],
  );
  // The saved copy keeps the filled-in categories, so the next first paint has exact park tags.
  useEffect(() => {
    if (top.page >= 1 && Object.keys(cats).length) saveFeed(topEntries);
  }, [cats, top.page, topEntries]);

  /** What this view shows: its own list, plus anything already loaded that fits (instant filters). */
  const state = key === 'all:' ? top : lists[key] ?? EMPTY;
  const shown = useMemo(() => {
    if (key === 'all:') return topEntries;
    if (search) {
      const local = searchLocal(allLoaded, search);
      return [...state.entries, ...local.filter(e => !state.entries.some(r => r.id === e.id))];
    }
    const local = allLoaded.filter(e => matchesFilter(e, filter, park));
    return mergeEntries(local, state.entries);
  }, [key, topEntries, search, allLoaded, state.entries, filter, park]);

  const waitingFirst = shown.length === 0 && (state.loading === 'first' || (key === 'all:' && saved === null) || (state.page === 0 && !state.failed));
  const rows = useMemo(() => buildFeedRows({
    entries: shown,
    lead: !search,
    now,
    searchLabel: search ? search : null,
    loadingMore: state.loading === 'more' || (state.loading === 'first' && shown.length > 0),
    failed: state.failed && shown.length > 0,
    end: !state.hasMore || (state.failed && state.page === 0 && shown.length > 0),
    stale: key === 'all:' && offline && shown.length > 0,
  }), [shown, search, now, state.loading, state.failed, state.hasMore, state.page, key, offline]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const open = useCallback((entry: NewsEntry) => {
    playSound(tapSound);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    Keyboard.dismiss();
    const list = rowsRef.current.flatMap(r => ('entry' in r ? [r.entry] : []));
    rememberEntries(list);
    setLastViewed(entry.id);
    markRead(entry.id);
    RootNavigation.navigate('Article', { id: entry.id, ids: list.map(e => e.id) });
  }, [playSound]);

  const visitSite = useCallback(() => {
    playSound(tapSound);
    void openExternal(SITE);
  }, [playSound]);

  const retry = useCallback(() => {
    void load(filter, park, search, state.page === 0 ? 'first' : 'more');
  }, [load, filter, park, search, state.page]);

  const renderItem: ListRenderItem<FeedRow> = useCallback(({ item }) => {
    switch (item.type) {
      case 'hero': return <HeroCard entry={item.entry} read={read.has(item.entry.id)} now={now} onPress={open} />;
      case 'feature': return <FeatureCard entry={item.entry} read={read.has(item.entry.id)} now={now} onPress={open} />;
      case 'row': return <StoryRow entry={item.entry} read={read.has(item.entry.id)} now={now} onPress={open} />;
      case 'sheet': return <SheetTop />;
      case 'day': return <DayDivider label={item.label} />;
      case 'skeleton': return <SkeletonRow />;
      case 'stale': return <InfoRow label="Showing saved stories. Pull down for the newest." />;
      case 'retry': return <InfoRow label="More stories are taking a while." action="Try again" onPress={retry} />;
      case 'search': return <InfoRow label={item.label} />;
      case 'site': return <SiteCard onVisit={visitSite} />;
      default: return null;
    }
  }, [read, now, open, retry, visitSite]);

  const onEndReached = useCallback(() => {
    if (state.hasMore && state.loading === 'idle' && !state.failed && state.page > 0) void load(filter, park, search, 'more');
  }, [state.hasMore, state.loading, state.failed, state.page, load, filter, park, search]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setNow(Date.now());
    load(filter, park, search, 'refresh').finally(() => setRefreshing(false));
  }, [load, filter, park, search]);

  const pickFilter = useCallback((next: NewsFilterKey) => {
    setFilter(next);
    setPark(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);
  const pickPark = useCallback((next: string | null) => {
    setPark(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);
  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearching(false);
    setQuery('');
    setSearch('');
  }, []);

  const emptyNow = !waitingFirst && shown.length === 0;
  const emptyTitle = search ? `No stories for "${search}" yet` : state.failed ? "News didn't load" : `No ${filterByKey(filter).label} stories yet`;

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch>
          <TopbarText>Latest News</TopbarText>
        </TopbarColumn>
      </Topbar>
      <View style={{ marginTop: -8, flex: 1 }}>
        <ImageBackground style={{ flex: 1 }} source={require('../../assets/images/screens/leaderboard/standings-bg.png')}>
          <NewsFilterBar filter={filter} park={park} searching={searching} query={query}
            onFilter={pickFilter} onPark={pickPark}
            onSearchOpen={() => setSearching(true)} onSearchClose={closeSearch} onQuery={setQuery} />
          {waitingFirst ? (
            <FeedSkeleton />
          ) : emptyNow ? (
            <SharkLoader state={state.failed ? 'error' : 'empty'} tone="onBlue" compact title={emptyTitle}
              message={state.failed ? 'Check your signal and try again.' : search ? 'Try a park or ride name.' : 'Pick another park for now.'}
              onRetry={state.failed ? retry : undefined} />
          ) : (
            <FlashList
              ref={listRef}
              data={rows}
              renderItem={renderItem}
              keyExtractor={row => row.key}
              getItemType={row => row.type}
              estimatedItemSize={124}
              onEndReached={onEndReached}
              onEndReachedThreshold={1.2}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={64}
              onScroll={e => {
                const far = e.nativeEvent.contentOffset.y > 1400;
                if (far !== showTopRef.current) { showTopRef.current = far; setShowTop(far); }
              }}
              refreshControl={<RefreshControl tintColor={BRAND.white} refreshing={refreshing} onRefresh={onRefresh} />}
              ListFooterComponent={<View style={{ height: BOTTOM_BAR_OVERHANG + 24, backgroundColor: BRAND.cream }} />}
            />
          )}
          {showTop && (
            <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} exiting={reduced ? undefined : FadeOut.duration(120)}
              style={{ position: 'absolute', right: 14, bottom: BOTTOM_BAR_OVERHANG + 18 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back to the top" hitSlop={8}
                onPress={() => { playSound(tapSound); listRef.current?.scrollToOffset({ offset: 0, animated: !reduced }); }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 14, borderRadius: RADIUS.pill,
                  backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
                <View style={{ transform: [{ rotate: '-90deg' }] }}><GameIcon name="arrow" size={20} /></View>
                <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.white }}>Top</Text>
              </Pressable>
            </Animated.View>
          )}
        </ImageBackground>
      </View>
    </Wrapper>
  );
}
