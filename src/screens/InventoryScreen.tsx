import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRoute } from '@react-navigation/native';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useAsyncEffect, useWillUnmount } from 'rooks';
import getItemTypes from '../api/endpoints/item-types/item-types';
import getItems from '../api/endpoints/me/inventory/items';
import updateInventory from '../api/endpoints/me/inventory/update-inventory';
import Item from '../components/Item';
import HapticPatterns from '../helpers/hapticPatterns';
import Loading from '../components/Loading';
import Playercard from '../components/Playercard';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import { MusicContext } from '../context/MusicProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { ItemType } from '../models/item-type';
import { ItemTypeType } from '../models/item-type-type';
import { wardrobeCategoryLabel } from '../helpers/wardrobe';

export default function InventoryScreen() {
  const route = useRoute();
  const requestedItemTypeId = (route.params as { itemTypeId?: number } | undefined)?.itemTypeId;
  const [itemTypes, setItemTypes] = useState<ItemTypeType[]>([]);
  const [currentItemType, setCurrentItemType] = useState<ItemTypeType>();
  const [items, setItems] = useState<ItemType[]>([]);
  const { player, setPlayer } = useContext(AuthContext);
  const [loading, setLoading] = useState<boolean>(true);
  const [itemsLoading, setItemsLoading] = useState<boolean>(true);
  const { refreshPlayer } = useContext(AuthContext);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeLoadAttempt, setTypeLoadAttempt] = useState(0);
  const [itemLoadAttempt, setItemLoadAttempt] = useState(0);
  const requestGeneration = useRef(0);
  const outfitMutation = useRef(false);
  const outfitNeedsRefreshRef = useRef(false);
  const [outfitNeedsRefresh, setOutfitNeedsRefresh] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);
  const { playSound } = useContext(SoundEffectContext);
  const { overrideTrack, restoreMusic } = useContext(MusicContext);

  const changeOutfit = async (item: ItemType, fromAvatar = false) => {
    if (outfitMutation.current || outfitNeedsRefreshRef.current) return;
    outfitMutation.current = true;
    setPendingItemId(item.id);
    playSound(fromAvatar
      ? require('../../assets/sounds/whoosh.mp3')
      : require('../../assets/sounds/inventory_item_tap.mp3'));
    if (fromAvatar) HapticPatterns.buttonTap();
    try {
      const outfit = await updateInventory(item);
      // The server answers with the saved outfit: dress the shark now, then
      // refresh the rest of the profile quietly.
      if (player) setPlayer({ ...player, inventory: outfit });
      refreshPlayer().catch(() => undefined);
    } catch {
      // The server may have changed the outfit even if its response was lost.
      // Block every wardrobe control until a profile read confirms its state.
      outfitNeedsRefreshRef.current = true;
      setOutfitNeedsRefresh(true);
    } finally {
      setPendingItemId(null);
      outfitMutation.current = false;
    }
  };

  // Play inventory music on mount, restore on unmount
  useAsyncEffect(async () => {
    await overrideTrack(require('../../assets/music/inventory.mp3'));
  }, []);
  useWillUnmount(() => {
    restoreMusic();
  });

  useAsyncEffect(async () => {
    try {
      const response = await getItemTypes();
      setItemTypes(response);
      setCurrentItemType(response.find((itemType) => itemType.id === requestedItemTypeId) ?? response[0]);
      setLoading(false);
      if (response.length === 0) setLoadError('No wardrobe categories are available yet.');
    } catch {
      setLoading(false);
      setLoadError('Could not load your wardrobe. Try again.');
    }
  }, [typeLoadAttempt]);

  useEffect(() => {
    if (!currentItemType) return;
    let cancelled = false;
    const generation = requestGeneration.current;
    setItemsLoading(true);
    setLoadError(null);
    getItems(currentItemType.id, page)
      .then(({ items: response, hasMore: nextPageAvailable }) => {
        if (cancelled || generation !== requestGeneration.current) return;
        setItems((previous) => page === 1 ? response : [
          ...previous,
          ...response.filter((item) => !previous.some((owned) => owned.id === item.id)),
        ]);
        setHasMore(nextPageAvailable);
      })
      .catch(() => {
        if (!cancelled && generation === requestGeneration.current) {
          setLoadError('Could not load these items. Try again.');
        }
      })
      .finally(() => {
        if (!cancelled && generation === requestGeneration.current) setItemsLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentItemType?.id, page, itemLoadAttempt]);

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Inventory</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      {loading && <Loading />}
      {!loading && !currentItemType && loadError && (
        <Pressable onPress={() => { setLoading(true); setLoadError(null); setTypeLoadAttempt((value) => value + 1); }} style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ color: 'white', textAlign: 'center' }}>{loadError} Tap to retry.</Text>
        </Pressable>
      )}
      {!loading && !player?.inventory && currentItemType && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reload your shark"
          onPress={() => { refreshPlayer().catch(() => undefined); }}
          style={{ padding: 24, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontFamily: 'Knockout', fontSize: 18 }}>
            Your shark is still getting dressed. Tap to reload.
          </Text>
        </Pressable>
      )}
      {!loading && player?.inventory && itemTypes && currentItemType && (
        <>
          <ImageBackground
            source={require('../../assets/images/screens/park/background-new.png')}
            resizeMode="stretch"
            style={{
              marginTop: -8,
              height: 400,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Playercard
              inventory={player.inventory}
              onItemTap={(item) => changeOutfit(item, true)}
              style={{
                position: 'absolute',
                width: Dimensions.get('window').width,
                height: 380,
              }}
            />
            {outfitNeedsRefresh && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh your shark outfit status"
                onPress={async () => {
                  if (outfitMutation.current) return;
                  outfitMutation.current = true;
                  try {
                    await refreshPlayer();
                    outfitNeedsRefreshRef.current = false;
                    setOutfitNeedsRefresh(false);
                  } catch {
                    // Keep the same recovery action available while offline.
                  } finally {
                    outfitMutation.current = false;
                  }
                }}
                style={{ position: 'absolute', top: 12, left: 20, right: 20,
                  paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12,
                  borderWidth: 2, borderColor: '#fff', backgroundColor: '#164f82', zIndex: 30 }}
              >
                <Text style={{ color: '#fff', fontFamily: 'Knockout', fontSize: 16, textAlign: 'center' }}>
                  Couldn't confirm your outfit. Tap to refresh.
                </Text>
              </Pressable>
            )}
            <ScrollView
              style={{
                position: 'absolute',
                width: '100%',
                bottom: 0,
                borderColor: 'white',
                borderTopWidth: 3,
                borderBottomWidth: 3,
              }}
              horizontal={true}
            >
              {itemTypes.map((itemType, key) => {
                return (
                  <View
                    key={itemType.id}
                    style={{
                      paddingLeft: 8,
                      paddingRight: 8,
                      borderColor: 'white',
                      borderRightWidth: key === itemTypes.length - 1 ? 0 : 1,
                      backgroundColor:
                        itemType.id === currentItemType?.id
                          ? 'rgba(255, 255, 255, .9)'
                          : 'rgba(255, 255, 255, .6)',
                    }}
                  >
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityLabel={wardrobeCategoryLabel(itemType)}
                      accessibilityState={{ selected: itemType.id === currentItemType?.id }}
                      style={{ alignItems: 'center', justifyContent: 'center', minWidth: 60, paddingVertical: 4 }}
                      onPress={async () => {
                        if (itemType.id === currentItemType.id) {
                          return;
                        }

                        playSound(
                          require('../../assets/sounds/inventory_item_type_tap.mp3')
                        );

                        setItemsLoading(true);
                        requestGeneration.current += 1;
                        setCurrentItemType(itemType);
                        setItems([]);
                        setHasMore(false);
                        setLoadError(null);
                        setPage(1);
                      }}
                    >
                      {!!itemType.image_url && (
                        <Image
                          style={{
                            width: 44,
                            height: 44,
                          }}
                          source={itemType.image_url}
                          contentFit="contain"
                        />
                      )}
                      <Text
                        style={{
                          color: '#15395B',
                          fontFamily: 'Knockout',
                          fontSize: itemType.image_url ? 13 : 18,
                          paddingVertical: itemType.image_url ? 0 : 12,
                        }}
                      >
                        {wardrobeCategoryLabel(itemType)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </ImageBackground>
          <ImageBackground
            source={require('../../assets/images/shark_background.png')}
            resizeMode="cover"
            style={{
              width: '100%',
              flex: 1,
            }}
          >
            <View
              style={{
                flex: 1,
                padding: 4,
              }}
            >
              {itemsLoading && items.length === 0 && (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ActivityIndicator size="large" color="rgba(0, 0, 0, .5)" />
                </View>
              )}
              {!itemsLoading && loadError && items.length === 0 && (
                <Pressable onPress={() => { setItemsLoading(true); setItemLoadAttempt((value) => value + 1); }} style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#15395B', textAlign: 'center', fontWeight: '700' }}>{loadError} Tap to retry.</Text>
                </Pressable>
              )}
              {items.length > 0 || (!itemsLoading && !loadError) ? (
                <FlashList
                  data={items}
                  ListEmptyComponent={<Text style={{ color: '#15395B', textAlign: 'center', padding: 20 }}>No items in this wardrobe category yet.</Text>}
                  ListFooterComponent={items.length > 0 && itemsLoading ? (
                    <ActivityIndicator size="small" color="#15395B" style={{ paddingVertical: 16 }} />
                  ) : items.length > 0 && loadError ? (
                    <Pressable onPress={() => { setItemsLoading(true); setItemLoadAttempt((value) => value + 1); }} style={{ padding: 16, alignItems: 'center' }}>
                      <Text style={{ color: '#15395B', fontWeight: '700' }}>More items could not load. Tap to retry.</Text>
                    </Pressable>
                  ) : null}
                  renderItem={({ item }) => <Item item={item}
                    onToggle={changeOutfit}
                    disabled={outfitNeedsRefresh || pendingItemId !== null}
                    saving={pendingItemId === item.id} />}
                  estimatedItemSize={150}
                  keyExtractor={(item) => item.id.toString()}
                  numColumns={3}
                  onEndReached={() => {
                    if (!hasMore || itemsLoading || loadError) return;
                    setItemsLoading(true);
                    setPage((prevState) => prevState + 1);
                  }}
                />
              ) : null}
            </View>
          </ImageBackground>
        </>
      )}
    </Wrapper>
  );
}
