import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '../helpers/haptics';
import HapticPatterns from '../helpers/hapticPatterns';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import Wrapper from '../components/Wrapper';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Button from '../components/Button';
import Playercard from '../components/Playercard';
import GiftPrepVariantPanel from './GiftPrepVariantPanel';
import type { InventoryType } from '../models/inventory-type';
import config from '../config';
import { Modal } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import prepItemImage from '../helpers/prepItemImages';
import * as RootNavigation from '../RootNavigation';
import GameIcon from '../ui/GameIcon';
import type { GiftReceipt } from '../api/endpoints/me/prep-variant-gifts';
import getPrepItemSets, {
  getPrepItemSet,
  claimSetRewards,
  claimStarterRewards,
  equipSetTitle,
  exchangeSetDuplicates,
  focusPrepItemSet,
  clearPrepItemSetFocus,
  PrepItemSetListItem,
  PrepItemSetItem,
  PrepItemSetDetailResponse,
} from '../api/endpoints/me/prep-item-sets';

// Churro image mapping - require all images statically
const CHURRO_IMAGES: Record<string, any> = {
  churro_01: require('../../assets/images/prep-items/churros/churro_01.png'),
  churro_02: require('../../assets/images/prep-items/churros/churro_02.png'),
  churro_03: require('../../assets/images/prep-items/churros/churro_03.png'),
  churro_04: require('../../assets/images/prep-items/churros/churro_04.png'),
  churro_05: require('../../assets/images/prep-items/churros/churro_05.png'),
  churro_06: require('../../assets/images/prep-items/churros/churro_06.png'),
  churro_07: require('../../assets/images/prep-items/churros/churro_07.png'),
  churro_08: require('../../assets/images/prep-items/churros/churro_08.png'),
  churro_09: require('../../assets/images/prep-items/churros/churro_09.png'),
  churro_10: require('../../assets/images/prep-items/churros/churro_10.png'),
  churro_11: require('../../assets/images/prep-items/churros/churro_11.png'),
  churro_12: require('../../assets/images/prep-items/churros/churro_12.png'),
  churro_13: require('../../assets/images/prep-items/churros/churro_13.png'),
  churro_14: require('../../assets/images/prep-items/churros/churro_14.png'),
  churro_15: require('../../assets/images/prep-items/churros/churro_15.png'),
  churro_16: require('../../assets/images/prep-items/churros/churro_16.png'),
  churro_17: require('../../assets/images/prep-items/churros/churro_17.png'),
  churro_18: require('../../assets/images/prep-items/churros/churro_18.png'),
  churro_19: require('../../assets/images/prep-items/churros/churro_19.png'),
  churro_20: require('../../assets/images/prep-items/churros/churro_20.png'),
  churro_21: require('../../assets/images/prep-items/churros/churro_21.png'),
  churro_22: require('../../assets/images/prep-items/churros/churro_22.png'),
  churro_23: require('../../assets/images/prep-items/churros/churro_23.png'),
  churro_24: require('../../assets/images/prep-items/churros/churro_24.png'),
  churro_25: require('../../assets/images/prep-items/churros/churro_25.png'),
  churro_26: require('../../assets/images/prep-items/churros/churro_26.png'),
  churro_27: require('../../assets/images/prep-items/churros/churro_27.png'),
  churro_28: require('../../assets/images/prep-items/churros/churro_28.png'),
  churro_29: require('../../assets/images/prep-items/churros/churro_29.png'),
  churro_30: require('../../assets/images/prep-items/churros/churro_30.png'),
  churro_31: require('../../assets/images/prep-items/churros/churro_31.png'),
  churro_32: require('../../assets/images/prep-items/churros/churro_32.png'),
  churro_33: require('../../assets/images/prep-items/churros/churro_33.png'),
  churro_34: require('../../assets/images/prep-items/churros/churro_34.png'),
  churro_35: require('../../assets/images/prep-items/churros/churro_35.png'),
  churro_36: require('../../assets/images/prep-items/churros/churro_36.png'),
  churro_37: require('../../assets/images/prep-items/churros/churro_37.png'),
  churro_38: require('../../assets/images/prep-items/churros/churro_38.png'),
  churro_39: require('../../assets/images/prep-items/churros/churro_39.png'),
  churro_40: require('../../assets/images/prep-items/churros/churro_40.png'),
};

// Helper to get churro image
const getChurroImage = (variantSlug: string) => {
  return CHURRO_IMAGES[variantSlug] || null;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_SIZE = (SCREEN_WIDTH - 56) / 4; // 4 items per row with padding

// Rarity configuration: modern, softer palette
const RARITY_CONFIG = {
  1: { name: 'common', label: 'Common', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.08)', glowColor: 'rgba(34, 197, 94, 0.2)' },
  2: { name: 'uncommon', label: 'Uncommon', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.08)', glowColor: 'rgba(59, 130, 246, 0.2)' },
  3: { name: 'rare', label: 'Rare', color: '#a855f7', bgColor: 'rgba(168, 85, 247, 0.08)', glowColor: 'rgba(168, 85, 247, 0.2)' },
  4: { name: 'epic', label: 'Epic', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.08)', glowColor: 'rgba(236, 72, 153, 0.2)' },
  5: { name: 'legendary', label: 'Legendary', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)', glowColor: 'rgba(245, 158, 11, 0.3)' },
};

// Animated collection item card
function CollectionCard({
  item,
  index,
  onPress,
}: {
  item: PrepItemSetItem;
  index: number;
  onPress: (item: PrepItemSetItem) => void;
}) {
  const rarity = RARITY_CONFIG[item.rarity as keyof typeof RARITY_CONFIG] || RARITY_CONFIG[1];
  const isCollected = item.is_collected;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      delay: index * 40,
      useNativeDriver: true,
      speed: 14,
      bounciness: 6,
    }).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(pressAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <Animated.View
      style={{
        width: ITEM_SIZE,
        height: ITEM_SIZE + 20,
        transform: [
          { scale: Animated.multiply(scaleAnim, pressAnim) },
        ],
        opacity: scaleAnim,
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => {
          HapticPatterns.buttonTap();
          onPress(item);
        }}
        style={{ flex: 1 }}
      >
        <View
          style={[
            styles.collectionItem,
            {
              borderColor: isCollected ? rarity.color : 'rgba(0,0,0,0.06)',
              borderWidth: isCollected ? 2 : 1,
              backgroundColor: isCollected
                ? 'white'
                : '#f0f0f4',
            },
          ]}
        >
          {/* Rarity glow for collected items */}
          {isCollected && (
            <View
              style={[
                styles.itemGlow,
                { backgroundColor: rarity.color, opacity: 0.15 },
              ]}
            />
          )}

          {/* Item Image */}
          <View style={styles.itemImageContainer}>
            {(() => {
              const localImage = prepItemImage(item.variant_slug)
                || (item.variant_slug ? getChurroImage(item.variant_slug) : null);

              if (localImage) {
                return (
                  <Image
                    source={localImage}
                    style={[
                      styles.itemImage,
                      !isCollected && styles.itemImageLocked,
                    ]}
                    contentFit="contain"
                  />
                );
              } else if (item.icon_url) {
                return (
                  <Image
                    source={{ uri: item.icon_url }}
                    style={[
                      styles.itemImage,
                      !isCollected && styles.itemImageLocked,
                    ]}
                    contentFit="contain"
                  />
                );
              } else {
                return (
                  <View
                    style={[
                      styles.itemPlaceholder,
                      { borderColor: 'rgba(0,0,0,0.1)' },
                    ]}
                  >
                    {!isCollected && (
                      <GameIcon name="lock" size={18 + 4} style={{ opacity: 0.35 }} />
                    )}
                  </View>
                );
              }
            })()}
          </View>

          {/* Lock overlay for uncollected */}
          {!isCollected && (
            <View style={styles.lockOverlay}>
              <GameIcon name="lock" size={16 + 4} style={{ opacity: 0.35 }} />
            </View>
          )}

          {/* Collected count badge */}
          {isCollected && (
            <View
              style={[
                styles.collectedBadge,
                { backgroundColor: rarity.color },
              ]}
            >
              <Text style={styles.collectedBadgeText}>
                {item.quantity_collected}
              </Text>
            </View>
          )}

          {/* Rarity indicator strip at bottom */}
          <View
            style={[
              styles.rarityStrip,
              { backgroundColor: rarity.color },
            ]}
          />
        </View>

        {/* Item name below card */}
        <Text
          style={[
            styles.itemName,
            { color: isCollected ? '#05346e' : 'rgba(5,52,110,0.3)' },
          ]}
          numberOfLines={1}
        >
          {isCollected ? item.name : '???'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Circular progress ring component
function ProgressRing({
  progress,
  size,
  strokeWidth,
  color,
}: {
  progress: number;
  size: number;
  strokeWidth: number;
  color: string;
}) {
  // Since SVG isn't available, use a simplified ring with overlay
  const angle = progress * 360;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: strokeWidth,
        borderColor: 'rgba(255,255,255,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Progress arc approximation using border */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: 'transparent',
          borderTopColor: color,
          borderRightColor: progress > 0.25 ? color : 'transparent',
          borderBottomColor: progress > 0.5 ? color : 'transparent',
          borderLeftColor: progress > 0.75 ? color : 'transparent',
          transform: [{ rotate: '-45deg' }],
        }}
      />
      <Text
        style={{
          fontFamily: 'Shark',
          fontSize: size * 0.28,
          color: '#fff',
          textAlign: 'center',
        }}
      >
        {Math.round(progress * 100)}%
      </Text>
    </View>
  );
}

