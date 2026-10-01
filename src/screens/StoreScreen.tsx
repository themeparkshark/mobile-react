import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import getCatalog from '../api/endpoints/catalogs/get';
import getItems from '../api/endpoints/catalogs/items';
import getStore from '../api/endpoints/stores/get';
import getStores from '../api/endpoints/stores/stores';
import getStoreRotation, { StoreRotation } from '../api/endpoints/stores/rotation';
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
import { BRAND, SharkLoader } from '../ui';
import currencyBalance from '../helpers/currency-balance';
import { CatalogType } from '../models/catalog-type';
import { InformationModalEnums } from '../models/information-modal-enums';
import { ItemType } from '../models/item-type';
import { StoreType } from '../models/store-type';
import { useTutorial } from '../components/Tutorial';
import Item from './StoreScreen/Item';
import SuppliesShop, { type SuppliesFocus } from './StoreScreen/SuppliesShop';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';

const SCREEN_W = Dimensions.get('window').width;

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
function ShopTabs({ tab, onChange }: { tab: 'gear' | 'supplies'; onChange: (tab: 'gear' | 'supplies') => void }) {
  return (
    <View style={tabStyles.row} accessibilityRole="tablist">
      {(['gear', 'supplies'] as const).map(key => (
        <Pressable key={key} onPress={() => onChange(key)} style={[tabStyles.tab, tab === key && tabStyles.tabOn]}
          accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
          <Text style={[tabStyles.label, tab === key && tabStyles.labelOn]}>{key === 'gear' ? 'GEAR' : 'SUPPLIES'}</Text>
        </Pressable>
      ))}
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
});

export default function StoreScreen({ route }: NativeStackScreenProps<ParamListBase, 'Store'>) {
  const { store, tab: initialTab, focus } = route.params as {
    store: number | 'shark-shop'; tab?: 'gear' | 'supplies'; focus?: SuppliesFocus;
  };
  const [tab, setTab] = useState<'gear' | 'supplies'>(initialTab ?? 'gear');
  const [currentStore, setCurrentStore] = useState<StoreType>();
  const [catalog, setCatalog] = useState<CatalogType>();
  const [items, setItems] = useState<ItemType[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [hasMore, setHasMore] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const reducedMotion = useReducedGameMotion();
  const { player } = useContext(AuthContext);
  const { labels } = useCrumbs();
  const { currencies } = useContext(CurrencyContext);
  const { startTutorial, hasCompleted } = useTutorial();
  const { purchaseItem, purchaseModal } = usePurchaseItem();
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
      const [nextRotation, nextCatalog] = await Promise.all([
        getStoreRotation(id).catch(() => null),
        getCatalog(nextStore.current_catalog_id),
      ]);
      const firstPage = await getItems(nextCatalog.id, 1);
      if (!live) return;
      setCurrentStore(nextStore);
      setRotation(nextRotation);
      setCatalog(nextCatalog);
      setItems(firstPage);
      setPage(1);
      setHasMore(firstPage.length > 0);
      setStatus('ready');
    // A failed background restock keeps the shelves the player is browsing.
    })().catch(() => { if (live && !silent) setStatus('error'); });
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

  const loadMore = async () => {
    if (!catalog || !hasMore || status !== 'ready' || loadingMore.current) return;
    loadingMore.current = true;
    const next = page + 1;
    try {
      const response = await getItems(catalog.id, next);
      // The page only advances once its items are in, so no page is ever skipped.
      setPage(next);
      if (response.length === 0) setHasMore(false);
      setItems(prev => [...prev, ...response.filter(item => !prev.some(p => p.id === item.id))]);
    } catch {
      setHasMore(false);
    } finally {
      loadingMore.current = false;
    }
  };

  return (
    <>
      {purchaseModal}
      <Topbar purple={currentStore?.is_secret_store ?? false}>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>{currentStore?.name ?? (sharkShop ? 'Shark Shop' : '')}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal id={InformationModalEnums.StoreScreen} />
        </TopbarColumn>
      </Topbar>
      {sharkShop && (
        <View style={{ backgroundColor: BRAND.blue, marginTop: -8, paddingTop: 8 }}>
          <ShopTabs tab={tab} onChange={setTab} />
        </View>
      )}
      {sharkShop && tab === 'supplies' && (
        <View style={{ flex: 1, backgroundColor: BRAND.blue }}>
          <SuppliesShop focus={focus} />
        </View>
      )}
      {(!sharkShop || tab === 'gear') && status !== 'ready' && (
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
          }}
          source={{
            uri: currentStore?.background_url,
          }}
        >
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
                paddingTop: 16,
              }}
            >
              {catalog &&
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
            {/* Countdown Timer */}
            {rotation?.next_rotation_at && (
              <StoreCountdown nextRotationAt={rotation.next_rotation_at} onElapsed={() => setRestockPending(true)} />
            )}
            <View
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
            </View>
            {items.length === 0 && (
              <SharkLoader tone="onBlue" state="empty" compact title="New gear is on the way"
                message="The Shark Shop restocks soon. Check back after the countdown." />
            )}
            {items && items?.length > 0 && (
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
        </ImageBackground>
      )}
    </>
  );
}
