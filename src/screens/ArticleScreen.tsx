/**
 * News v2 story reader.
 *
 * - Swipe left and right between the stories of the list you came from
 *   (or tap Next / Previous in the bottom bar); the back button and the
 *   iOS edge swipe always return to that list, scrolled to your last story.
 * - A fixed top bar that clears the Dynamic Island: back to News, where you
 *   are ("3 of 20"), and Share.
 * - Other Theme Park Shark stories linked inside a story open right here.
 *   Every way out of the app (website, other sites, share) asks a grown-up.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, useWindowDimensions, View, type ViewToken } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YouTubePlayerModal from '../components/watch/YouTubePlayerModal';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import type { SocialPostType } from '../models/social-post-type';
import { openExternal, shareExternal } from '../services/external';
import { BRAND, GameIcon, RADIUS } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import type { ArticleBodyHandlers } from './NewsScreen/ArticleBody';
import ArticlePage from './NewsScreen/ArticlePage';
import { fetchBySlug, findBySlug, getEntry, markRead, rememberEntries, setLastViewed } from './NewsScreen/newsFeed';
import { plainText, relatedFor, tpsArticleSlug, type NewsEntry } from './NewsScreen/newsModel';

const tapSound = require('../../assets/sounds/tap.mp3');
const BACK_ART = require('../../assets/images/screens/explore/back.png');
const BAR_HEIGHT = 54;
const BOTTOM_BAR = 58;

type Params = { id?: number; ids?: number[]; entry?: NewsEntry; fromStory?: boolean };

function BarButton({ label, onPress, children, disabled = false, hint }: {
  readonly label: string; readonly onPress: () => void; readonly children: React.ReactNode; readonly disabled?: boolean; readonly hint?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled }} disabled={disabled}
      hitSlop={8} onPress={onPress}
      style={({ pressed }) => ({ height: 42, minWidth: 44, paddingHorizontal: 12, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 6, backgroundColor: BRAND.white, borderWidth: 2, borderBottomWidth: 4, borderColor: 'rgba(5,52,110,0.18)',
        opacity: disabled ? 0.35 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] })}>
      {children}
    </Pressable>
  );
}

export default function ArticleScreen({ route, navigation }: any) {
  const params: Params = route.params ?? {};
  const { playSound } = useContext(SoundEffectContext);
  const reduced = useUiReducedMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const topInset = insets.top + BAR_HEIGHT;

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
  const entry = list[index];

  useEffect(() => {
    if (!entry) return;
    markRead(entry.id);
    setLastViewed(entry.id);
  }, [entry]);

  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= list.length) return;
    playSound(tapSound);
    void Haptics.selectionAsync().catch(() => undefined);
    pager.current?.scrollToIndex({ index: next, animated: !reduced });
    setIndex(next);
  }, [list.length, playSound, reduced]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find(v => v.isViewable);
    if (first?.index != null) setIndex(i => {
      if (i !== first.index) void Haptics.selectionAsync().catch(() => undefined);
      return first.index as number;
    });
  }).current;

  const back = useCallback(() => {
    playSound(tapSound);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    navigation.goBack();
  }, [navigation, playSound]);

  const share = useCallback(async () => {
    if (!entry) return;
    playSound(tapSound);
    await shareExternal({ message: `${plainText(entry.title)} ${entry.url}`, url: entry.url });
  }, [entry, playSound]);

  const website = useCallback((e: NewsEntry) => {
    playSound(tapSound);
    void openExternal(e.url);
  }, [playSound]);

  /** A story that is not in this list opens as its own reader on top. */
  const openStory = useCallback((target: NewsEntry) => {
    const at = list.findIndex(e => e.id === target.id);
    if (at >= 0) { goTo(at); return; }
    playSound(tapSound);
    rememberEntries([target]);
    navigation.push('Article', { id: target.id, ids: [target.id, ...relatedFor(target, list, 6).map(e => e.id)], fromStory: true });
  }, [list, goTo, navigation, playSound]);

  const handlers: ArticleBodyHandlers = useMemo(() => ({
    onLink: (href: string) => {
      const slug = tpsArticleSlug(href);
      if (!slug) { void openExternal(href); return; }
      const known = findBySlug(slug);
      if (known) { openStory(known); return; }
      setOpening(true);
      fetchBySlug(slug)
        .then(found => { if (found) openStory(found); else void openExternal(href); })
        .catch(() => { void openExternal(href); })
        .finally(() => setOpening(false));
    },
    onImage: (uri: string, aspect: number) => { playSound(tapSound); setZoom({ uri, aspect }); },
    onVideo: (id: string, title: string, short: boolean) => {
      playSound(tapSound);
      setVideo({ id: 0, title, image_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, permalink: `https://www.youtube.com/watch?v=${id}`,
        has_watched: true, video_id: id, is_short: short });
    },
  }), [openStory, playSound]);

  const renderPage = useCallback(({ item, index: i }: { item: NewsEntry; index: number }) => (
    <ArticlePage entry={item} width={width} topInset={topInset} live={i === index} near={Math.abs(i - index) <= 1}
      next={list[i + 1] ?? null} related={relatedFor(item, list.slice(i + 2).concat(list.slice(0, i)), 3)}
      onOpen={openStory} onNext={() => goTo(i + 1)} onWebsite={website} handlers={handlers} />
  ), [width, topInset, index, list, openStory, goTo, website, handlers]);

  // Nothing to show (a stale link): straight back to News.
  useEffect(() => { if (!entry) navigation.goBack(); }, [entry, navigation]);
  if (!entry) return <View style={{ flex: 1, backgroundColor: BRAND.white }} />;

  return (
    <View style={{ flex: 1, backgroundColor: BRAND.white }}>
      <FlatList
        ref={pager}
        data={list}
        horizontal
        pagingEnabled
        initialScrollIndex={startIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={item => String(item.id)}
        renderItem={renderPage}
        extraData={index}
        showsHorizontalScrollIndicator={false}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        removeClippedSubviews
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        style={{ flex: 1 }}
      />

      {/* Top bar: always visible, below the Dynamic Island. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: insets.top, height: topInset, backgroundColor: BRAND.blue,
        borderBottomWidth: 3, borderBottomColor: BRAND.blueLip, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 }}>
        <BarButton label={params.fromStory ? 'Back to the last story' : 'Back to News'} onPress={back}>
          <Image source={BACK_ART} style={{ width: 26, height: 26 }} contentFit="contain" />
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>{params.fromStory ? 'Back' : 'News'}</Text>
        </BarButton>
        <View style={{ flex: 1, alignItems: 'center' }}>
          {list.length > 1 && (
            <Text accessibilityLabel={`Story ${index + 1} of ${list.length}`} maxFontSizeMultiplier={1.2}
              style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.white }}>{index + 1} of {list.length}</Text>
          )}
        </View>
        <BarButton label="Share this story" hint="Asks a grown-up first" onPress={() => { void share(); }}>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>Share</Text>
        </BarButton>
      </View>

      {/* Bottom bar: previous and next story, above the home indicator. */}
      {list.length > 1 && (
        <View style={{ height: BOTTOM_BAR + insets.bottom, paddingBottom: insets.bottom, backgroundColor: BRAND.cream, borderTopWidth: 2,
          borderTopColor: 'rgba(5,52,110,0.12)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 }}>
          <BarButton label="Previous story" disabled={index === 0} onPress={() => goTo(index - 1)}>
            <View style={{ transform: [{ scaleX: -1 }] }}><GameIcon name="arrow" size={22} /></View>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>Previous</Text>
          </BarButton>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft }}>
            {index >= list.length - 1 ? 'Last story' : 'Swipe for more'}
          </Text>
          <BarButton label="Next story" disabled={index >= list.length - 1} onPress={() => goTo(index + 1)}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>Next</Text>
            <GameIcon name="arrow" size={22} />
          </BarButton>
        </View>
      )}

      {opening && (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(150)} exiting={reduced ? undefined : FadeOut.duration(120)} pointerEvents="none"
          style={{ position: 'absolute', alignSelf: 'center', bottom: BOTTOM_BAR + insets.bottom + 16, paddingHorizontal: 16, height: 40, borderRadius: 20,
            backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white, justifyContent: 'center' }}>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.white }}>Opening story...</Text>
        </Animated.View>
      )}

      {/* Tap a photo to look closer: pinch to zoom. */}
      <Modal visible={zoom !== null} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={() => setZoom(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(5,30,70,0.96)' }}>
          {zoom && (
            <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent bouncesZoom showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
              <Image source={{ uri: zoom.uri }} style={{ width, aspectRatio: zoom.aspect }} contentFit="contain" />
            </ScrollView>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo" hitSlop={12} onPress={() => { playSound(tapSound); setZoom(null); }}
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
