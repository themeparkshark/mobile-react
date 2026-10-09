import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  Pressable,
  SafeAreaView,
  useWindowDimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import getCatalog from '../api/endpoints/catalogs/get';
import getItems from '../api/endpoints/catalogs/items';
import getStore from '../api/endpoints/stores/get';
import getStores from '../api/endpoints/stores/stores';
import getStoreRotation, { StoreRotation } from '../api/endpoints/stores/rotation';
import getShopToday from '../api/endpoints/stores/today';
import { ShopToday } from '../models/shop-today';
import ShopShelves from './StoreScreen/ShopShelves';
import { WishHeart } from './StoreScreen/shopUi';
import WishlistSheet from './StoreScreen/WishlistSheet';
import { REVEAL_NAVY } from './StoreScreen/shopUi';
import { useWishCount } from './StoreScreen/wishStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { type SharedValue, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { clockOffset, formatCoins } from '../helpers/shopShelves';
import StoreCountdown from '../components/StoreCountdown';
import InformationModal from '../components/InformationModal';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { AuthContext } from '../context/AuthProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import useCrumbs from '../hooks/useCrumbs';
import usePurchaseItem, { currencyLabel } from '../hooks/usePurchaseItem';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { ws7Preview } from '../dev/ws7Preview';
import { BRAND, GameIcon, SharkLoader } from '../ui';
import currencyBalance from '../helpers/currency-balance';
import { CatalogType } from '../models/catalog-type';
import { InformationModalEnums } from '../models/information-modal-enums';
import { ItemType } from '../models/item-type';
import { StoreType } from '../models/store-type';
import { AWAY_LINE, HALLOWEEN_SHOP_NAME, awayMessage, isEventShop } from '../components/fright/halloweenShop';
import { useTutorial } from '../components/Tutorial';
import { SECRET_THEME } from '../fx/secretTheme';
import { loadSecretShopFlag } from '../services/secretShopFlag';
import Item from './StoreScreen/Item';
import SuppliesShop, { type SuppliesFocus } from './StoreScreen/SuppliesShop';
import GearShelf from './StoreScreen/GearShelf';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';

const SCREEN_W = Dimensions.get('window').width;
/** Items per catalog page (the server's simplePaginate default). */
const CATALOG_PAGE = 15;

