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
import { BRAND, GameIcon, RADIUS, SHADOW } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { dek, parkLabel, plainText, readMinutes, timeAgo, type NewsEntry } from './newsModel';

export const TPS_WORDMARK = require('../../../assets/images/screens/login/logo.png');
export const TPS_SHARK = require('../../../assets/images/screens/pin-collections/shark.png');

export const INK = BRAND.navy;
export const INK_SOFT = BRAND.navySoft;
/** One card frame for hero, rows and More news (Standings family, a touch heavier): 3 px navy-tint rim, 6 px lip. */
export const RIM = 'rgba(5,52,110,0.4)';
export const FRAME = { borderWidth: 3, borderBottomWidth: 6, borderColor: RIM } as const;
const PLACEHOLDER = '#dcecf9';
export const ROW_HEIGHT = 128;
export const SIDE = 14;

/** Small park tag: navy on sky, Shark face. */
export function ParkTag({ label, onImage = false }: { readonly label: string | null; readonly onImage?: boolean }) {
  if (!label) return null;
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: 'center',
      backgroundColor: onImage ? BRAND.white : BRAND.sky, borderWidth: onImage ? 2 : 0, borderColor: BRAND.navy }}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.navy, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

export function NewBadge() {
  return (
    <View accessibilityLabel="New story" style={{ paddingHorizontal: 7, height: 22, borderRadius: 11, justifyContent: 'center',
      backgroundColor: BRAND.gold, borderWidth: 2, borderBottomWidth: 3, borderColor: BRAND.goldLip }}>
      <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.navy }}>NEW</Text>
    </View>
  );
}

/** "3 hr ago" with the clock; "2 min read" only where there is room (lead story, reader). */
function Meta({ entry, now, long = false }: { readonly entry: NewsEntry; readonly now: number; readonly long?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <GameIcon name="timer" size={15} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.35} style={{ fontFamily: 'Knockout', fontSize: 14, color: INK_SOFT, letterSpacing: 0.2 }}>
        {timeAgo(entry.date, now)}{long ? `  ·  ${readMinutes(entry)} min read` : ''}
      </Text>
    </View>
  );
}

/**
 * Already opened: the app's own "done" check (Alex's badge, the same mark the
 * game uses for finished goals) on the photo's corner. The photo and tag fade
 * a little; the headline stays full navy so it is still easy to read.
 */
function ReadCheck() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ position: 'absolute', right: 5, top: 5, width: 30, height: 30, borderRadius: 15,
      backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', ...SHADOW.card }}>
      <GameIcon name="check" size={26} />
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
  return `${tag ? `${tag}. ` : ''}${plainText(entry.title)}. ${timeAgo(entry.date)}.${read ? ' You read this one.' : ''}`;
}

type CardProps = {
  readonly entry: NewsEntry;
  readonly read: boolean;
  /** One of the three newest park stories (the only ones that get NEW). */
  readonly fresh: boolean;
  readonly now: number;
  readonly onPress: (entry: NewsEntry) => void;
};

