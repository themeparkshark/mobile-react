/**
 * News v2: one story in the reader pager.
 *
 * Photo at its real shape, park tag, headline, Theme Park Shark byline, the
 * story, then the end of story: themeparkshark.com, Up next, and More stories.
 * A gold bar under the top bar shows how far you have read (UI thread).
 * Pages away from the one on screen draw only their header (cheap paging).
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { BRAND, GameIcon, RADIUS } from '../../ui';
import ArticleBody, { READ_INK, type ArticleBodyHandlers } from './ArticleBody';
import { FRAME, INK, INK_SOFT, ParkTag, SiteCard, TPS_SHARK } from './NewsCards';
import { filterByKey, filterOf, imageAspect, longDate, parkLabel, plainText, readMinutes, timeAgo, type NewsEntry } from './newsModel';

export const PAGE_SIDE = 20;

/** "More EPCOT news" only when every story under it is EPCOT; else the brand ("More Disney news"); else "More news". */
export function relatedHeading(entry: NewsEntry, related: readonly NewsEntry[]): string {
  const tag = parkLabel(entry);
  if (tag && related.length && related.every(r => parkLabel(r) === tag)) return `More ${tag} news`;
  const key = filterOf(entry);
  if (key && key !== 'all' && related.length && related.every(r => filterOf(r) === key)) return `More ${filterByKey(key).label} news`;
  return 'More news';
}

