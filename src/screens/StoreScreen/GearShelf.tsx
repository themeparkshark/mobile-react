/**
 * The Shark Shop's Gear tab on the classic catalog (live today: the rotation engine is off, so the
 * server serves a catalog page instead of v2 shelves). Dustin, Oct 8: "the items are a little too
 * low, would be cooler if they were slightly higher up on the screen. The countdown for new items
 * doesn't need to be that big."
 *
 * Top to bottom, one scroll (nothing is pinned, so the shelf rises as you scroll):
 * 1. The shopkeeper stage: the catalog's promo shark bobbing in the bubbles (kept, shorter).
 * 2. One house-blue shelf panel: "ON THE SHELF" and one small calm chip that names the restock day.
 * 3. The v2 tiles (name, rarity plate, price, owned), owned pieces last. A tap opens the try-on on
 *    your own shark (the v2 TryOnSheet: same buy endpoint, coin landing, wear it now).
 *
 * Performance: the stage's loops stop once it scrolls away, off screen and under Reduce Motion;
 * tiles are plain views; the chip ticks once a minute.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Dimensions, Easing as RNEasing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addToWishlist, getWishlist, removeFromWishlist } from '../../api/endpoints/me/wishlist';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { formatCoins, slotWord, passesFilter, restockPill, shelfFilters, shelfOrder, slotLine, starPick, wishSavedCopy } from '../../helpers/shopShelves';
import { useAnyModalLayer } from '../../ui/modalLayers';
import Playercard from '../../components/Playercard';
import { isItemWorn, itemDisplayName, wearableBadge } from '../../helpers/wardrobe';
import { previewLook } from './TryOnSheet';
import type { ItemType } from '../../models/item-type';
import type { ShopItem } from '../../models/shop-today';
import { BRAND, FONT, GameIcon, SHADOW, SharkLoader } from '../../ui';
import { LinearGradient } from 'expo-linear-gradient';
import ShopTile from './ShopTile';
import TryOnSheet from './TryOnSheet';
import { MAX_FONT, plateFor, SHOP_SURFACE as S, Sheen, ShopToast, TimerPill, useShopNow, useShopToast, WishHeart } from './shopUi';
import { useWished, wishStore } from './wishStore';

const SCREEN_W = Dimensions.get('window').width;
const GAP = 12;
const GRID_PAD = 8;
// Same tile as the v2 shelves: panel 10 pt margin + 3 pt border each side, 8 pt grid padding.
const TILE_W = Math.floor((SCREEN_W - 2 * (10 + 3 + GRID_PAD) - GAP * 2) / 3);
/** The shopkeeper stage (was 180 under a 90 pt countdown and a balance row: the shelf sat at 63% of the screen). */
export const GEAR_STAGE_H = 116;
/** The shelf panel rises over the stage's floor: the shopkeeper stands behind the counter. */
export const COUNTER_TUCK = 32;

/** The catalog promo shark, bobbing and tilting in its bubbles (UI thread; stops when still). */
const Shopkeeper = memo(function Shopkeeper({ imageUrl, still }: { imageUrl: string | undefined; still: boolean }) {
  const bob = useRef(new RNAnimated.Value(0)).current;
  const tilt = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (still) { bob.setValue(0); tilt.setValue(0); return; }
    const ease = RNEasing.inOut(RNEasing.sin);
    const step = (v: RNAnimated.Value, to: number, ms: number) => RNAnimated.timing(v, { toValue: to, duration: ms, easing: ease, useNativeDriver: true });
    const a = RNAnimated.loop(RNAnimated.sequence([step(bob, -6, 900), step(bob, 0, 900), step(bob, 6, 900), step(bob, 0, 900)]));
    const b = RNAnimated.loop(RNAnimated.sequence([step(tilt, 1, 1200), step(tilt, 0, 1200), step(tilt, -1, 1200), step(tilt, 0, 1200)]));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [still]);
  const rotate = tilt.interpolate({ inputRange: [-1, 1], outputRange: ['-3deg', '3deg'] });
  return (
    <RNAnimated.View style={{ flex: 1, transform: [{ translateY: bob }, { rotate }] }}>
      <Image source={imageUrl} style={styles.keeper} contentFit="contain" transition={160} />
    </RNAnimated.View>
  );
});

const BUBBLES = [
  { x: 0.12, size: 12, ms: 4200, delay: 0, o: 0.32 }, { x: 0.24, size: 7, ms: 3600, delay: 900, o: 0.25 },
  { x: 0.78, size: 10, ms: 4600, delay: 400, o: 0.3 }, { x: 0.88, size: 6, ms: 3300, delay: 1600, o: 0.22 },
  { x: 0.36, size: 8, ms: 5000, delay: 2200, o: 0.2 }, { x: 0.66, size: 9, ms: 3900, delay: 1200, o: 0.26 },
] as const;

