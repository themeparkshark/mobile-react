import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import markItemsSeen from '../api/endpoints/me/inventory/seen';
import Item, { COMPACT_HEIGHT } from '../components/Item';
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
import { inventoryPinTarget, isRequiredSlot, pinnedItemIndex, requiredSlotCopy, slotForItem, wardrobeCategoryLabel } from '../helpers/wardrobe';
import { SLOT_KEYS } from '../models/look-type';
import useLook from '../hooks/useLook';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { LookNotice } from '../helpers/lookQueue';
import { explainMemberLock } from '../components/MemberLookHost';
import { MEMBER_WEAR_COPY, memberWearLocked, refreshMemberLook, useMemberWearLock } from '../services/memberLook';

/** What the player reads when a save does not go through (dressing-room.md 7.10). */
export function lookNoticeCopy(notice: LookNotice): string {
  switch (notice.kind) {
    case 'other_device': return 'Updated from your other device.';
    case 'not_owned': return "That item isn't in your closet.";
    case 'save_failed': return "Couldn't save. Your shark is back to your last look.";
    case 'member_locked': return MEMBER_WEAR_COPY;
  }
}

/** NEW clears once a card has been at least 60% on screen for 800ms (8.6). */
const SEEN_VIEWABILITY = { itemVisiblePercentThreshold: 60, minimumViewTime: 800 };
const SEEN_FLUSH_MS = 3000;

