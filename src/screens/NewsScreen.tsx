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
import { Image } from 'expo-image';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import useTapSound from './NewsScreen/useTapSound';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, InteractionManager, Keyboard, Pressable, RefreshControl, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as RootNavigation from '../RootNavigation';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper, { BOTTOM_BAR_OVERHANG } from '../components/Wrapper';
import { openExternal } from '../services/external';
import { BRAND, GameIcon, RADIUS, SHADOW, SharkLoader } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { onTabReselect } from '../utils/tabReselect';
import {
  DayDivider,
  FeatureCard,
  FeedSkeleton,
  HeroCard,
  InfoRow,
  SheetTop,
  SiteRow,
  TPS_SHARK,
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
  onLastViewed,
} from './NewsScreen/newsFeed';
import {
  filterByKey,
  matchesFilter,
  mergeEntries,
  searchLocal,
  withLead,
  type NewsEntry,
  type NewsFilterKey,
} from './NewsScreen/newsModel';
import { buildFeedRows, keepOrder, shopLast, type FeedRow } from './NewsScreen/feedRows';


type ListState = {
  readonly entries: NewsEntry[];
  readonly page: number;
  readonly hasMore: boolean;
  readonly loading: 'idle' | 'first' | 'more';
  readonly failed: boolean;
};
const VIEWABILITY = { itemVisiblePercentThreshold: 90 };
/** Dev only: EXPO_PUBLIC_NEWS_TOAST_MS holds the toast longer for slow simulator screenshots. */
const TOAST_MS = (__DEV__ && Number(process.env.EXPO_PUBLIC_NEWS_TOAST_MS)) || 3000;
const rowKey = (row: FeedRow) => row.key;
const rowType = (row: FeedRow) => row.type;
const FOOTER = <View style={{ height: BOTTOM_BAR_OVERHANG + 24, backgroundColor: BRAND.cream }} />;
const EMPTY: ListState = { entries: [], page: 0, hasMore: true, loading: 'idle', failed: false };

function keyOf(filter: NewsFilterKey, park: string | null, search: string): string {
  return search ? `search:${search.toLowerCase()}` : `${filter}:${park ?? ''}`;
}