export default function SetCollectionScreen({ previewSets, previewDetails }: {
  previewSets?: PrepItemSetListItem[];
  previewDetails?: Record<string, PrepItemSetDetailResponse['data']>;
} = {}) {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const { player, refreshPlayer } = useContext(AuthContext);
  const { location } = useContext(LocationContext);
  const locationRef = useRef(location);
  locationRef.current = location;

  const [sets, setSets] = useState<PrepItemSetListItem[]>([]);
  const currentSets = sets.filter(set => set.availability === 'current' || (set.availability == null && set.is_in_rotation !== false));
  const upcomingSets = sets.filter(set => set.availability === 'upcoming');
  const archivedSets = sets.filter(set => set.availability === 'archived' || (set.availability == null && set.is_in_rotation === false));
  const [selectedSetSlug, setSelectedSetSlug] = useState<string | null>(
    (route.params as any)?.slug || null
  );
  const [selectedSetData, setSelectedSetData] = useState<{
    set: any;
    progress: any;
    items: PrepItemSetItem[];
    items_by_rarity: any;
    completion_rewards: any;
    discovery?: { found_in_world: number; legendary_found_in_world: number; legendary_total: number };
    recent_gifts?: PrepItemSetDetailResponse['data']['recent_gifts'];
  } | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimingStarter, setClaimingStarter] = useState(false);
  const [selectedWearableId, setSelectedWearableId] = useState<number | null>(null);
  const [equippingTitle, setEquippingTitle] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [focusPending, setFocusPending] = useState(false);
  const [setsError, setSetsError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<PrepItemSetItem | null>(
    null
  );
  const [giftItem, setGiftItem] = useState<PrepItemSetItem | null>(null);
  const [giftNotice, setGiftNotice] = useState<string | null>(null);
  const [showMissingChoices, setShowMissingChoices] = useState(false);
  const detailScrollRef = useRef<ScrollView>(null);
  const tripPrepTopRef = useRef(0);

  // A direct link opens the detail immediately; only taps from the list slide it in.
  const slideAnim = useRef(new Animated.Value((route.params as any)?.slug ? 1 : 0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const headerFadeAnim = useRef(new Animated.Value(0)).current;

  // Show only server-backed collection progress.
  const loadSets = useCallback(async () => {
    try {
      const data = previewSets ?? await getPrepItemSets(locationRef.current);
      setSets(data);
      setSetsError(false);
    } catch (error) {
      setSetsError(true);
    } finally {
      setLoading(false);
    }
  }, [previewSets]);

  const loadSetDetail = useCallback(
    async (slug: string) => {
      try {
        const data = previewDetails?.[slug] ?? await getPrepItemSet(slug, locationRef.current);
        setSelectedSetData(data);
        setDetailError(false);

        Animated.parallel([
          Animated.timing(progressAnim, {
            toValue: data.progress.percentage / 100,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(headerFadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start();
      } catch (error) {
        setDetailError(true);
      }
    },
    [progressAnim, headerFadeAnim, previewDetails]
  );

  // Initial load
  useEffect(() => {
    loadSets();
  }, [loadSets]);

  // Load detail when set is selected
  useEffect(() => {
    if (selectedSetSlug) {
      loadSetDetail(selectedSetSlug);
    }
  }, [selectedSetSlug, loadSetDetail]);

  // Conditions can change while the collector is browsing a set. Keep the
  // live rain/night status current without polling an off-screen route.
  useEffect(() => {
    if (!isFocused || previewSets) return;
    const interval = setInterval(() => {
      void loadSets();
      if (selectedSetSlug) void loadSetDetail(selectedSetSlug);
    }, 60_000);
    return () => clearInterval(interval);
  }, [isFocused, previewSets, loadSets, loadSetDetail, selectedSetSlug]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    HapticPatterns.buttonTap();
    await loadSets();
    if (selectedSetSlug) {
      await loadSetDetail(selectedSetSlug);
    }
    setRefreshing(false);
  }, [loadSets, loadSetDetail, selectedSetSlug]);

  const toggleFocus = useCallback(async () => {
    if (!selectedSetSlug || !selectedSetData || focusPending) return;
    const desired = !Boolean(selectedSetData.set.is_focused);
    setFocusPending(true);
    setActionError(null);
    try {
      if (previewSets) {
        setSets(current => current.map(set => ({ ...set,
          is_focused: desired && set.slug === selectedSetSlug })));
        setSelectedSetData(current => current ? {
          ...current, set: { ...current.set, is_focused: desired },
        } : current);
      } else {
        if (desired) await focusPrepItemSet(selectedSetSlug);
        else await clearPrepItemSetFocus();
        await Promise.all([loadSets(), loadSetDetail(selectedSetSlug)]);
      }
      HapticPatterns.buttonTap();
    } catch {
      // A lost response can follow a saved preference. Read it back first.
      if (!previewSets) {
        try {
          const latest = await getPrepItemSet(selectedSetSlug, locationRef.current);
          setSelectedSetData(latest);
          await loadSets();
          if (Boolean(latest.set.is_focused) === desired) return;
        } catch { /* Keep the current selection visible. */ }
      }
      setActionError('Could not change your home hunt. Try again.');
    } finally {
      setFocusPending(false);
    }
  }, [selectedSetSlug, selectedSetData, focusPending, previewSets, loadSets, loadSetDetail]);

  // Open set detail
  const openSet = useCallback(
    (slug: string) => {
      HapticPatterns.buttonTap();
      setSelectedSetSlug(slug);
      setSelectedSetData(null);
      setSelectedWearableId(null);
      setShowMissingChoices(false);
      setDetailError(false);
      setActionError(null);
      setGiftNotice(null);
      progressAnim.setValue(0);
      headerFadeAnim.setValue(0);

      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    },
    [slideAnim, progressAnim, headerFadeAnim]
  );

  // Close set detail
  const closeSet = useCallback(() => {
    HapticPatterns.buttonTap();

    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setSelectedSetSlug(null);
      setSelectedSetData(null);
      setShowMissingChoices(false);
    });
  }, [slideAnim]);

  // Claim completion rewards
  const handleClaimRewards = useCallback(async () => {
    if (!selectedSetSlug || claiming || previewSets) return;

    setClaiming(true);
    HapticPatterns.collect('legendary');

    try {
      await claimSetRewards(selectedSetSlug);
      setActionError(null);
      await refreshPlayer();
      await loadSetDetail(selectedSetSlug);
      await loadSets();
      HapticPatterns.achievement();
    } catch {
      try {
        const latest = await getPrepItemSet(selectedSetSlug, locationRef.current);
        setSelectedSetData(latest);
        progressAnim.setValue(latest.progress.percentage / 100);
        await loadSets();
        if (latest.progress.rewards_claimed) {
          await refreshPlayer().catch(() => undefined);
          setActionError(null);
          HapticPatterns.achievement();
        } else {
          setActionError('The full-set reward was not claimed. Try again.');
          HapticPatterns.error();
        }
      } catch {
        setActionError('Could not confirm this claim. Refresh the collection before trying again.');
        HapticPatterns.error();
      }
    } finally {
      setClaiming(false);
    }
  }, [selectedSetSlug, claiming, refreshPlayer, loadSetDetail, loadSets, progressAnim]);

  const handleClaimStarter = useCallback(async () => {
    if (!selectedSetSlug || claimingStarter || previewSets) return;
    const choices = selectedSetData?.progress?.starter_milestone?.wearable_choices ?? [];
    if (choices.some((item: { owned: boolean }) => !item.owned) &&
        !choices.some((item: { id: number; owned: boolean }) => item.id === selectedWearableId && !item.owned)) {
      setActionError('Choose a shark item to earn with this set.');
      return;
    }
    setClaimingStarter(true);
    try {
      await claimStarterRewards(selectedSetSlug, selectedWearableId ?? undefined);
      setActionError(null);
      await refreshPlayer();
      await loadSetDetail(selectedSetSlug);
      await loadSets();
      HapticPatterns.achievement();
    } catch {
      try {
        const latest = await getPrepItemSet(selectedSetSlug, locationRef.current);
        setSelectedSetData(latest);
        if (latest.progress.starter_milestone?.rewards_claimed) {
          await refreshPlayer().catch(() => undefined);
          await loadSets();
          setActionError(null);
          HapticPatterns.achievement();
        } else {
          setActionError('Could not claim your trip-prep reward. Please try again.');
          HapticPatterns.error();
        }
      } catch {
        setActionError('Could not confirm your claim. Refresh this collection before trying again.');
        HapticPatterns.error();
      }
    } finally {
      setClaimingStarter(false);
    }
  }, [selectedSetSlug, selectedSetData, selectedWearableId, claimingStarter, refreshPlayer, loadSetDetail, loadSets]);

  const handleEquipTitle = useCallback(async (tier: 'starter' | 'complete' = 'complete') => {
    const title = tier === 'starter'
      ? selectedSetData?.progress?.starter_milestone?.rewards?.title
      : selectedSetData?.completion_rewards?.title;
    if (!selectedSetSlug || !title || equippingTitle || previewSets) return;
    setEquippingTitle(true);
    try {
      await equipSetTitle(selectedSetSlug, player?.title !== title, tier);
      await refreshPlayer();
      setActionError(null);
      HapticPatterns.achievement();
    } catch {
      setActionError('Could not update your profile title. Please try again.');
      HapticPatterns.error();
    } finally {
      setEquippingTitle(false);
    }
  }, [selectedSetSlug, selectedSetData, equippingTitle, player?.title, refreshPlayer]);

  const handleExchange = useCallback(async () => {
    if (!selectedSetSlug || !selectedItem || exchanging || previewSets) return;
    const targetId = selectedItem.id;
    setExchanging(true);
    try {
      await exchangeSetDuplicates(selectedSetSlug, selectedItem.id);
      setSelectedItem(null);
      setActionError(null);
      await loadSetDetail(selectedSetSlug);
      await loadSets();
      HapticPatterns.achievement();
    } catch {
      try {
        const latest = await getPrepItemSet(selectedSetSlug, locationRef.current);
        setSelectedSetData(latest);
        progressAnim.setValue(latest.progress.percentage / 100);
        await loadSets();
        if (latest.items.some(item => item.id === targetId && item.is_collected)) {
          setSelectedItem(null);
          setActionError(null);
          HapticPatterns.achievement();
        } else {
          setActionError('Exchange was not confirmed. Check the current spare count before trying again.');
          HapticPatterns.error();
        }
      } catch {
        setActionError('Could not confirm this exchange. Refresh the collection before trying again.');
        HapticPatterns.error();
      }
    } finally {
      setExchanging(false);
    }
  }, [selectedSetSlug, selectedItem, exchanging, loadSetDetail, loadSets, progressAnim]);

  const handleGiftSent = useCallback((receipt: GiftReceipt) => {
    setGiftNotice(`You shared a spare with ${receipt.recipient_name}. Their collection book has changed.`);
    HapticPatterns.achievement();
    if (selectedSetSlug) void Promise.allSettled([loadSetDetail(selectedSetSlug), loadSets()]);
  }, [selectedSetSlug, loadSetDetail, loadSets]);

  // Render set card in list
  const renderSetCard = (set: PrepItemSetListItem) => {
    const progressPercent = set.progress_percentage;
    const themeColor = set.theme_config?.color || '#FF9800';
    const isComplete = set.is_complete;

    return (
      <TouchableOpacity
        key={set.id}
        style={styles.setCard}
        onPress={() => openSet(set.slug)}
        activeOpacity={0.85}
      >
        <View
          style={[
            styles.setCardInner,
            isComplete && {
              borderColor: 'rgba(255,215,0,0.5)',
              shadowColor: '#FFD700',
              shadowOpacity: 0.4,
              shadowRadius: 12,
            },
          ]}
        >
          {/* Gradient accent along left edge */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              borderTopLeftRadius: 16,
              borderBottomLeftRadius: 16,
              backgroundColor: themeColor,
            }}
          />

          {/* Set Icon */}
          <View
            style={[
              styles.setIconContainer,
              {
                backgroundColor: themeColor + '25',
                borderColor: themeColor + '50',
              },
            ]}
          >
            {set.icon_url ? (
              <Image
                source={{ uri: set.icon_url }}
                style={styles.setIcon}
                contentFit="contain"
              />
            ) : (
              <Image
                source={set.slug === 'churro_collection'
                  ? CHURRO_IMAGES['churro_01']
                  : set.slug === 'pretzel_collection'
                    ? prepItemImage('pretzel_01')!
                    : set.slug === 'night_lights'
                      ? prepItemImage('flashlight_40')!
                    : set.slug === 'rain_parade'
                      ? prepItemImage('umbrella_40')!
                    : set.slug === 'camera_crew'
                      ? prepItemImage('camera_40')!
                    : require('../../assets/images/screens/player/gift.png')}
                style={styles.setIcon}
                contentFit="contain"
              />
            )}
          </View>

          {/* Set Info */}
          <View style={styles.setInfo}>
            <Text style={styles.setEyebrow}>{set.is_in_rotation === false ? 'SAVED COLLECTION · OFF MAP' : 'HOME COLLECTION'} · {set.total_items} FINDS</Text>
            <Text style={styles.setName}>{set.name}</Text>
            <Text style={styles.setDescription} numberOfLines={1}>
              {set.description}
            </Text>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progressPercent}%`,
                      backgroundColor: isComplete ? '#FFD700' : themeColor,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {set.collected_count}/{set.total_items}
              </Text>
            </View>
            {set.starter_milestone && !set.starter_milestone.rewards_claimed && (
              <Text style={[styles.rewardLabel, { color: set.starter_milestone.is_unlocked ? '#B26A00' : '#64748b', textAlign: 'left', marginTop: 4 }]}>
                {set.starter_milestone.is_unlocked
                  ? 'Trip prep reward ready'
                  : `Trip prep ${set.starter_milestone.collected}/${set.starter_milestone.target} unique finds`}
              </Text>
            )}
            {!!set.recent_gift_count && <Text style={[styles.rewardLabel,
              { color: '#0875C9', textAlign: 'left', marginTop: 4 }]}>
              {set.recent_gift_count} CREW {set.recent_gift_count === 1 ? 'GIFT' : 'GIFTS'} THIS WEEK
            </Text>}
            {set.is_focused && <Text style={[styles.rewardLabel, { color: '#0875c9', textAlign: 'left', marginTop: 4 }]}>YOUR ACTIVE HUNT</Text>}
            {set.is_in_rotation === false && <Text style={styles.archivedLabel}>YOUR FINDS ARE SAVED</Text>}
            {set.is_in_rotation !== false && set.theme === 'weather' && (
              <Text style={[styles.rewardLabel, { color: set.time_gate?.is_spawning_now === true ? '#08739C' : '#536B82', textAlign: 'left', marginTop: 4 }]}>
                {set.time_gate?.is_spawning_now === true ? 'RAIN HUNT ACTIVE'
                  : set.time_gate?.is_spawning_now === false ? 'WAITING FOR RAIN'
                  : 'RAIN STATUS UNAVAILABLE'}
              </Text>
            )}
          </View>

          {/* Completion Badge */}
          {isComplete && (
            <View style={styles.completeBadge}>
              <GameIcon name="star" size={14 + 4} />
            </View>
          )}

          {/* Time Gate Indicator */}
          {set.time_gate && set.time_gate.is_spawning_now === false && (
            <View style={styles.timeGateBadge}>
              <GameIcon name="timer" size={10 + 4} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Render set detail view
  const renderSetDetail = () => {
    if (!selectedSetData) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{detailError ? 'Could not load this collection. Pull to refresh.' : 'Loading...'}</Text>
          {detailError && <TouchableOpacity onPress={() => selectedSetSlug && loadSetDetail(selectedSetSlug)}><Text style={styles.loadingText}>Retry</Text></TouchableOpacity>}
        </View>
      );
    }

    const { set, progress, discovery, items, items_by_rarity, completion_rewards } =
      selectedSetData;
    const themeColor = set.theme_config?.color || '#FF9800';
    const progressFrac = progress.total > 0 ? progress.collected / progress.total : 0;
    const missingItems = items.filter((item) => !item.is_collected);
    const sparesNeeded = Math.max(0, progress.exchange_cost - progress.spare_count);
    const wearableChoices = progress.starter_milestone?.wearable_choices ?? [];
    const visibleWearableId = progress.starter_milestone?.rewards_claimed
      ? progress.starter_milestone.awarded_item_id : selectedWearableId;
    const selectedWearable = wearableChoices.find((item: { id: number }) => item.id === visibleWearableId);
    const wearableSlot = ({ 1: 'head_item', 2: 'face_item', 3: 'neck_item',
      4: 'body_item', 5: 'hand_item', 8: 'pin_item' } as Record<number, keyof InventoryType>)[selectedWearable?.item_type_id];
    const canPreviewWearable = !!selectedWearable && !!wearableSlot &&
      (selectedWearable.item_type_id === 8 ? !!selectedWearable.icon_url : !!selectedWearable.paper_url);
    const previewInventory = canPreviewWearable && !!player?.inventory?.skin_item?.no_eye_url ? {
      ...(player?.inventory ?? {}),
      [wearableSlot]: {
        id: selectedWearable.id,
        name: selectedWearable.name,
        icon_url: selectedWearable.icon_url,
        paper_url: selectedWearable.paper_url,
      },
    } as InventoryType : null;

    return (
      <ScrollView
        ref={detailScrollRef}
        style={styles.detailScroll}
        contentContainerStyle={styles.detailContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#94a3b8"
          />
        }
      >
        {/* Header */}
        <Animated.View style={{ opacity: headerFadeAnim }}>
          <View
            style={styles.detailHeader}
          >
            {/* Progress Ring + Title area */}
            <View style={styles.headerContent}>
              <ProgressRing
                progress={progressFrac}
                size={80}
                strokeWidth={4}
                color={progress.is_complete ? '#FFD700' : themeColor}
              />
              <View style={styles.headerTextArea}>
                <Text style={styles.detailTitle}>{set.name}</Text>
                <Text style={styles.detailDescription}>
                  {set.description}
                </Text>
              </View>
            </View>

            {/* Time gate info */}
            {set.is_in_rotation !== false && set.time_gate && (
              <View style={styles.timeGateInfo}>
                <GameIcon name="timer" size={12 + 4} />
                <Text style={styles.timeGateText}>
                  {set.time_gate.description}
                </Text>
                {set.time_gate.is_spawning_now === true ? (
                  <View style={styles.activeIndicator}>
                    <View style={styles.activeDot} />
                    <Text style={styles.timeGateActive}>Active Now</Text>
                  </View>
                ) : set.time_gate.is_spawning_now === null ? (
                  <Text style={styles.timeGateInactive}>{set.theme === 'weather' ? 'Rain status unavailable' : 'Check map for live status'}</Text>
                ) : (
                  <Text style={styles.timeGateInactive}>{set.theme === 'weather' ? 'Waiting for rain' : 'Not Spawning'}</Text>
                )}
              </View>
            )}

            {/* Progress Bar */}
            <View style={styles.detailProgress}>
              <View style={styles.detailProgressBar}>
                <Animated.View
                  style={[
                    styles.detailProgressFill,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                      backgroundColor: progress.is_complete
                        ? '#FFD700'
                        : themeColor,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressCount}>
                {progress.collected} / {progress.total}
              </Text>
            </View>
            {set.is_in_rotation === false ? <View style={styles.archivePanel}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <GameIcon name="sparkle" size={18} />
                <Text style={styles.archiveKicker}>YOUR COLLECTOR ARCHIVE</Text>
              </View>
              <Text style={styles.archiveBody}>This book is off the map for now. Your finds, spare copies, and earned rewards are safe. You can still use saved spares and claim rewards you earned.</Text>
            </View> : <View style={styles.focusRow}>
              <View style={styles.focusCopy}>
                <Text style={styles.focusKicker}>{set.is_focused ? 'YOUR ACTIVE HUNT' : 'CHOOSE YOUR HUNT'}</Text>
                <Text style={styles.focusHint}>
                  {set.time_gate?.is_spawning_now === false ? 'This hunt resumes when conditions return.'
                    : set.time_gate?.is_spawning_now === null ? 'Waiting for live conditions.'
                    : 'New home finds favor this book.'}
                </Text>
              </View>
              <TouchableOpacity accessibilityRole="button"
                accessibilityLabel={set.is_focused ? 'Hunt all collections equally' : `Focus ${set.name} on the home map`}
                disabled={focusPending} onPress={() => void toggleFocus()}
                activeOpacity={0.8} style={[styles.focusButton, focusPending && { opacity: 0.6 }]}>
                <Text style={styles.focusButtonText}>{focusPending ? 'SAVING...' : set.is_focused ? 'HUNT ALL' : 'FOCUS SET'}</Text>
              </TouchableOpacity>
            </View>}
          </View>
        </Animated.View>

        {actionError && <Text style={[styles.loadingText, { marginHorizontal: 16 }]}>{actionError}</Text>}
        {giftNotice && <View style={{ marginHorizontal: 16, marginBottom: 10, padding: 12,
          borderRadius: 14, borderWidth: 2, borderColor: '#FFD466', backgroundColor: '#0D6EA9' }}>
          <Text style={{ color: '#FFFFFF', fontFamily: 'Knockout', fontSize: 15 }}>{giftNotice}</Text>
        </View>}
        {progress.starter_milestone && (
          <View onLayout={event => { tripPrepTopRef.current = event.nativeEvent.layout.y; }}
            style={[styles.rewardsSection, { backgroundColor: '#FFF5DE', borderRadius: 16, marginBottom: 14 }]}>
            <Text style={styles.sectionTitle}>Trip Prep · {progress.starter_milestone.collected}/{progress.starter_milestone.target} unique finds</Text>
            <Text style={styles.tripPrepExplanation}>
              {set.is_in_rotation === false
                ? progress.starter_milestone.is_unlocked
                  ? `You earned this trip-prep milestone before the hunt rotated out. Claim ${progress.starter_milestone.rewards.tickets} Ticket${progress.starter_milestone.rewards.tickets === 1 ? '' : 's'}, ${progress.starter_milestone.rewards.energy} Energy, and ${progress.starter_milestone.rewards.experience} XP.`
                  : `Your ${progress.starter_milestone.collected} unique finds toward this reward are saved. The set is off the map for now.`
                : `Find eight different items to bring ${progress.starter_milestone.rewards.tickets} Ticket${progress.starter_milestone.rewards.tickets === 1 ? '' : 's'}, ${progress.starter_milestone.rewards.energy} Energy, and ${progress.starter_milestone.rewards.experience} XP toward your next park day${progress.starter_milestone.rewards.title ? `, and earn the ${progress.starter_milestone.rewards.title} profile title` : ''}. Keep collecting for the full set reward.`}
            </Text>
            {!!progress.starter_milestone.wearable_choices?.length && !progress.starter_milestone.rewards_claimed && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: '#174D79', fontFamily: 'Knockout', fontSize: 15,
                  marginBottom: 9, letterSpacing: 0.4 }}>CHOOSE YOUR SHARK REWARD</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {progress.starter_milestone.wearable_choices.map((item: { id: number; name: string; icon_url: string | null; owned: boolean }) => (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => { if (!item.owned) {
                        setSelectedWearableId(item.id);
                        setActionError(null);
                        detailScrollRef.current?.scrollTo({ y: Math.max(0, tripPrepTopRef.current + 14), animated: true });
                      } }}
                      disabled={item.owned}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selectedWearableId === item.id, disabled: item.owned }}
                      style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center',
                        flexDirection: wearableChoices.length === 1 ? 'row' : 'column', gap: 7,
                        padding: 8, borderRadius: 13, borderWidth: 2,
                        borderColor: selectedWearableId === item.id ? '#F8C94F' : '#9BC7DE',
                        backgroundColor: item.owned ? '#E8E5DE' : selectedWearableId === item.id ? '#0B72BB' : '#F4FBFF' }}
                    >
                      {item.icon_url ? <Image source={{ uri: item.icon_url }} style={{ width: 65, height: 65 }} contentFit="contain" />
                        : <GameIcon name="shark" size={52} />}
                      <View style={{ flex: wearableChoices.length === 1 ? 1 : undefined, alignItems: 'center' }}>
                        <Text style={{ color: selectedWearableId === item.id && !item.owned ? '#FFFFFF' : '#174D79',
                          fontFamily: 'Knockout', textAlign: 'center', fontSize: wearableChoices.length === 1 ? 15 : 12,
                          lineHeight: wearableChoices.length === 1 ? 18 : 15 }} numberOfLines={2}>{item.name}</Text>
                        {(item.owned || selectedWearableId === item.id) && <Text style={{ color: item.owned ? '#637B8A' : '#FFE187',
                          fontFamily: 'Knockout', fontSize: 11, marginTop: 3 }}>{item.owned ? 'OWNED' : 'SELECTED'}</Text>}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
                {progress.starter_milestone.wearable_choices.every((item: { owned: boolean }) => item.owned) && (
                  <Text style={[styles.rewardLabel, { textAlign: 'left', marginTop: 8 }]}>
                    You already own these shark items. Claim Trip Prep for its Tickets, Energy, XP, and title.
                  </Text>
                )}
              </View>
            )}
            {selectedWearable && (
              <LinearGradient colors={['#117FC6', '#07477D']} style={{
                marginBottom: 13, minHeight: 172, borderRadius: 18, borderWidth: 3,
                borderColor: '#FFE187', overflow: 'hidden', flexDirection: 'row',
                alignItems: 'center', paddingLeft: 14,
              }}>
                <View style={{ flex: 1, zIndex: 1 }}>
                  <Text style={{ color: '#FFE187', fontFamily: 'Oswald-Bold', fontSize: 13, letterSpacing: 1.2 }}>
                    {progress.starter_milestone.rewards_claimed ? 'NEW FOR YOUR SHARK' : 'TRY IT ON'}
                  </Text>
                  <Text style={{ color: '#FFFFFF', fontFamily: 'Shark', fontSize: 17, marginTop: 6, lineHeight: 21 }} numberOfLines={3}>{selectedWearable.name}</Text>
                  <Text style={{ color: '#D8F3FF', fontSize: 12, marginTop: 8, lineHeight: 17 }}>
                    {progress.starter_milestone.rewards_claimed ? 'Earned with Trip Prep · Open your wardrobe to wear it'
                      : previewInventory ? 'Preview on your shark · Earn it with Trip Prep'
                        : 'Earn this item with Trip Prep, then style your shark.'}
                  </Text>
                </View>
                {previewInventory ? <Playercard inventory={previewInventory} showBackground={false}
                  style={{ width: 172, height: 165, marginRight: -8 }} />
                  : <View style={{ width: 172, height: 165, marginRight: -8 }}>
                    <Image source={require('../../assets/images/screens/welcome/shark.png')}
                      style={{ width: 160, height: 160 }} contentFit="contain" />
                    {selectedWearable.icon_url && <View style={{ position: 'absolute', right: 11, bottom: 4,
                      width: 60, height: 60, borderRadius: 30, borderWidth: 2,
                      borderColor: '#FFE187', backgroundColor: '#E9F8FF',
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Image source={{ uri: selectedWearable.icon_url }} style={{ width: 49, height: 49 }} contentFit="contain" />
                    </View>}
                  </View>}
              </LinearGradient>
            )}
            {progress.starter_milestone.rewards_claimed ? (
              <View>
                <Text style={[styles.rewardLabel, { color: '#227A53', textAlign: 'left' }]}>Trip prep claimed{progress.starter_milestone.rewards.title ? ` · ${progress.starter_milestone.rewards.title} earned` : ''}</Text>
                {!!progress.starter_milestone.awarded_item_id && (
                  <Text style={[styles.rewardLabel, { textAlign: 'left', marginTop: 6 }]}>
                    Shark item earned: {progress.starter_milestone.wearable_choices?.find((item: { id: number }) => item.id === progress.starter_milestone.awarded_item_id)?.name ?? 'Open your wardrobe to see it'}
                  </Text>
                )}
                {!!progress.starter_milestone.awarded_item_id && <Button onPress={() => RootNavigation.navigate('Inventory', {
                  itemTypeId: progress.starter_milestone.wearable_choices?.find((item: { id: number }) => item.id === progress.starter_milestone.awarded_item_id)?.item_type_id,
                })}>
                  <LinearGradient colors={['#FFBE57', '#F18B32']} style={styles.claimButton}>
                    <Text style={styles.claimButtonText}>Style your shark</Text>
                  </LinearGradient>
                </Button>}
                {!!progress.starter_milestone.rewards.title && <Button onPress={() => handleEquipTitle('starter')} hasPermission={!equippingTitle}>
                  <LinearGradient colors={['#254A72', '#142C4B']} style={styles.claimButton}>
                    <Text style={styles.claimButtonText}>
                      {equippingTitle ? 'Saving...' : player?.title === progress.starter_milestone.rewards.title ? 'Remove title' : 'Wear title'}
                    </Text>
                  </LinearGradient>
                </Button>}
              </View>
            ) : progress.starter_milestone.is_unlocked ? (
              <Button onPress={handleClaimStarter} hasPermission={!claimingStarter}>
                <LinearGradient colors={['#FFBE57', '#F18B32']} style={styles.claimButton}>
                  <GameIcon name="star" size={18 + 4} />
                  <Text style={styles.claimButtonText}>{claimingStarter ? 'Claiming...' : 'Claim Trip Prep'}</Text>
                </LinearGradient>
              </Button>
            ) : null}
          </View>
        )}

        {!!selectedSetData.recent_gifts?.length && <View style={{ marginHorizontal: 16,
          marginBottom: 14, borderRadius: 16, borderWidth: 2, borderColor: '#FFCF5D',
          backgroundColor: '#0A5D9A', padding: 14 }}>
          <Text style={{ color: '#FFE08A', fontFamily: 'Shark', fontSize: 17 }}>GIFTS FROM YOUR CREW</Text>
          <Text style={{ color: '#DDF3FF', fontSize: 12, marginTop: 3 }}>
            A friend helped fill this book. Map discovery remains yours to earn.
          </Text>
          {selectedSetData.recent_gifts.slice(0, 3).map(gift => <View key={gift.id}
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10,
              padding: 8, borderRadius: 10, backgroundColor: '#DDF4FF' }}>
            <Image source={prepItemImage(gift.variant_slug ?? '')
              || getChurroImage(gift.variant_slug ?? '')
              || (items.find(item => item.id === gift.prep_item_id)?.icon_url
                ? { uri: items.find(item => item.id === gift.prep_item_id)!.icon_url! }
                : null)
              || require('../../assets/images/screens/player/gift.png')}
              style={{ width: 36, height: 36, marginRight: 9 }} contentFit="contain" />
            <Text style={{ flex: 1, color: '#19496E', fontFamily: 'Knockout', fontSize: 14 }}>
              {gift.sender_name} shared {gift.item_name}
            </Text>
          </View>)}
        </View>}

        {progress.starter_milestone?.is_unlocked && !progress.is_complete && (
          <View style={styles.chaseCard}>
            <Text style={styles.chaseKicker}>THE NEXT COLLECTOR CHASE</Text>
            <Text style={styles.chaseTitle}>{missingItems.length} VARIANTS TO THE FULL SET</Text>
            <Text style={styles.chaseBody}>
              {set.is_in_rotation === false
                ? `This book is off the map. Use ${progress.exchange_cost} saved spare copies to fill a missing slot.`
                : `Find new variants on the home map or use ${progress.exchange_cost} spare copies to fill a missing slot.`}
              {sparesNeeded === 0
                ? ' Your exchange is ready.'
                : set.is_in_rotation === false
                  ? ` You need ${sparesNeeded} more spare ${sparesNeeded === 1 ? 'copy' : 'copies'} if this hunt returns.`
                  : ` ${sparesNeeded} more spare ${sparesNeeded === 1 ? 'copy' : 'copies'} until your next exchange.`}
            </Text>
            {discovery && <Text style={styles.chaseDiscovery}>
              MAP DISCOVERIES {discovery.found_in_world}/{progress.total} · LEGENDARY {discovery.legendary_found_in_world}/{discovery.legendary_total}
            </Text>}
            <Text style={styles.chaseNote}>An exchange fills your book; finding it on the map remains a separate collector feat.</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setShowMissingChoices(value => !value)}
              style={styles.chaseButton}>
              <Text style={styles.chaseButtonText}>{showMissingChoices ? 'HIDE MISSING VARIANTS'
                : sparesNeeded === 0 ? 'CHOOSE A MISSING VARIANT' : 'VIEW MISSING VARIANTS'}</Text>
            </TouchableOpacity>
            {showMissingChoices && missingItems.map((item: PrepItemSetItem) => (
              <TouchableOpacity key={item.id} accessibilityRole="button"
                accessibilityLabel={`View missing ${item.name}, ${item.rarity_label}`}
                onPress={() => setSelectedItem(item)} style={styles.missingRow}>
                <Image source={prepItemImage(item.variant_slug) || getChurroImage(item.variant_slug)
                  || require('../../assets/images/screens/player/gift.png')}
                  style={styles.missingImage} contentFit="contain" />
                <View style={styles.missingCopy}>
                  <Text style={styles.missingName}>{item.name}</Text>
                  <Text style={styles.missingRarity}>{item.rarity_label}</Text>
                </View>
                <GameIcon name="arrow" size={24} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Completion Rewards */}
        <View style={styles.rewardsSection}>
          {(!progress.starter_milestone?.is_unlocked || progress.is_complete) && discovery && <Text style={styles.rewardLabel}>
            Found on map {discovery.found_in_world}/{progress.total} · Legendary finds {discovery.legendary_found_in_world}/{discovery.legendary_total}
          </Text>}
          {!progress.starter_milestone?.is_unlocked && !progress.is_complete && <Text style={styles.rewardLabel}>
            {progress.spare_count} spare copies · Exchange {progress.exchange_cost} for any missing item
          </Text>}
          <View style={styles.rewardsSectionHeader}>
            <GameIcon name="trophy" size={16 + 4} />
            <Text style={styles.sectionTitle}>Completion Rewards</Text>
          </View>
          <View style={styles.rewardsGrid}>
            <View style={styles.rewardItem}>
              <View
                style={[
                  styles.rewardIconBg,
                  { backgroundColor: 'rgba(212,247,212,0.25)' },
                ]}
              >
                <Image
                  source={require('../../assets/images/energy.png')}
                  style={styles.rewardIconImage}
                />
              </View>
              <Text style={styles.rewardValue}>
                +{completion_rewards.energy}
              </Text>
              <Text style={styles.rewardLabel}>Energy</Text>
            </View>
            <View style={styles.rewardItem}>
              <View
                style={[
                  styles.rewardIconBg,
                  { backgroundColor: 'rgba(255,243,212,0.25)' },
                ]}
              >
                <Image
                  source={require('../../assets/images/ticket-icon.png')}
                  style={styles.rewardIconImage}
                />
              </View>
              <Text style={styles.rewardValue}>
                +{completion_rewards.tickets}
              </Text>
              <Text style={styles.rewardLabel}>Tickets</Text>
            </View>
            <View style={styles.rewardItem}>
              <View
                style={[
                  styles.rewardIconBg,
                  { backgroundColor: 'rgba(76,220,255,0.25)' },
                ]}
              >
                <Image
                  source={require('../../assets/images/screens/explore/xp.png')}
                  style={styles.rewardIconImage}
                />
              </View>
              <Text style={styles.rewardValue}>
                +{completion_rewards.experience}
              </Text>
              <Text style={styles.rewardLabel}>XP</Text>
            </View>
            {completion_rewards.title && (
              <View style={styles.rewardItem}>
                <View
                  style={[
                    styles.rewardIconBg,
                    { backgroundColor: 'rgba(255,215,0,0.15)' },
                  ]}
                >
                  <GameIcon name="trophy" size={16 + 4} />
                </View>
                <Text style={[styles.rewardValue, { fontSize: 11 }]} numberOfLines={2}>
                  {completion_rewards.title}
                </Text>
                <Text style={styles.rewardLabel}>Title</Text>
              </View>
            )}
          </View>

          {/* Claim Button */}
          {progress.is_complete && !progress.rewards_claimed && (
            <Button
              onPress={handleClaimRewards}
              hasPermission={!claiming}
            >
              <LinearGradient
                colors={['#FFD700', '#FFA000']}
                style={styles.claimButton}
              >
                <GameIcon name="star" size={18 + 4} />
                <Text style={styles.claimButtonText}>
                  {claiming ? 'Claiming...' : 'Claim Rewards!'}
                </Text>
              </LinearGradient>
            </Button>
          )}
          {progress.rewards_claimed && completion_rewards.title && (
              <Button onPress={() => handleEquipTitle('complete')} hasPermission={!equippingTitle}>
              <LinearGradient colors={['#254A72', '#142C4B']} style={styles.claimButton}>
                <GameIcon name="trophy" size={17 + 4} />
                <Text style={styles.claimButtonText}>
                  {equippingTitle ? 'Saving...' : player?.title === completion_rewards.title
                    ? 'Remove Profile Title' : 'Wear Profile Title'}
                </Text>
              </LinearGradient>
            </Button>
          )}
        </View>

        {/* Collection Grid - By Rarity */}
        {Object.entries(items_by_rarity)
          .filter(
            ([_, items]) => (items as PrepItemSetItem[]).length > 0
          )
          .map(([rarityName, rarityItems]) => {
            const items = rarityItems as PrepItemSetItem[];
            const rarityNum =
              {
                legendary: 5,
                epic: 4,
                rare: 3,
                uncommon: 2,
                common: 1,
              }[rarityName] || 1;
            const rarityConfig =
              RARITY_CONFIG[rarityNum as keyof typeof RARITY_CONFIG];
            const collectedCount = items.filter(
              (i) => i.is_collected
            ).length;

            return (
              <View key={rarityName} style={styles.raritySection}>
                <View style={styles.raritySectionHeader}>
                  <View
                    style={[
                      styles.rarityBadge,
                      { backgroundColor: rarityConfig.color },
                    ]}
                  >
                    <Image
                      source={CHURRO_IMAGES['churro_01']}
                      style={{ width: 14, height: 14, marginRight: 4 }}
                      contentFit="contain"
                    />
                    <Text style={styles.rarityBadgeText}>
                      {rarityConfig.label}
                    </Text>
                  </View>
                  <Text style={styles.rarityCount}>
                    {collectedCount}/{items.length}
                  </Text>
                </View>
                <View style={styles.collectionGrid}>
                  {items.map((item, index) => (
                    <CollectionCard
                      key={item.id}
                      item={item}
                      index={index}
                      onPress={setSelectedItem}
                    />
                  ))}
                </View>
              </View>
            );
          })}

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton onPress={selectedSetSlug ? closeSet : undefined} />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>{selectedSetData?.set?.name || 'Collections'}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>

      {/* Main Content - Set List or Detail */}
      <View style={styles.container}>
        {/* Set List */}
        {!selectedSetSlug && (
          <ScrollView
            style={styles.setList}
            contentContainerStyle={styles.setListContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#94a3b8"
              />
            }
          >
            <View style={styles.listHero}>
              <View style={styles.listHeroCopy}>
                <Text style={styles.listHeroEyebrow}>BUILD YOUR NEXT PARK DAY</Text>
                <Text style={styles.listHeroTitle}>HUNT FROM{'\n'}HOME</Text>
                <Text style={styles.listHeroSub}>Find sets, earn Tickets and Energy, and style your shark.</Text>
              </View>
              <Image source={require('../../assets/images/screens/pin-collections/shark.png')}
                style={styles.listHeroShark} contentFit="contain" accessibilityLabel="Theme Park Shark mascot" />
            </View>
            <Text style={styles.listSectionTitle}>HUNTING NOW</Text>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>
                  Loading collections...
                </Text>
              </View>
            ) : setsError ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Could not load collections.</Text>
                <TouchableOpacity onPress={loadSets}><Text style={styles.emptyText}>Retry</Text></TouchableOpacity>
              </View>
            ) : sets.length === 0 ? (
              <View style={styles.emptyContainer}>
                <GameIcon name="sparkle" size={48 + 4} style={{ opacity: 0.35 }} />
                <Text style={styles.emptyText}>
                  No collections available
                </Text>
              </View>
            ) : (
              <>
                {currentSets.length ? currentSets.map(renderSetCard)
                  : <Text style={styles.noCurrentHunts}>No collection is on the map right now. Your saved books are below.</Text>}
                {upcomingSets.length > 0 && <>
                  <Text style={styles.listSectionTitle}>COMING TO THE MAP</Text>
                  {upcomingSets.map(set => <TouchableOpacity key={`upcoming-${set.id}`}
                    style={styles.upcomingCard} disabled={set.collected_count === 0}
                    accessibilityRole={set.collected_count > 0 ? 'button' : undefined}
                    activeOpacity={0.85} onPress={() => openSet(set.slug)}>
                    <View style={styles.upcomingIconWrap}>
                      <Image source={set.icon_url ? { uri: set.icon_url }
                        : set.slug === 'night_lights' ? prepItemImage('flashlight_40')!
                        : set.slug === 'rain_parade' ? prepItemImage('umbrella_40')!
                        : set.slug === 'camera_crew' ? prepItemImage('camera_40')!
                        : set.slug === 'churro_collection' ? CHURRO_IMAGES['churro_01']
                        : set.slug === 'pretzel_collection' ? prepItemImage('pretzel_01')!
                        : require('../../assets/images/screens/player/gift.png')}
                        style={styles.upcomingIcon} contentFit="contain" />
                    </View>
                    <View style={styles.upcomingCopy}>
                      <Text style={styles.upcomingEyebrow}>NEXT FEATURED HUNT</Text>
                      <Text style={styles.upcomingTitle}>{set.name}</Text>
                      <Text style={styles.upcomingDate}>{set.starts_at
                        ? `OPENS ${new Date(set.starts_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }).toUpperCase()}`
                        : 'OPENING SOON'}</Text>
                      <Text style={styles.upcomingBody} numberOfLines={2}>{set.description}</Text>
                      {set.collected_count > 0 && <Text style={styles.upcomingSaved}>
                        {set.collected_count}/{set.total_items} SAVED · VIEW YOUR BOOK
                      </Text>}
                    </View>
                  </TouchableOpacity>)}
                </>}
                {archivedSets.length > 0 && <>
                  <Text style={styles.listSectionTitle}>YOUR COLLECTOR ARCHIVE</Text>
                  <Text style={styles.archiveListHint}>Books you started stay with your shark after a hunt rotates out.</Text>
                  {archivedSets.map(renderSetCard)}
                </>}
                {currentSets.length > 0 && <TouchableOpacity accessibilityRole="button" activeOpacity={0.85}
                  onPress={() => RootNavigation.navigate('Explore')}
                  style={styles.mapHuntCard}>
                  <Image source={require('../../assets/images/coingold.png')}
                    style={styles.mapHuntCoin} contentFit="contain" />
                  <View style={styles.mapHuntCopy}>
                    <Text style={styles.mapHuntKicker}>YOUR NEXT MOVE</Text>
                    <Text style={styles.mapHuntTitle}>FIND ITEMS ON THE MAP</Text>
                    <Text style={styles.mapHuntBody}>Every pickup builds your park-day resources. New variants fill your active books.</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.mapHuntAction}>OPEN HOME MAP</Text>
                      <GameIcon name="arrow" size={20} />
                    </View>
                  </View>
                </TouchableOpacity>}
              </>
            )}
          </ScrollView>
        )}

        {/* Set Detail (slides in) */}
        {selectedSetSlug && (
          <Animated.View
            style={[
              styles.detailContainer,
              {
                transform: [
                  {
                    translateX: slideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [SCREEN_WIDTH, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {renderSetDetail()}
          </Animated.View>
        )}
      </View>

      {/* Item Detail Modal */}
      <Modal
        visible={!!selectedItem}
        transparent
        animationType="fade"
        onRequestClose={() => giftItem ? setGiftItem(null) : setSelectedItem(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setGiftItem(null); setSelectedItem(null); }}
        >
          <View style={[styles.modalContent, giftItem && {
            width: '91%', maxWidth: 400, padding: 16,
            backgroundColor: '#E9F7FF', borderWidth: 3, borderColor: '#FFFFFF',
          }]}>
            {giftItem ? <GiftPrepVariantPanel item={giftItem}
              imageSource={prepItemImage(giftItem.variant_slug)
                || getChurroImage(giftItem.variant_slug)
                || (giftItem.icon_url ? { uri: giftItem.icon_url }
                  : require('../../assets/images/screens/player/gift.png'))}
              onBack={() => setGiftItem(null)}
              onClose={() => { setGiftItem(null); setSelectedItem(null); }}
              onSent={handleGiftSent}
              previewEligibility={previewSets && process.env.EXPO_PUBLIC_CREW_GIFT_PREVIEW === '1'
                ? { prep_item_id: giftItem.id, spare_copies: Math.max(0, giftItem.quantity_collected - 1),
                  remaining_24h: 3, eligible_friends: [
                    { id: 101, screen_name: 'WAVE RIDER' },
                    { id: 102, screen_name: 'SHARK SCOUT' },
                    { id: 103, screen_name: 'CHURRO FAN' },
                  ] } : undefined}
              onFindFriends={() => { setGiftItem(null); setSelectedItem(null);
                RootNavigation.navigate('Friends'); }} /> : selectedItem && (
              <>
                {/* Rarity glow ring */}
                <View
                  style={[
                    styles.modalGlowRing,
                    {
                      borderColor: (
                        RARITY_CONFIG[
                          selectedItem.rarity as keyof typeof RARITY_CONFIG
                        ] || RARITY_CONFIG[1]
                      ).color,
                      shadowColor: (
                        RARITY_CONFIG[
                          selectedItem.rarity as keyof typeof RARITY_CONFIG
                        ] || RARITY_CONFIG[1]
                      ).color,
                    },
                  ]}
                >
                  {/* Item Image */}
                  <View style={styles.modalImageContainer}>
                    {(() => {
                      const localImage = prepItemImage(selectedItem.variant_slug)
                        || (selectedItem.variant_slug ? getChurroImage(selectedItem.variant_slug) : null);
                      if (localImage) {
                        return (
                          <Image
                            source={localImage}
                            style={styles.modalImage}
                            contentFit="contain"
                          />
                        );
                      } else if (selectedItem.icon_url) {
                        return (
                          <Image
                            source={{ uri: selectedItem.icon_url }}
                            style={styles.modalImage}
                            contentFit="contain"
                          />
                        );
                      } else {
                        return (
                          <Image
                            source={CHURRO_IMAGES['churro_01']}
                            style={{ width: 64, height: 64, opacity: 0.3 }}
                            contentFit="contain"
                          />
                        );
                      }
                    })()}
                  </View>
                </View>

                {/* Item Name */}
                <Text style={styles.modalItemName}>
                  {selectedItem.name}
                </Text>

                {/* Rarity */}
                <View
                  style={[
                    styles.modalRarityBadge,
                    {
                      backgroundColor: (
                        RARITY_CONFIG[
                          selectedItem.rarity as keyof typeof RARITY_CONFIG
                        ] || RARITY_CONFIG[1]
                      ).color,
                    },
                  ]}
                >
                  <Image
                    source={CHURRO_IMAGES['churro_01']}
                    style={{ width: 14, height: 14, marginRight: 4 }}
                    contentFit="contain"
                  />
                  <Text style={styles.modalRarityText}>
                    {
                      (
                        RARITY_CONFIG[
                          selectedItem.rarity as keyof typeof RARITY_CONFIG
                        ] || RARITY_CONFIG[1]
                      ).label
                    }
                  </Text>
                </View>

                {/* Collection Status */}
                <View style={styles.modalStatusRow}>
                  {selectedItem.is_collected ? (
                    <>
                      <GameIcon name="check" size={14 + 4} />
                      <Text
                        style={[
                          styles.modalStatus,
                          { color: '#4CAF50' },
                        ]}
                      >
                        Collected
                        {selectedItem.quantity_collected > 1
                          ? ` (x${selectedItem.quantity_collected})`
                          : ''}
                      </Text>
                    </>
                  ) : (
                    <>
                      <GameIcon name="lock" size={14 + 4} />
                      <Text style={styles.modalStatus}>
                        Not Yet Collected
                      </Text>
                    </>
                  )}
                </View>

                {selectedItem.is_collected && selectedItem.found_in_world !== undefined && (
                  <Text style={styles.modalHint}>
                    {selectedItem.found_in_world
                      ? selectedItem.rarity === 5
                        ? 'Found on the map. This legendary find counts toward the Wild Legend stamp.'
                        : 'Found on the map.'
                      : 'Added to your collection; still waiting to be found on the map.'}
                  </Text>
                )}

                {/* Description */}
                {selectedItem.description && (
                  <Text style={styles.modalDescription}>
                    {selectedItem.description}
                  </Text>
                )}

                {selectedItem.quantity_collected > 1 && (!previewSets || process.env.EXPO_PUBLIC_CREW_GIFT_PREVIEW === '1') && <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Share a spare ${selectedItem.name} with a friend`}
                  onPress={() => setGiftItem(selectedItem)}
                  style={{ alignSelf: 'stretch', marginTop: 7, borderRadius: 13,
                    borderWidth: 2, borderColor: '#FFD56A', backgroundColor: '#0B72BB',
                    paddingVertical: 11, paddingHorizontal: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontFamily: 'Shark', fontSize: 15 }}>
                    SHARE A SPARE WITH A FRIEND
                  </Text>
                </TouchableOpacity>}

                {/* Hint if not collected */}
                {!selectedItem.is_collected &&
                  (selectedItem as any).hint && (
                    <Text style={styles.modalHint}>
                      {(selectedItem as any).hint}
                    </Text>
                  )}

                {!selectedItem.is_collected && selectedSetData && (
                  <TouchableOpacity
                    style={[
                      styles.modalCloseButton,
                      selectedSetData.progress.spare_count < selectedSetData.progress.exchange_cost && styles.modalDisabledButton,
                    ]}
                    disabled={exchanging || selectedSetData.progress.spare_count < selectedSetData.progress.exchange_cost}
                    onPress={handleExchange}
                  >
                    <Text style={[styles.modalCloseText,
                      selectedSetData.progress.spare_count < selectedSetData.progress.exchange_cost && styles.modalDisabledText]}>
                      {exchanging ? 'Exchanging...' : selectedSetData.progress.spare_count < selectedSetData.progress.exchange_cost
                        ? `Need ${selectedSetData.progress.exchange_cost - selectedSetData.progress.spare_count} more ${selectedSetData.progress.exchange_cost - selectedSetData.progress.spare_count === 1 ? 'spare copy' : 'spare copies'}`
                        : `Exchange ${selectedSetData.progress.exchange_cost} spare copies`}
                    </Text>
                  </TouchableOpacity>
                )}
                {actionError && <Text style={styles.modalHint}>{actionError}</Text>}

                {/* Close button */}
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setSelectedItem(null)}
                >
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a76c8',
  },
  // Set List
  setList: {
    flex: 1,
  },
  setListContent: {
    padding: 16,
    gap: 12,
  },
  listHero: { minHeight: 156, flexDirection: 'row', overflow: 'hidden',
    borderRadius: 18, borderWidth: 3, borderColor: '#fff', backgroundColor: '#07569e',
    paddingLeft: 17, paddingVertical: 14,
    shadowColor: '#003c7a', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 5 },
    shadowRadius: 5, elevation: 5 },
  listHeroCopy: { flex: 1, zIndex: 1 },
  listHeroEyebrow: { color: '#bfeaff', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1 },
  listHeroTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 29, lineHeight: 33, marginTop: 5,
    textShadowColor: '#003c7a', textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1 },
  listHeroSub: { color: '#e5f7ff', fontSize: 12, lineHeight: 16, marginTop: 6, maxWidth: 215 },
  listHeroShark: { position: 'absolute', width: 132, height: 142, right: -14, bottom: -4 },
  listSectionTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 20,
    textShadowColor: '#003c7a', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  archiveListHint: { color: '#e6f7ff', fontFamily: 'Knockout', fontSize: 14,
    marginTop: -5, marginBottom: 2 },
  upcomingCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 3,
    borderColor: '#fff', borderRadius: 18, backgroundColor: '#073f7f', padding: 14,
    shadowColor: '#00305f', shadowOpacity: 0.35, shadowOffset: { width: 0, height: 4 },
    shadowRadius: 5, elevation: 5 },
  upcomingIconWrap: { width: 73, height: 73, borderRadius: 18, borderWidth: 2,
    borderColor: '#ffcf4c', backgroundColor: '#0c66b5', alignItems: 'center',
    justifyContent: 'center', marginRight: 13 },
  upcomingIcon: { width: 54, height: 54 },
  upcomingCopy: { flex: 1 },
  upcomingEyebrow: { color: '#ffcf4c', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8 },
  upcomingTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 19, marginTop: 2 },
  upcomingDate: { color: '#ffcf4c', fontFamily: 'Knockout', fontSize: 14, marginTop: 2 },
  upcomingBody: { color: '#d9f1ff', fontSize: 12, lineHeight: 16, marginTop: 4 },
  upcomingSaved: { color: '#ffcf4c', fontFamily: 'Knockout', fontSize: 12, marginTop: 5 },
  noCurrentHunts: { color: '#e6f7ff', fontFamily: 'Knockout', fontSize: 15,
    paddingHorizontal: 10, paddingVertical: 9 },
  mapHuntCard: { flexDirection: 'row', alignItems: 'center', marginTop: 5,
    borderWidth: 3, borderColor: '#fff', borderRadius: 18, backgroundColor: '#ffca30',
    padding: 14, shadowColor: '#003c7a', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 4, elevation: 4 },
  mapHuntCoin: { width: 64, height: 64, marginRight: 12 },
  mapHuntCopy: { flex: 1 },
  mapHuntKicker: { color: '#07569e', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1 },
  mapHuntTitle: { color: '#093d77', fontFamily: 'Shark', fontSize: 17, marginTop: 2 },
  mapHuntBody: { color: '#244d70', fontSize: 12, lineHeight: 16, marginTop: 3 },
  mapHuntAction: { color: '#005da4', fontFamily: 'Knockout', fontSize: 16, marginTop: 6 },
  setCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 8,
  },
  setCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingLeft: 18,
    backgroundColor: '#e1f6ff',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#003c7a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  setIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 2,
    backgroundColor: '#fff',
  },
  setIcon: {
    width: 36,
    height: 36,
  },
  setInfo: {
    flex: 1,
  },
  setEyebrow: { color: '#0875c9', fontFamily: 'Knockout', fontSize: 11,
    letterSpacing: 0.7, marginBottom: 2 },
  archivedLabel: { color: '#07569e', fontFamily: 'Knockout', fontSize: 12,
    marginTop: 5, letterSpacing: 0.4 },
  setName: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: '#093d77',
    textTransform: 'uppercase',
  },
  setDescription: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#376888',
    marginTop: 2,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#fff',
    borderRadius: 4,
    marginRight: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#075d9f',
    minWidth: 40,
    textAlign: 'right',
  },
  completeBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeGateBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    padding: 4,
  },
  comingSoonCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 4,
    opacity: 0.5,
  },
  comingSoonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingLeft: 18,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    borderStyle: 'dashed',
  },
  comingSoonIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    borderStyle: 'dashed',
  },
  comingSoonTitle: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  comingSoonSubtitle: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 2,
  },

  // Detail View
  detailContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#89d7fc',
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    paddingBottom: 40,
  },
  detailHeader: {
    padding: 20,
    paddingTop: 16,
    backgroundColor: '#07569e',
    borderBottomWidth: 4,
    borderBottomColor: '#fff',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerTextArea: {
    flex: 1,
  },
  detailTitle: {
    fontFamily: 'Shark',
    fontSize: 26,
    color: '#fff',
    textTransform: 'uppercase',
  },
  detailDescription: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#e1f6ff',
    marginTop: 4,
  },
  timeGateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  timeGateText: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#e1f6ff',
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  timeGateActive: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#ffdf54',
  },
  timeGateInactive: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#d2eaff',
  },
  detailProgress: {
    marginTop: 16,
    alignItems: 'center',
  },
  detailProgressBar: {
    width: '100%',
    height: 10,
    backgroundColor: '#c2eaff',
    borderRadius: 5,
    overflow: 'hidden',
  },
  detailProgressFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressCount: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#fff',
    marginTop: 8,
  },
  focusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 14, padding: 10, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#87d9ff', backgroundColor: '#0b67ad',
  },
  archivePanel: { marginTop: 14, padding: 12, borderRadius: 14,
    borderWidth: 2, borderColor: '#ffdb65', backgroundColor: '#0b67ad' },
  archiveKicker: { color: '#ffdb65', fontFamily: 'Shark', fontSize: 12 },
  archiveBody: { color: '#e2f5ff', fontFamily: 'Knockout', fontSize: 13,
    lineHeight: 17, marginTop: 5 },
  focusCopy: { flex: 1, minWidth: 0 },
  focusKicker: { fontFamily: 'Shark', fontSize: 12, color: '#fff' },
  focusHint: { fontFamily: 'Knockout', fontSize: 11, color: '#d6f2ff', marginTop: 2 },
  focusButton: {
    minWidth: 92, minHeight: 38, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 9, borderRadius: 10, borderWidth: 2, borderColor: '#fff',
    backgroundColor: '#ffca30',
  },
  focusButtonText: { fontFamily: 'Knockout', fontSize: 12, color: '#093d77', textAlign: 'center' },

  // Rewards Section
  rewardsSection: {
    padding: 16,
    backgroundColor: '#fff9e6',
    margin: 16,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#003c7a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  chaseCard: { marginHorizontal: 16, marginBottom: 4, padding: 16, borderRadius: 18,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#0875c9',
    shadowColor: '#003c7a', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 },
    shadowRadius: 4, elevation: 3 },
  chaseKicker: { color: '#ffdf54', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.8 },
  chaseTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 20, marginTop: 5 },
  chaseBody: { color: '#e4f5ff', fontSize: 13, lineHeight: 19, marginTop: 8 },
  chaseDiscovery: { color: '#ffdf54', fontFamily: 'Knockout', fontSize: 14, marginTop: 12 },
  chaseNote: { color: '#d6eeff', fontSize: 11, lineHeight: 16, marginTop: 6 },
  chaseButton: { marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 2,
    borderColor: '#fff', backgroundColor: '#ffca30', alignItems: 'center' },
  chaseButtonText: { color: '#093d77', fontFamily: 'Knockout', fontSize: 17 },
  missingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, marginTop: 8,
    paddingHorizontal: 9, borderRadius: 11, backgroundColor: '#e7f8ff', borderWidth: 1, borderColor: '#fff' },
  missingImage: { width: 43, height: 43, marginRight: 8 },
  missingCopy: { flex: 1 },
  missingName: { color: '#093d77', fontFamily: 'Knockout', fontSize: 15 },
  missingRarity: { color: '#376888', fontSize: 11 },
  missingArrow: { color: '#0875c9', fontSize: 21, fontWeight: '800' },
  rewardsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: '#093d77',
    textTransform: 'uppercase',
  },
  rewardsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  rewardItem: {
    alignItems: 'center',
    flex: 1,
  },
  rewardIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  rewardIconImage: {
    width: 26,
    height: 26,
  },
  rewardValue: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#05346e',
    marginTop: 2,
  },
  rewardLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  tripPrepExplanation: { color: '#315674', fontSize: 13, lineHeight: 18,
    marginTop: 7, marginBottom: 12 },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    marginTop: 16,
  },
  claimButtonText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: 'white',
    textTransform: 'uppercase',
  },

  // Rarity Sections
  raritySection: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  raritySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rarityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  rarityBadgeText: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'white',
    textTransform: 'uppercase',
  },
  rarityCount: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#093d77',
  },

  // Collection Grid
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  collectionItem: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    paddingTop: 8,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  itemGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 24,
  },
  itemImageContainer: {
    width: '75%',
    height: '65%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemImageLocked: {
    opacity: 0.12,
  },
  itemPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
    fontFamily: 'Knockout',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 3,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rarityStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  collectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  collectedBadgeText: {
    fontFamily: 'Shark',
    fontSize: 11,
    color: 'white',
    textAlign: 'center',
  },

  // Loading & Empty States
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#94a3b8',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    gap: 16,
  },
  emptyText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
  },

  // Item Detail Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5,52,110,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: '#075A9F',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    width: '85%',
    maxWidth: 360,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#002E67',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 24,
  },
  modalGlowRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    backgroundColor: '#E7F7FF',
  },
  modalImageContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  modalItemName: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 10,
    textShadowColor: '#003568',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 2,
  },
  modalRarityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 14,
  },
  modalRarityText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'white',
    textTransform: 'uppercase',
  },
  modalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalStatus: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#E5F6FF',
  },
  modalDescription: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#E5F6FF',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalHint: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#FFE186',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  modalCloseButton: {
    backgroundColor: '#FFCA36',
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginTop: 12,
    shadowColor: config.tertiary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  modalDisabledButton: { backgroundColor: '#dbeaf2', shadowOpacity: 0,
    borderWidth: 2, borderColor: '#a8c9d8' },
  modalDisabledText: { color: '#315d75' },
  modalCloseText: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: '#133E70',
    textTransform: 'uppercase',
  },
});
