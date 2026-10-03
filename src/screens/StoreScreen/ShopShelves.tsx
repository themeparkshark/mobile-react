/**
 * Shark Shop v2 gear shelves (shop-v2/CONTRACT.md).
 *
 * Top to bottom:
 * 1. One "You finished N sets!" card when sets wait for their title.
 * 2. The Featured hero stage: this week's star on your own shark, alone and spotlit.
 * 3. Event banners with key art, two honest timers and a "Next:" tease.
 * 4. The rest of Featured with "complete the look" callouts.
 * 5. Daily.
 *
 * Everyone sees the same shelves. A tile bought this visit stays put and
 * stamps OWNED. On the first open of a shop day, today's new items wear NEW!.
 *
 * Performance:
 * - Hearts live in a tiny store keyed by item id (wishStore), so a heart tap
 *   re-renders one tile and the wishlist pill.
 * - Timer pills own their own minute tick, on server time.
 * - Grids, banners and the hero are memoized with stable props.
 * - EXPO_PUBLIC_SHOP_PROFILE=1 logs React Profiler commits per tile.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Dimensions, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition, type SharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';
import { claimShopSet } from '../../api/endpoints/me/shop-sets';
import getShopToday from '../../api/endpoints/stores/today';
import updatePlayer from '../../api/endpoints/me/update-player';
import { addToWishlist, removeFromWishlist } from '../../api/endpoints/me/wishlist';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import {
  dailyPill, dropReveal, eventDropPill, eventEndPill, eventKicker, featuredPill, formatCoins, heroItem, inkOn, newCountLabel, pieceState,
  queueReveal, readySummary, restockBackoffMs, sectionAccent, stageCard, setA11y, setProgressText, settleClaims, shortDate, stableOrder, wishSavedCopy,
} from '../../helpers/shopShelves';
import { isItemWorn, itemDisplayName, wearableBadge } from '../../helpers/wardrobe';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { ShopItem, ShopSection, ShopSetReward, ShopSetSummary, ShopTease, ShopToday } from '../../models/shop-today';
import { BRAND, FONT, GameButton, GameDialog, GameIcon, SHADOW } from '../../ui';
import SetCompleteReveal from './SetCompleteReveal';
import ShopTile, { TileArt } from './ShopTile';
import TryOnSheet, { asWearable, previewLook } from './TryOnSheet';
import { MAX_FONT, PieceChip, Sheen, ShopCta, ShopStage, ShopToast, TimerPill, useShopNow, useShopToast } from './shopUi';

function ShopCtaInline({ label, onPress, busy }: { label: string; onPress: () => void; busy: boolean }) {
  const still = useReducedGameMotion();
  return <ShopCta label={label} icon="crown" width={Math.min(300, SCREEN_W - 80)} onPress={onPress} loading={busy} still={still} />;
}
import { ShopProfile } from './shopProfile';
import { wishStore } from './wishStore';

const SCREEN_W = Dimensions.get('window').width;
const GAP = 12;
// Panel: 10pt margin + 3pt border each side, grid padding 8pt each side.
const GRID_PAD = 8;
const TILE_W = Math.floor((SCREEN_W - 2 * (10 + 3 + GRID_PAD) - GAP * 2) / 3);
const EVENT_TILE_W = Math.min(124, TILE_W + 8);
const HERO_H = Math.round(Math.min(320, SCREEN_W * 0.76));
const FIRST_OPEN_KEY = 'shop:first-open-day';
const PENDING_REVEALS_KEY = 'shop:pending-reveals';
// Hero stage: 62% of the panel's inner width, full hero height; the tail rests on the plinth.
const HERO_CARD = stageCard(Math.round((SCREEN_W - 28) * 0.62), HERO_H - 8);
const HERO_CARD_STYLE = { position: 'absolute' as const, ...HERO_CARD.box };
const MINI_CARD_STYLE = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };

type Open = { item: ShopItem; fullLook: boolean; bought: boolean; accent: string | null } | null;
type OpenFn = (item: ShopItem, opts?: { fullLook?: boolean; bought?: boolean; accent?: string | null }) => void;

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

/** "Next: Bone Zone" with a few blacked-out piece shapes (honest: the real next set). */
const TeaseChip = memo(function TeaseChip({ tease, label }: { tease: ShopTease; label: string }) {
  const when = shortDate(tease.starts_on);
  return (
    <View style={styles.tease} accessible accessibilityLabel={`${label}, ${tease.title ?? tease.set_name ?? 'a surprise'}${when ? `, from ${when}` : ''}`}>
      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.teaseLabel}>{label}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.teaseName} numberOfLines={1}>{tease.title ?? tease.set_name ?? '???'}</Text>
      <View style={styles.teaseShapes}>
        {(tease.silhouettes.length ? tease.silhouettes : [null]).slice(0, 3).map((url, i) => url
          ? <Image key={i} source={url} style={styles.teaseShape} contentFit="contain" tintColor="#0a2350" />
          : <Text key={i} style={styles.teaseQ}>?</Text>)}
      </View>
    </View>
  );
});

