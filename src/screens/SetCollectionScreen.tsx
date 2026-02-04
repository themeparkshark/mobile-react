import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
// import { LinearGradient } from 'expo-linear-gradient';
// Temp: Using View instead of LinearGradient until dev client is rebuilt
const LinearGradient = ({ colors, style, children }: any) => (
  <View style={[style, { backgroundColor: colors[0] }]}>{children}</View>
);
import * as Haptics from '../helpers/haptics';
import HapticPatterns from '../helpers/hapticPatterns';
import { useNavigation, useRoute } from '@react-navigation/native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { 
  faArrowLeft, 
  faLock, 
  faStar, 
  faCheck, 
  faClock, 
  faCloud,
  faTrophy,
  faFire,
  faGem,
} from '@fortawesome/free-solid-svg-icons';
import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
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
const ITEM_SIZE = (SCREEN_WIDTH - 48) / 4; // 4 items per row with padding

// Rarity configuration
const RARITY_CONFIG = {
  1: { name: 'common', label: 'Common', color: '#4CAF50', bgColor: 'rgba(76, 175, 80, 0.15)' },
  2: { name: 'uncommon', label: 'Uncommon', color: '#2196F3', bgColor: 'rgba(33, 150, 243, 0.15)' },
  3: { name: 'rare', label: 'Rare', color: '#9C27B0', bgColor: 'rgba(156, 39, 176, 0.15)' },
  4: { name: 'epic', label: 'Epic', color: '#FF9800', bgColor: 'rgba(255, 152, 0, 0.15)' },
  5: { name: 'legendary', label: 'Legendary', color: '#FFD700', bgColor: 'rgba(255, 215, 0, 0.2)' },
};

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
  const [selectedItem, setSelectedItem] = useState<PrepItemSetItem | null>(null);
  
  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Load all sets (with mock data fallback)
  const loadSets = useCallback(async () => {
    try {
      const data = await getPrepItemSets();
      setSets(data);
    } catch (error) {
      console.log('API unavailable, using mock data');
      // Use mock data when API is unavailable
      setSets([MOCK_CHURRO_SET_LIST]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load single set detail (with mock data fallback)
  const loadSetDetail = useCallback(async (slug: string) => {
    try {
      const data = await getPrepItemSet(slug);
      setSelectedSetData(data);
      
      // Animate progress bar
      Animated.timing(progressAnim, {
        toValue: data.progress.percentage / 100,
        duration: 800,
        useNativeDriver: false,
      }).start();
    } catch (error) {
      console.log('API unavailable, using mock set detail');
      // Use mock data when API is unavailable
      if (slug === 'churro_collection') {
        setSelectedSetData(MOCK_CHURRO_SET_DETAIL);
        
        Animated.timing(progressAnim, {
          toValue: MOCK_CHURRO_SET_DETAIL.progress.percentage / 100,
          duration: 800,
          useNativeDriver: false,
        }).start();
      }
    }
  }, [progressAnim]);

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
    HapticPatterns.refresh();
    await loadSets();
    if (selectedSetSlug) {
      await loadSetDetail(selectedSetSlug);
    }
    setRefreshing(false);
  }, [loadSets, loadSetDetail, selectedSetSlug]);

  // Open set detail
  const openSet = useCallback((slug: string) => {
    HapticPatterns.buttonTap();
    setSelectedSetSlug(slug);
    progressAnim.setValue(0);
    
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [slideAnim, progressAnim]);

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
      
      // Show celebration (TODO: implement celebration modal)
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
    
    return (
      <TouchableOpacity
        key={set.id}
        style={styles.setCard}
        onPress={() => openSet(set.slug)}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={[themeColor + '20', themeColor + '40']}
          style={styles.setCardGradient}
        >
          {/* Set Icon */}
          <View style={[styles.setIconContainer, { backgroundColor: themeColor + '30' }]}>
            {set.icon_url ? (
              <Image source={{ uri: set.icon_url }} style={styles.setIcon} />
            ) : (
              <Text style={styles.setIconEmoji}>
                {set.theme === 'food' ? '🥨' : set.theme === 'night' ? '🌙' : '📦'}
              </Text>
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
                    { width: `${progressPercent}%`, backgroundColor: themeColor }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {set.collected_count}/{set.total_items}
              </Text>
            </View>
          </View>

          {/* Completion Badge */}
          {set.is_complete && (
            <View style={styles.completeBadge}>
              <FontAwesomeIcon icon={faCheck} size={14} color="white" />
            </View>
          )}

          {/* Time Gate Indicator */}
          {set.time_gate && !set.time_gate.is_spawning_now && (
            <View style={styles.timeGateBadge}>
              <FontAwesomeIcon icon={faClock} size={10} color="#666" />
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  // Render collection item
  const renderCollectionItem = (item: PrepItemSetItem, index: number) => {
    const rarity = RARITY_CONFIG[item.rarity as keyof typeof RARITY_CONFIG] || RARITY_CONFIG[1];
    const isCollected = item.is_collected;
    
    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.collectionItem,
          { backgroundColor: isCollected ? rarity.bgColor : 'rgba(0,0,0,0.3)' },
        ]}
        activeOpacity={0.8}
        onPress={() => {
          HapticPatterns.buttonTap();
          setSelectedItem(item);
        }}
      >
        {/* Rarity glow for collected items */}
        {isCollected && (
          <View 
            style={[
              styles.itemGlow, 
              { backgroundColor: rarity.color, opacity: 0.3 }
            ]} 
          />
        )}

        {/* Item Image */}
        <View style={styles.itemImageContainer}>
          {(() => {
            const localImage = item.variant_slug ? getChurroImage(item.variant_slug) : null;
            
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
                <View style={[styles.itemPlaceholder, { borderColor: rarity.color }]}>
                  {isCollected ? (
                    <Text style={styles.itemPlaceholderEmoji}>🥨</Text>
                  ) : (
                    <FontAwesomeIcon icon={faLock} size={20} color="#666" />
                  )}
                </View>
              );
            }
          })()}
        </View>

        {/* Rarity indicator */}
        <View style={[styles.rarityDot, { backgroundColor: rarity.color }]} />

        {/* Collected checkmark */}
        {isCollected && (
          <View style={styles.collectedBadge}>
            <FontAwesomeIcon icon={faCheck} size={8} color="white" />
          </View>
        )}

        {/* Quantity badge - always show count */}
        <View style={[
          styles.quantityBadge,
          !isCollected && styles.quantityBadgeEmpty
        ]}>
          <Text style={[
            styles.quantityText,
            !isCollected && styles.quantityTextEmpty
          ]}>
            {isCollected ? item.quantity_collected : 0}
          </Text>
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

    const { set, progress, items, items_by_rarity, completion_rewards } = selectedSetData;
    const themeColor = set.theme_config?.color || '#FF9800';

    return (
      <ScrollView
        style={styles.detailScroll}
        contentContainerStyle={styles.detailContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <LinearGradient
          colors={[themeColor, themeColor + 'CC']}
          style={styles.detailHeader}
        >
          <TouchableOpacity style={styles.backButton} onPress={closeSet}>
            <FontAwesomeIcon icon={faArrowLeft} size={20} color="white" />
          </TouchableOpacity>

          <Text style={styles.detailTitle}>{set.name}</Text>
          <Text style={styles.detailDescription}>{set.description}</Text>

          {/* Time gate info */}
          {set.time_gate && (
            <View style={styles.timeGateInfo}>
              <FontAwesomeIcon icon={faClock} size={12} color="rgba(255,255,255,0.8)" />
              <Text style={styles.timeGateText}>{set.time_gate.description}</Text>
              {set.time_gate.is_spawning_now ? (
                <Text style={styles.timeGateActive}>● Active Now</Text>
              ) : (
                <Text style={styles.timeGateInactive}>○ Not Spawning</Text>
              )}
            </View>
          )}

          {/* Progress */}
          <View style={styles.detailProgress}>
            <Text style={styles.progressLabel}>Collection Progress</Text>
            <View style={styles.detailProgressBar}>
              <Animated.View
                style={[
                  styles.detailProgressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={styles.progressCount}>
              {progress.collected} / {progress.total} ({progress.percentage}%)
            </Text>
          </View>
        </LinearGradient>

        {/* Completion Rewards */}
        <View style={styles.rewardsSection}>
          <Text style={styles.sectionTitle}>
            <FontAwesomeIcon icon={faTrophy} size={16} color="#FFD700" /> Completion Rewards
          </Text>
          <View style={styles.rewardsGrid}>
            <View style={styles.rewardItem}>
              <Text style={styles.rewardEmoji}>⚡</Text>
              <Text style={styles.rewardValue}>+{completion_rewards.energy}</Text>
              <Text style={styles.rewardLabel}>Energy</Text>
            </View>
            <View style={styles.rewardItem}>
              <Text style={styles.rewardEmoji}>🎟️</Text>
              <Text style={styles.rewardValue}>+{completion_rewards.tickets}</Text>
              <Text style={styles.rewardLabel}>Tickets</Text>
            </View>
            <View style={styles.rewardItem}>
              <Text style={styles.rewardEmoji}>⭐</Text>
              <Text style={styles.rewardValue}>+{completion_rewards.experience}</Text>
              <Text style={styles.rewardLabel}>XP</Text>
            </View>
            {completion_rewards.title && (
              <View style={styles.rewardItem}>
                <Text style={styles.rewardEmoji}>🏆</Text>
                <Text style={styles.rewardValue} numberOfLines={1}>
                  {completion_rewards.title}
                </Text>
                <Text style={styles.rewardLabel}>Title</Text>
              </View>
            )}
          </View>

          {/* Claim Button */}
          {progress.is_complete && (
            <Button onPress={handleClaimRewards} hasPermission={!claiming}>
              <View style={styles.claimButton}>
                <Text style={styles.claimButtonText}>
                  {claiming ? 'Claiming...' : '🎉 Claim Rewards!'}
                </Text>
              </View>
            </Button>
          )}
        </View>

        {/* Collection Grid - By Rarity */}
        {Object.entries(items_by_rarity)
          .filter(([_, items]) => (items as PrepItemSetItem[]).length > 0)
          .map(([rarityName, rarityItems]) => {
            const items = rarityItems as PrepItemSetItem[];
            const rarityNum = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 }[rarityName] || 1;
            const rarityConfig = RARITY_CONFIG[rarityNum as keyof typeof RARITY_CONFIG];
            const collectedCount = items.filter(i => i.is_collected).length;

            return (
              <View key={rarityName} style={styles.raritySection}>
                <View style={styles.raritySectionHeader}>
                  <View style={[styles.rarityBadge, { backgroundColor: rarityConfig.color }]}>
                    <Text style={styles.rarityBadgeText}>{rarityConfig.label}</Text>
                  </View>
                  <Text style={styles.rarityCount}>
                    {collectedCount}/{items.length}
                  </Text>
                </View>
                <View style={styles.collectionGrid}>
                  {items.map((item, index) => renderCollectionItem(item, index))}
                </View>
              </View>
            );
          })}
      </ScrollView>
    );
  };

  return (
    <Wrapper>
      <Topbar>
        <View style={styles.topbarContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topbarBack}>
            <FontAwesomeIcon icon={faArrowLeft} size={20} color="white" />
          </TouchableOpacity>
          <Text style={styles.topbarTitle}>Collections</Text>
        </View>
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
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading collections...</Text>
              </View>
            ) : sets.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>📦</Text>
                <Text style={styles.emptyText}>No collections available</Text>
              </View>
            ) : (
              sets.map(renderSetCard)
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
                {/* Item Image */}
                <View style={styles.modalImageContainer}>
                  {(() => {
                    const localImage = selectedItem.variant_slug ? getChurroImage(selectedItem.variant_slug) : null;
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
                      return <Text style={styles.modalPlaceholder}>🥨</Text>;
                    }
                  })()}
                </View>

                {/* Item Name */}
                <Text style={styles.modalItemName}>{selectedItem.name}</Text>

                {/* Rarity */}
                <View style={[
                  styles.modalRarityBadge,
                  { backgroundColor: (RARITY_CONFIG[selectedItem.rarity as keyof typeof RARITY_CONFIG] || RARITY_CONFIG[1]).color }
                ]}>
                  <Text style={styles.modalRarityText}>
                    {(RARITY_CONFIG[selectedItem.rarity as keyof typeof RARITY_CONFIG] || RARITY_CONFIG[1]).label}
                  </Text>
                </View>

                {/* Collection Status */}
                <Text style={styles.modalStatus}>
                  {selectedItem.is_collected
                    ? `✅ Collected${selectedItem.quantity_collected > 1 ? ` (×${selectedItem.quantity_collected})` : ''}`
                    : '🔒 Not Yet Collected'}
                </Text>

                {/* Hint if not collected */}
                {!selectedItem.is_collected && selectedItem.hint && (
                  <Text style={styles.modalHint}>💡 {selectedItem.hint}</Text>
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
  },
  topbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topbarBack: {
    padding: 8,
    marginRight: 12,
  },
  topbarTitle: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: 'white',
    textTransform: 'uppercase',
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
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  setCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  setIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  setIcon: {
    width: 40,
    height: 40,
  },
  setIconEmoji: {
    fontSize: 28,
  },
  setInfo: {
    flex: 1,
  },
  setName: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: 'white',
    textTransform: 'uppercase',
  },
  setDescription: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    marginRight: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'white',
    minWidth: 40,
    textAlign: 'right',
  },
  completeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeGateBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    padding: 4,
  },

  // Detail View
  detailContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: config.primary,
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    paddingBottom: 40,
  },
  detailHeader: {
    padding: 20,
    paddingTop: 60,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: 8,
    zIndex: 10,
  },
  detailTitle: {
    fontFamily: 'Shark',
    fontSize: 28,
    color: 'white',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 20,
  },
  detailDescription: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 4,
  },
  timeGateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  timeGateText: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  timeGateActive: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#4CAF50',
  },
  timeGateInactive: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  detailProgress: {
    marginTop: 20,
    alignItems: 'center',
  },
  progressLabel: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
  },
  detailProgressBar: {
    width: '80%',
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    marginTop: 8,
    overflow: 'hidden',
  },
  detailProgressFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 6,
  },
  progressCount: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: 'white',
    marginTop: 8,
  },

  // Rewards Section
  rewardsSection: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    margin: 16,
    borderRadius: 16,
  },
  sectionTitle: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: 'white',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  rewardsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  rewardItem: {
    alignItems: 'center',
  },
  rewardEmoji: {
    fontSize: 24,
  },
  rewardValue: {
    fontFamily: 'Knockout',
    fontSize: 18,
    color: config.tertiary,
    marginTop: 4,
  },
  rewardLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
  },
  claimButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  claimButtonText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: 'white',
    textTransform: 'uppercase',
  },

  // Rarity Sections
  raritySection: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  raritySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rarityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
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
    color: 'rgba(255,255,255,0.6)',
  },

  // Collection Grid
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  collectionItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  itemGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 20,
  },
  itemImageContainer: {
    width: '70%',
    height: '70%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemImageLocked: {
    opacity: 0.3,
  },
  itemPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPlaceholderEmoji: {
    fontSize: 24,
  },
  rarityDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  collectedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 20,
    alignItems: 'center',
  },
  quantityBadgeEmpty: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  quantityText: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'white',
  },
  quantityTextEmpty: {
    color: 'rgba(255,255,255,0.4)',
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
    color: 'rgba(255,255,255,0.6)',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },

  // Item Detail Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: '#1E222A',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '80%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  modalImageContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  modalPlaceholder: {
    fontSize: 64,
  },
  modalItemName: {
    fontFamily: 'Shark',
    fontSize: 22,
    color: 'white',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalRarityBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  modalRarityText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'white',
    textTransform: 'uppercase',
  },
  modalStatus: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  modalHint: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  modalCloseButton: {
    backgroundColor: config.tertiary,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 8,
  },
  modalCloseText: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: 'white',
    textTransform: 'uppercase',
  },
});