export default function InventoryScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const params = route.params as { itemTypeId?: number; highlightItemId?: number; focusItemId?: number } | undefined;
  const requestedItemTypeId = params?.itemTypeId;
  // A deep link ("See it in Inventory" sends highlightItemId, WEAR IT sends
  // focusItemId) pins its item first and pulses it once; captured at open so
  // a back-and-forward never replays it.
  const pinItemId = useRef(inventoryPinTarget(params)).current;
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const listRef = useRef<FlashList<ItemType>>(null);
  const [itemTypes, setItemTypes] = useState<ItemTypeType[]>([]);
  const [currentItemType, setCurrentItemType] = useState<ItemTypeType>();
  const [items, setItems] = useState<ItemType[]>([]);
  const { player } = useContext(AuthContext);
  const [loading, setLoading] = useState<boolean>(true);
  const [itemsLoading, setItemsLoading] = useState<boolean>(true);
  const { refreshPlayer } = useContext(AuthContext);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeLoadAttempt, setTypeLoadAttempt] = useState(0);
  const [itemLoadAttempt, setItemLoadAttempt] = useState(0);
  const requestGeneration = useRef(0);
  const { playSound } = useContext(SoundEffectContext);
  const { overrideTrack, restoreMusic } = useContext(MusicContext);
  const { height: windowHeight } = Dimensions.get('window');
  const compact = windowHeight < COMPACT_HEIGHT;
  const reduceMotion = useReducedGameMotion();
  // The look on the stage: saved plus every tap still saving. Taps apply in
  // the same frame and nothing ever locks (dressing-room.md 13.3).
  const look = useLook();
  const worn = look.inventory;
  // Member pieces: owned forever, worn only while a member (secret-shop/DESIGN.md 4.3).
  const memberLockOn = useMemberWearLock();
  const isMember = player?.is_subscribed === true;
  useEffect(() => { void refreshMemberLook(); }, [isMember]);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, ms: number) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastOpacity.setValue(0);
    Animated.timing(toastOpacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 180, useNativeDriver: true })
        .start(() => setToast(null));
    }, ms);
  }, [toastOpacity]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  useEffect(() => {
    if (!look.notice) return;
    if (look.notice.kind !== 'other_device') {
      playSound(require('../../assets/sounds/nope.mp3'));
      HapticPatterns.warning();
    }
    if (look.notice.kind === 'member_locked') {
      // The server said no (membership ended on another screen): explain, never a dead end.
      void refreshMemberLook();
      void explainMemberLock();
    } else {
      showToast(lookNoticeCopy(look.notice), look.notice.kind === 'save_failed' ? 2500 : 2000);
    }
    look.clearNotice();
  }, [look.notice]);

  // Worn items on the shark arrive without item_type, so a tap on the shark
  // passes its slot; otherwise find the slot already holding the item.
  const changeOutfit = (item: ItemType, fromAvatar = false, tappedSlot?: string) => {
    const slot = slotForItem(item)
      ?? SLOT_KEYS.find((key) => key === tappedSlot)
      ?? SLOT_KEYS.find((key) => (worn?.[key] as ItemType | null | undefined)?.id === item.id)
      ?? null;
    if (!slot || !worn) return;
    const isWorn = (worn[slot] as ItemType | null | undefined)?.id === item.id;
    if (isWorn && isRequiredSlot(slot)) {
      // The shark always keeps a skin and a backdrop.
      playSound(require('../../assets/sounds/nope.mp3'));
      showToast(requiredSlotCopy(slot), 1200);
      return;
    }
    if (!isWorn && memberWearLocked(item, isMember, memberLockOn)) {
      // Still in the closet; taking one off always works, putting one on needs membership.
      playSound(require('../../assets/sounds/nope.mp3'));
      void explainMemberLock();
      return;
    }
    playSound(fromAvatar
      ? require('../../assets/sounds/whoosh.mp3')
      : require('../../assets/sounds/inventory_item_tap.mp3'));
    HapticPatterns.selection();
    look.set(slot, isWorn ? null : item);
  };

  // Owned cards that have been on screen long enough, sent in small batches.
  const seenQueue = useRef(new Set<number>());
  const reportedSeen = useRef(new Set<number>());
  const flushSeen = useCallback(() => {
    const ids = [...seenQueue.current].slice(0, 60);
    if (ids.length === 0) return;
    ids.forEach((id) => { seenQueue.current.delete(id); reportedSeen.current.add(id); });
    markItemsSeen(ids).catch(() => ids.forEach((id) => reportedSeen.current.delete(id)));
  }, []);
  useEffect(() => {
    const timer = setInterval(flushSeen, SEEN_FLUSH_MS);
    return () => { clearInterval(timer); flushSeen(); };
  }, [flushSeen]);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: ItemType }[] }) => {
    viewableItems.forEach(({ item }) => {
      if (item?.seen === false && !reportedSeen.current.has(item.id)) seenQueue.current.add(item.id);
    });
  }).current;

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
    const pin = pinItemId && currentItemType.id === requestedItemTypeId ? pinItemId : undefined;
    getItems(currentItemType.id, page, pin)
      .then(({ items: response, hasMore: nextPageAvailable }) => {
        if (cancelled || generation !== requestGeneration.current) return;
        setItems((previous) => page === 1 ? response : [
          ...previous,
          ...response.filter((item) => !previous.some((owned) => owned.id === item.id)),
        ]);
        setHasMore(nextPageAvailable);
        const pinnedAt = pinnedItemIndex(page, pin, response);
        if (pin && pinnedAt >= 0 && highlightedId === null) {
          setHighlightedId(pin);
          if (pinnedAt === 0) {
            listRef.current?.scrollToOffset({ offset: 0, animated: false });
          } else {
            requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: pinnedAt, animated: false }));
          }
          HapticPatterns.selection();
          (navigation as unknown as { setParams?: (value: object) => void }).setParams?.({ highlightItemId: undefined, focusItemId: undefined });
        }
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
      {!loading && worn && itemTypes && currentItemType && (
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
              inventory={worn}
              onItemTap={(item, slot) => changeOutfit(item, true, slot)}
              popLayers={!reduceMotion}
              style={{
                position: 'absolute',
                width: Dimensions.get('window').width,
                height: 460,
                marginTop: -50,
              }}
            />
            {!!toast && (
              <Animated.View
                pointerEvents="none"
                accessibilityLiveRegion="polite"
                style={{ position: 'absolute', top: 12, left: 20, right: 20, alignItems: 'center', zIndex: 30,
                  opacity: toastOpacity }}
              >
                <View style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 14,
                  borderWidth: 2, borderColor: '#fff', backgroundColor: '#164f82' }}>
                  <Text style={{ color: '#fff', fontFamily: 'Knockout', fontSize: 16, textAlign: 'center' }}>
                    {toast}
                  </Text>
                </View>
              </Animated.View>
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
                  ref={listRef}
                  data={items}
                  extraData={worn}
                  viewabilityConfig={SEEN_VIEWABILITY}
                  onViewableItemsChanged={onViewableItemsChanged}
                  ListEmptyComponent={<Text style={{ color: '#15395B', textAlign: 'center', padding: 20 }}>No items in this wardrobe category yet.</Text>}
                  ListFooterComponent={items.length > 0 && itemsLoading ? (
                    <ActivityIndicator size="small" color="#15395B" style={{ paddingVertical: 16 }} />
                  ) : items.length > 0 && loadError ? (
                    <Pressable onPress={() => { setItemsLoading(true); setItemLoadAttempt((value) => value + 1); }} style={{ padding: 16, alignItems: 'center' }}>
                      <Text style={{ color: '#15395B', fontWeight: '700' }}>More items could not load. Tap to retry.</Text>
                    </Pressable>
                  ) : null}
                  renderItem={({ item }) => <Item item={item}
                    inventory={worn}
                    highlighted={highlightedId === item.id}
                    memberLocked={memberWearLocked(item, isMember, memberLockOn)}
                    onToggle={changeOutfit} />}
                  estimatedItemSize={compact ? 116 : 150}
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