const Grid = memo(function Grid({ items, vip, balance, still, bought, quiet = false, flipIn = false, width = TILE_W, horizontal = false, onOpen, onWish }: {
  items: ShopItem[]; vip: boolean; balance: number; still: boolean; bought: number[]; quiet?: boolean;
  /** First open of the shop day: tiles flip in one by one. */
  flipIn?: boolean; width?: number; horizontal?: boolean;
  onOpen: (item: ShopItem) => void; onWish: (item: ShopItem) => void;
}) {
  const tiles = items.map((item, i) => (
    <ShopProfile key={item.id} id={`tile-${item.id}`}>
      <Animated.View entering={flipIn && !still ? FadeInUp.delay(120 + i * 70).springify().damping(14) : undefined}>
        <ShopTile item={item} width={width} still={still} quiet={quiet}
          vipLocked={!!item.is_member_item && !vip} affordable={balance >= item.cost} justBought={bought.includes(item.id)}
          onOpen={onOpen} onWish={onWish} />
      </Animated.View>
    </ShopProfile>
  ));
  return horizontal
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventRow}>{tiles}</ScrollView>
    : <View style={styles.grid}>{tiles}</View>;
});

/** Your shark in the set, small (completed callouts). */
const SetPortrait = memo(function SetPortrait({ set }: { set: ShopSetSummary }) {
  const { player } = useContext(AuthContext);
  const stage = useMemo(() => previewLook(player?.inventory, (set.pieces ?? []).map(asWearable), 'base'), [player?.inventory?.skin_item?.id, set.slug]);
  if (!stage) return null;
  return (
    <View style={[styles.portrait, { borderColor: set.color ?? BRAND.gold }]}>
      <Playercard inventory={stage.look} still showBackground={false} pinAnchor="body" shadow style={MINI_CARD_STYLE} />
    </View>
  );
});

const SetCallout = memo(function SetCallout({ set, todayIds, onTry }: {
  set: ShopSetSummary; todayIds: number[]; onTry: (set: ShopSetSummary) => void;
}) {
  const done = set.reward_state === 'claimed';
  const color = set.color ?? BRAND.gold;
  return (
    <Pressable onPress={() => onTry(set)} accessibilityRole="button" accessibilityLabel={setA11y(set)}
      style={[styles.setCard, { borderColor: color }]}>
      <View style={styles.setHead}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setTitle} numberOfLines={1}>{set.name}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setCount}>{setProgressText(set)}</Text>
      </View>
      {/* One segment per piece, filled in the set colour. */}
      <View style={styles.segments}>
        {Array.from({ length: set.total }, (_, i) => (
          <View key={i} style={[styles.segment, i < set.owned && { backgroundColor: color }]} />
        ))}
      </View>
      <View style={styles.setRow}>
        {done && <SetPortrait set={set} />}
        <View style={{ flex: 1, gap: 8 }}>
          <View style={styles.setPieces}>
            {(set.pieces ?? []).map(piece => (
              <View key={piece.id} style={!piece.owned && { opacity: 0.55 }}>
                <PieceChip piece={piece} state={pieceState(piece, todayIds)} size={50} />
              </View>
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
        </View>
      </View>
    </Pressable>
  );
});

/** Every set waiting for its title in one card (stacked, no hidden pages), with one "Claim all". */
const ReadyCard = memo(function ReadyCard({ sets, todayIds, busy, onClaimAll }: {
  sets: ShopSetSummary[]; todayIds: number[]; busy: boolean; onClaimAll: () => void;
}) {
  const summary = readySummary(sets);
  if (!summary) return null;
  const shown = sets.slice(0, 3);
  return (
    <View style={[styles.setCard, styles.readyCard]}>
      <View style={styles.setHead}>
        <GameIcon name="trophy" size={24} />
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.readyTitle} numberOfLines={1}>{summary.title}</Text>
      </View>
      {shown.map(set => (
        <View key={set.slug} style={styles.readySet}>
          <View style={styles.readyRow}>
            {(set.pieces ?? []).slice(0, 5).map(piece => <PieceChip key={piece.id} piece={piece} state={pieceState(piece, todayIds)} size={40} />)}
          </View>
          {set.title && <View style={[styles.titleChip, { alignSelf: 'flex-start' }]}><GameIcon name="crown" size={15} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.titleChipText}>{set.title}</Text></View>}
        </View>
      ))}
      {sets.length > shown.length && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.readyMore}>and {sets.length - shown.length} more</Text>}
      <View style={{ alignItems: 'center' }}>
        <ShopCtaInline label={sets.length > 1 ? `Claim all ${sets.length}!` : 'Claim your title!'} onPress={onClaimAll} busy={busy} />
      </View>
    </View>
  );
});

