/**
 * News v2 story reader.
 *
 * - The house header (wavy water, Alex's back button, "News" in the Shark
 *   face) with Share on the right; it always clears the Dynamic Island.
 * - Swipe left and right between the stories of the list you came from, or
 *   use the bottom bar: a round Previous button and a Next card that shows
 *   the next story's photo and headline. Far jumps (a More news story) cut
 *   straight there instead of flicking through every page.
 * - The left screen edge never belongs to the pager, so the iOS edge swipe
 *   always goes back to News, from any story.
 * - Other Theme Park Shark stories linked inside a story open right here.
 *   Every way out of the app (website, other sites, share) asks a grown-up.
 */
import * as Haptics from 'expo-haptics';
import GamePress from './NewsScreen/GamePress';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, InteractionManager, Modal, Pressable, ScrollView, Text, useWindowDimensions, View, type ViewToken } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import YouTubePlayerModal from '../components/watch/YouTubePlayerModal';
import type { SocialPostType } from '../models/social-post-type';
import { openExternal, shareExternal } from '../services/external';
import { BRAND, GameIcon, RADIUS } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import type { ArticleBodyHandlers } from './NewsScreen/ArticleBody';
import ArticlePage from './NewsScreen/ArticlePage';
import { RIM } from './NewsScreen/NewsCards';
import { fetchBySlug, findBySlug, getEntry, markRead, rememberEntries, setLastViewed } from './NewsScreen/newsFeed';
import { plainText, relatedFor, tpsArticleSlug, type NewsEntry } from './NewsScreen/newsModel';
import useTapSound from './NewsScreen/useTapSound';

const BOTTOM_BAR = 66;
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };
const NO_RELATED: NewsEntry[] = [];

type Params = { id?: number; ids?: number[]; entry?: NewsEntry; fromStory?: boolean };

/** Round white game button with a lip (Previous, Share). */
function RoundButton({ label, hint, onPress, disabled = false, children }: {
  readonly label: string; readonly hint?: string; readonly onPress: () => void; readonly disabled?: boolean; readonly children: React.ReactNode;
}) {
  return (
    <GamePress accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled }} disabled={disabled}
      hitSlop={8} onPress={onPress}
      lip={5}
        style={{ minWidth: 52, height: 50, paddingHorizontal: 12, borderRadius: 25, alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', gap: 6, backgroundColor: BRAND.white, borderWidth: 3, borderColor: RIM,
        opacity: disabled ? 0.35 : 1 }}>
      {children}
    </GamePress>
  );
}

