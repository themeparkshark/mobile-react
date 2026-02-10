import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import getCatalog from '../api/endpoints/catalogs/get';
import getItems from '../api/endpoints/catalogs/items';
import getStore from '../api/endpoints/stores/get';
import getStoreRotation, { StoreRotation } from '../api/endpoints/stores/rotation';
import StoreCountdown from '../components/StoreCountdown';
import InformationModal from '../components/InformationModal';
import Loading from '../components/Loading';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { AuthContext } from '../context/AuthProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import useCrumbs from '../hooks/useCrumbs';
import usePurchaseItem from '../hooks/usePurchaseItem';
import { CatalogType } from '../models/catalog-type';
import { InformationModalEnums } from '../models/information-modal-enums';
import { ItemType } from '../models/item-type';
import { StoreType } from '../models/store-type';
import { useTutorial } from '../components/Tutorial';
import Item from './StoreScreen/Item';

const SCREEN_W = Dimensions.get('window').width;

/** Bobbing + tilting shark shopkeeper — perfect symmetric loops */
function AnimatedShark({ imageUrl }: { imageUrl: string | undefined }) {
  const bob = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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
  }, []);

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

export default function StoreScreen({ route }) {
  const { store } = route.params;
  const [currentStore, setCurrentStore] = useState<StoreType>();
  const [catalog, setCatalog] = useState<CatalogType>();
  const [items, setItems] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { player } = useContext(AuthContext);
  const { labels } = useCrumbs();
  const { currencies } = useContext(CurrencyContext);
  const { startTutorial, hasCompleted } = useTutorial();
  const { purchaseItem, purchaseModal } = usePurchaseItem();
  const [page, setPage] = useState<number>(1);

  // Trigger store tutorial on first visit
  useEffect(() => {
    if (!hasCompleted('store')) {
      const timer = setTimeout(() => startTutorial('store'), 800);
      return () => clearTimeout(timer);
    }
  }, []);
  const [rotation, setRotation] = useState<StoreRotation | null>(null);

  const fetchItems = async (page: number) => {
    if (!catalog) {
      return;
    }

    const response = await getItems(catalog.id, page);
    setItems((prevState) => {
      return [...prevState, ...response];
    });
  };

  useAsyncEffect(async () => {
    setCurrentStore(await getStore(store));
    setRotation(await getStoreRotation(store));
  }, []);

  useAsyncEffect(async () => {
    if (!currentStore) {
      return;
    }

    setCatalog(await getCatalog(currentStore.current_catalog_id));
  }, [currentStore?.id]);

  useAsyncEffect(async () => {
    if (!catalog) {
      return;
    }

    await fetchItems(page);
    setLoading(false);
  }, [catalog]);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchItems(page);
    }
  }, [page]);

  return (
    <>
      {purchaseModal}
      <Topbar purple={currentStore?.is_secret_store ?? false}>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>{currentStore?.name}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal id={InformationModalEnums.StoreScreen} />
        </TopbarColumn>
      </Topbar>
      {loading && <Loading />}
      {!loading && (
        <ImageBackground
          style={{
            flex: 1,
            marginTop: -8,
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
                        backgroundColor: 'rgba(0, 0, 0, .5)',
                        paddingLeft: 12,
                        paddingRight: 12,
                        paddingTop: 6,
                        paddingBottom: 6,
                        borderRadius: 6,
                        borderColor: 'rgba(255, 255, 255, .4)',
                        borderWidth: 2,
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
                          textShadowColor: 'rgba(0, 0, 0, .5)',
                          textShadowOffset: {
                            width: 1,
                            height: 1,
                          },
                          textShadowRadius: 0,
                          fontFamily: 'Knockout',
                          fontSize: 18,
                          marginLeft: 8,
                        }}
                      >
                        {player[currency.name.toLowerCase()] ?? 0}{' '}
                        {currency.name}
                      </Text>
                    </View>
                  );
                })}
            </View>
            {/* Countdown Timer */}
            {rotation?.next_rotation_at && (
              <StoreCountdown nextRotationAt={rotation.next_rotation_at} />
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
              <StoreBubbles />
              {/* Animated shark */}
              <AnimatedShark imageUrl={catalog?.promotion_image_url} />
            </View>
            {items && items?.length > 0 && (
              <View
                style={{
                  borderTopWidth: 5,
                  borderTopColor: '#fff',
                  flex: 1,
                }}
              >
                <FlashList
                  data={items as ReadonlyArray<ItemType[]>}
                  contentContainerStyle={{
                    padding: 8,
                    backgroundColor: 'rgba(255, 255, 255, .6)',
                  }}
                  numColumns={3}
                  renderItem={({ item }) => (
                    <View style={{ padding: 8, flex: 1 }}>
                      <Item item={item as ItemType} onPurchase={purchaseItem} />
                    </View>
                  )}
                  estimatedItemSize={80}
                  keyExtractor={(item) => item.id}
                  onEndReached={() => {
                    setPage((prevState) => prevState + 1);
                  }}
                />
              </View>
            )}
          </SafeAreaView>
        </ImageBackground>
      )}
    </>
  );
}