const EventBanner = memo(function EventBanner({ section, offset, still, vip, balance, bought, flipIn, todayIds, setsBySlug, onOpen, onWish, onTrySet }: {
  section: ShopSection; offset: number; still: boolean; vip: boolean; balance: number; bought: number[]; flipIn: boolean;
  todayIds: number[]; setsBySlug: Map<string, ShopSetSummary>;
  onOpen: OpenFn; onWish: (item: ShopItem) => void; onTrySet: (set: ShopSetSummary) => void;
}) {
  const accent = sectionAccent(section);
  const ink = section.art_url ? '#ffffff' : inkOn(accent);
  const openHere = useCallback((item: ShopItem) => onOpen(item, { accent }), [onOpen, accent]);
  return (
    <View style={[styles.event, { backgroundColor: accent }]}>
      {section.art_url ? (
        <ImageBackground source={{ uri: section.art_url }} resizeMode="cover" style={styles.eventArt}>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', accent]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        </ImageBackground>
      ) : <View style={styles.eventShine} pointerEvents="none" />}
      <View style={styles.eventHead}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.eventKicker, { color: section.last_chance ? '#ffe07a' : ink }]}>{eventKicker(section)}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.eventTitle, { color: ink }]} numberOfLines={1}>{section.title}</Text>
        {section.subtitle && section.subtitle !== section.wave?.title ? (
          <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.eventSub, { color: ink }]} numberOfLines={2}>{section.subtitle}</Text>
        ) : null}
        <SectionPills section={section} offset={offset} still={still} />
        {section.next_wave && <View style={{ marginTop: 8 }}><TeaseChip tease={section.next_wave} label="NEXT" /></View>}
      </View>
      <Grid items={section.items} vip={vip} balance={balance} still={still} bought={bought} quiet={!!section.quiet_tiles} flipIn={flipIn}
        width={EVENT_TILE_W} horizontal onOpen={openHere} onWish={onWish} />
      {section.set_slugs.map(slug => setsBySlug.get(slug)).filter((s): s is ShopSetSummary => !!s).map(set => (
        <SetCallout key={set.slug} set={set} todayIds={todayIds} onTry={onTrySet} />
      ))}
    </View>
  );
});