export default function ArticleScreen({ route, navigation }: any) {
  const params: Params = route.params ?? {};
  const tap = useTapSound();
  const reduced = useUiReducedMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // The list this reader swipes through: ids from News, entries from the cache.
  const [list] = useState<NewsEntry[]>(() => {
    if (params.entry) rememberEntries([params.entry]);
    const ids = params.ids?.length ? params.ids : [params.id ?? params.entry?.id].filter((n): n is number => typeof n === 'number');
    const found = ids.map(id => getEntry(id)).filter((e): e is NewsEntry => !!e);
    return found.length ? found : params.entry ? [params.entry] : [];
  });
  const startIndex = Math.max(0, list.findIndex(e => e.id === (params.id ?? params.entry?.id)));
  const [index, setIndex] = useState(startIndex);
  const pager = useRef<FlatList<NewsEntry>>(null);
  const [zoom, setZoom] = useState<{ uri: string; aspect: number } | null>(null);
  const [video, setVideo] = useState<SocialPostType | null>(null);
  const [opening, setOpening] = useState(false);
  const zoomRef = useRef<ScrollView>(null);
  const zoomScale = useRef(1);
  /** Where the photo sits inside the zoom view's content (it is centred), for aiming a double tap. */
  const photoTop = useRef(0);
  const lastTap = useRef(0);
  const closeZoom = useCallback(() => { zoomScale.current = 1; setZoom(null); }, []);
  /** Double tap zooms in 2x on that spot (or back out); a single tap does nothing, so zooming never closes it by accident. */
  const photoTap = useCallback((x: number, y: number) => {
    const t = Date.now();
    if (t - lastTap.current > 300) { lastTap.current = t; return; }
    lastTap.current = 0;
    const responder = zoomRef.current as unknown as { scrollResponderZoomTo?: (r: { x: number; y: number; width: number; height: number; animated?: boolean }) => void };
    const out = zoomScale.current > 1.2;
    const photoH = zoom ? width / zoom.aspect : width;
    if (out) {
      responder.scrollResponderZoomTo?.({ x: 0, y: photoTop.current, width, height: photoH, animated: !reduced });
      zoomScale.current = 1;
      return;
    }
    // 2x on the tapped spot, kept inside the photo.
    const w = width / 2;
    const h = photoH / 2;
    const cx = Math.min(Math.max(x - w / 2, 0), width - w);
    const cy = photoTop.current + Math.min(Math.max(y - h / 2, 0), photoH - h);
    responder.scrollResponderZoomTo?.({ x: cx, y: cy, width: w, height: h, animated: !reduced });
    zoomScale.current = 2;
  }, [width, reduced, zoom]);
  const entry = list[index];
  // "More news" per story, worked out the first time a page is drawn and kept.
  const relatedCache = useRef(new Map<number, NewsEntry[]>());
  const relatedAt = useCallback((i: number) => {
    let hit = relatedCache.current.get(i);
    if (!hit) relatedCache.current.set(i, (hit = relatedFor(list[i], list.slice(i + 2).concat(list.slice(0, i)), 3)));
    return hit;
  }, [list]);
  // The next page's full story is built after the swipe settles, never during it.
  const [settled, setSettled] = useState(startIndex);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setSettled(index));
    return () => task.cancel();
  }, [index]);

  useEffect(() => {
    if (!entry) return;
    markRead(entry.id);
    setLastViewed(entry.id);
  }, [entry]);

  const fade = useSharedValue(1);
  const jumping = useRef(false);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (jumpTimer.current) clearTimeout(jumpTimer.current); }, []);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const indexRef = useRef(index);
  indexRef.current = index;
  /** One rule for every story change: the tap sound for a button, the selection tick when the page lands. */
  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= list.length || next === indexRef.current) return;
    tap();
    const near = Math.abs(next - indexRef.current) <= 1;
    if (!near) void Haptics.selectionAsync().catch(() => undefined);
    if (near || reduced) {
      pager.current?.scrollToIndex({ index: next, animated: near && !reduced });
      setIndex(next);
      return;
    }
    // A far jump (a More news story) dips to the page colour, cuts, and fades back in once the
    // new page is drawn: it reads as a move, not a glitch. A second jump while one is running is ignored.
    if (jumping.current) return;
    jumping.current = true;
    fade.value = withTiming(0, { duration: 90 });
    jumpTimer.current = setTimeout(() => {
      pager.current?.scrollToIndex({ index: next, animated: false });
      setIndex(next);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fade.value = withTiming(1, { duration: 160 });
        jumping.current = false;
      }));
    }, 90);
  }, [list.length, tap, reduced, fade]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find(v => v.isViewable);
    if (first?.index == null) return;
    const at = first.index;
    setIndex(i => {
      if (i !== at) void Haptics.selectionAsync().catch(() => undefined);
      return at;
    });
  }).current;

  const share = useCallback(async () => {
    if (!entry) return;
    tap();
    await shareExternal({ message: `${plainText(entry.title)} ${entry.url}`, url: entry.url });
  }, [entry, tap]);

  const openSite = useCallback((url: string) => {
    tap();
    void openExternal(url);
  }, [tap]);

  /** A story that is not in this list opens as its own reader on top. */
  const openStory = useCallback((target: NewsEntry) => {
    const at = list.findIndex(e => e.id === target.id);
    if (at >= 0) { goTo(at); return; }
    tap();
    rememberEntries([target]);
    navigation.push('Article', { id: target.id, ids: [target.id, ...relatedFor(target, list, 6).map(e => e.id)], fromStory: true });
  }, [list, goTo, navigation, tap]);

  const handlers: ArticleBodyHandlers = useMemo(() => ({
    onLink: (href: string) => {
      const slug = tpsArticleSlug(href);
      if (!slug) { tap(); void openExternal(href); return; }
      const known = findBySlug(slug);
      if (known) { openStory(known); return; }
      setOpening(true);
      fetchBySlug(slug)
        .then(found => { if (found) openStory(found); else void openExternal(href); })
        .catch(() => { void openExternal(href); })
        .finally(() => setOpening(false));
    },
    onImage: (uri: string, aspect: number) => { tap(); setZoom({ uri, aspect }); },
    onVideo: (id: string, title: string, short: boolean) => {
      tap();
      setVideo({ id: 0, title, image_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, permalink: `https://www.youtube.com/watch?v=${id}`,
        has_watched: true, video_id: id, is_short: short });
    },
  }), [openStory, tap]);

  const renderPage = useCallback(({ item, index: i }: { item: NewsEntry; index: number }) => (
    <ArticlePage entry={item} index={i} width={width} live={i === index} near={i === index || Math.abs(i - settled) <= 1}
      next={list[i + 1] ?? null} related={i === index || Math.abs(i - settled) <= 1 ? relatedAt(i) : NO_RELATED} onOpen={openStory} onGoTo={goTo}
      onWebsite={openSite} handlers={handlers} />
  ), [width, index, settled, list, relatedAt, openStory, goTo, openSite, handlers]);

  // Nothing to show (a stale link): straight back to News.
  useEffect(() => { if (!entry) navigation.goBack(); }, [entry, navigation]);
  if (!entry) return <View style={{ flex: 1, backgroundColor: BRAND.white }} />;

  const next = list[index + 1] ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: BRAND.white }}>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn>
          <TopbarText>{params.fromStory ? 'Story' : 'News'}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <GamePress accessibilityRole="button" accessibilityLabel="Share this story" accessibilityHint="Asks a grown-up first" hitSlop={8}
            onPress={() => { void share(); }}
            lip={4}
        style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center', backgroundColor: BRAND.white,
              borderWidth: 3, borderColor: BRAND.navy }}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.navy }}>Share</Text>
          </GamePress>
        </TopbarColumn>
      </Topbar>

      <Animated.View style={[{ flex: 1, marginTop: -8 }, fadeStyle]}>
        <FlatList
          ref={pager}
          data={list}
          horizontal
          pagingEnabled
          initialScrollIndex={startIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={item => String(item.id)}
          renderItem={renderPage}
          extraData={`${index}:${settled}`}
          showsHorizontalScrollIndicator={false}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          removeClippedSubviews
          onViewableItemsChanged={onViewable}
          viewabilityConfig={VIEWABILITY}
          style={{ flex: 1 }}
        />
        {/* The left edge belongs to the iOS back swipe, never to the pager. */}
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 18 }} />
      </Animated.View>

      {/* Bottom bar: round Previous, and a Next card with the next story's photo and headline. */}
      <View style={{ minHeight: BOTTOM_BAR + insets.bottom, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8, backgroundColor: BRAND.cream,
        borderTopWidth: 3, borderTopColor: 'rgba(5,52,110,0.14)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
        {/* First story: no Previous at all (a greyed button looks broken). */}
        {index > 0 && (
          <RoundButton label="Previous story" onPress={() => goTo(index - 1)}>
            <View style={{ transform: [{ scaleX: -1 }] }}><GameIcon name="arrow" size={26} /></View>
          </RoundButton>
        )}
        {next ? (
          <GamePress accessibilityRole="button" accessibilityLabel={`Next story. ${plainText(next.title)}`} hitSlop={6} onPress={() => goTo(index + 1)}
            lip={5} grow
        style={{ height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 5, paddingRight: 8,
              backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.gold }}>
            <Image source={next.featured_image_small || next.featured_image ? { uri: (next.featured_image_small || next.featured_image) as string } : undefined} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND.sky }}
              contentFit="cover" transition={120} />
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 13, color: BRAND.goldLip }}>NEXT</Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Knockout', fontSize: 16, color: BRAND.navy }}>{plainText(next.title)}</Text>
            </View>
            <GameIcon name="arrow" size={26} />
          </GamePress>
        ) : (
          <GamePress accessibilityRole="button" accessibilityLabel="Back to News" hitSlop={6} onPress={() => { tap(); navigation.goBack(); }}
            lip={5} grow
        style={{ height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.gold,
              borderWidth: 3, borderColor: BRAND.goldLip }}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 16, color: BRAND.navy }}>All caught up! Back to News</Text>
          </GamePress>
        )}
      </View>

      {opening && (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(150)} exiting={reduced ? undefined : FadeOut.duration(120)} pointerEvents="none"
          style={{ position: 'absolute', alignSelf: 'center', bottom: BOTTOM_BAR + insets.bottom + 16, paddingHorizontal: 16, height: 40, borderRadius: 20,
            backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white, justifyContent: 'center' }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.white }}>Opening story...</Text>
        </Animated.View>
      )}

      {/* Tap a photo to look closer: pinch to zoom, X to close. */}
      <Modal visible={zoom !== null} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={closeZoom} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(5,30,70,0.96)' }}>
          {zoom && (
            <ScrollView ref={zoomRef} maximumZoomScale={4} minimumZoomScale={1} centerContent bouncesZoom showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
              onScroll={e => { zoomScale.current = e.nativeEvent.zoomScale ?? 1; }} scrollEventThrottle={64}
              // Pull the photo down (not zoomed) to put it away, like Photos.
              onScrollEndDrag={e => { if ((e.nativeEvent.zoomScale ?? 1) <= 1.01 && e.nativeEvent.contentOffset.y < -70) closeZoom(); }}>
              <Pressable accessibilityLabel="Photo. Double tap to zoom, pull down to close" onPress={e => photoTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
                onLayout={e => { photoTop.current = e.nativeEvent.layout.y; }}>
                <Image source={{ uri: zoom.uri }} style={{ width, aspectRatio: zoom.aspect }} contentFit="contain" />
              </Pressable>
            </ScrollView>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo" hitSlop={12} onPress={() => { tap(); closeZoom(); }}
            style={{ position: 'absolute', top: insets.top + 8, right: 16 }}>
            <GameIcon name="close" size={44} />
          </Pressable>
        </View>
      </Modal>

      <YouTubePlayerModal video={video} watched coins={0} upNext={[]}
        onSwitch={() => undefined} onClose={() => setVideo(null)} />
    </View>
  );
}
