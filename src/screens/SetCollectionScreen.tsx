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
import { useNavigation, useRoute } from '@react-navigation/native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import {
  faLock,
  faStar,
  faCheck,
  faClock,
  faTrophy,
  faGem,
} from '@fortawesome/free-solid-svg-icons';
import Wrapper from '../components/Wrapper';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Button from '../components/Button';
import config from '../config';
import { Modal } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import getPrepItemSets, {
  getPrepItemSet,
  claimSetRewards,
  PrepItemSetListItem,
  PrepItemSetItem,
} from '../api/endpoints/me/prep-item-sets';
import mockChurroData, { MOCK_CHURRO_SET_LIST, MOCK_CHURRO_SET_DETAIL } from '../data/mockChurroSet';

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

// Rarity configuration — modern, softer palette
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
              const localImage = item.variant_slug
                ? getChurroImage(item.variant_slug)
                : null;

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
                      <FontAwesomeIcon icon={faLock} size={18} color="rgba(0,0,0,0.12)" />
                    )}
                  </View>
                );
              }
            })()}
          </View>

          {/* Lock overlay for uncollected */}
          {!isCollected && (
            <View style={styles.lockOverlay}>
              <FontAwesomeIcon
                icon={faLock}
                size={16}
                color="rgba(0,0,0,0.15)"
              />
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
            { color: isCollected ? '#1a1a2e' : 'rgba(0,0,0,0.25)' },
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
        borderColor: 'rgba(0,0,0,0.06)',
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
          color: '#1a1a2e',
          textAlign: 'center',
        }}
      >
        {Math.round(progress * 100)}%
      </Text>
    </View>
  );
}

