/**
 * News v2 feed pieces: the lead story, story rows, the big feature card,
 * day dividers, skeletons and the themeparkshark.com end card.
 *
 * House look (Standings v3): white cards with a soft navy rim and a 4 px lip
 * on a cream sheet, gold for "chosen" and NEW, Shark for labels, Knockout for
 * headlines. Official featured images only, drawn at their real shape in the
 * reader; cards use a fixed 16:9 or 4:3 frame so rows never jump.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { dek, isFresh, parkLabel, plainText, readMinutes, timeAgo, type NewsEntry } from './newsModel';

export const TPS_WORDMARK = require('../../../assets/images/screens/login/logo.png');
export const TPS_SHARK = require('../../../assets/images/screens/pin-collections/shark.png');

export const INK = BRAND.navy;
export const INK_SOFT = BRAND.navySoft;
const RIM = 'rgba(5,52,110,0.14)';
const PLACEHOLDER = '#dcecf9';
export const ROW_HEIGHT = 124;
export const SIDE = 14;

/** Small park tag: navy on sky, Shark face. */
export function ParkTag({ label, onImage = false }: { readonly label: string | null; readonly onImage?: boolean }) {
  if (!label) return null;
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: 'center',
      backgroundColor: onImage ? BRAND.white : BRAND.sky, borderWidth: onImage ? 2 : 0, borderColor: BRAND.navy }}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.navy, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

export function NewBadge() {
  return (
    <View accessibilityLabel="New story" style={{ paddingHorizontal: 7, height: 22, borderRadius: 11, justifyContent: 'center',
      backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.goldLip }}>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.navy }}>NEW</Text>
    </View>
  );
}

/** "3 hr ago  ·  2 min read", or a Read check once opened. */
function Meta({ entry, read, now }: { readonly entry: NewsEntry; readonly read: boolean; readonly now: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {read && <GameIcon name="check" size={14} />}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={{ fontFamily: 'Knockout', fontSize: 14, color: INK_SOFT, letterSpacing: 0.2 }}>
        {read ? 'Read  ·  ' : ''}{timeAgo(entry.date, now)}  ·  {readMinutes(entry)} min read
      </Text>
    </View>
  );
}

function Picture({ uri, style, recycle }: { readonly uri: string | null | undefined; readonly style: object; readonly recycle: string }) {
  if (!uri) {
    return (
      <LinearGradient colors={[BRAND.blueBright, BRAND.blue]} style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
        <GameIcon name="shark" size={44} />
      </LinearGradient>
    );
  }
  return (
    <Image source={{ uri }} recyclingKey={recycle} style={[style, { backgroundColor: PLACEHOLDER }]} contentFit="cover"
      transition={180} cachePolicy="memory-disk" priority="normal" />
  );
}

function storyLabel(entry: NewsEntry, read: boolean): string {
  const tag = parkLabel(entry);
  return `${tag ? `${tag}. ` : ''}${plainText(entry.title)}. ${timeAgo(entry.date)}.${read ? ' Read.' : ''}`;
}