function Bubble({ x, size, ms, delay, o, still }: (typeof BUBBLES)[number] & { still: boolean }) {
  const rise = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    if (still) { rise.setValue(0); return; }
    const loop = RNAnimated.loop(RNAnimated.timing(rise, { toValue: 1, duration: ms, easing: RNEasing.linear, useNativeDriver: true }));
    const t = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(t); loop.stop(); };
  }, [still]);
  if (still) return null;
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [GEAR_STAGE_H, -16] });
  const translateX = rise.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 6, 0, -6, 0] });
  const scale = rise.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1, 0.4] });
  return <RNAnimated.View pointerEvents="none" style={[styles.bubble, { left: x * SCREEN_W, width: size, height: size, borderRadius: size / 2, opacity: o,
    transform: [{ translateY }, { translateX }, { scale }] }]} />;
}

/** The restock day, small: one chip that ticks once a minute (never seconds). */
function RestockChip({ nextAt, offset, onElapsed }: { nextAt: string | null | undefined; offset: number; onElapsed?: () => void }) {
  // Server time (offset), like every shop timer: a changed device clock never moves the day.
  const now = useShopNow(offset);
  const pill = restockPill(nextAt, now);
  const fired = useRef<string | null>(null);
  const due = !!nextAt && Date.parse(nextAt) - now <= 0;
  // Once per restock: a new nextAt (the next rotation) can fire again.
  useEffect(() => { if (due && fired.current !== nextAt) { fired.current = nextAt ?? null; onElapsed?.(); } }, [due, nextAt]);
  if (!pill) return null;
  return <TimerPill pill={pill} still />;
}