/** Bobbing + tilting shark shopkeeper — perfect symmetric loops */
function AnimatedShark({ imageUrl, still }: { imageUrl: string | undefined; still: boolean }) {
  const bob = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) { bob.setValue(0); tilt.setValue(0); return; }
    // Bob: center → up → center → down → center (perfect symmetric loop)
    Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: -8,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 8,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Tilt: center → right → center → left → center (same symmetric pattern)
    Animated.loop(
      Animated.sequence([
        Animated.timing(tilt, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(tilt, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(tilt, {
          toValue: -1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(tilt, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
    return () => { bob.stopAnimation(); tilt.stopAnimation(); };
  }, [still]);

  const rotation = tilt.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-3deg', '3deg'],
  });

  return (
    <Animated.View
      style={{
        transform: [{ translateY: bob }, { rotate: rotation }],
        alignItems: 'center',
        flex: 1,
      }}
    >
      <Image
        source={imageUrl}
        style={{
          width: SCREEN_W - 25,
          height: '100%',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
        contentFit="contain"
      />
    </Animated.View>
  );
}

/** Floating bubble particles */
function StoreBubbles() {
  const bubbles = useRef(
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: Math.random() * (SCREEN_W - 40) + 20,
      size: Math.random() * 10 + 6,
      duration: Math.random() * 2000 + 3000,
      delay: Math.random() * 2000,
      opacity: Math.random() * 0.3 + 0.15,
    }))
  ).current;

  return (
    <>
      {bubbles.map((b) => (
        <SingleBubble key={b.id} {...b} />
      ))}
    </>
  );
}

function SingleBubble({
  x,
  size,
  duration,
  delay,
  opacity,
}: {
  x: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(wobble, {
            toValue: 1,
            duration: duration * 0.4,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(wobble, {
            toValue: -1,
            duration: duration * 0.4,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, []);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [180, -20],
  });

  const translateX = wobble.interpolate({
    inputRange: [-1, 1],
    outputRange: [-8, 8],
  });

  const scale = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.5, 1, 0.3],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(255,255,255,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        opacity,
        transform: [{ translateY }, { translateX }, { scale }],
      }}
    />
  );
}

/** Gear (cosmetics for Shark Coins) and Supplies (in-app purchases), on the Shark Shop only. */
function ShopTabs({ tab, onChange, coins, onWishlist, withBack = false }: {
  tab: 'gear' | 'supplies'; onChange: (tab: 'gear' | 'supplies') => void;
  /** Shop v2: the balance lives in the tab row (no separate pill row). */
  coins?: number | null;
  onWishlist?: () => void;
  /** Shop v2: the back button lives in the tab row, so the title bar can fold away by transform only. */
  withBack?: boolean;
}) {
  const wishes = useWishCount();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: coins == null ? 0 : 12 }}>
    {withBack && <View style={{ marginLeft: 12, marginTop: 10 }}><BackButton /></View>}
    <View style={[tabStyles.row, coins == null ? null : { flex: 1, marginRight: 8 }, withBack && { marginLeft: 8 }]} accessibilityRole="tablist">
      {(['gear', 'supplies'] as const).map(key => (
        <Pressable key={key} onPress={() => onChange(key)} style={[tabStyles.tab, tab === key && tabStyles.tabOn]}
          accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
          <Text style={[tabStyles.label, tab === key && tabStyles.labelOn]}>{key === 'gear' ? 'GEAR' : 'SUPPLIES'}</Text>
        </Pressable>
      ))}
    </View>
    {coins != null && (
      <>
        <Pressable onPress={onWishlist} style={tabStyles.wish} accessibilityRole="button"
          accessibilityLabel={`Favorites, ${wishes} ${wishes === 1 ? 'item' : 'items'}`}>
          <WishHeart on={wishes > 0} size={20} />
          {wishes > 0 && <Text maxFontSizeMultiplier={1.3} style={tabStyles.wishText}>{wishes}</Text>}
        </Pressable>
        <View style={tabStyles.coins} accessible accessibilityLabel={`${formatCoins(coins)} coins`}>
          <GameIcon name="coins" size={20} />
          <Text maxFontSizeMultiplier={1.3} style={tabStyles.coinsText}>{formatCoins(coins)}</Text>
        </View>
      </>
    )}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, padding: 4, marginHorizontal: 16, marginTop: 10, marginBottom: 2,
    backgroundColor: 'rgba(5,52,110,0.55)', borderRadius: 999 },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 999, alignItems: 'center' },
  tabOn: { backgroundColor: '#ffcf3b' },
  label: { fontFamily: 'Shark', fontSize: 17, color: '#fff' },
  labelOn: { color: '#6a3b00' },
  coins: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minWidth: 92, gap: 4, marginTop: 10, backgroundColor: BRAND.blueLip,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: BRAND.white },
  coinsText: { fontFamily: 'Shark', fontSize: 16, color: '#fff' },
  wish: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, marginRight: 8, backgroundColor: '#fff0f5',
    borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 2, borderColor: '#ff4f8b' },
  wishText: { fontFamily: 'Shark', fontSize: 14, color: '#c2185b' },
});

/**
 * One store per screen instance: a new store param (navigate('Store', ...) landing on a Store
 * screen already in the stack) starts a fresh screen, so no tab, shelf, scroll fold, try-on or
 * Secret Shop state carries over from the other store.
 */
export default function StoreScreen(props: NativeStackScreenProps<ParamListBase, 'Store'>) {
  const store = (props.route.params as { store?: number | 'shark-shop' } | undefined)?.store;
  return <StoreScreenBody key={String(store)} {...props} />;
}

