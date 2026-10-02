/**
 * Shark Shop v2 gear shelves (shop-v2/CONTRACT.md): event banners, the weekly
 * Featured hero, set callouts and the Daily shelf, each with its own live
 * "why now" timer. Everyone sees the same shelves; owned items sink to the end.
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { addToWishlist, removeFromWishlist } from '../../api/endpoints/me/wishlist';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import {
  heroItem, inkOn, missingPiecesToday, sectionAccent, sectionTimeLabel, setProgressText, setRewardText, toggleWish,
} from '../../helpers/shopShelves';
import { itemDisplayName, wearableBadge } from '../../helpers/wardrobe';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { ShopItem, ShopSection, ShopSetSummary, ShopToday } from '../../models/shop-today';
import { BRAND, FONT, GameIcon, SHADOW, gameAlert } from '../../ui';
import ShopTile, { TileArt } from './ShopTile';
import TryOnSheet from './TryOnSheet';

const SCREEN_W = Dimensions.get('window').width;
const GAP = 12;
// Panel: 10pt margin + 3pt border each side, grid padding 8pt each side.
const GRID_PAD = 8;
const TILE_W = Math.floor((SCREEN_W - 2 * (10 + 3 + GRID_PAD) - GAP * 2) / 3);
const EVENT_TILE_W = Math.min(124, TILE_W + 8);

/** Re-render once a minute so section timers stay true without a per-second tick. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function TimerPill({ label, color, urgent, still }: { label: string; color: string; urgent: boolean; still: boolean }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!urgent || still) { pulse.value = 1; return; }
    pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 520 }), withTiming(1, { duration: 520 })), -1, false);
  }, [urgent, still]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View style={[styles.pill, { backgroundColor: urgent ? BRAND.red : 'rgba(5,52,110,0.82)' }, style]}>
      <GameIcon name="timer" size={14} />
      <Text style={[styles.pillText, { color: urgent ? BRAND.white : color === BRAND.gold ? BRAND.goldLight : BRAND.white }]}>{label}</Text>
    </Animated.View>
  );
}

function SectionHeader({ section, now, still }: { section: ShopSection; now: number; still: boolean }) {
  const accent = sectionAccent(section);
  const label = sectionTimeLabel(section, now);
  const urgent = section.last_chance || label.startsWith('Last');
  return (
    <View style={styles.header}>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>{section.title.toUpperCase()}</Text>
        {section.subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{section.subtitle}</Text> : null}
      </View>
      <TimerPill label={label} color={accent} urgent={urgent} still={still} />
    </View>
  );
}

function Grid({ items, wishes, vip, onOpen, onWish }: {
  items: ShopItem[]; wishes: number[]; vip: boolean;
  onOpen: (item: ShopItem) => void; onWish: (item: ShopItem) => void;
}) {
  return (
    <View style={styles.grid}>
      {items.map(item => (
        <ShopTile key={item.id} item={item} width={TILE_W} wished={wishes.includes(item.id)}
          vipLocked={!!item.is_member_item && !vip} onOpen={onOpen} onWish={onWish} />
      ))}
    </View>
  );
}

function EventBanner({ section, now, still, wishes, vip, sets, allItems, onOpen, onWish }: {
  section: ShopSection; now: number; still: boolean; wishes: number[]; vip: boolean;
  sets: ShopSetSummary[]; allItems: ShopItem[];
  onOpen: (item: ShopItem) => void; onWish: (item: ShopItem) => void;
}) {
  const accent = sectionAccent(section);
  const ink = inkOn(accent);
  return (
    <View style={[styles.event, { backgroundColor: accent }]}>
      <View style={styles.eventShine} pointerEvents="none" />
      <View style={styles.eventHead}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.eventKicker, { color: ink }]}>{section.last_chance ? 'LAST CHANCE' : 'LIMITED TIME'}</Text>
          <Text style={[styles.eventTitle, { color: ink }]} numberOfLines={1}>{section.title}</Text>
          {section.subtitle ? <Text style={[styles.eventSub, { color: ink }]} numberOfLines={1}>{section.subtitle}</Text> : null}
        </View>
        <TimerPill label={sectionTimeLabel(section, now)} color={accent} urgent={section.last_chance} still={still} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventRow}>
        {section.items.map(item => (
          <ShopTile key={item.id} item={item} width={EVENT_TILE_W} wished={wishes.includes(item.id)}
            vipLocked={!!item.is_member_item && !vip} onOpen={onOpen} onWish={onWish} />
        ))}
      </ScrollView>
      {sets.filter(set => section.set_slugs.includes(set.slug)).map(set => (
        <SetCallout key={set.slug} set={set} items={allItems} onOpen={onOpen} />
      ))}
    </View>
  );
}

function Hero({ item, onOpen }: { item: ShopItem; onOpen: (item: ShopItem) => void }) {
  const badge = wearableBadge(item);
  const owned = !!(item.shop?.is_owned ?? item.has_purchased);
  return (
    <Pressable onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={`Featured: ${itemDisplayName(item)}. Tap to try it on.`}
      style={({ pressed }) => [styles.hero, { borderColor: badge.border === '#FFFFFF' ? BRAND.gold : badge.border,
        transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      <View style={styles.heroArt}><TileArt item={item} size={150} /></View>
      <View style={styles.heroText}>
        <Text style={styles.heroKicker}>THIS WEEK'S STAR</Text>
        <Text style={styles.heroName} numberOfLines={2}>{itemDisplayName(item)}</Text>
        {badge.label ? <Text style={[styles.heroRarity, { color: badge.labelColor }]}>{badge.label}</Text> : null}
        {item.shop?.set ? <Text style={styles.heroSet} numberOfLines={1}>Part of {item.shop.set.name}</Text> : null}
        <View style={styles.heroCta}>
          <Text style={styles.heroCtaText}>{owned ? 'OWNED' : `TRY IT ON  ${item.cost.toLocaleString('en-US')}`}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function SetCallout({ set, items, onOpen }: { set: ShopSetSummary; items: ShopItem[]; onOpen: (item: ShopItem) => void }) {
  const pieces = items.filter(item => item.shop?.set?.slug === set.slug);
  const missing = missingPiecesToday(set.slug, items);
  const done = set.reward_state === 'claimed';
  return (
    <Pressable onPress={() => pieces[0] && onOpen(missing[0] ?? pieces[0])} accessibilityRole="button"
      style={[styles.setCard, { borderColor: set.color ?? BRAND.gold }]}>
      <View style={styles.setHead}>
        <GameIcon name={done ? 'trophy' : 'sparkle'} size={22} />
        <Text style={styles.setTitle} numberOfLines={1}>{done ? `${set.name} complete` : `Complete the look: ${set.name}`}</Text>
        <Text style={styles.setCount}>{setProgressText(set)}</Text>
      </View>
      <View style={styles.setBar}><View style={[styles.setFill, { width: `${Math.round((set.owned / Math.max(1, set.total)) * 100)}%`,
        backgroundColor: set.color ?? BRAND.gold }]} /></View>
      <Text style={styles.setReward}>{done ? `You earned ${set.title ? `the ${set.title} title` : 'this set'}.` : setRewardText(set)}</Text>
    </Pressable>
  );
}

export default function ShopShelves({ today, onRefresh, onBuy, onTodayChange }: {
  readonly today: ShopToday;
  readonly onRefresh: () => Promise<void>;
  readonly onBuy: (item: ShopItem) => void;
  readonly onTodayChange: (next: ShopToday) => void;
}) {
  const { player } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const still = useReducedGameMotion();
  const now = useMinuteClock();
  const [open, setOpen] = useState<ShopItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pendingBuy = useRef<ShopItem | null>(null);
  const vip = !!player?.is_subscribed;
  const wishes = today.wishlist_ids ?? [];
  const allItems = useMemo(() => today.sections.flatMap(s => s.items), [today]);

  const openItem = useCallback((item: ShopItem) => {
    playSound(require('../../../assets/sounds/reveal.mp3'), { volume: 0.6 });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setOpen(item);
  }, [playSound]);

  const wish = useCallback(async (item: ShopItem) => {
    const on = !wishes.includes(item.id);
    playSound(require('../../../assets/sounds/tap.mp3'));
    void Haptics.impactAsync(on ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onTodayChange({ ...today, wishlist_ids: toggleWish(wishes, item.id) });
    try {
      const ids = on ? await addToWishlist(item.id) : await removeFromWishlist(item.id);
      onTodayChange({ ...today, wishlist_ids: ids });
    } catch (error: unknown) {
      onTodayChange({ ...today, wishlist_ids: wishes });
      const full = (error as { response?: { data?: { code?: string } } })?.response?.data?.code === 'wishlist_full';
      gameAlert(full ? 'Wishlist is full' : 'Couldn’t save that', full
        ? 'Remove an item from your wishlist to add another.' : 'Check your connection and try again.');
    }
  }, [today, wishes, onTodayChange, playSound]);

  // The buy sheet is its own dialog: close the try-on first, then ask.
  const buy = useCallback((item: ShopItem) => {
    pendingBuy.current = item;
    setOpen(null);
  }, []);
  useEffect(() => {
    if (open || !pendingBuy.current) return;
    const item = pendingBuy.current;
    pendingBuy.current = null;
    const timer = setTimeout(() => onBuy(item), 260);
    return () => clearTimeout(timer);
  }, [open, onBuy]);

  // At the reset the new shop day is already built server side: swap shelves in place, once.
  const restocked = useRef<string | null>(null);
  useEffect(() => {
    if (now < Date.parse(today.resets_at) || restocked.current === today.shop_day) return;
    restocked.current = today.shop_day;
    void onRefresh();
  }, [now, today.resets_at, today.shop_day, onRefresh]);

  const refresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const events = today.sections.filter(s => s.type === 'event');
  const featured = today.sections.find(s => s.type === 'featured');
  const daily = today.sections.find(s => s.type === 'daily');
  const hero = featured ? heroItem(featured.hero_id, featured.items) : null;
  const featuredRest = featured ? featured.items.filter(item => item.id !== hero?.id) : [];
  const calloutSets = today.sets.filter(set => featured?.set_slugs.includes(set.slug));

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={BRAND.white} />}>
        {events.map((section, index) => (
          <Animated.View key={section.key} entering={still ? undefined : FadeInUp.delay(60 * index).springify().damping(16)}>
            <EventBanner section={section} now={now} still={still} wishes={wishes} vip={vip} sets={today.sets} allItems={allItems}
              onOpen={openItem} onWish={wish} />
          </Animated.View>
        ))}

        {featured && (
          <Animated.View entering={still ? undefined : FadeInUp.delay(120).springify().damping(16)} style={styles.panel}>
            <SectionHeader section={featured} now={now} still={still} />
            {hero && <Hero item={hero} onOpen={openItem} />}
            {calloutSets.map(set => <SetCallout key={set.slug} set={set} items={allItems} onOpen={openItem} />)}
            <Grid items={featuredRest} wishes={wishes} vip={vip} onOpen={openItem} onWish={wish} />
          </Animated.View>
        )}

        {daily && (
          <Animated.View entering={still ? undefined : FadeInUp.delay(180).springify().damping(16)} style={styles.panel}>
            <SectionHeader section={daily} now={now} still={still} />
            <Grid items={daily.items} wishes={wishes} vip={vip} onOpen={openItem} onWish={wish} />
          </Animated.View>
        )}

        <View style={styles.footer}>
          <GameIcon name="heart" size={18} />
          <Text style={styles.footerText}>Missed something? Heart it. Items come back, and we will tell you when.</Text>
        </View>
      </ScrollView>
      <TryOnSheet item={open} allItems={allItems} sets={today.sets} wished={!!open && wishes.includes(open.id)}
        onClose={() => setOpen(null)} onBuy={buy} onWish={wish} />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 10, paddingBottom: 40, gap: 14 },
  panel: { marginHorizontal: 10, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.86)', paddingBottom: 14,
    borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  headerTitle: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, letterSpacing: 0.5 },
  headerSub: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontFamily: FONT.display, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: GRID_PAD, paddingTop: 8 },
  event: { marginHorizontal: 10, borderRadius: 22, paddingBottom: 14, borderWidth: 3, borderColor: BRAND.white, overflow: 'hidden', ...SHADOW.card },
  eventShine: { position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.16)' },
  eventHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  eventKicker: { fontFamily: FONT.display, fontSize: 12, letterSpacing: 1.2, opacity: 0.85 },
  eventTitle: { fontFamily: FONT.display, fontSize: 26 },
  eventSub: { fontFamily: FONT.body, fontSize: 16, opacity: 0.9 },
  eventRow: { gap: GAP, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 4 },
  hero: { flexDirection: 'row', marginHorizontal: 12, borderRadius: 20, borderWidth: 4, backgroundColor: BRAND.white,
    overflow: 'hidden', ...SHADOW.card },
  heroArt: { width: 160, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.sky, paddingVertical: 10 },
  heroText: { flex: 1, padding: 12, justifyContent: 'center', gap: 2 },
  heroKicker: { fontFamily: FONT.display, fontSize: 11, color: BRAND.goldLip, letterSpacing: 1 },
  heroName: { fontFamily: FONT.display, fontSize: 21, color: BRAND.navy },
  heroRarity: { fontFamily: FONT.display, fontSize: 12, letterSpacing: 0.6 },
  heroSet: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft },
  heroCta: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: BRAND.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    borderBottomWidth: 3, borderBottomColor: BRAND.goldLip },
  heroCtaText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy },
  setCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 16, borderWidth: 3, backgroundColor: '#fffdf4', padding: 10, gap: 6 },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setTitle: { flex: 1, fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
  setCount: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navySoft },
  setBar: { height: 8, borderRadius: 4, backgroundColor: '#e8eef5', overflow: 'hidden' },
  setFill: { height: 8, borderRadius: 4 },
  setReward: { fontFamily: FONT.body, fontSize: 14, color: BRAND.navySoft },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 18, padding: 10, borderRadius: 14,
    backgroundColor: 'rgba(5,52,110,0.55)' },
  footerText: { flex: 1, fontFamily: FONT.body, fontSize: 15, color: BRAND.white },
});