/** The lead story: a wide 2:1 photo with one TOP STORY badge, park tag, headline, one-line dek. */
export const HeroCard = memo(function HeroCard({ entry, read, now, onPress }: CardProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Top story. ${storyLabel(entry, read)}`} accessibilityHint="Opens the story"
      onPress={() => onPress(entry)}
      style={({ pressed }) => ({ marginHorizontal: SIDE, marginTop: 2, marginBottom: 10, borderRadius: RADIUS.lg, backgroundColor: BRAND.white,
        ...FRAME, borderColor: BRAND.white, ...SHADOW.lifted, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <View style={{ borderRadius: RADIUS.lg - 3, overflow: 'hidden' }}>
        <View>
          <Picture uri={entry.featured_image} recycle={`hero-${entry.id}`} style={{ width: '100%', aspectRatio: 2.8 }} />
          <View style={{ position: 'absolute', left: 10, top: 10, paddingHorizontal: 9, height: 26, borderRadius: 13, justifyContent: 'center',
            backgroundColor: BRAND.navy, borderWidth: 2, borderBottomWidth: 3, borderColor: BRAND.white }}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.white, letterSpacing: 0.4 }}>TOP STORY</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 6 }}>
          <ParkTag label={parkLabel(entry)} />
          <Text numberOfLines={3} maxFontSizeMultiplier={1.35} style={{ fontFamily: 'Knockout', fontSize: 26, lineHeight: 30, color: INK }}>
            {plainText(entry.title)}
          </Text>
          {!!dek(entry) && (
            <Text numberOfLines={1} maxFontSizeMultiplier={1.35} style={{ fontSize: 15, lineHeight: 20, color: '#33507a' }}>{dek(entry, 120)}</Text>
          )}
          <Meta entry={entry} now={now} long />
        </View>
      </View>
    </Pressable>
  );
});

/** A story row: text on the left (three-line headline), a 4:3 photo on the right. */
export const StoryRow = memo(function StoryRow({ entry, read, fresh, now, onPress }: CardProps) {
  return (
    <View style={{ height: ROW_HEIGHT, paddingHorizontal: SIDE, justifyContent: 'center', backgroundColor: BRAND.cream }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${fresh ? 'New. ' : ''}${storyLabel(entry, read)}`} accessibilityHint="Opens the story"
        onPress={() => onPress(entry)}
        style={({ pressed }) => ({ height: ROW_HEIGHT - 10, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingRight: 8,
          borderRadius: RADIUS.md, backgroundColor: BRAND.white, ...FRAME, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', opacity: read ? 0.6 : 1 }}>
            {fresh && !read ? <NewBadge /> : <ParkTag label={parkLabel(entry)} />}
          </View>
          <Text numberOfLines={3} maxFontSizeMultiplier={1.25} style={{ fontFamily: 'Knockout', fontSize: 19, lineHeight: 22, color: INK }}>
            {plainText(entry.title)}
          </Text>
          <Meta entry={entry} now={now} />
        </View>
        <View>
          <Picture uri={entry.featured_image_small || entry.featured_image} recycle={`row-${entry.id}`} style={{ width: 104, height: 92, borderRadius: 10, opacity: read ? 0.7 : 1 }} />
          {read && <ReadCheck />}
        </View>
      </Pressable>
    </View>
  );
});

/** Every few rows, one big photo story keeps the scroll lively. */
export const FeatureCard = memo(function FeatureCard({ entry, read, fresh, now, onPress }: CardProps) {
  return (
    <View style={{ paddingHorizontal: SIDE, paddingVertical: 5, backgroundColor: BRAND.cream }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${fresh ? 'New. ' : ''}${storyLabel(entry, read)}`} accessibilityHint="Opens the story"
        onPress={() => onPress(entry)}
        style={({ pressed }) => ({ borderRadius: RADIUS.md, backgroundColor: BRAND.white, ...FRAME, overflow: 'hidden', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <View>
          <Picture uri={entry.featured_image} recycle={`feat-${entry.id}`} style={{ width: '100%', aspectRatio: 2, opacity: read ? 0.7 : 1 }} />
          {read && <ReadCheck />}
        </View>
        <View style={{ padding: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6, opacity: read ? 0.6 : 1 }}>
            {fresh && !read ? <NewBadge /> : <ParkTag label={parkLabel(entry)} />}
          </View>
          <Text numberOfLines={3} maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Knockout', fontSize: 22, lineHeight: 26, color: INK }}>
            {plainText(entry.title)}
          </Text>
          <Meta entry={entry} now={now} />
        </View>
      </Pressable>
    </View>
  );
});

/** "Today", "Yesterday", "Earlier": a label between two soft lines (Standings divider). */
export function DayDivider({ label }: { readonly label: string }) {
  return (
    <View accessibilityRole="header" style={{ height: 34, backgroundColor: BRAND.cream, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, gap: 10 }}>
      <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(5,52,110,0.15)' }} />
      <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 15, color: INK_SOFT }}>{label}</Text>
      <View style={{ flex: 1, height: 2, backgroundColor: 'rgba(5,52,110,0.15)' }} />
    </View>
  );
}

/** The cream sheet's rounded top edge, under the lead story. */
export function SheetTop() {
  return <View style={{ height: 12, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, backgroundColor: BRAND.cream, borderTopWidth: 3, borderColor: BRAND.white }} />;
}

function usePulse() {
  const reduced = useUiReducedMotion();
  const pulse = useSharedValue(0.75);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.75, { duration: 650 })), -1);
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  return useAnimatedStyle(() => ({ opacity: pulse.value }));
}

/** A row-shaped placeholder while a page loads. */
export function SkeletonRow() {
  const style = usePulse();
  return (
    <View style={{ height: ROW_HEIGHT, paddingHorizontal: SIDE, justifyContent: 'center', backgroundColor: BRAND.cream }} accessible={false}>
      <Animated.View style={[{ height: ROW_HEIGHT - 10, borderRadius: RADIUS.md, backgroundColor: BRAND.white, ...FRAME, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 }, style]}>
        <View style={{ flex: 1, gap: 9 }}>
          <View style={{ width: 90, height: 16, borderRadius: 8, backgroundColor: '#cfe3f5' }} />
          <View style={{ width: '95%', height: 16, borderRadius: 8, backgroundColor: '#cfe3f5' }} />
          <View style={{ width: '70%', height: 16, borderRadius: 8, backgroundColor: '#cfe3f5' }} />
        </View>
        <View style={{ width: 104, height: 92, borderRadius: 10, backgroundColor: '#cfe3f5' }} />
      </Animated.View>
    </View>
  );
}

/** First visit with nothing saved: the lead-story frame plus rows, never a blank screen. */
export function FeedSkeleton() {
  const style = usePulse();
  return (
    <View accessibilityLabel="Loading news" style={{ flex: 1 }}>
      <Animated.View style={[{ marginHorizontal: SIDE, marginTop: 6, marginBottom: 14, borderRadius: RADIUS.lg, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 3, borderBottomWidth: 6, borderColor: BRAND.white, overflow: 'hidden' }, style]}>
        <View style={{ width: '100%', aspectRatio: 2.8, backgroundColor: BRAND.sky, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={TPS_SHARK} style={{ width: 72, height: 72, opacity: 0.85 }} contentFit="contain" accessibilityLabel="Loading news" />
        </View>
        <View style={{ padding: 14, gap: 10 }}>
          <View style={{ width: 110, height: 18, borderRadius: 9, backgroundColor: '#cfe3f5' }} />
          <View style={{ width: '92%', height: 22, borderRadius: 11, backgroundColor: '#cfe3f5' }} />
          <View style={{ width: '60%', height: 22, borderRadius: 11, backgroundColor: '#cfe3f5' }} />
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
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 15, color: INK }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

export const SITE_HOME = 'https://themeparkshark.com/';
export const SITE_WAIT_TIMES = 'https://themeparkshark.com/category/wait-times/';

function SiteTile({ icon, label, onPress }: { readonly icon: 'sparkle' | 'timer' | 'map'; readonly label: string; readonly onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} on themeparkshark.com`} accessibilityHint="Asks a grown-up first" onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 92, borderRadius: RADIUS.md, backgroundColor: BRAND.white, borderWidth: 3, borderBottomWidth: 6,
        borderColor: BRAND.blueLip, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 8, gap: 4,
        transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <GameIcon name={icon} size={32} />
      <Text numberOfLines={2} maxFontSizeMultiplier={1.25} style={{ fontFamily: 'Shark', fontSize: 14, lineHeight: 16, color: BRAND.navy, textAlign: 'center' }}>{label}</Text>
      <View style={{ position: 'absolute', top: 5, right: 5 }}><GameIcon name="lock" size={14} /></View>
    </Pressable>
  );
}

/**
 * themeparkshark.com, shown off: Dustin's wordmark, the TPS shark and three
 * drawn tiles into the site (this story, wait times, all the news). Each tile
 * goes through the grown-up gate (the small lock says so before the tap).
 */
export function SiteCard({ onOpen, storyUrl }: { readonly onOpen: (url: string) => void; readonly storyUrl?: string | null }) {
  return (
    <View style={{ borderRadius: RADIUS.lg, backgroundColor: BRAND.blue, borderWidth: 3, borderBottomWidth: 6, borderColor: BRAND.blueLip, padding: 14, gap: 10, overflow: 'hidden' }}>
      <Image source={TPS_WORDMARK} style={{ width: '96%', alignSelf: 'center', aspectRatio: 1284 / 322 }} contentFit="contain" accessibilityLabel="Theme Park Shark" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image source={TPS_SHARK} style={{ width: 56, height: 56 }} contentFit="contain" />
        <View style={{ flex: 1, gap: 4 }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Knockout', fontSize: 19, lineHeight: 22, color: BRAND.white }}>
            Every story, guide and wait time lives on themeparkshark.com.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <GameIcon name="lock" size={16} />
            <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: 'Shark', fontSize: 13, color: BRAND.goldLight }}>A grown-up opens these</Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {storyUrl
          ? <SiteTile icon="sparkle" label="This story" onPress={() => onOpen(storyUrl)} />
          : <SiteTile icon="sparkle" label="Top stories" onPress={() => onOpen(SITE_HOME)} />}
        <SiteTile icon="timer" label="Wait times" onPress={() => onOpen(SITE_WAIT_TIMES)} />
        <SiteTile icon="map" label="All the news" onPress={() => onOpen(SITE_HOME)} />
      </View>
    </View>
  );
}

/** End of the feed: the site card on the cream sheet. */
export function SiteRow({ onOpen }: { readonly onOpen: (url: string) => void }) {
  return (
    <View style={{ paddingHorizontal: SIDE, paddingTop: 10, paddingBottom: 16, backgroundColor: BRAND.cream }}>
      <SiteCard onOpen={onOpen} />
    </View>
  );
}