export default function SetCollectionScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { player, refreshPlayer } = useContext(AuthContext);

  const [sets, setSets] = useState<PrepItemSetListItem[]>([]);
  const [selectedSetSlug, setSelectedSetSlug] = useState<string | null>(
    (route.params as any)?.slug || null
  );
  const [selectedSetData, setSelectedSetData] = useState<{
    set: any;
    progress: any;
    items: PrepItemSetItem[];
    items_by_rarity: any;
    completion_rewards: any;
  } | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PrepItemSetItem | null>(
    null
  );

  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const headerFadeAnim = useRef(new Animated.Value(0)).current;

  // Load all sets (with mock data fallback)
  const loadSets = useCallback(async () => {
    try {
      const data = await getPrepItemSets();
      setSets(data);
    } catch (error) {
      console.log('API unavailable, using mock data');
      setSets([MOCK_CHURRO_SET_LIST]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load single set detail (with mock data fallback)
  const loadSetDetail = useCallback(
    async (slug: string) => {
      try {
        const data = await getPrepItemSet(slug);
        setSelectedSetData(data);

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
        console.log('API unavailable, using mock set detail');
        if (slug === 'churro_collection') {
          setSelectedSetData(MOCK_CHURRO_SET_DETAIL);

          Animated.parallel([
            Animated.timing(progressAnim, {
              toValue: MOCK_CHURRO_SET_DETAIL.progress.percentage / 100,
              duration: 800,
              useNativeDriver: false,
            }),
            Animated.timing(headerFadeAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ]).start();
        }
      }
    },
    [progressAnim, headerFadeAnim]
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    HapticPatterns.buttonTap();
    await loadSets();
    if (selectedSetSlug) {
      await loadSetDetail(selectedSetSlug);
    }
    setRefreshing(false);
  }, [loadSets, loadSetDetail, selectedSetSlug]);

  // Open set detail
  const openSet = useCallback(
    (slug: string) => {
      HapticPatterns.buttonTap();
      setSelectedSetSlug(slug);
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
    });
  }, [slideAnim]);

  // Claim completion rewards
  const handleClaimRewards = useCallback(async () => {
    if (!selectedSetSlug || claiming) return;

    setClaiming(true);
    HapticPatterns.collect('legendary');

    try {
      const result = await claimSetRewards(selectedSetSlug);
      await refreshPlayer();
      await loadSetDetail(selectedSetSlug);
      HapticPatterns.achievement();
    } catch (error) {
      console.error('Failed to claim rewards:', error);
      HapticPatterns.error();
    } finally {
      setClaiming(false);
    }
  }, [selectedSetSlug, claiming, refreshPlayer, loadSetDetail]);

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
                source={CHURRO_IMAGES[`churro_0${(set.id % 5) + 1}`] || CHURRO_IMAGES['churro_01']}
                style={styles.setIcon}
                contentFit="contain"
              />
            )}
          </View>

          {/* Set Info */}
          <View style={styles.setInfo}>
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
          </View>

          {/* Completion Badge */}
          {isComplete && (
            <View style={styles.completeBadge}>
              <FontAwesomeIcon icon={faStar} size={14} color="#FFD700" />
            </View>
          )}

          {/* Time Gate Indicator */}
          {set.time_gate && !set.time_gate.is_spawning_now && (
            <View style={styles.timeGateBadge}>
              <FontAwesomeIcon
                icon={faClock}
                size={10}
                color="rgba(255,255,255,0.4)"
              />
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
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      );
    }

    const { set, progress, items, items_by_rarity, completion_rewards } =
      selectedSetData;
    const themeColor = set.theme_config?.color || '#FF9800';
    const progressFrac = progress.total > 0 ? progress.collected / progress.total : 0;

    return (
      <ScrollView
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
            {set.time_gate && (
              <View style={styles.timeGateInfo}>
                <FontAwesomeIcon
                  icon={faClock}
                  size={12}
                  color="rgba(255,255,255,0.6)"
                />
                <Text style={styles.timeGateText}>
                  {set.time_gate.description}
                </Text>
                {set.time_gate.is_spawning_now ? (
                  <View style={styles.activeIndicator}>
                    <View style={styles.activeDot} />
                    <Text style={styles.timeGateActive}>Active Now</Text>
                  </View>
                ) : (
                  <Text style={styles.timeGateInactive}>Not Spawning</Text>
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
          </View>
        </Animated.View>

        {/* Completion Rewards */}
        <View style={styles.rewardsSection}>
          <View style={styles.rewardsSectionHeader}>
            <FontAwesomeIcon icon={faTrophy} size={16} color="#FFD700" />
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
                  <FontAwesomeIcon
                    icon={faTrophy}
                    size={16}
                    color="#FFD700"
                  />
                </View>
                <Text style={[styles.rewardValue, { fontSize: 11 }]} numberOfLines={2}>
                  {completion_rewards.title}
                </Text>
                <Text style={styles.rewardLabel}>Title</Text>
              </View>
            )}
          </View>

          {/* Claim Button */}
          {progress.is_complete && (
            <Button
              onPress={handleClaimRewards}
              hasPermission={!claiming}
            >
              <LinearGradient
                colors={['#FFD700', '#FFA000']}
                style={styles.claimButton}
              >
                <FontAwesomeIcon
                  icon={faStar}
                  size={18}
                  color="white"
                />
                <Text style={styles.claimButtonText}>
                  {claiming ? 'Claiming...' : 'Claim Rewards!'}
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
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>
                  Loading collections...
                </Text>
              </View>
            ) : sets.length === 0 ? (
              <View style={styles.emptyContainer}>
                <FontAwesomeIcon
                  icon={faGem}
                  size={48}
                  color="rgba(0,0,0,0.1)"
                />
                <Text style={styles.emptyText}>
                  No collections available
                </Text>
              </View>
            ) : (
              <>
                {sets.map(renderSetCard)}
                {/* Coming Soon placeholders */}
                {[1, 2, 3, 4, 5].map((i) => (
                  <View key={`coming-${i}`} style={styles.comingSoonCard}>
                    <View style={styles.comingSoonInner}>
                      <View style={styles.comingSoonIconContainer}>
                        <FontAwesomeIcon icon={faLock} size={20} color="rgba(0,0,0,0.12)" />
                      </View>
                      <View style={styles.setInfo}>
                        <Text style={styles.comingSoonTitle}>A New Collection Awaits</Text>
                        <Text style={styles.comingSoonSubtitle}>Coming Soon</Text>
                        {/* Placeholder progress bar */}
                        <View style={[styles.progressContainer, { marginTop: 10 }]}>
                          <View style={styles.progressBar}>
                            <View style={[styles.progressFill, { width: '0%', backgroundColor: '#cbd5e1' }]} />
                          </View>
                          <Text style={styles.progressText}>? / ?</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
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
        onRequestClose={() => setSelectedItem(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedItem(null)}
        >
          <View style={styles.modalContent}>
            {selectedItem && (
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
                      const localImage = selectedItem.variant_slug
                        ? getChurroImage(selectedItem.variant_slug)
                        : null;
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
                      <FontAwesomeIcon
                        icon={faCheck}
                        size={14}
                        color="#4CAF50"
                      />
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
                      <FontAwesomeIcon
                        icon={faLock}
                        size={14}
                        color="rgba(255,255,255,0.5)"
                      />
                      <Text style={styles.modalStatus}>
                        Not Yet Collected
                      </Text>
                    </>
                  )}
                </View>

                {/* Description */}
                {selectedItem.description && (
                  <Text style={styles.modalDescription}>
                    {selectedItem.description}
                  </Text>
                )}

                {/* Hint if not collected */}
                {!selectedItem.is_collected &&
                  (selectedItem as any).hint && (
                    <Text style={styles.modalHint}>
                      {(selectedItem as any).hint}
                    </Text>
                  )}

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
    backgroundColor: '#f0f4f8',
  },
  // Set List
  setList: {
    flex: 1,
  },
  setListContent: {
    padding: 16,
    gap: 12,
  },
  setCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 4,
  },
  setCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingLeft: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  setIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
  },
  setIcon: {
    width: 36,
    height: 36,
  },
  setInfo: {
    flex: 1,
  },
  setName: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: '#1a1a2e',
    textTransform: 'uppercase',
  },
  setDescription: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#64748b',
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
    backgroundColor: 'rgba(0,0,0,0.06)',
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
    color: '#64748b',
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
    backgroundColor: '#f0f4f8',
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
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
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
    color: '#1a1a2e',
    textTransform: 'uppercase',
  },
  detailDescription: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#64748b',
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
    color: '#64748b',
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
    color: '#22c55e',
  },
  timeGateInactive: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#94a3b8',
  },
  detailProgress: {
    marginTop: 16,
    alignItems: 'center',
  },
  detailProgressBar: {
    width: '100%',
    height: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
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
    color: '#64748b',
    marginTop: 8,
  },

  // Rewards Section
  rewardsSection: {
    padding: 16,
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  rewardsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: '#1a1a2e',
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
    color: '#1a1a2e',
    marginTop: 2,
  },
  rewardLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginTop: 2,
  },
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
    color: '#94a3b8',
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '82%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
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
    backgroundColor: '#f8fafc',
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
    color: '#1a1a2e',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 10,
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
    color: '#64748b',
  },
  modalDescription: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalHint: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#f59e0b',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  modalCloseButton: {
    backgroundColor: config.tertiary,
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 14,
    marginTop: 12,
    shadowColor: config.tertiary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  modalCloseText: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: 'white',
    textTransform: 'uppercase',
  },
});