/** The shelf's star: two tiles wide, the piece on your own shark, a slow shine. */
const StarTile = memo(function StarTile({ item, balance, still, onOpen, onWish }: {
  item: ShopItem; balance: number; still: boolean; onOpen: (item: ShopItem) => void; onWish: (item: ShopItem) => void;
}) {
  const { player } = useContext(AuthContext);
  const wished = useWished(item.id);
  const badge = wearableBadge(item);
  const owned = !!item.has_purchased;
  const look = useMemo(() => previewLook(player?.inventory, [{ id: item.id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url,
    no_eye_url: item.no_eye_url, item_type: item.item_type, fx_key: item.fx_key ?? null }], 'player'), [player?.inventory, item.id]);
  const short = Math.max(0, item.cost - balance);
  const worn = isItemWorn(player?.inventory, item);
  const name = itemDisplayName(item);
  const rim = badge.border === '#FFFFFF' ? '#c9dbeb' : badge.border;
  return (
    <Pressable onPress={() => onOpen(item)} accessibilityRole="button"
      accessibilityLabel={`Shop pick: ${name}${badge.label ? `, ${badge.label.toLowerCase()}` : ''}, ${owned ? 'yours' : `${formatCoins(item.cost)} coins`}. Tap to try it on.`}
      style={({ pressed }) => [styles.star, { borderColor: rim }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={styles.starClip} pointerEvents="none">
        <LinearGradient colors={plateFor(item.rarity)} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']} style={styles.starGloss} />
        <Sheen still={still} width={2 * TILE_W + 80} every={6000} />
      </View>
      <View style={styles.starArt} pointerEvents="none">
        {look ? <Playercard inventory={look.look} still={still} showBackground={false} pinAnchor="body" shadow style={StyleSheet.absoluteFill} />
          : <Image source={item.icon_url} style={StyleSheet.absoluteFill} contentFit="contain" />}
      </View>
      <View style={styles.starText} pointerEvents="box-none">
        <View style={styles.starKicker}><Text maxFontSizeMultiplier={1.1} style={styles.starKickerText}>SHOP PICK</Text></View>
        <Text maxFontSizeMultiplier={1.15} numberOfLines={2} style={styles.starName}>{name}</Text>
        <View style={styles.starChips}>
          {badge.label ? <View style={[styles.starRarity, { backgroundColor: badge.labelColor }]}>
            <Text maxFontSizeMultiplier={1.1} style={styles.starRarityText}>{badge.label}</Text></View> : null}
          {slotWord(item.item_type?.id) && <View style={styles.starSlotChip}><Text maxFontSizeMultiplier={1.1} style={styles.starSlotChipText}>{slotWord(item.item_type?.id)}</Text></View>}
        </View>
        {slotLine(item.item_type?.id) && <Text maxFontSizeMultiplier={1.1} numberOfLines={2} style={styles.starSlot}>{slotLine(item.item_type?.id)}</Text>}
        <View style={{ flex: 1 }} />
        {owned ? (
          <View style={styles.starPrice}>
            <GameIcon name="check" size={17} />
            <Text maxFontSizeMultiplier={1.15} style={[styles.starPriceText, styles.starYours]}>{worn ? 'Wearing' : 'Yours'}</Text>
          </View>
        ) : (
          <View style={styles.starPrice}>
            <GameIcon name="coins" size={17} />
            <Text maxFontSizeMultiplier={1.15} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.starPriceText}>{short > 0 ? `Need ${formatCoins(short)} more` : formatCoins(item.cost)}</Text>
          </View>
        )}
      </View>
      {!owned && <Pressable onPress={() => onWish(item)} hitSlop={10} style={styles.starHeart} accessibilityRole="button" accessibilityState={{ selected: wished }}
        accessibilityLabel={wished ? `Remove ${name} from Favorites` : `Save ${name} to Favorites`}>
        <View style={[styles.heartDot, wished && styles.heartDotOn]}><WishHeart on={wished} size={18} /></View>
      </Pressable>}
    </Pressable>
  );
});

export default function GearShelf({ items, setItems, promoUrl, nextRotationAt, onRestockElapsed, onEndReached, recheck, focusRequest, still, offset = 0, loading = false }: {
  readonly items: ItemType[];
  readonly setItems: (update: (prev: ItemType[]) => ItemType[]) => void;
  readonly promoUrl: string | undefined;
  readonly nextRotationAt: string | null | undefined;
  readonly onRestockElapsed?: () => void;
  readonly onEndReached?: () => void;
  /** Refetches the catalog and answers whether this item is now owned (the try-on's "Check again"). */
  readonly recheck: (itemId: number) => Promise<boolean | null>;
  /** Wishlist push or Favorites: open this item's try-on (a new nonce reopens the same item). */
  readonly focusRequest?: { id: number; nonce: number } | null;
  readonly still: boolean;
  /** Server clock minus device clock. */
  readonly offset?: number;
  /** More catalog pages may still arrive (a focus request waits for them). */
  readonly loading?: boolean;
}) {
  const { player } = useContext(AuthContext);
  const { playSound: playSoundNow } = useContext(SoundEffectContext);
  const soundRef = useRef(playSoundNow);
  soundRef.current = playSoundNow;
  const [open, setOpen] = useState<ShopItem | null>(null);
  const [bought, setBought] = useState<number[]>([]);
  const [toast, setToast] = useShopToast();
  const [stageAway, setStageAway] = useState(false);
  const nearEnd = useRef(false);
  // Only the first screenful staggers in; tiles from later pages just appear.
  const firstIds = useRef<Set<number> | null>(null);
  if (!firstIds.current && items.length) firstIds.current = new Set(items.slice(0, 9).map(i => i.id));
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const vip = !!player?.is_subscribed;
  const balance = Number(player?.coins ?? 0);
  // The stage rests once it has scrolled away, off screen, and under the try-on.
  const covered = useAnyModalLayer();
  // Under the try-on, Favorites, a dialog or the grown-up gate the stage rests too.
  const stageStill = still || stageAway || !focused || !!open || covered;

  // Hearts: the server's list seeds the shared store (the tab row's Favorites count reads it too).
  useEffect(() => {
    let live = true;
    void getWishlist().then(w => { if (live) wishStore.seed(w.item_ids ?? []); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  // Bought this visit: stays where the kid saw it until the next open.
  const shelf = useMemo(() => shelfOrder(items, bought), [items, bought]);
  const ownedCount = items.filter(i => i.has_purchased).length;
  // Filter chips: All, each slot on the shelf, Can buy (shop critic round 2: "hats I can afford" in two taps).
  const filters = useMemo(() => shelfFilters(items, balance), [items, balance]);
  const [filter, setFilter] = useState('all');
  const pickFilter = useCallback((key: string) => {
    void Haptics.selectionAsync().catch(() => undefined);
    soundRef.current(require('../../../assets/sounds/tap.mp3'));
    setFilter(key);
  }, []);
  // The shelf's star: the rarest piece you can still get, two tiles wide, on your own shark. Chosen once
  // per visit (it doesn't jump away when you buy it).
  const starRef = useRef<number | null>(null);
  if (starRef.current == null && items.length) starRef.current = starPick(items, vip)?.id ?? -1;
  const star = items.find(i => i.id === starRef.current) ?? null;

  const openItem = useCallback((item: ShopItem) => {
    soundRef.current(require('../../../assets/sounds/reveal.mp3'), { volume: 0.6 });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setOpen(item);
  }, []);

  useEffect(() => {
    if (!focusRequest) return;
    const item = items.find(i => i.id === focusRequest.id);
    if (item) { setOpen(item as ShopItem); return; }
    // Wait for the shelf (and its next pages) before saying it isn't here.
    if (items.length === 0 || loading) return;
    setToast('That one isn’t on the shelf today.');
  }, [focusRequest?.nonce, items.length, loading]);

  const wish = useCallback(async (item: ShopItem) => {
    const id = item.id;
    const adding = !wishStore.has(id);
    soundRef.current(require('../../../assets/sounds/tap.mp3'));
    void Haptics.impactAsync(adding ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    wishStore.set(id, adding);
    if (adding) setToast(wishSavedCopy(false));
    try {
      const server = adding ? await addToWishlist(id) : await removeFromWishlist(id);
      wishStore.set(id, server.includes(id));
    } catch (error: unknown) {
      wishStore.set(id, !adding);
      const full = (error as { response?: { data?: { code?: string } } })?.response?.data?.code === 'wishlist_full';
      setToast(full ? 'Your Favorites list is full. Remove one first.' : 'Couldn’t save that. Try again.');
    }
  }, [setToast]);

  const onPurchased = useCallback((item: ShopItem) => {
    setBought(list => (list.includes(item.id) ? list : [...list, item.id]));
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, has_purchased: true } : i)));
  }, [setItems]);

  const checkOwned = useCallback(async (itemId: number) => {
    const owns = await recheck(itemId).catch(() => null);
    return owns == null ? null : { owns, set: null };
  }, [recheck]);

  const onWorn = useCallback((item: ShopItem) => setToast(`Now wearing ${item.display_name || item.name}!`), [setToast]);
  const todayIds = useMemo(() => items.map(i => i.id), [items]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false} scrollEventThrottle={64}
        onScroll={e => {
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
          const away = contentOffset.y > GEAR_STAGE_H - 10;
          if (away !== stageAway) setStageAway(away);
          const near = contentOffset.y + layoutMeasurement.height > contentSize.height - 240;
          if (near && !nearEnd.current) onEndReached?.();
          nearEnd.current = near;
        }}>
        <View style={styles.stage}>
          {BUBBLES.map((b, i) => <Bubble key={i} {...b} still={stageStill} />)}
          <Shopkeeper imageUrl={promoUrl} still={stageStill} />
          {/* The restock day rides on the stage's corner: small, calm, out of the shelf's way. */}
          <View style={styles.restock}>
            <RestockChip nextAt={nextRotationAt} offset={offset} onElapsed={onRestockElapsed} />
            {/* Collection progress, quietly (monetization r7): a reason to come back that never pressures. */}
            {ownedCount > 0 && <View style={styles.yoursChip} accessible accessibilityLabel={`${ownedCount} of ${items.length} on the shelf are yours`}>
              <GameIcon name="check" size={14} /><Text maxFontSizeMultiplier={1.2} style={styles.yoursChipText}>{`${ownedCount} of ${items.length} yours`}</Text></View>}
          </View>
        </View>
        <Animated.View entering={still ? undefined : FadeInUp.duration(260)} style={styles.panel}>
          {filters.length === 0 && (
            <View style={styles.header}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.title} accessibilityRole="header">ON THE SHELF</Text>
            </View>
          )}
          {filters.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="tablist">
              {filters.map(f => {
                const on = f.key === filter;
                return (
                  <Pressable key={f.key} onPress={() => pickFilter(f.key)} hitSlop={6} accessibilityRole="tab" accessibilityState={{ selected: on }}
                    accessibilityLabel={`${f.label}, ${f.count}`} style={[styles.filter, on && styles.filterOn]}>
                    {f.key === 'can_buy' && <GameIcon name="coins" size={15} />}
                    <Text maxFontSizeMultiplier={1.2} style={[styles.filterText, on && styles.filterTextOn]}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {/* The chip row fades at its right edge, so a cut chip reads as "scroll for more". */}
          {filters.length > 0 && <LinearGradient pointerEvents="none" colors={['rgba(10,79,150,0)', S.panel]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chipFade} />}
          {shelf.length === 0 ? (
            <SharkLoader tone="onBlue" state="empty" compact title="New gear is on the way" message="New gear comes soon. Check back later." />
          ) : (
            <View style={styles.grid}>
              {star && filter === 'all' && (
                <Animated.View key={`star-${star.id}`} entering={still ? undefined : FadeIn.delay(40).duration(180)} style={{ width: 2 * TILE_W + GAP }}>
                  <StarTile item={star as ShopItem} balance={balance} still={still || !focused || !!open || covered} onOpen={openItem} onWish={wish} />
                </Animated.View>
              )}
              {shelf.filter(i => (filter !== 'all' || i.id !== star?.id) && passesFilter(i, filter, balance)).map((item, i) => (
                <Animated.View key={item.id} entering={still || !firstIds.current?.has(item.id) ? undefined : FadeIn.delay(60 + Math.min(i, 8) * 30).duration(180)}>
                  <ShopTile item={item as ShopItem} width={TILE_W} still={still} vipLocked={!!item.is_member_item && !vip}
                    affordable={balance >= item.cost} balance={balance} justBought={bought.includes(item.id)} onOpen={openItem} onWish={wish} />
                </Animated.View>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
      {/* The shelf slides under the tab row through a short fade (no hard cut across the shopkeeper). */}
      <LinearGradient pointerEvents="none" colors={[BRAND.blue, 'rgba(7,104,185,0)']} style={styles.fade} />
      <ShopToast message={toast} still={still} />
      {open && (
        <TryOnSheet item={open} set={null} todayIds={todayIds} still={still} onClose={() => setOpen(null)}
          onWish={wish} onPurchased={onPurchased} onWorn={onWorn} checkOwned={checkOwned}
          startBought={!!open.has_purchased} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {},
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 34 },
  filters: { gap: 8, paddingHorizontal: 12, paddingTop: 9 },
  restock: { position: 'absolute', top: 8, left: 10, gap: 6, alignItems: 'flex-start' },
  yoursChip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 9, borderRadius: 13, backgroundColor: 'rgba(5,52,110,0.84)' },
  yoursChipText: { fontFamily: FONT.display, fontSize: 13, color: '#ffffff' },
  chipFade: { position: 'absolute', right: 0, top: 10, width: 28, height: 40, borderTopRightRadius: 19 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: 13, borderRadius: 17,
    backgroundColor: 'rgba(5,52,110,0.65)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)' },
  filterOn: { backgroundColor: '#ffcf3b', borderColor: '#ffffff' },
  filterText: { fontFamily: FONT.display, fontSize: 15, color: '#ffffff' },
  filterTextOn: { color: '#0a2350' },
  star: { flex: 1, minHeight: 186, borderRadius: 16, borderWidth: 3, backgroundColor: '#ffffff', flexDirection: 'row', ...SHADOW.card },
  starClip: { ...StyleSheet.absoluteFillObject, borderRadius: 13, overflow: 'hidden' },
  starGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '40%' },
  starArt: { width: '54%', marginVertical: 2 },
  starText: { flex: 1, paddingTop: 12, paddingBottom: 10, paddingRight: 12, gap: 4 },
  starKicker: { alignSelf: 'flex-start', backgroundColor: '#0a2350', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  starKickerText: { fontFamily: FONT.display, fontSize: 12, color: '#ffe07a', letterSpacing: 0.8 },
  starName: { fontFamily: FONT.display, fontSize: 18, lineHeight: 21, color: '#0a2350' },
  starChips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  starSlotChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: 'rgba(10,35,80,0.1)' },
  starSlotChipText: { fontFamily: FONT.display, fontSize: 12, color: '#34506f', letterSpacing: 0.4 },
  starRarity: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  starRarityText: { fontFamily: FONT.display, fontSize: 12, color: '#ffffff', letterSpacing: 0.4 },
  starSlot: { fontFamily: FONT.body, fontSize: 14, lineHeight: 17, color: '#34506f' },
  starPrice: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  starPriceText: { flexShrink: 1, fontFamily: FONT.display, fontSize: 17, color: '#0a2350' },
  starHeart: { position: 'absolute', top: 4, right: 4 },
  starYours: { color: '#1b7f45' },
  heartDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#ff9bbf' },
  heartDotOn: { borderColor: '#ff4f8b', backgroundColor: '#fff0f5' },
  stage: { height: GEAR_STAGE_H, overflow: 'hidden', paddingTop: 6 },
  keeper: { width: SCREEN_W - 40, height: GEAR_STAGE_H - 6, alignSelf: 'center' },
  bubble: { position: 'absolute', top: 0, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  panel: { marginHorizontal: 10, marginTop: -COUNTER_TUCK, borderRadius: 22, backgroundColor: S.panel, paddingBottom: 14, borderWidth: 3, borderColor: S.border, ...SHADOW.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 0 },
  title: { fontFamily: FONT.display, fontSize: 20, color: S.ink, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: GRID_PAD, paddingTop: 10 },
});