const Hero = memo(function Hero({ item, set, section, offset, still, todayItems, tease, onOpen }: {
  item: ShopItem; set: ShopSetSummary | null; section: ShopSection; offset: number; still: boolean;
  todayItems: ShopItem[]; tease: ShopTease | null | undefined; onOpen: OpenFn;
}) {
  const { player } = useContext(AuthContext);
  const badge = wearableBadge(item);
  const glow = badge.border === '#FFFFFF' ? BRAND.gold : badge.border;
  const owned = !!(item.shop?.is_owned ?? item.has_purchased);
  const worn = isItemWorn(player?.inventory, item);
  const pieces = set?.pieces ?? [];
  // The star alone on your shark's own skin: the brightest thing in the panel.
  const stage = useMemo(() => previewLook(player?.inventory, [{ id: item.id, name: item.name, icon_url: item.icon_url,
    paper_url: item.paper_url, no_eye_url: item.no_eye_url, item_type: item.item_type }], 'base'), [player?.inventory?.skin_item?.id, item.id]);
  // Four 36pt chips fit one row of the text column; more shows three and "+N".
  const extra = pieces.length > 4 ? pieces.length - 3 : 0;

  const openPiece = (pieceId: number) => {
    const onShelf = todayItems.find(i => i.id === pieceId);
    onOpen(onShelf ?? item, { fullLook: !onShelf });
  };

  return (
    <View style={[styles.hero, { height: HERO_H + (tease ? 44 : 0), borderColor: glow }]}>
      <LinearGradient colors={['#dff3ff', '#9fd6f8']} style={StyleSheet.absoluteFill} />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpen(item, { bought: owned })} accessibilityRole="button"
        accessibilityLabel={`This week's star: ${itemDisplayName(item)}. ${owned ? (worn ? "You're wearing it." : 'Yours. Tap to wear it.') : `${formatCoins(item.cost)} Shark Coins. Tap to try it on.`}`}>
        <View style={styles.heroStage}>
          <ShopStage rim={glow} backdropUrl={stage?.backdrop} still={still}>
            {stage ? <Playercard inventory={stage.look} still={still} showBackground={false} pinAnchor="body" shadow shadowAt={HERO_CARD.shadow} style={HERO_CARD_STYLE} />
              : <View style={styles.heroFlat}><TileArt item={item} size={170} thumb={false} /></View>}
          </ShopStage>
        </View>
      </Pressable>
      <View style={styles.heroText} pointerEvents="box-none">
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroKicker}>THIS WEEK'S STAR</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroName} numberOfLines={2}>{itemDisplayName(item)}</Text>
        {badge.label ? <View style={[styles.heroRarity, { backgroundColor: badge.labelColor }]}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroRarityText}>{badge.label}</Text></View> : null}
        {set && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroSet} numberOfLines={1}>{set.name}: {setProgressText(set)}</Text>}
        {/* In the text column, so it never sits on the hat. */}
        <View pointerEvents="none" style={{ alignSelf: 'flex-start' }}><SectionPills section={section} offset={offset} still={still} /></View>
        {pieces.length > 1 && (
          <View style={styles.heroPieces}>
            {pieces.slice(0, extra ? 3 : 4).map(p => (
              <PieceChip key={p.id} piece={p} state={pieceState(p, todayItems.map(i => i.id))} size={36} onPress={() => openPiece(p.id)} />
            ))}
            {extra > 0 && <View style={styles.heroMore}><Text style={styles.heroMoreText}>+{extra}</Text></View>}
          </View>
        )}
        <View style={{ marginTop: 'auto', gap: 4 }}>
          {owned ? (
            worn ? (
              <View style={styles.wearingChip}><GameIcon name="check" size={18} /><Text maxFontSizeMultiplier={MAX_FONT} style={styles.wearingText}>WEARING</Text></View>
            ) : (
              <Pressable onPress={() => onOpen(item, { bought: true })} style={styles.heroGhost} accessibilityRole="button">
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroGhostText}>WEAR IT</Text>
              </Pressable>
            )
          ) : (
            <>
              <View style={styles.heroPrice}><GameIcon name="coins" size={18} />
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroPriceText}>{formatCoins(item.cost)}</Text></View>
              <Pressable onPress={() => onOpen(item)} style={styles.heroCta} accessibilityRole="button">
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroCtaText}>TRY IT ON</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
      {tease && <View style={styles.heroTease} pointerEvents="none"><TeaseChip tease={tease} label="NEXT WEEK" /></View>}
    </View>
  );
});