/** The lead story: a big 16:9 photo, park tag, NEW, headline and a two-line dek. */
export const HeroCard = memo(function HeroCard({ entry, read, now, onPress }: {
  readonly entry: NewsEntry; readonly read: boolean; readonly now: number; readonly onPress: (entry: NewsEntry) => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Top story. ${storyLabel(entry, read)}`} accessibilityHint="Opens the story"
      onPress={() => onPress(entry)}
      style={({ pressed }) => ({ marginHorizontal: SIDE, marginTop: 6, marginBottom: 14, borderRadius: RADIUS.lg, backgroundColor: BRAND.white,
        borderWidth: 3, borderBottomWidth: 6, borderColor: BRAND.white, ...SHADOW.lifted, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <View style={{ borderRadius: RADIUS.lg - 3, overflow: 'hidden' }}>
        <Picture uri={entry.featured_image} recycle={`hero-${entry.id}`} style={{ width: '100%', aspectRatio: 16 / 9 }} />
        <View style={{ position: 'absolute', left: 10, top: 10, flexDirection: 'row', gap: 6 }}>
          <View style={{ paddingHorizontal: 9, height: 24, borderRadius: 12, justifyContent: 'center', backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white }}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.white, letterSpacing: 0.4 }}>TOP STORY</Text>
          </View>
          {isFresh(entry.date, now) && !read && <NewBadge />}
        </View>
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 7 }}>
          <ParkTag label={parkLabel(entry)} />
          <Text numberOfLines={3} maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Knockout', fontSize: 27, lineHeight: 31, color: read ? INK_SOFT : INK }}>
            {plainText(entry.title)}
          </Text>
          {!!dek(entry) && (
            <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontSize: 15, lineHeight: 21, color: '#33507a' }}>{dek(entry, 140)}</Text>
          )}
          <Meta entry={entry} read={read} now={now} />
        </View>
      </View>
    </Pressable>
  );
});

/** A story row: text on the left, a 4:3 photo on the right. About five fit on a screen. */
export const StoryRow = memo(function StoryRow({ entry, read, now, onPress }: {
  readonly entry: NewsEntry; readonly read: boolean; readonly now: number; readonly onPress: (entry: NewsEntry) => void;
}) {
  return (
    <View style={{ height: ROW_HEIGHT, paddingHorizontal: SIDE, justifyContent: 'center', backgroundColor: BRAND.cream }}>
      <Pressable accessibilityRole="button" accessibilityLabel={storyLabel(entry, read)} accessibilityHint="Opens the story"
        onPress={() => onPress(entry)}
        style={({ pressed }) => ({ height: ROW_HEIGHT - 10, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingRight: 8,
          borderRadius: RADIUS.md, backgroundColor: BRAND.white, borderWidth: 2, borderBottomWidth: 4, borderColor: RIM,
          transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <ParkTag label={parkLabel(entry)} />
            {isFresh(entry.date, now) && !read && <NewBadge />}
          </View>
          <Text numberOfLines={2} maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Knockout', fontSize: 19, lineHeight: 22, color: read ? INK_SOFT : INK }}>
            {plainText(entry.title)}
          </Text>
          <Meta entry={entry} read={read} now={now} />
        </View>
        <Picture uri={entry.featured_image} recycle={`row-${entry.id}`} style={{ width: 104, height: 92, borderRadius: 10 }} />
      </Pressable>
    </View>
  );
});

/** Every few rows, one big photo story keeps the scroll lively. */
export const FeatureCard = memo(function FeatureCard({ entry, read, now, onPress }: {
  readonly entry: NewsEntry; readonly read: boolean; readonly now: number; readonly onPress: (entry: NewsEntry) => void;
}) {
  return (
    <View style={{ paddingHorizontal: SIDE, paddingVertical: 5, backgroundColor: BRAND.cream }}>
      <Pressable accessibilityRole="button" accessibilityLabel={storyLabel(entry, read)} accessibilityHint="Opens the story"
        onPress={() => onPress(entry)}
        style={({ pressed }) => ({ borderRadius: RADIUS.md, backgroundColor: BRAND.white, borderWidth: 2, borderBottomWidth: 4, borderColor: RIM,
          overflow: 'hidden', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <Picture uri={entry.featured_image} recycle={`feat-${entry.id}`} style={{ width: '100%', aspectRatio: 16 / 9 }} />
        <View style={{ padding: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <ParkTag label={parkLabel(entry)} />
            {isFresh(entry.date, now) && !read && <NewBadge />}
          </View>
          <Text numberOfLines={3} maxFontSizeMultiplier={1.25} style={{ fontFamily: 'Knockout', fontSize: 22, lineHeight: 26, color: read ? INK_SOFT : INK }}>
            {plainText(entry.title)}
          </Text>
          <Meta entry={entry} read={read} now={now} />
        </View>
      </Pressable>
    </View>
  );
});

/** "Today", "Yesterday", "Earlier": a label between two soft lines (Standings divider). */
export function DayDivider({ label }: { readonly label: string }) {
  return (
    <View accessibilityRole="header" style={{ height: 40, backgroundColor: BRAND.cream, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, gap: 10 }}>
      <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(5,52,110,0.15)' }} />
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 15, color: INK_SOFT }}>{label}</Text>
      <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(5,52,110,0.15)' }} />
    </View>
  );
}

/** The cream sheet's rounded top edge, under the lead story. */
export function SheetTop() {
  return <View style={{ height: 18, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, backgroundColor: BRAND.cream, borderTopWidth: 3, borderColor: BRAND.white }} />;
}

function usePulse() {
  const reduced = useUiReducedMotion();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.55, { duration: 650 })), -1);
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  return useAnimatedStyle(() => ({ opacity: pulse.value }));
}

/** A row-shaped placeholder while a page loads. */
export function SkeletonRow() {
  const style = usePulse();
  return (
    <View style={{ height: ROW_HEIGHT, paddingHorizontal: SIDE, justifyContent: 'center', backgroundColor: BRAND.cream }} accessible={false}>
      <Animated.View style={[{ height: ROW_HEIGHT - 10, borderRadius: RADIUS.md, backgroundColor: 'rgba(5,52,110,0.06)', flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 }, style]}>
        <View style={{ flex: 1, gap: 9 }}>
          <View style={{ width: 90, height: 16, borderRadius: 8, backgroundColor: 'rgba(5,52,110,0.09)' }} />
          <View style={{ width: '95%', height: 16, borderRadius: 8, backgroundColor: 'rgba(5,52,110,0.09)' }} />
          <View style={{ width: '70%', height: 16, borderRadius: 8, backgroundColor: 'rgba(5,52,110,0.09)' }} />
        </View>
        <View style={{ width: 104, height: 92, borderRadius: 10, backgroundColor: 'rgba(5,52,110,0.09)' }} />
      </Animated.View>
    </View>
  );
}

/** First visit with nothing saved: the lead-story frame plus rows, never a blank screen. */
export function FeedSkeleton() {
  const style = usePulse();
  return (
    <View accessibilityLabel="Loading news" style={{ flex: 1 }}>
      <Animated.View style={[{ marginHorizontal: SIDE, marginTop: 6, marginBottom: 14, borderRadius: RADIUS.lg, backgroundColor: 'rgba(255,255,255,0.75)', borderWidth: 3, borderColor: BRAND.white, overflow: 'hidden' }, style]}>
        <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: 'rgba(5,52,110,0.08)' }} />
        <View style={{ padding: 14, gap: 10 }}>
          <View style={{ width: 110, height: 18, borderRadius: 9, backgroundColor: 'rgba(5,52,110,0.08)' }} />
          <View style={{ width: '92%', height: 22, borderRadius: 11, backgroundColor: 'rgba(5,52,110,0.08)' }} />
          <View style={{ width: '60%', height: 22, borderRadius: 11, backgroundColor: 'rgba(5,52,110,0.08)' }} />
        </View>
      </Animated.View>
      <SheetTop />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  );
}

/** A quiet line on the cream sheet: still loading, or try again. */
export function InfoRow({ label, action, onPress }: { readonly label: string; readonly action?: string; readonly onPress?: () => void }) {
  return (
    <View style={{ minHeight: 64, backgroundColor: BRAND.cream, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, gap: 8, paddingVertical: 10 }}>
      <Text maxFontSizeMultiplier={1.25} style={{ fontFamily: 'Knockout', fontSize: 16, color: INK_SOFT, textAlign: 'center' }}>{label}</Text>
      {action && onPress && (
        <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}
          style={({ pressed }) => ({ paddingHorizontal: 16, height: 38, borderRadius: RADIUS.pill, justifyContent: 'center', backgroundColor: BRAND.white,
            borderWidth: 2, borderBottomWidth: 4, borderColor: RIM, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 15, color: INK }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** End of the feed: the site itself, with Dustin's wordmark and the TPS shark. */
export function SiteCard({ onVisit, label = 'Visit themeparkshark.com' }: { readonly onVisit: () => void; readonly label?: string }) {
  return (
    <View style={{ paddingHorizontal: SIDE, paddingTop: 10, paddingBottom: 16, backgroundColor: BRAND.cream }}>
      <View style={{ borderRadius: RADIUS.lg, backgroundColor: BRAND.blue, borderWidth: 3, borderBottomWidth: 6, borderColor: BRAND.blueLip, padding: 16, alignItems: 'center', gap: 10, overflow: 'hidden' }}>
        <Image source={TPS_WORDMARK} style={{ width: '92%', aspectRatio: 1284 / 322 }} contentFit="contain" accessibilityLabel="Theme Park Shark" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={TPS_SHARK} style={{ width: 64, height: 64 }} contentFit="contain" />
          <Text maxFontSizeMultiplier={1.25} style={{ flex: 1, fontFamily: 'Knockout', fontSize: 18, lineHeight: 22, color: BRAND.white }}>
            Every story, park guide and wait time lives on themeparkshark.com.
          </Text>
        </View>
        <GameButton label={label} onPress={onVisit} accessibilityHint="Asks a grown-up, then opens the website" />
      </View>
    </View>
  );
}