export default function NewsScreen() {
  const tap = useTapSound();
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
  const shownRef = useRef<NewsEntry[]>([]);
  /** The Back to top pill floats just under the chips (never over the footer or card art at the bottom). */
  const [topPillTop, setTopPillTop] = useState(64);
  const visibleRows = useRef(new Set<number>());
  const onViewable = useRef(({ viewableItems }: { viewableItems: { index: number | null; isViewable: boolean }[] }) => {
    visibleRows.current = new Set(viewableItems.filter(v => v.isViewable && v.index != null).map(v => v.index as number));
  }).current;
  const listsRef = useRef(lists);
  listsRef.current = lists;
  /** Requests in flight by list and mode: a second ask joins the first (so Refresh never reports early). */
  const inflight = useRef(new Map<string, Promise<void>>());
  /** Bumped by pull to refresh: a page that started before it is dropped (never shrinks or skips the list). */
  const generation = useRef(new Map<string, number>());
  const searchAbort = useRef<AbortController | null>(null);

  const key = keyOf(filter, park, search);
  const top = lists['all:'] ?? EMPTY;

  const patch = useCallback((k: string, next: Partial<ListState>) => {
    setLists(prev => ({ ...prev, [k]: { ...(prev[k] ?? EMPTY), ...next } }));
  }, []);

  /** Loads the next page (or page 1 again on refresh) for one list. */
  const load = useCallback((f: NewsFilterKey, p: string | null, s: string, mode: 'first' | 'more' | 'refresh'): Promise<void> => {
    const k = keyOf(f, p, s);
    const flight = `${k}:${mode}`;
    const running = inflight.current.get(flight);
    if (running) return running;
    const current = listsRef.current[k] ?? EMPTY;
    if (mode === 'more' && (!current.hasMore || current.loading !== 'idle' || current.page === 0)) return Promise.resolve();
    const task = runLoad(k, f, p, s, mode, current).finally(() => { inflight.current.delete(flight); });
    inflight.current.set(flight, task);
    return task;
  }, []);
  const runLoadRef = useRef<(k: string, f: NewsFilterKey, p: string | null, s: string, mode: 'first' | 'more' | 'refresh', current: ListState) => Promise<void>>(async () => undefined);
  const runLoad = (k: string, f: NewsFilterKey, p: string | null, s: string, mode: 'first' | 'more' | 'refresh', current: ListState) =>
    runLoadRef.current(k, f, p, s, mode, current);
  runLoadRef.current = async (k, f, p, s, mode, current) => {
    if (mode !== 'more') generation.current.set(k, (generation.current.get(k) ?? 0) + 1);
    const gen = generation.current.get(k) ?? 0;
    const page = mode === 'more' ? current.page + 1 : 1;
    // A newer search cancels the one still downloading.
    let signal: AbortSignal | undefined;
    if (s) {
      searchAbort.current?.abort();
      searchAbort.current = new AbortController();
      signal = searchAbort.current.signal;
    }
    patch(k, { loading: mode === 'more' ? 'more' : 'first', failed: false });
    try {
      const result = await fetchNewsPage({ filter: f, park: p, search: s || undefined, page, signal });
      if ((generation.current.get(k) ?? 0) !== gen) return;
      setLists(prev => {
        const base = mode === 'more' ? (prev[k] ?? EMPTY).entries : [];
        const entries = mergeEntries(base, result.entries);
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
      if ((generation.current.get(k) ?? 0) !== gen || signal?.aborted) {
        if (signal?.aborted) patch(k, { loading: 'idle' });
        return;
      }
      patch(k, { loading: 'idle', failed: true });
      // Only a failed first page means "showing saved stories"; a failed page 2 just offers Try again.
      if (k === 'all:' && mode !== 'more') setOffline(true);
    }
  };

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

  // While the reader is open the feed follows it (out of sight), so Back lands on the last story.
  const bringIntoView = useCallback((id: number) => {
    const index = rowsRef.current.findIndex(r => 'entry' in r && r.entry.id === id);
    // Already fully on screen (the story you just tapped): leave the feed where it is.
    if (index <= 0 || visibleRows.current.has(index)) return;
    listRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: false });
  }, []);
  useEffect(() => onLastViewed(id => {
    // After the reader's swipe settles, never in the same frame as it.
    InteractionManager.runAfterInteractions(() => bringIntoView(id));
  }), [bringIntoView]);
  // Coming back from the reader: fresh Read marks and ages.
  useFocusEffect(useCallback(() => {
    setRead(prev => (prev.size === readNow().size ? prev : new Set(readNow())));
    setNow(Date.now());
    const id = takeLastViewed();
    if (id != null) requestAnimationFrame(() => bringIntoView(id));
  }, [bringIntoView]));

  // Tapping News in the footer while here: back to the top.
  // Tapping News in the footer: back to the top, or (already there) check for new stories.
  const scrollY = useRef(0);
  const refreshRef = useRef<() => void>(() => undefined);
  useEffect(() => onTabReselect('News', () => {
    // Already at the top: look for new stories, and say so right away.
    if (scrollY.current < 40) { setToast('Looking for new stories...'); refreshRef.current(); }
    else listRef.current?.scrollToOffset({ offset: 0, animated: !reduced });
  }), [reduced]);

  // Filled-in copies are made once per story and reused, so memoized cards keep their identity.
  const catCopies = useRef(new WeakMap<NewsEntry, NewsEntry>());
  const withCats = useCallback((list: readonly NewsEntry[]) => list.map(e => {
    if (e.categories || !cats[e.id]) return e;
    let copy = catCopies.current.get(e);
    if (!copy) catCopies.current.set(e, (copy = { ...e, categories: cats[e.id] }));
    return copy;
  }), [cats]);
  const topEntries = useMemo(() => withCats(top.entries.length ? top.entries : saved ?? []), [top.entries, saved, withCats]);
  const allLoaded = useMemo(
    () => mergeEntries(topEntries, ...Object.values(lists).map(l => withCats(l.entries))),
    [topEntries, lists, withCats],
  );
  // The saved copy keeps the filled-in categories, so the next first paint has exact park tags.
  const topRef = useRef(topEntries);
  topRef.current = topEntries;
  useEffect(() => {
    if (!Object.keys(cats).length) return;
    const id = setTimeout(() => saveFeed(topRef.current), 1500);
    return () => clearTimeout(id);
  }, [cats]);

  /** What this view shows: its own list, plus anything already loaded that fits (instant filters). */
  const state = key === 'all:' ? top : lists[key] ?? EMPTY;
  const shown = useMemo(() => {
    if (key === 'all:') return withLead(topEntries.filter(e => matchesFilter(e, 'all')));
    if (search) {
      // Headline matches already on the phone first, then the site's wider matches, newest first.
      const local = searchLocal(allLoaded, search);
      return [...local, ...mergeEntries(state.entries).filter(e => !local.some(r => r.id === e.id))];
    }
    return withLead(mergeEntries(allLoaded, withCats(state.entries)).filter(e => matchesFilter(e, filter, park)));
  }, [key, topEntries, search, allLoaded, state.entries, filter, park, withCats]);

  const waitingFirst = shown.length === 0 && (state.loading === 'first' || (key === 'all:' && saved === null) || (state.page === 0 && !state.failed));
  // Park stories lead each day with shopping spread out (only for days that are complete),
  // then rows already on screen keep their place while more pages load.
  const orderRef = useRef<{ key: string; ids: number[] }>({ key: '', ids: [] });
  const ordered = useMemo(() => {
    if (search) return shown;
    const [lead, ...rest] = shown;
    const spaced = lead ? [lead, ...shopLast(rest, now, !state.hasMore)] : [];
    const prev = orderRef.current.key === key ? orderRef.current.ids : [];
    const next = keepOrder(prev, spaced);
    orderRef.current = { key, ids: next.map(e => e.id) };
    return next;
  }, [shown, search, now, state.hasMore, key]);
  const rows = useMemo(() => buildFeedRows({
    entries: ordered,
    lead: !search,
    now,
    searchLabel: search ? search : null,
    loadingMore: state.loading === 'more' || (state.loading === 'first' && shown.length > 0),
    failed: state.failed && shown.length > 0,
    end: !state.hasMore || (state.failed && state.page === 0 && shown.length > 0),
    stale: shown.length > 0 && (key === 'all:' ? offline : state.failed),
  }), [shown, search, now, state.loading, state.failed, state.hasMore, state.page, key, offline]);
  shownRef.current = shown;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const open = useCallback((entry: NewsEntry) => {
    tap();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    Keyboard.dismiss();
    const list = rowsRef.current.flatMap(r => ('entry' in r ? [r.entry] : []));
    rememberEntries(list);
    setLastViewed(entry.id);
    markRead(entry.id);
    RootNavigation.navigate('Article', { id: entry.id, ids: list.map(e => e.id) });
  }, [tap]);

  const visitSite = useCallback((url: string) => {
    tap();
    void openExternal(url);
  }, [tap]);

  const retry = useCallback(() => {
    void load(filter, park, search, state.page === 0 ? 'first' : 'more');
  }, [load, filter, park, search, state.page]);

  const renderItem: ListRenderItem<FeedRow> = useCallback(({ item }) => {
    switch (item.type) {
      case 'hero': return <HeroCard entry={item.entry} read={read.has(item.entry.id)} fresh={false} now={now} onPress={open} />;
      case 'feature': return <FeatureCard entry={item.entry} read={read.has(item.entry.id)} fresh={item.fresh} now={now} onPress={open} />;
      case 'row': return <StoryRow entry={item.entry} read={read.has(item.entry.id)} fresh={item.fresh} now={now} onPress={open} />;
      case 'sheet': return <SheetTop />;
      case 'day': return <DayDivider label={item.label} />;
      case 'skeleton': return <SkeletonRow />;
      case 'stale': return <InfoRow label="Showing saved stories. Pull down for the newest." />;
      case 'retry': return <InfoRow label="More stories are taking a while." action="Try again" onPress={retry} />;
      case 'search': return <InfoRow label={item.label} />;
      case 'site': return <SiteRow onOpen={visitSite} />;
      default: return null;
    }
  }, [read, now, open, retry, visitSite]);

  const onEndReached = useCallback(() => {
    if (state.hasMore && state.loading === 'idle' && !state.failed && state.page > 0) void load(filter, park, search, 'more');
  }, [state.hasMore, state.loading, state.failed, state.page, load, filter, park, search]);

  const [toast, setToast] = useState<string | null>(null);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setNow(Date.now());
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    const before = new Set(shownRef.current.map(e => e.id));
    load(filter, park, search, 'refresh').finally(() => {
      setRefreshing(false);
      // The payoff: how many new stories arrived, or that you are all caught up.
      requestAnimationFrame(() => {
        const fresh = shownRef.current.filter(e => !before.has(e.id)).length;
        setToast(fresh > 0 ? `${fresh} new ${fresh === 1 ? 'story' : 'stories'}!` : "You're all caught up!");
      });
    });
  }, [load, filter, park, search]);
  refreshRef.current = onRefresh;
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

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
          <View onLayout={e => setTopPillTop(e.nativeEvent.layout.height + 6)}>
          <NewsFilterBar filter={filter} park={park} searching={searching} query={query} endInset={showTop ? 60 : 0}
            onFilter={pickFilter} onPark={pickPark}
            onSearchOpen={() => setSearching(true)} onSearchClose={closeSearch} onQuery={setQuery} />
          </View>
          {searching && !search ? (
            // Search is open but nothing typed yet: say what to type, not the old feed.
            <View style={{ marginHorizontal: 16, marginTop: 12, padding: 18, borderRadius: RADIUS.xl, alignItems: 'center', gap: 8,
              backgroundColor: BRAND.cream, borderWidth: 3, borderBottomWidth: 6, borderColor: BRAND.white }}>
              <GameIcon name="search" size={44} />
              <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, textAlign: 'center' }}>Type a park, ride or food</Text>
              <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft, textAlign: 'center' }}>Like "Space Mountain" or "churros"</Text>
            </View>
          ) : waitingFirst ? (
            <FeedSkeleton />
          ) : emptyNow ? (
            <View style={{ marginHorizontal: 16, marginTop: 12, paddingVertical: 18, paddingHorizontal: 12, borderRadius: RADIUS.xl,
              backgroundColor: BRAND.cream, borderWidth: 3, borderBottomWidth: 6, borderColor: BRAND.white }}>
              <SharkLoader state={state.failed ? 'error' : 'empty'} tone="onLight" compact title={emptyTitle}
                message={state.failed ? (topEntries.length ? 'Check your signal. Saved stories are in Top Stories.' : 'Check your signal and try again.')
                  : search ? 'Try a park or ride name.' : 'Pick another park for now.'}
                onRetry={state.failed ? retry : undefined} />
            </View>
          ) : (
            <FlashList
              ref={listRef}
              data={rows}
              renderItem={renderItem}
              keyExtractor={rowKey}
              getItemType={rowType}
              estimatedItemSize={124}
              onEndReached={onEndReached}
              onEndReachedThreshold={1.2}
              onViewableItemsChanged={onViewable}
              viewabilityConfig={VIEWABILITY}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={64}
              onScroll={e => {
                scrollY.current = e.nativeEvent.contentOffset.y;
                const far = e.nativeEvent.contentOffset.y > 1400;
                if (far !== showTopRef.current) { showTopRef.current = far; setShowTop(far); }
              }}
              refreshControl={<RefreshControl tintColor={BRAND.white} refreshing={refreshing} onRefresh={onRefresh} />}
              ListFooterComponent={FOOTER}
            />
          )}
          {showTop && !toast && (
            <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} exiting={reduced ? undefined : FadeOut.duration(120)}
              style={{ position: 'absolute', right: 10, top: 12 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back to the top" hitSlop={8}
                onPress={() => { tap(); listRef.current?.scrollToOffset({ offset: 0, animated: !reduced }); }}
                style={({ pressed }) => ({ width: 46, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: BRAND.navy, borderWidth: 3, borderBottomWidth: 5, borderColor: BRAND.white, ...SHADOW.card, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
                <View style={{ transform: [{ rotate: '-90deg' }] }}><GameIcon name="arrow" size={24} /></View>
              </Pressable>
            </Animated.View>
          )}
          {toast && (
            <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} exiting={reduced ? undefined : FadeOut.duration(160)} pointerEvents="none"
              accessibilityLiveRegion="polite"
              style={{ position: 'absolute', alignSelf: 'center', top: topPillTop, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44,
                paddingLeft: 6, paddingRight: 16, borderRadius: 22, backgroundColor: BRAND.white, borderWidth: 3, borderBottomWidth: 5, borderColor: BRAND.gold, ...SHADOW.card }}>
              <Image source={TPS_SHARK} style={{ width: 34, height: 34 }} contentFit="contain" />
              <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>{toast}</Text>
            </Animated.View>
          )}
        </ImageBackground>
      </View>
    </Wrapper>
  );
}