export default function ShopShelves({ today, setToday, onRefresh, offset, focusRequest, scrollY }: {
  readonly today: ShopToday;
  readonly setToday: Dispatch<SetStateAction<ShopToday | null>>;
  readonly onRefresh: () => Promise<boolean>;
  /** Server clock minus device clock, measured at load. */
  readonly offset: number;
  /** Open this item's try-on (wishlist push or My Wishlist). A new nonce re-opens the same item. */
  readonly focusRequest?: { id: number; nonce: number } | null;
  /** The screen collapses its header from this. */
  readonly scrollY?: SharedValue<number>;
}) {
  const { player } = useContext(AuthContext);
  const { playSound: playSoundNow } = useContext(SoundEffectContext);
  // Stable sound callback: the provider's value changes identity, our handlers must not.
  const soundRef = useRef(playSoundNow);
  soundRef.current = playSoundNow;
  const playSound = useCallback((sound: number, options?: { volume?: number }) => soundRef.current(sound, options), []);
  const still = useReducedGameMotion();
  const [open, setOpen] = useState<Open>(null);
  const [reveals, setReveals] = useState<{ reward: ShopSetReward; set: ShopSetSummary | null }[]>([]);
  const [askAlerts, setAskAlerts] = useState(false);
  const [bought, setBought] = useState<number[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [firstOpenToday, setFirstOpenToday] = useState(false);
  const [toast, setToast] = useShopToast();
  const vip = !!player?.is_subscribed;
  const balance = Number(player?.coins ?? 0);

  // The wishlist store follows the server copy (never a per-tap re-render of the shelves).
  useEffect(() => { wishStore.seed(today.wishlist_ids ?? [], today.wishlist_alerts); }, [today.wishlist_ids, today.wishlist_alerts]);

  // The first open of each shop day gets a moment: tiles flip in one by one and the Daily header shines.
  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(FIRST_OPEN_KEY).then(seen => {
      if (!live || seen === today.shop_day) return;
      setFirstOpenToday(true);
      void AsyncStorage.setItem(FIRST_OPEN_KEY, today.shop_day).catch(() => undefined);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [today.shop_day]);

  const restored = useRef(false);
  // A Set Complete won but not yet shown (the app closed mid-celebration) plays on the next open.
  useEffect(() => {
    void AsyncStorage.getItem(PENDING_REVEALS_KEY).then(raw => {
      const saved = raw ? (JSON.parse(raw) as { reward: ShopSetReward; set: ShopSetSummary | null }[]) : [];
      restored.current = true;
      // Always a new array, so the save effect runs once with the merged queue.
      setReveals(list => saved.reduce((acc, r) => (acc.some(x => x.reward.slug === r.reward.slug) ? acc : [...acc, r]), [...list]));
    }).catch(() => { restored.current = true; setReveals(list => [...list]); });
  }, []);
  // One queue (won during a buy, or from Claim all), saved from one place, so nothing overwrites anything.
  useEffect(() => {
    if (!restored.current) return;
    void AsyncStorage.setItem(PENDING_REVEALS_KEY, JSON.stringify(reveals)).catch(() => undefined);
  }, [reveals]);

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

  // Prefetch the hero and event art so try-on and banners never pop in.
  useEffect(() => {
    const urls = sections.flatMap(s => [s.art_url, ...(s.type === 'event' || s.type === 'featured' ? s.items.slice(0, 4).map(i => i.paper_url) : [])])
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (urls.length) void Image.prefetch(urls, 'memory-disk').catch(() => undefined);
  }, [today.shop_day]);

  const openItem = useCallback<OpenFn>((item, opts = {}) => {
    playSound(require('../../../assets/sounds/reveal.mp3'), { volume: 0.6 });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setOpen({ item, fullLook: !!opts.fullLook, bought: !!opts.bought, accent: opts.accent ?? null });
  }, [playSound]);
  const openTile = useCallback((item: ShopItem) => openItem(item), [openItem]);

  // Wishlist push or My Wishlist: open that item's try-on (every request, even the same item twice).
  useEffect(() => {
    if (!focusRequest) return;
    const item = allItems.find(i => i.id === focusRequest.id);
    if (item) setOpen({ item, fullLook: false, bought: false, accent: null });
  }, [focusRequest?.nonce]);

  // Stable heart: the store holds the truth per id; the server answer reconciles that id only.
  const wish = useCallback(async (item: ShopItem) => {
    const id = item.id;
    const adding = !wishStore.has(id);
    playSound(require('../../../assets/sounds/tap.mp3'));
    void Haptics.impactAsync(adding ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    wishStore.set(id, adding);
    if (adding && wishStore.alerts() == null) setAskAlerts(true);
    else if (adding) setToast(wishSavedCopy(wishStore.alerts()));
    try {
      const server = adding ? await addToWishlist(id) : await removeFromWishlist(id);
      wishStore.set(id, server.includes(id));
    } catch (error: unknown) {
      wishStore.set(id, !adding);
      const full = (error as { response?: { data?: { code?: string } } })?.response?.data?.code === 'wishlist_full';
      setToast(full ? 'Your wishlist is full. Remove one first.' : 'Couldn’t save that. Try again.');
    }
  }, [playSound, setToast]);

  const answerAlerts = useCallback(async (on: boolean) => {
    setAskAlerts(false);
    wishStore.setAlerts(on);
    setToast(wishSavedCopy(on));
    await updatePlayer({ wishlist_alerts: on }).catch(() => undefined);
  }, [setToast]);

  // The reward is the shelf's the moment the server grants it: closing the try-on early never loses it.
  const onPurchased = useCallback((item: ShopItem, reward: ShopSetReward | null) => {
    setBought(list => (list.includes(item.id) ? list : [...list, item.id]));
    // Queued at once (never lost to an early close); it plays when the sheet has slid away.
    if (reward) {
      const entry = { reward, set: setsBySlug.get(reward.slug) ?? null };
      setReveals(list => queueReveal(list.map(x => ({ ...x, slug: x.reward.slug })), { ...entry, slug: reward.slug }).map(({ slug: _s, ...x }) => x));
    }
    void onRefresh();
  }, [onRefresh, setsBySlug]);

  // Has this player bought the item? Asks the server (a fresh shop), for "Check again".
  const checkOwned = useCallback(async (itemId: number): Promise<boolean | null> => {
    const fresh = await getShopToday(today.store_id).catch(() => null);
    if (!fresh) return null;
    setToday(fresh);
    const onShelf = fresh.sections.some(sec => sec.items.some(i => i.id === itemId && (i.shop?.is_owned ?? i.has_purchased)));
    const inSet = [...(fresh.sets ?? []), ...(fresh.ready_sets ?? [])].some(set => (set.owned_ids ?? []).includes(itemId));
    return onShelf || inSet;
  }, [today.store_id, setToday]);

  const onWorn = useCallback((item: ShopItem) => setToast(`Now wearing ${itemDisplayName(item)}!`), [setToast]);

  // Claim all: the card leaves at once (failed claims come back), then the reveals play in order.
  const claimAll = useCallback(async () => {
    const ready = today.ready_sets ?? [];
    if (!ready.length || claiming) return;
    setClaiming(true);
    const results = await Promise.all(ready.map(set => claimShopSet(set.slug).then(r => r, () => null)));
    const { won, failed } = settleClaims(ready, results);
    setToday(t => (t ? { ...t, ready_sets: failed, ready_set_slugs: failed.map(f => f.slug) } as ShopToday : t));
    setClaiming(false);
    if (failed.length) setToast(failed.length === ready.length ? 'Couldn’t claim that yet. Try again.' : 'Some sets will be ready to claim in a moment.');
    const queue = won.map(({ set, reward }) => ({ reward: { ...reward, item_ids: reward.item_ids ?? set.item_ids }, set }));
    setReveals(list => [...list, ...queue]);
    void onRefresh();
  }, [today.ready_sets, claiming, onRefresh, setToday, setToast]);

  // iOS can't present a modal while the last one is still dismissing: hold the next reveal a beat.
  const [revealGate, setRevealGate] = useState(true);
  const finishReveal = useCallback(() => {
    setRevealGate(false);
    setTimeout(() => setRevealGate(true), 450);
    setReveals(list => (list[0] ? dropReveal(list.map(x => ({ ...x, slug: x.reward.slug })), list[0].reward.slug).map(({ slug: _s, ...x }) => x) : list));
  }, []);

  const trySet = useCallback((set: ShopSetSummary) => {
    const target = allItems.find(i => i.shop?.set?.slug === set.slug && !(i.shop?.is_owned ?? i.has_purchased))
      ?? allItems.find(i => i.shop?.set?.slug === set.slug);
    if (target) openItem(target, { fullLook: true });
  }, [allItems, openItem]);

  // At the reset the next day is already built server side: reload, retry with backoff on failure.
  useEffect(() => {
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const due = Date.parse(today.resets_at) - (Date.now() + offset) + 2_000;
    const run = async () => {
      const ok = await onRefresh().catch(() => false);
      if (!ok) timer = setTimeout(run, restockBackoffMs(attempt++));
    };
    timer = setTimeout(run, Math.max(1_000, due));
    return () => clearTimeout(timer);
  }, [today.resets_at, offset]);

  const scrollHandler = useAnimatedScrollHandler(e => { if (scrollY) scrollY.value = e.contentOffset.y; });

  const refresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const events = sections.filter(s => s.type === 'event');
  const featured = sections.find(s => s.type === 'featured');
  const daily = sections.find(s => s.type === 'daily');
  const hero = featured ? heroItem(featured.hero_id, featured.items) : null;
  const heroSet = hero?.shop?.set ? setsBySlug.get(hero.shop.set.slug) ?? null : null;
  const featuredRest = useMemo(() => (featured ? featured.items.filter(item => item.id !== hero?.id) : []), [featured, hero?.id]);
  const readySets = today.ready_sets ?? [];
  const openSet = open?.item.shop?.set ? setsBySlug.get(open.item.shop.set.slug) ?? null : null;
  const enter = (i: number) => (still ? undefined : FadeInUp.delay(60 * i).springify().damping(16));
  const reveal = reveals[0] ?? null;
  const dailyNew = newCountLabel(daily?.new_count);

  return (
    <ShopProfile id="shelves">
      <View style={{ flex: 1 }}>
        <Animated.ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
          onScroll={scrollHandler} scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={BRAND.white} />}>
          {today.fallback && (
            <View style={styles.fallback}><GameIcon name="timer" size={18} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.fallbackText}>Today’s shop is opening. Back in a moment!</Text></View>
          )}
          {readySets.length > 0 && (
            <Animated.View entering={enter(0)} exiting={still ? undefined : FadeOutUp.duration(220)}>
              <ReadyCard sets={readySets} todayIds={todayIds} busy={claiming} onClaimAll={() => void claimAll()} />
            </Animated.View>
          )}

          <Animated.View layout={still ? undefined : LinearTransition.duration(220)} style={{ gap: 14 }}>
            {featured && hero && (
              <Animated.View entering={enter(0)}>
                <ShopProfile id="hero">
                  <Hero item={hero} set={heroSet} section={featured} offset={offset} still={still} todayItems={allItems}
                    tease={today.next_featured} onOpen={openItem} />
                </ShopProfile>
              </Animated.View>
            )}

            {events.map((section, index) => (
              <Animated.View key={section.key} entering={enter(index + 1)}>
                <ShopProfile id={`banner-${section.key}`}>
                  <EventBanner section={section} offset={offset} still={still} vip={vip} balance={balance} bought={bought} flipIn={firstOpenToday}
                    todayIds={todayIds} setsBySlug={setsBySlug} onOpen={openItem} onWish={wish} onTrySet={trySet} />
                </ShopProfile>
              </Animated.View>
            ))}

            {featured && (
              <Animated.View entering={enter(events.length + 1)} style={styles.panel}>
                <View style={styles.header}>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.headerTitle}>FEATURED</Text>
                  <SectionPills section={featured} offset={offset} still={still} />
                </View>
                {featured.set_slugs.map(slug => setsBySlug.get(slug)).filter((s): s is ShopSetSummary => !!s).map(set => (
                  <SetCallout key={set.slug} set={set} todayIds={todayIds} onTry={trySet} />
                ))}
                <Grid items={featuredRest} vip={vip} balance={balance} still={still} bought={bought} flipIn={firstOpenToday} onOpen={openTile} onWish={wish} />
              </Animated.View>
            )}

            {daily && (
              <Animated.View entering={enter(events.length + 2)} style={styles.panel}>
                <View style={[styles.header, { overflow: 'hidden', borderTopLeftRadius: 19, borderTopRightRadius: 19 }]}>
                  {firstOpenToday && <Sheen still={still} delay={700} width={SCREEN_W} />}
                  <View style={{ flexShrink: 1, gap: 4 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.headerTitle}>DAILY</Text>
                    {dailyNew && <View style={styles.newChip}><Text maxFontSizeMultiplier={MAX_FONT} style={styles.newChipText}>{dailyNew}</Text></View>}
                  </View>
                  <SectionPills section={daily} offset={offset} still={still} />
                </View>
                <Grid items={daily.items} vip={vip} balance={balance} still={still} bought={bought} flipIn={firstOpenToday} onOpen={openTile} onWish={wish} />
              </Animated.View>
            )}
          </Animated.View>
        </Animated.ScrollView>
        {/* Content fades under the tab row instead of a hard cut. */}
        <LinearGradient pointerEvents="none" colors={[BRAND.blue, 'rgba(7,104,185,0)']} style={styles.fade} />
        <ShopToast message={toast} still={still} />
      </View>

      {open && (
        <TryOnSheet item={open.item} set={openSet} todayIds={todayIds} still={still} accent={open.accent}
          startFullLook={open.fullLook} startBought={open.bought}
          onClose={() => setOpen(null)} onWish={wish} onPurchased={onPurchased} onWorn={onWorn}
          checkOwned={checkOwned} buyPaused={!!today.fallback} rewardPending={reveals.some(r => r.reward.slug === open.item.shop?.set?.slug)} />
      )}
      {reveal && !open && revealGate && <SetCompleteReveal key={reveal.reward.slug} reward={reveal.reward} set={reveal.set} still={still} onDone={finishReveal} />}
      {askAlerts && (
        <GameDialog visible title="Want a heads-up?" icon="bell"
          message="We'll send one note the next time something on your wishlist is in the shop. Turn it off anytime in Settings."
          buttons={[{ text: 'Yes, tell me', onPress: () => void answerAlerts(true) }, { text: 'No thanks', style: 'cancel', onPress: () => void answerAlerts(false) }]}
          onAnswer={() => setAskAlerts(false)} />
      )}
    </ShopProfile>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 14, paddingBottom: 40, gap: 14 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 24 },
  fallback: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, padding: 10, borderRadius: 14, backgroundColor: 'rgba(5,52,110,0.6)' },
  fallbackText: { flex: 1, fontFamily: FONT.display, fontSize: 15, color: BRAND.white },
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
  eventSub: { maxWidth: '64%', fontFamily: FONT.body, fontSize: 17, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  eventRow: { gap: GAP, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 6 },
  tease: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12, paddingLeft: 8, paddingRight: 6, paddingVertical: 4, borderWidth: 2, borderColor: BRAND.white },
  teaseLabel: { fontFamily: FONT.display, fontSize: 12, color: BRAND.goldLip, letterSpacing: 0.8 },
  teaseName: { maxWidth: 130, fontFamily: FONT.display, fontSize: 14, color: BRAND.navy },
  teaseShapes: { flexDirection: 'row', gap: 2 },
  teaseShape: { width: 24, height: 24, opacity: 0.85 },
  teaseQ: { width: 24, textAlign: 'center', fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  hero: { marginHorizontal: 10, borderRadius: 24, borderWidth: 4, overflow: 'hidden', backgroundColor: '#dff3ff', ...SHADOW.card },
  heroStage: { position: 'absolute', right: 0, top: 0, height: HERO_H - 8, width: '62%' },
  heroFlat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroText: { position: 'absolute', left: 14, top: 14, height: HERO_H - 28, width: '46%', gap: 4 },
  heroKicker: { fontFamily: FONT.display, fontSize: 13, color: BRAND.goldLip, letterSpacing: 1 },
  heroName: { fontFamily: FONT.display, fontSize: 24, lineHeight: 26, color: BRAND.navy },
  heroRarity: { alignSelf: 'flex-start', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  heroRarityText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.5 },
  heroSet: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navySoft },
  heroPieces: { flexDirection: 'row', gap: 6, marginTop: 4 },
  heroMore: { width: 36, height: 36, borderRadius: 12, backgroundColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  heroMoreText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.white },
  heroPrice: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroPriceText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  heroCta: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', backgroundColor: BRAND.gold, borderRadius: 999, paddingHorizontal: 16,
    borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  heroCtaText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy },
  heroGhost: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 18, borderWidth: 3, borderColor: BRAND.navy },
  heroGhostText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy },
  wearingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: BRAND.green,
    borderRadius: 999, paddingLeft: 6, paddingRight: 14, paddingVertical: 5, borderWidth: 2, borderColor: BRAND.white },
  wearingText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.white },
  heroTease: { position: 'absolute', left: 10, right: 10, bottom: 6 },
  setCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 16, borderWidth: 3, backgroundColor: '#fffdf4', padding: 10, gap: 8 },
  readyCard: { borderColor: BRAND.gold, backgroundColor: '#fffaf0' },
  readyTitle: { flex: 1, fontFamily: FONT.display, fontSize: 19, color: BRAND.navy },
  readySet: { gap: 6, paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#f0e2b6' },
  readyRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  readyMore: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navySoft },
  newChip: { alignSelf: 'flex-start', backgroundColor: BRAND.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  newChipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.navy },
  readySetName: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navySoft },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setTitle: { flex: 1, fontFamily: FONT.display, fontSize: 17, color: BRAND.navy },
  setCount: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navySoft },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#e3eaf2' },
  setRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  portrait: { width: 78, height: 88, borderRadius: 14, borderWidth: 3, overflow: 'hidden', backgroundColor: '#dff3ff' },
  setPieces: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  titleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  titleChipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.goldLight },
  xpChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  xpChipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.blue },
  doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#effbf2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  doneText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.greenLip },
});