function MiniStory({ entry, label, onPress }: { readonly entry: NewsEntry; readonly label?: string; readonly onPress: (entry: NewsEntry) => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label ? `${label}. ` : ''}${plainText(entry.title)}`} onPress={() => onPress(entry)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: RADIUS.md, backgroundColor: BRAND.white,
        ...FRAME, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <View style={{ flex: 1, gap: 4 }}>
        <ParkTag label={parkLabel(entry)} />
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Knockout', fontSize: 18, lineHeight: 21, color: INK }}>{plainText(entry.title)}</Text>
        <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Knockout', fontSize: 13, color: INK_SOFT }}>{timeAgo(entry.date)}</Text>
      </View>
      <Image source={entry.featured_image_small || entry.featured_image ? { uri: (entry.featured_image_small || entry.featured_image) as string } : TPS_SHARK} style={{ width: 92, height: 70, borderRadius: 9, backgroundColor: '#dcecf9' }}
        contentFit={entry.featured_image ? 'cover' : 'contain'} transition={150} />
    </Pressable>
  );
}

function UpNext({ entry, onPress }: { readonly entry: NewsEntry; readonly onPress: (entry: NewsEntry) => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Next story. ${plainText(entry.title)}`} onPress={() => onPress(entry)}
      style={({ pressed }) => ({ borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: BRAND.white, borderWidth: 3, borderBottomWidth: 6,
        borderColor: BRAND.goldLip, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {!!entry.featured_image && (
        <Image source={{ uri: entry.featured_image }} style={{ width: '100%', aspectRatio: 2 }} contentFit="cover" transition={150} />
      )}
      <View style={{ padding: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 14, color: BRAND.goldLip }}>UP NEXT</Text>
          <ParkTag label={parkLabel(entry)} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text numberOfLines={3} maxFontSizeMultiplier={1.25} style={{ flex: 1, fontFamily: 'Knockout', fontSize: 22, lineHeight: 26, color: INK }}>{plainText(entry.title)}</Text>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.goldLip, alignItems: 'center', justifyContent: 'center' }}>
            <GameIcon name="arrow" size={24} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ArticlePage({ entry, index, width, live, near, next, related, onOpen, onGoTo, onWebsite, handlers }: {
  readonly entry: NewsEntry;
  readonly index: number;
  readonly width: number;
  /** The page on screen (draws its progress bar). */
  readonly live: boolean;
  /** On screen or one swipe away: draws its full story. */
  readonly near: boolean;
  readonly next: NewsEntry | null;
  readonly related: readonly NewsEntry[];
  readonly onOpen: (entry: NewsEntry) => void;
  readonly onGoTo: (index: number) => void;
  readonly onWebsite: (url: string) => void;
  readonly handlers: ArticleBodyHandlers;
}) {
  const aspect = imageAspect(entry);
  // The large WordPress size when we know it, else the 768 px card size: never the multi-MB original.
  const hero = entry.featured_image_large || entry.featured_image || entry.featured_image_full;
  const contentWidth = width - PAGE_SIDE * 2;
  const heroWidth = width - 24;
  const progress = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(event => {
    const max = Math.max(1, event.contentSize.height - event.layoutMeasurement.height);
    progress.value = Math.min(1, Math.max(0, event.contentOffset.y / max));
  });
  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));
  const tag = parkLabel(entry);

  return (
    <View style={{ width, flex: 1, backgroundColor: BRAND.white }}>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 30, paddingBottom: 36 }}>
        {/* The official photo at its real shape, in the same framed card as the feed. */}
        <View style={{ marginHorizontal: 12, borderRadius: RADIUS.lg, overflow: 'hidden', ...FRAME, backgroundColor: '#dcecf9' }}>
          {hero ? (
            <Image source={{ uri: hero }} style={{ width: heroWidth - 6, aspectRatio: aspect }} contentFit="cover"
              transition={200} cachePolicy="memory-disk" allowDownscaling priority={live ? 'high' : 'low'}
              accessibilityLabel={entry.image_credit ? `Featured photo. ${entry.image_credit}` : 'Featured photo'} />
          ) : (
            <View style={{ width: heroWidth - 6, aspectRatio: 16 / 9, backgroundColor: BRAND.blue, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={TPS_SHARK} style={{ width: 120, height: 120 }} contentFit="contain" />
            </View>
          )}
        </View>
        {!!entry.image_credit && (
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Knockout', fontSize: 14, color: INK_SOFT, paddingHorizontal: PAGE_SIDE, marginTop: 6 }}>
            {entry.image_credit}
          </Text>
        )}

        <View style={{ paddingHorizontal: PAGE_SIDE, paddingTop: 16, gap: 10 }}>
          {tag && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <ParkTag label={tag} />
            </View>
          )}
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.4} style={{ fontFamily: 'Knockout', fontSize: 33, lineHeight: 37, color: INK }}>
            {plainText(entry.title)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.white, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              <Image source={TPS_SHARK} style={{ width: 40, height: 40 }} contentFit="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 15, color: INK }}>Theme Park Shark</Text>
              <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Knockout', fontSize: 14, color: INK_SOFT }}>
                {longDate(entry.date)}  ·  {readMinutes(entry)} min read
              </Text>
            </View>
          </View>
          <View style={{ height: 4, width: 56, borderRadius: 2, backgroundColor: BRAND.gold, marginTop: 6, marginBottom: 8 }} />
        </View>

        <View style={{ paddingHorizontal: PAGE_SIDE }}>
          {near && entry.content ? (
            <ArticleBody html={entry.content} width={contentWidth} live={live} handlers={handlers} />
          ) : near ? (
            <Text style={{ fontSize: 18, lineHeight: 28, color: READ_INK }}>{plainText(entry.excerpt ?? '')}</Text>
          ) : (
            <View style={{ height: 400 }} />
          )}
        </View>

        {near && (
          <View style={{ paddingHorizontal: PAGE_SIDE, gap: 16, marginTop: 8 }}>
            <SiteCard onOpen={onWebsite} storyUrl={entry.url} />
            {next && <UpNext entry={next} onPress={() => onGoTo(index + 1)} />}
            {related.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 18, color: INK }}>
                  {relatedHeading(entry, related)}
                </Text>
                {related.map(r => <MiniStory key={r.id} entry={r} onPress={onOpen} />)}
              </View>
            )}
          </View>
        )}
      </Animated.ScrollView>
      {/* A soft white edge under the wave so text slides under it instead of being cut. */}
      {/* A solid cream band under the wavy header (text slides under it, never cut by the wave),
          with the gold reading bar on it, then a short fade. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
        <View style={{ height: 16, backgroundColor: BRAND.cream, justifyContent: 'flex-end', paddingBottom: 4 }}>
          {live && (
            <View style={{ marginHorizontal: 12, height: 6, borderRadius: 3, backgroundColor: 'rgba(5,52,110,0.12)', overflow: 'hidden' }}>
              <Animated.View style={[{ height: 6, width: width - 24, backgroundColor: BRAND.gold, transformOrigin: 'left' }, bar]} />
            </View>
          )}
        </View>
        <LinearGradient colors={[BRAND.cream, 'rgba(255,248,228,0)']} style={{ height: 12 }} />
      </View>
    </View>
  );
}

export default memo(ArticlePage);
