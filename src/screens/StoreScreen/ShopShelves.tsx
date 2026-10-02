/**
 * Shark Shop v2 gear shelves (shop-v2/CONTRACT.md).
 *
 * Top to bottom: sets ready to claim, the Featured hero stage (this week's
 * star on the player's own shark), event banners with key art and two honest
 * timers (next drop, event end), the rest of Featured with "complete the
 * look" callouts, then Daily. Everyone sees the same shelves; a tile bought
 * this visit stays put and stamps OWNED, owned items sink on the next visit.
 *
 * Performance: each timer pill owns its minute tick (server clock), the heart
 * handler is stable and updates one id, and tiles, grids and banners are
 * memoized, so a heart tap re-renders one tile.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Dimensions, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { claimShopSet } from '../../api/endpoints/me/shop-sets';
import updatePlayer from '../../api/endpoints/me/update-player';
import { addToWishlist, removeFromWishlist } from '../../api/endpoints/me/wishlist';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import {
  dailyPill, eventDropPill, eventEndPill, eventKicker, featuredPill, formatCoins, heroItem, inkOn, pieceState,
  reconcileWish, sectionAccent, setA11y, setProgressText, stableOrder, toggleWish, wearingIds,
} from '../../helpers/shopShelves';
import { itemDisplayName, wearableBadge } from '../../helpers/wardrobe';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { ShopItem, ShopSection, ShopSetReward, ShopSetSummary, ShopToday } from '../../models/shop-today';
import { BRAND, FONT, GameButton, GameDialog, GameIcon, SHADOW } from '../../ui';
import { showToast } from '../../utils/toast';
import SetCompleteReveal from './SetCompleteReveal';
import ShopTile, { TileArt } from './ShopTile';
import TryOnSheet, { previewLook } from './TryOnSheet';
import { MAX_FONT, PieceChip, TimerPill, useShopNow } from './shopUi';

const SCREEN_W = Dimensions.get('window').width;
const GAP = 12;
// Panel: 10pt margin + 3pt border each side, grid padding 8pt each side.
const GRID_PAD = 8;
const TILE_W = Math.floor((SCREEN_W - 2 * (10 + 3 + GRID_PAD) - GAP * 2) / 3);
const EVENT_TILE_W = Math.min(124, TILE_W + 8);
const HERO_H = Math.round(Math.min(300, SCREEN_W * 0.7));

type Open = { item: ShopItem; fullLook: boolean } | null;

const SectionPills = memo(function SectionPills({ section, offset, still }: { section: ShopSection; offset: number; still: boolean }) {
  const now = useShopNow(offset);
  if (section.type === 'daily') return <TimerPill pill={dailyPill(section, now)} still={still} />;
  if (section.type === 'featured') return <TimerPill pill={featuredPill(section, now)} still={still} />;
  const drop = eventDropPill(section, now);
  return (
    <View style={styles.pills}>
      {drop && <TimerPill pill={drop} still={still} icon="gift" light />}
      <TimerPill pill={eventEndPill(section, now)} still={still} />
    </View>
  );
});

const Grid = memo(function Grid({ items, wishes, vip, balance, still, bought, width = TILE_W, horizontal = false, onOpen, onWish }: {
  items: ShopItem[]; wishes: number[]; vip: boolean; balance: number; still: boolean; bought: number[]; width?: number; horizontal?: boolean;
  onOpen: (item: ShopItem) => void; onWish: (item: ShopItem) => void;
}) {
  const tiles = items.map(item => (
    <ShopTile key={item.id} item={item} width={width} wished={wishes.includes(item.id)} still={still}
      vipLocked={!!item.is_member_item && !vip} affordable={balance >= item.cost} justBought={bought.includes(item.id)}
      onOpen={onOpen} onWish={onWish} />
  ));
  return horizontal
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventRow}>{tiles}</ScrollView>
    : <View style={styles.grid}>{tiles}</View>;
});

const SetCallout = memo(function SetCallout({ set, todayIds, onTry, onClaim }: {
  set: ShopSetSummary; todayIds: number[]; onTry: (set: ShopSetSummary) => void; onClaim: (set: ShopSetSummary) => void;
}) {
  const ready = set.reward_state === 'ready';
  const done = set.reward_state === 'claimed';
  return (
    <Pressable onPress={() => (ready ? onClaim(set) : onTry(set))} accessibilityRole="button" accessibilityLabel={setA11y(set)}
      style={[styles.setCard, { borderColor: set.color ?? BRAND.gold }]}>
      <View style={styles.setHead}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setTitle} numberOfLines={1}>{set.name}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setCount}>{setProgressText(set)}</Text>
      </View>
      <View style={styles.setPieces}>
        {(set.pieces ?? []).map(piece => (
          <PieceChip key={piece.id} piece={piece} state={pieceState(piece, todayIds)} size={50} />
        ))}
      </View>
      <View style={styles.chips}>
        {set.title && <View style={styles.titleChip}><GameIcon name="crown" size={15} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.titleChipText}>{set.title}</Text></View>}
        {set.xp_reward > 0 && !done && <View style={styles.xpChip}><GameIcon name="xp" size={15} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.xpChipText}>+{set.xp_reward} XP</Text></View>}
        {done && <View style={styles.doneChip}><GameIcon name="check" size={15} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.doneText}>Yours</Text></View>}
      </View>
      {ready && <GameButton label="Claim your title!" icon="crown" onPress={() => onClaim(set)} />}
    </Pressable>
  );
});

const EventBanner = memo(function EventBanner({ section, offset, still, children }: {
  section: ShopSection; offset: number; still: boolean; children: React.ReactNode;
}) {
  const accent = sectionAccent(section);
  const ink = section.art_url ? '#ffffff' : inkOn(accent);
  return (
    <View style={[styles.event, { backgroundColor: accent }]}>
      {section.art_url ? (
        <ImageBackground source={{ uri: section.art_url }} resizeMode="cover" style={styles.eventArt}>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.0)', accent]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        </ImageBackground>
      ) : <View style={styles.eventShine} pointerEvents="none" />}
      <View style={styles.eventHead}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.eventKicker, { color: section.last_chance ? '#ffe07a' : ink }]}>{eventKicker(section)}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.eventTitle, { color: ink }]} numberOfLines={1}>{section.title}</Text>
        {section.subtitle && section.subtitle !== section.wave?.title ? (
          <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.eventSub, { color: ink }]} numberOfLines={1}>{section.subtitle}</Text>
        ) : null}
        <SectionPills section={section} offset={offset} still={still} />
      </View>
      {children}
    </View>
  );
});

function Hero({ item, set, section, offset, still, onOpen }: {
  item: ShopItem; set: ShopSetSummary | null; section: ShopSection; offset: number; still: boolean; onOpen: (item: ShopItem, full: boolean) => void;
}) {
  const { player } = useContext(AuthContext);
  const badge = wearableBadge(item);
  const glow = badge.border === '#FFFFFF' ? BRAND.gold : badge.border;
  const owned = !!(item.shop?.is_owned ?? item.has_purchased);
  const pieces = set?.pieces ?? [];
  const look = useMemo(() => {
    const ids = wearingIds(item.id, pieces, false);
    const wear = ids.map(id => (id === item.id
      ? { id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url, item_type: item.item_type }
      : (() => { const p = pieces.find(x => x.id === id)!; return { id, name: p.name, icon_url: p.icon_url, paper_url: p.paper_url,
        no_eye_url: p.no_eye_url, item_type: { id: p.item_type_id } }; })()));
    return previewLook(player?.inventory, wear as never);
  }, [player?.inventory, item.id, pieces]);

  return (
    <Pressable onPress={() => onOpen(item, false)} accessibilityRole="button"
      accessibilityLabel={`This week's star: ${itemDisplayName(item)}, ${formatCoins(item.cost)} Shark Coins. Tap to try it on.`}
      style={[styles.hero, { height: HERO_H, borderColor: glow }]}>
      <LinearGradient colors={['#d7f0ff', '#8fd0f7']} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[styles.heroSpot, { backgroundColor: glow }]} />
      <View pointerEvents="none" style={styles.heroFloor} />
      <View style={styles.heroStage}>
        {look ? <Playercard inventory={look} still={still} style={{ position: 'absolute', width: '100%', height: '100%' }} />
          : <View style={styles.heroFlat}><TileArt item={item} size={170} torso={false} /></View>}
      </View>
      <View style={styles.heroText}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroKicker}>THIS WEEK'S STAR</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroName} numberOfLines={2}>{itemDisplayName(item)}</Text>
        {badge.label ? <View style={[styles.heroRarity, { backgroundColor: badge.labelColor }]}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroRarityText}>{badge.label}</Text></View> : null}
        {set && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroSet} numberOfLines={1}>Part of {set.name}</Text>}
        {pieces.length > 1 && (
          <View style={styles.heroPieces}>
            {pieces.slice(0, 4).map(p => <PieceChip key={p.id} piece={p} state={pieceState(p, [item.id])} size={34} />)}
          </View>
        )}
        <View style={{ marginTop: 'auto', gap: 4 }}>
          {!owned && <View style={styles.heroPrice}><GameIcon name="coins" size={18} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroPriceText}>{formatCoins(item.cost)}</Text></View>}
          <View style={styles.heroCta}><Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroCtaText}>{owned ? 'OWNED' : 'TRY IT ON'}</Text></View>
        </View>
      </View>
      <View style={styles.heroTimer}><SectionPills section={section} offset={offset} still={still} /></View>
    </Pressable>
  );
}

export default function ShopShelves({ today, setToday, onRefresh, offset, focusItemId, wishCount }: {
  readonly today: ShopToday;
  readonly setToday: Dispatch<SetStateAction<ShopToday | null>>;
  readonly onRefresh: () => Promise<boolean>;
  /** Server clock minus device clock, measured at load. */
  readonly offset: number;
  /** Opens this item's try-on once (wishlist push deep link). */
  readonly focusItemId?: number;
  readonly wishCount?: (n: number) => void;
}) {
  const { player } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const still = useReducedGameMotion();
  const [open, setOpen] = useState<Open>(null);
  const [reveal, setReveal] = useState<{ reward: ShopSetReward; set: ShopSetSummary | null } | null>(null);
  const [askAlerts, setAskAlerts] = useState(false);
  const [bought, setBought] = useState<number[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const vip = !!player?.is_subscribed;
  const balance = Number(player?.coins ?? 0);
  const wishes = today.wishlist_ids ?? [];

  // A tile stays where the kid saw it for this visit (per shop day).
  const seenOrder = useRef<{ day: string; order: Record<string, number[]> }>({ day: '', order: {} });
  if (seenOrder.current.day !== today.shop_day) seenOrder.current = { day: today.shop_day, order: {} };
  const sections = useMemo(() => today.sections.map(section => {
    const ids = section.items.map(i => i.id);
    const seen = seenOrder.current.order[section.key];
    const order = stableOrder(ids, seen);
    if (!seen) seenOrder.current.order[section.key] = ids;
    const byId = new Map(section.items.map(i => [i.id, i]));
    return { ...section, items: order.map(id => byId.get(id)!).filter(Boolean) };
  }), [today.sections, today.shop_day]);

  const allItems = useMemo(() => sections.flatMap(s => s.items), [sections]);
  const todayIds = useMemo(() => allItems.map(i => i.id), [allItems]);
  const setsBySlug = useMemo(() => new Map([...(today.sets ?? []), ...(today.ready_sets ?? [])].map(s => [s.slug, s])), [today.sets, today.ready_sets]);
  useEffect(() => { wishCount?.(wishes.length); }, [wishes.length]);

  // Prefetch the hero and event art so try-on and banners never pop in.
  useEffect(() => {
    const urls = sections.flatMap(s => [s.art_url, ...(s.type === 'event' || s.type === 'featured' ? s.items.slice(0, 4).map(i => i.paper_url) : [])])
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (urls.length) void Image.prefetch(urls, 'memory-disk').catch(() => undefined);
  }, [today.shop_day]);

  const openItem = useCallback((item: ShopItem, fullLook = false) => {
    playSound(require('../../../assets/sounds/reveal.mp3'), { volume: 0.6 });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setOpen({ item, fullLook });
  }, [playSound]);
  const openTile = useCallback((item: ShopItem) => openItem(item, false), [openItem]);

  // Deep link from a wishlist push: open that item's try-on once.
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || !focusItemId) return;
    const item = allItems.find(i => i.id === focusItemId);
    if (item) { focused.current = true; setOpen({ item, fullLook: false }); }
  }, [focusItemId, allItems]);

  // Stable heart: reads the latest state through a ref, updates one id.
  const alertsRef = useRef(today.wishlist_alerts);
  alertsRef.current = today.wishlist_alerts;
  const wishesRef = useRef(wishes);
  wishesRef.current = wishes;
  const wish = useCallback(async (item: ShopItem) => {
    const id = item.id;
    const adding = !wishesRef.current.includes(id);
    playSound(require('../../../assets/sounds/tap.mp3'));
    void Haptics.impactAsync(adding ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setToday(t => (t ? { ...t, wishlist_ids: toggleWish(t.wishlist_ids, id) } : t));
    if (adding && alertsRef.current == null) setAskAlerts(true);
    else if (adding) showToast(alertsRef.current ? 'Saved! We’ll ping you when it’s back.' : 'Saved to your wishlist.', 'success', 2200);
    try {
      const server = adding ? await addToWishlist(id) : await removeFromWishlist(id);
      setToday(t => (t ? { ...t, wishlist_ids: reconcileWish(t.wishlist_ids, server, id) } : t));
    } catch (error: unknown) {
      setToday(t => (t ? { ...t, wishlist_ids: toggleWish(t.wishlist_ids, id) } : t));
      const full = (error as { response?: { data?: { code?: string } } })?.response?.data?.code === 'wishlist_full';
      showToast(full ? 'Your wishlist is full. Remove one to add another.' : 'Couldn’t save that. Try again.', 'warning');
    }
  }, [playSound, setToday]);

  const answerAlerts = useCallback(async (on: boolean) => {
    setAskAlerts(false);
    setToday(t => (t ? { ...t, wishlist_alerts: on } : t));
    showToast(on ? 'Saved! We’ll ping you when it’s back.' : 'Saved to your wishlist.', 'success', 2200);
    await updatePlayer({ wishlist_alerts: on }).catch(() => undefined);
  }, [setToday]);

  const onPurchased = useCallback((item: ShopItem) => {
    setBought(list => (list.includes(item.id) ? list : [...list, item.id]));
    // Owned state comes from the server; the tile keeps its place this visit.
    void onRefresh();
  }, [onRefresh]);

  const onSetComplete = useCallback((reward: ShopSetReward) => {
    setOpen(null);
    setTimeout(() => setReveal({ reward, set: setsBySlug.get(reward.slug) ?? null }), 280);
  }, [setsBySlug]);

  const claim = useCallback(async (set: ShopSetSummary) => {
    try {
      const reward = await claimShopSet(set.slug);
      setReveal({ reward: { ...reward, item_ids: reward.item_ids ?? set.item_ids }, set });
      void onRefresh();
    } catch {
      showToast('Couldn’t claim that yet. Try again.', 'warning');
    }
  }, [onRefresh]);

  const trySet = useCallback((set: ShopSetSummary) => {
    const target = allItems.find(i => i.shop?.set?.slug === set.slug && !(i.shop?.is_owned ?? i.has_purchased))
      ?? allItems.find(i => i.shop?.set?.slug === set.slug);
    if (target) openItem(target, true);
  }, [allItems, openItem]);

  // At the reset the next day is already built server side: reload, retry with backoff on failure.
  useEffect(() => {
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const due = Date.parse(today.resets_at) - (Date.now() + offset) + 2_000;
    const run = async () => {
      const ok = await onRefresh().catch(() => false);
      if (!ok) { timer = setTimeout(run, Math.min(120_000, 5_000 * Math.pow(3, attempt++))); }
    };
    timer = setTimeout(run, Math.max(1_000, due));
    return () => clearTimeout(timer);
  }, [today.resets_at, offset]);

  const refresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const events = sections.filter(s => s.type === 'event');
  const featured = sections.find(s => s.type === 'featured');
  const daily = sections.find(s => s.type === 'daily');
  const hero = featured ? heroItem(featured.hero_id, featured.items) : null;
  const heroSet = hero?.shop?.set ? setsBySlug.get(hero.shop.set.slug) ?? null : null;
  const featuredRest = featured ? featured.items.filter(item => item.id !== hero?.id) : [];
  const readySets = today.ready_sets ?? [];
  const openSet = open?.item.shop?.set ? setsBySlug.get(open.item.shop.set.slug) ?? null : null;
  const enter = (i: number) => (still ? undefined : FadeInUp.delay(60 * i).springify().damping(16));

  return (
    <>
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={BRAND.white} />}>
          {readySets.map(set => (
            <Animated.View key={`ready-${set.slug}`} entering={enter(0)}>
              <SetCallout set={set} todayIds={todayIds} onTry={trySet} onClaim={claim} />
            </Animated.View>
          ))}

          {featured && hero && (
            <Animated.View entering={enter(0)}>
              <Hero item={hero} set={heroSet} section={featured} offset={offset} still={still} onOpen={openItem} />
            </Animated.View>
          )}

          {events.map((section, index) => (
            <Animated.View key={section.key} entering={enter(index + 1)}>
              <EventBanner section={section} offset={offset} still={still}>
                <Grid items={section.items} wishes={wishes} vip={vip} balance={balance} still={still} bought={bought}
                  width={EVENT_TILE_W} horizontal onOpen={openTile} onWish={wish} />
                {section.set_slugs.map(slug => setsBySlug.get(slug)).filter((s): s is ShopSetSummary => !!s).map(set => (
                  <SetCallout key={set.slug} set={set} todayIds={todayIds} onTry={trySet} onClaim={claim} />
                ))}
              </EventBanner>
            </Animated.View>
          ))}

          {featured && (
            <Animated.View entering={enter(events.length + 1)} style={styles.panel}>
              <View style={styles.header}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.headerTitle}>FEATURED</Text>
                <SectionPills section={featured} offset={offset} still={still} />
              </View>
              {featured.set_slugs.map(slug => setsBySlug.get(slug)).filter((s): s is ShopSetSummary => !!s).map(set => (
                <SetCallout key={set.slug} set={set} todayIds={todayIds} onTry={trySet} onClaim={claim} />
              ))}
              <Grid items={featuredRest} wishes={wishes} vip={vip} balance={balance} still={still} bought={bought} onOpen={openTile} onWish={wish} />
            </Animated.View>
          )}

          {daily && (
            <Animated.View entering={enter(events.length + 2)} style={styles.panel}>
              <View style={styles.header}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.headerTitle}>DAILY</Text>
                <SectionPills section={daily} offset={offset} still={still} />
              </View>
              <Grid items={daily.items} wishes={wishes} vip={vip} balance={balance} still={still} bought={bought} onOpen={openTile} onWish={wish} />
            </Animated.View>
          )}

          <View style={styles.footer}>
            <GameIcon name="heart" size={18} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.footerText}>Missed something? Heart it. Items come back, and we can tell you when.</Text>
          </View>
        </ScrollView>
        {/* Content fades under the header instead of a hard cut. */}
        <LinearGradient pointerEvents="none" colors={[BRAND.blue, 'rgba(7,104,185,0)']} style={styles.fade} />
      </View>

      {open && (
        <TryOnSheet item={open.item} set={openSet} todayIds={todayIds} wished={wishes.includes(open.item.id)} still={still}
          startFullLook={open.fullLook} onClose={() => setOpen(null)} onWish={wish} onPurchased={onPurchased} onSetComplete={onSetComplete} />
      )}
      {reveal && <SetCompleteReveal reward={reveal.reward} set={reveal.set} still={still} onDone={() => setReveal(null)} />}
      {askAlerts && (
        <GameDialog visible title="Want a heads-up?" icon="bell"
          message="We'll send one note when something on your wishlist is back in the shop. Turn it off anytime in Settings."
          buttons={[{ text: 'Yes, tell me', onPress: () => void answerAlerts(true) }, { text: 'No thanks', style: 'cancel', onPress: () => void answerAlerts(false) }]}
          onAnswer={() => setAskAlerts(false)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 12, paddingBottom: 40, gap: 14 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 14 },
  panel: { marginHorizontal: 10, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.88)', paddingBottom: 14,
    borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  headerTitle: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, letterSpacing: 0.5 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: GRID_PAD, paddingTop: 14 },
  event: { marginHorizontal: 10, borderRadius: 22, paddingBottom: 14, borderWidth: 3, borderColor: BRAND.white, overflow: 'hidden', ...SHADOW.card },
  eventArt: { position: 'absolute', top: 0, left: 0, right: 0, height: Math.round((SCREEN_W - 20) * 0.4) },
  eventShine: { position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.16)' },
  eventHead: { paddingHorizontal: 14, paddingTop: 14, minHeight: Math.round((SCREEN_W - 20) * 0.4) - 18 },
  eventKicker: { fontFamily: FONT.display, fontSize: 13, letterSpacing: 1.2, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  eventTitle: { fontFamily: FONT.display, fontSize: 28, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 2 } },
  eventSub: { fontFamily: FONT.body, fontSize: 17, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  eventRow: { gap: GAP, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 6 },
  hero: { marginHorizontal: 10, borderRadius: 24, borderWidth: 4, overflow: 'hidden', ...SHADOW.card },
  heroSpot: { position: 'absolute', right: -40, top: -80, width: 320, height: 320, borderRadius: 160, opacity: 0.3 },
  heroFloor: { position: 'absolute', right: '12%', bottom: 18, width: '38%', height: 22, borderRadius: 99, backgroundColor: 'rgba(5,52,110,0.18)' },
  heroStage: { position: 'absolute', right: -10, top: 6, bottom: 0, width: '62%' },
  heroFlat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroText: { position: 'absolute', left: 14, top: 14, bottom: 14, width: '46%', gap: 4 },
  heroKicker: { fontFamily: FONT.display, fontSize: 13, color: BRAND.goldLip, letterSpacing: 1 },
  heroName: { fontFamily: FONT.display, fontSize: 24, lineHeight: 26, color: BRAND.navy },
  heroRarity: { alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  heroRarityText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.5 },
  heroSet: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft },
  heroPieces: { flexDirection: 'row', gap: 6, marginTop: 2 },
  heroPrice: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroPriceText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  heroCta: { alignSelf: 'flex-start', backgroundColor: BRAND.gold, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  heroCtaText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy },
  heroTimer: { position: 'absolute', right: 10, top: 10 },
  setCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 16, borderWidth: 3, backgroundColor: '#fffdf4', padding: 10, gap: 8 },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setTitle: { flex: 1, fontFamily: FONT.display, fontSize: 17, color: BRAND.navy },
  setCount: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navySoft },
  setPieces: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  titleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  titleChipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.goldLight },
  xpChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  xpChipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.blue },
  doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#effbf2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  doneText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.greenLip },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 18, padding: 10, borderRadius: 14,
    backgroundColor: 'rgba(5,52,110,0.55)' },
  footerText: { flex: 1, fontFamily: FONT.body, fontSize: 15, color: BRAND.white },
});
