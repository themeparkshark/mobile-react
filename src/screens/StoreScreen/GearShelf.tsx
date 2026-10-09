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
import { Animated as RNAnimated, Dimensions, Easing as RNEasing, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addToWishlist, getWishlist, removeFromWishlist } from '../../api/endpoints/me/wishlist';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { restockPill, wishSavedCopy } from '../../helpers/shopShelves';
import type { ItemType } from '../../models/item-type';
import type { ShopItem } from '../../models/shop-today';
import { FONT, SHADOW, SharkLoader } from '../../ui';
import ShopTile from './ShopTile';
import TryOnSheet from './TryOnSheet';
import { MAX_FONT, SHOP_SURFACE as S, ShopToast, TimerPill, useShopNow, useShopToast } from './shopUi';
import { wishStore } from './wishStore';

const SCREEN_W = Dimensions.get('window').width;
const GAP = 12;
const GRID_PAD = 8;
// Same tile as the v2 shelves: panel 10 pt margin + 3 pt border each side, 8 pt grid padding.
const TILE_W = Math.floor((SCREEN_W - 2 * (10 + 3 + GRID_PAD) - GAP * 2) / 3);
/** The shopkeeper stage (was 180 under a 90 pt countdown and a balance row: the shelf sat at 63% of the screen). */
export const GEAR_STAGE_H = 142;
/** The shelf panel rises over the stage's floor: the shopkeeper stands behind the counter. */
export const COUNTER_TUCK = 30;

/** Owned pieces sink to the end (the shelf is mostly things you can still get); order is otherwise the server's. */
export function shelfOrder<T extends { id: number; has_purchased?: boolean }>(items: readonly T[], keepFirst: readonly number[] = []): T[] {
  const sinks = (i: T) => !!i.has_purchased && !keepFirst.includes(i.id);
  return [...items.filter(i => !sinks(i)), ...items.filter(sinks)];
}

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
function RestockChip({ nextAt, onElapsed }: { nextAt: string | null | undefined; onElapsed?: () => void }) {
  const now = useShopNow(0);
  const pill = restockPill(nextAt, now);
  const fired = useRef(false);
  const left = nextAt ? Date.parse(nextAt) - now : 1;
  useEffect(() => { if (left <= 0 && !fired.current) { fired.current = true; onElapsed?.(); } }, [left <= 0]);
  if (!pill) return null;
  return <TimerPill pill={pill} still />;
}

export default function GearShelf({ items, setItems, promoUrl, nextRotationAt, onRestockElapsed, onEndReached, recheck, focusRequest, still }: {
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
}) {
  const { player } = useContext(AuthContext);
  const { playSound: playSoundNow } = useContext(SoundEffectContext);
  const soundRef = useRef(playSoundNow);
  soundRef.current = playSoundNow;
  const [open, setOpen] = useState<ShopItem | null>(null);
  const [bought, setBought] = useState<number[]>([]);
  const [toast, setToast] = useShopToast();
  const [stageAway, setStageAway] = useState(false);
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const vip = !!player?.is_subscribed;
  const balance = Number(player?.coins ?? 0);
  // The stage rests once it has scrolled away, off screen, and under the try-on.
  const stageStill = still || stageAway || !focused || !!open;

  // Hearts: the server's list seeds the shared store (the tab row's Favorites count reads it too).
  useEffect(() => {
    let live = true;
    void getWishlist().then(w => { if (live) wishStore.seed(w.item_ids ?? []); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  // Bought this visit: stays where the kid saw it until the next open.
  const shelf = useMemo(() => shelfOrder(items, bought), [items, bought]);

  const openItem = useCallback((item: ShopItem) => {
    soundRef.current(require('../../../assets/sounds/reveal.mp3'), { volume: 0.6 });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setOpen(item);
  }, []);

  useEffect(() => {
    if (!focusRequest) return;
    const item = items.find(i => i.id === focusRequest.id);
    if (item) setOpen(item as ShopItem);
    else setToast('That one isn’t on the shelf today.');
  }, [focusRequest?.nonce]);

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
          if (contentOffset.y + layoutMeasurement.height > contentSize.height - 240) onEndReached?.();
        }}>
        <View style={styles.stage}>
          {BUBBLES.map((b, i) => <Bubble key={i} {...b} still={stageStill} />)}
          <Shopkeeper imageUrl={promoUrl} still={stageStill} />
        </View>
        <Animated.View entering={still ? undefined : FadeInUp.duration(260)} style={styles.panel}>
          <View style={styles.header}>
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.title} accessibilityRole="header">ON THE SHELF</Text>
            <RestockChip nextAt={nextRotationAt} onElapsed={onRestockElapsed} />
          </View>
          {shelf.length === 0 ? (
            <SharkLoader tone="onBlue" state="empty" compact title="New gear is on the way" message="New gear comes soon. Check back later." />
          ) : (
            <View style={styles.grid}>
              {shelf.map((item, i) => (
                <Animated.View key={item.id} entering={still ? undefined : FadeIn.delay(80 + Math.min(i, 8) * 45).duration(220)}>
                  <ShopTile item={item as ShopItem} width={TILE_W} still={still} vipLocked={!!item.is_member_item && !vip}
                    affordable={balance >= item.cost} justBought={bought.includes(item.id)} onOpen={openItem} onWish={wish} />
                </Animated.View>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
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
  stage: { height: GEAR_STAGE_H, overflow: 'hidden', paddingTop: 6 },
  keeper: { width: SCREEN_W - 40, height: GEAR_STAGE_H - 6, alignSelf: 'center' },
  bubble: { position: 'absolute', top: 0, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  panel: { marginHorizontal: 10, marginTop: -COUNTER_TUCK, borderRadius: 22, backgroundColor: S.panel, paddingBottom: 14, borderWidth: 3, borderColor: S.border, ...SHADOW.card },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 0 },
  title: { fontFamily: FONT.display, fontSize: 20, color: S.ink, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: GRID_PAD, paddingTop: 10 },
});