function StoreScreenBody({ route }: NativeStackScreenProps<ParamListBase, 'Store'>) {
  const { store, tab: initialTab, focus, focus_item: focusItem } = route.params as {
    store: number | 'shark-shop'; tab?: 'gear' | 'supplies'; focus?: SuppliesFocus;
    /** Wishlist push deep link: open this item's try-on. */
    focus_item?: number;
  };
  const [tab, setTab] = useState<'gear' | 'supplies'>(initialTab ?? 'gear');
  const [currentStore, setCurrentStore] = useState<StoreType>();
  const [catalog, setCatalog] = useState<CatalogType>();
  const [items, setItems] = useState<ItemType[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready' | 'away'>('loading');
  /** Why the server kept this player out of the event-only Halloween Shop (403 only_at_event). */
  const [awayReason, setAwayReason] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const reducedMotion = useReducedGameMotion();
  const { player } = useContext(AuthContext);
  const { labels } = useCrumbs();
  const { currencies } = useContext(CurrencyContext);
  const { startTutorial, hasCompleted } = useTutorial();
  const [today, setToday] = useState<ShopToday | null>(null);
  const storeIdRef = useRef<number | null>(null);
  // Server clock minus device clock: timers never trust a changed device clock.
  const [clockSkew, setClockSkew] = useState(0);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  // Wishlist push or My Wishlist: a new nonce opens the try-on, even for the same item twice.
  const [focusRequest, setFocusRequest] = useState<{ id: number; nonce: number } | null>(
    () => (focusItem ? { id: focusItem, nonce: 1 } : null));
  const shopStill = useReducedGameMotion();
  const [shopHandoff, setShopHandoff] = useState(false);
  // Secret Shop v2 (secret-shop/DESIGN.md): the secret store on the shop engine, behind secret_shop_v2.
  const [secretV2, setSecretV2] = useState(false);
  // The title bar folds into the tab row after 40pt of shop scroll.
  const scrollY = useSharedValue(0);
  const collapse = useDerivedValue(() => (shopStill ? (scrollY.value > 40 ? 1 : 0) : Math.min(1, Math.max(0, scrollY.value / 40))));
  const [barH, setBarH] = useState(0);
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The title bar folds away by transform and opacity only (no layout per scroll frame): the whole
  // stack slides up by the bar's height, and is that much taller so the shelf fills the screen.
  const fold = Math.max(0, barH - insets.top);
  const stackStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -fold * collapse.value }] }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: 1 - collapse.value }));
  const reloadToday = useCallback(async (): Promise<boolean> => {
    if (!storeIdRef.current) return false;
    const next = await getShopToday(storeIdRef.current).catch(() => null);
    if (!next) return false;
    setClockSkew(clockOffset(next.server_time, Date.now()));
    setToday(next);
    return true;
  }, []);
  // The classic grid (older backends, park stores) keeps the dialog purchase flow.
  // A bought item shows as owned right away, so a second tap says "Already yours", never "Buy this?" again.
  const { purchaseItem, purchaseModal } = usePurchaseItem({
    onPurchased: bought => setItems(prev => prev.map(i => (i.id === bought.id ? { ...i, has_purchased: true } : i))),
  });
  const [page, setPage] = useState<number>(1);
  // One page request at a time: two quick onEndReached calls must not skip a page.
  const loadingMore = useRef(false);
  // A restock refresh swaps the shelves in place; it never blanks the shop mid-browse.
  const silentReload = useRef(false);

  // Trigger store tutorial on first visit
  useEffect(() => {
    if (!hasCompleted('store')) {
      const timer = setTimeout(() => startTutorial('store'), 800);
      return () => clearTimeout(timer);
    }
  }, []);
  const [rotation, setRotation] = useState<StoreRotation | null>(null);
  const [restockPending, setRestockPending] = useState(false);

  // At zero the server restocks on its hourly job: check the timer each minute
  // and reload the shop once a new rotation is live.
  useEffect(() => {
    if (!restockPending || !currentStore) return;
    const interval = setInterval(async () => {
      const next = await getStoreRotation(currentStore.id).catch(() => null);
      if (next?.next_rotation_at && new Date(next.next_rotation_at).getTime() > Date.now()) {
        setRestockPending(false);
        silentReload.current = true;
        setAttempt(a => a + 1);
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [restockPending, currentStore?.id]);

  // One load path with an end state: the shop never spins forever.
  useEffect(() => {
    let live = true;
    const silent = silentReload.current;
    silentReload.current = false;
    if (!silent) setStatus('loading');
    (async () => {
      // 'shark-shop' opens the global Shark Shop without knowing its id.
      const id = typeof store === 'number' ? store
        : Number((await getStores()).find(s => s.name === 'Shark Shop')?.id) || undefined;
      if (!id) throw new Error('Shark Shop not found');
      const nextStore = await getStore(id);
      storeIdRef.current = id;
      // The secret store only asks for shelves while secret_shop_v2 is on (the server checks it too).
      const nextSecretV2 = !!nextStore.is_secret_store && await loadSecretShopFlag();
      const [nextRotation, nextCatalog, nextToday] = await Promise.all([
        getStoreRotation(id).catch(() => null),
        getCatalog(nextStore.current_catalog_id),
        // Shop v2 shelves; null on an older backend, which keeps the classic grid. The Secret Shop
        // with its flag on never falls back to the legacy grid on a hiccup: a failed day is an error
        // with a retry (getShopToday answers null only for "this store doesn't rotate").
        nextStore.is_secret_store && !nextSecretV2 ? Promise.resolve(null)
          : nextSecretV2 ? getShopToday(id) : getShopToday(id).catch(() => null),
      ]);
      const firstPage = nextToday ? [] : await getItems(nextCatalog.id, 1);
      if (!live) return;
      if (nextToday) setClockSkew(clockOffset(nextToday.server_time, Date.now()));
      setToday(nextToday);
      setSecretV2(nextSecretV2 && !!nextToday);
      setCurrentStore(nextStore);
      setRotation(nextRotation);
      setCatalog(nextCatalog);
      setItems(firstPage);
      setPage(1);
      setHasMore(firstPage.length >= CATALOG_PAGE);
      setStatus('ready');
    // A failed background restock keeps the shelves the player is browsing.
    })().catch((error: unknown) => {
      // The Halloween Shop opens only at a Fin-ister event: say so, never offer a buy button.
      const refused = (error as { response?: { status?: number; data?: { only_at_event?: boolean; reason?: string } } })?.response;
      if (live && !silent && refused?.status === 403 && refused.data?.only_at_event) {
        setAwayReason(refused.data.reason ?? null);
        setStatus('away');
        return;
      }
      if (live && !silent) setStatus('error');
    });
    return () => { live = false; };
  }, [store, attempt]);

  // Dev visual QA: show the not-enough sheet for the first item the player can't afford.
  useEffect(() => {
    if (ws7Preview() !== 'store-poor' || status !== 'ready' || !player) return;
    const item = items.find(i => !i.has_purchased && currencyBalance(player, i.currency.name) < i.cost);
    if (!item) return;
    const timer = setTimeout(() => { void purchaseItem(item); }, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Supplies sit on the Shark Shop only; secret and park stores stay gear-only.
  const sharkShop = store === 'shark-shop' || currentStore?.name === 'Shark Shop';
  // Shop v2 shelves (the title bar folds away as the shelf scrolls).
  const v2 = !!today && sharkShop && tab === 'gear';
  // The classic catalog on the Shark Shop (live today): the shelf, the try-on and the balance in the tab row.
  const classicGear = !today && sharkShop && tab === 'gear' && !(currentStore && isEventShop(currentStore));
  // The Secret Shop: the same shelves in midnight, with its own title bar (no tab row to fold into).
  const secretShelves = !!today && secretV2 && !sharkShop;
  const floor = secretShelves ? SECRET_THEME.floor : BRAND.blue;

  const loadMore = async () => {
    if (!catalog || !hasMore || status !== 'ready' || loadingMore.current) return;
    loadingMore.current = true;
    const next = page + 1;
    try {
      const response = await getItems(catalog.id, next);
      // The page only advances once its items are in, so no page is ever skipped.
      setPage(next);
      // A short page is the last one (Laravel simplePaginate: 15 a page), so no empty fetch is needed to know.
      if (response.length < CATALOG_PAGE) setHasMore(false);
      setItems(prev => [...prev, ...response.filter(item => !prev.some(p => p.id === item.id))]);
    } catch {
      setHasMore(false);
    } finally {
      loadingMore.current = false;
    }
  };

  // The try-on's "Check again": a fresh catalog (every page loaded so far) says whether this item is owned now.
  const recheckOwned = async (itemId: number): Promise<boolean | null> => {
    if (!catalog) return null;
    for (let p = 1; p <= page; p++) {
      const fresh = await getItems(catalog.id, p);
      const hit = fresh.find(i => i.id === itemId);
      if (hit) {
        if (hit.has_purchased) setItems(prev => prev.map(i => (i.id === itemId ? { ...i, has_purchased: true } : i)));
        return !!hit.has_purchased;
      }
    }
    return false;
  };

  return (
    <>
      {purchaseModal}
      <WishlistSheet visible={wishlistOpen} still={shopStill} onClose={() => setWishlistOpen(false)}
        onOpenItem={id => setFocusRequest(r => ({ id, nonce: (r?.nonce ?? 0) + 1 }))} />
      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: floor }}>
      <Reanimated.View style={v2 ? [{ position: 'absolute', top: 0, left: 0, right: 0, height: winH + fold }, stackStyle] : { flex: 1 }}>
      <Reanimated.View style={v2 ? titleStyle : undefined}
        onLayout={e => { if (!barH) setBarH(e.nativeEvent.layout.height); }}>
      {/* The vault keeps the house top bar (navy, not the legacy purple one): the shelves carry the midnight. */}
      <Topbar purple={(currentStore?.is_secret_store ?? false) && !secretShelves} night={secretShelves}>
        <TopbarColumn stretch={false}>
          {v2 ? <View style={{ width: 35 }} /> : <BackButton />}
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>{secretShelves ? 'Secret Shop' : currentStore && isEventShop(currentStore) ? HALLOWEEN_SHOP_NAME
            : status === 'away' ? HALLOWEEN_SHOP_NAME : currentStore?.name ?? (sharkShop ? 'Shark Shop' : '')}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal id={InformationModalEnums.StoreScreen} />
        </TopbarColumn>
      </Topbar>
      </Reanimated.View>
      {sharkShop && (
        <View style={{ backgroundColor: BRAND.blue, marginTop: -8, paddingTop: 8 }}>
          <ShopTabs tab={tab} onChange={setTab} coins={v2 || classicGear ? Number(player?.coins ?? 0) : null}
            onWishlist={() => setWishlistOpen(true)} withBack={v2} />
        </View>
      )}
      {sharkShop && tab === 'supplies' && (
        <View style={{ flex: 1, backgroundColor: BRAND.blue }}>
          <SuppliesShop focus={focus} />
        </View>
      )}
      {status === 'away' && (
        <View style={{ flex: 1, backgroundColor: BRAND.blue }}>
          <SharkLoader tone="onBlue" state="empty" title={AWAY_LINE} message={awayMessage(awayReason)} />
        </View>
      )}
      {(!sharkShop || tab === 'gear') && status !== 'ready' && status !== 'away' && (
        <View style={{ flex: 1, backgroundColor: BRAND.blue }}>
          <SharkLoader tone="onBlue" state={status === 'error' ? 'error' : 'loading'}
            title={status === 'error' ? 'The Shark Shop couldn’t open' : undefined}
            onRetry={() => setAttempt(a => a + 1)} />
        </View>
      )}
      {(!sharkShop || tab === 'gear') && status === 'ready' && (
        <ImageBackground
          style={{
            flex: 1,
            marginTop: sharkShop ? 0 : -8,
            // Brand blue under the art, never white if a store has no background.
            backgroundColor: floor,
          }}
          source={currentStore?.background_url && !secretShelves ? { uri: currentStore.background_url } : undefined}
        >
          {/* The classic Shark Shop shelf scrolls edge to edge (it pads for the home indicator itself). */}
          {classicGear ? (
            <GearShelf items={items} setItems={setItems} promoUrl={catalog?.promotion_image_url}
              nextRotationAt={rotation?.next_rotation_at} onRestockElapsed={() => setRestockPending(true)}
              onEndReached={() => { void loadMore(); }} recheck={recheckOwned} focusRequest={focusRequest} still={reducedMotion}
              offset={clockSkew} loading={hasMore} />
          ) : (
          <SafeAreaView
            style={{
              flex: 1,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                columnGap: 16,
                justifyContent: 'center',
                paddingTop: today ? 0 : 16,
              }}
            >
              {catalog && !today &&
                catalog.currencies.map((currency) => {
                  return (
                    <View
                      key={currency.id}
                      style={{
                        backgroundColor: BRAND.blue,
                        paddingLeft: 12,
                        paddingRight: 14,
                        paddingTop: 4,
                        paddingBottom: 4,
                        borderRadius: 999,
                        borderColor: BRAND.white,
                        borderWidth: 3,
                        flexDirection: 'row',
                        alignItems: 'center',
                      }}
                    >
                      <Image
                        source={{
                          uri: currency.icon_url,
                        }}
                        style={{
                          width: 35,
                          height: 35,
                        }}
                        contentFit="contain"
                      />
                      <Text
                        style={{
                          color: '#fff',
                          textShadowColor: BRAND.navy,
                          textShadowOffset: {
                            width: 1,
                            height: 2,
                          },
                          textShadowRadius: 0,
                          fontFamily: 'Shark',
                          fontSize: 18,
                          marginLeft: 8,
                        }}
                      >
                        {player ? currencyBalance(player, currency.name) : 0}{' '}
                        {currencyLabel(currency.name)}
                      </Text>
                    </View>
                  );
                })}
            </View>
            {today && (
              <ShopShelves today={today} setToday={setToday} onRefresh={reloadToday} offset={clockSkew}
                focusRequest={focusRequest} scrollY={v2 ? scrollY : undefined} onHandoff={setShopHandoff} secret={secretShelves}
                onOpenFavorites={() => setWishlistOpen(true)} />
            )}
            {/* Countdown Timer */}
            {!today && currentStore?.event?.ends_at ? (
              <StoreCountdown nextRotationAt={currentStore.event.ends_at} event={{ header: 'SHOP CLOSES IN',
                tag: currentStore.event.tag || 'LIMITED', subtitle: currentStore.event.subtitle,
                elapsed: 'The Halloween Shop is closed for the season.' }} />
            ) : !today && rotation?.next_rotation_at && (
              <StoreCountdown nextRotationAt={rotation.next_rotation_at} onElapsed={() => setRestockPending(true)} />
            )}
            {!today && <View
              style={{
                height: 180,
                paddingTop: 16,
                paddingBottom: 16,
                overflow: 'hidden',
              }}
            >
              {/* Floating bubbles */}
              {!reducedMotion && <StoreBubbles />}
              {/* Animated shark */}
              <AnimatedShark imageUrl={catalog?.promotion_image_url} still={reducedMotion} />
            </View>}
            {!today && items.length === 0 && (
              <SharkLoader tone="onBlue" state="empty" compact title="New gear is on the way"
                message="New gear comes soon. Check back later." />
            )}
            {!today && items && items?.length > 0 && (
              <View
                style={{
                  borderTopWidth: 5,
                  borderTopColor: '#fff',
                  flex: 1,
                }}
              >
                <FlashList
                  data={items}
                  contentContainerStyle={{
                    padding: 8,
                    backgroundColor: 'rgba(255, 255, 255, .6)',
                  }}
                  numColumns={3}
                  renderItem={({ item }) => (
                    <View style={{ padding: 8, flex: 1 }}>
                      <Item item={item} onPurchase={purchaseItem} />
                    </View>
                  )}
                  estimatedItemSize={80}
                  keyExtractor={(item) => String(item.id)}
                  onEndReached={() => { void loadMore(); }}
                />
              </View>
            )}
          </SafeAreaView>
          )}
        </ImageBackground>
      )}
      </Reanimated.View>
      {/* Buy hand-off into the Set Complete reveal: navy over everything, header included. */}
      {shopHandoff && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: REVEAL_NAVY, zIndex: 50 }]} />}
      </View>
    </>
  );
}
