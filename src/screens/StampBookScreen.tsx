import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import config from '../config';
import {
  StampType,
  StampCategory,
  STAMP_CATEGORY_CONFIG,
  STAMP_RARITY_CONFIG,
} from '../models/stamp-type';

// Mock data - replace with API call
const MOCK_STAMPS: StampType[] = [
  {
    id: 1,
    name: 'First Steps',
    description: 'Collect your first prep item',
    icon_url: '',
    category: 'exploration',
    rarity: 'common',
    is_earned: true,
    earned_at: '2025-01-20',
    progress: 100,
    requirement_text: 'Collect 1 prep item',
    rewards: { energy: 5, tickets: 1, experience: 25, ride_parts: 0 },
    sort_order: 1,
    is_hidden: false,
    is_new: false,
  },
  {
    id: 2,
    name: 'Set Collector',
    description: 'Complete your first item set',
    icon_url: '',
    category: 'collection',
    rarity: 'uncommon',
    is_earned: false,
    progress: 60,
    progress_text: '3/5 items collected',
    requirement_text: 'Complete any item set',
    rewards: { energy: 10, tickets: 3, experience: 100, ride_parts: 5 },
    sort_order: 2,
    is_hidden: false,
    is_new: false,
  },
  {
    id: 3,
    name: 'Trivia Whiz',
    description: 'Answer 10 trivia questions correctly',
    icon_url: '',
    category: 'trivia',
    rarity: 'common',
    is_earned: true,
    earned_at: '2025-01-22',
    progress: 100,
    requirement_text: '10 correct trivia answers',
    rewards: { energy: 5, tickets: 2, experience: 50, ride_parts: 0 },
    sort_order: 3,
    is_hidden: false,
    is_new: true,
  },
  {
    id: 4,
    name: 'Week Warrior',
    description: 'Maintain a 7-day collection streak',
    icon_url: '',
    category: 'streaks',
    rarity: 'rare',
    is_earned: false,
    progress: 42,
    progress_text: '3/7 days',
    requirement_text: '7 day streak',
    rewards: { energy: 20, tickets: 5, experience: 200, ride_parts: 10, title: 'Dedicated Collector' },
    sort_order: 4,
    is_hidden: false,
    is_new: false,
  },
  {
    id: 5,
    name: 'Coin Connoisseur',
    description: 'Level a ride coin to maximum',
    icon_url: '',
    category: 'leveling',
    rarity: 'epic',
    is_earned: false,
    progress: 20,
    progress_text: 'Level 1/5',
    requirement_text: 'Max level any coin',
    rewards: { energy: 50, tickets: 10, experience: 500, ride_parts: 50 },
    sort_order: 5,
    is_hidden: false,
    is_new: false,
  },
  {
    id: 6,
    name: 'Line Champion',
    description: 'Wait 2 hours in a single queue',
    icon_url: '',
    category: 'rides',
    rarity: 'rare',
    is_earned: false,
    progress: 0,
    requirement_text: 'Wait 120+ minutes',
    rewards: { energy: 30, tickets: 5, experience: 300, ride_parts: 30 },
    sort_order: 6,
    is_hidden: false,
    is_new: false,
  },
  {
    id: 7,
    name: '???',
    description: 'Discover hidden secrets...',
    icon_url: '',
    category: 'secret',
    rarity: 'legendary',
    is_earned: false,
    progress: 0,
    requirement_text: '???',
    rewards: { energy: 100, tickets: 20, experience: 1000, ride_parts: 100 },
    sort_order: 99,
    is_hidden: true,
    is_new: false,
  },
];

// Stamp Card Component
function StampCard({ stamp, onPress }: { stamp: StampType; onPress: () => void }) {
  const categoryConfig = STAMP_CATEGORY_CONFIG[stamp.category];
  const rarityConfig = STAMP_RARITY_CONFIG[stamp.rarity];
  const shineAnim = useRef(new Animated.Value(0)).current;

  // Shine animation for rare+ stamps
  useEffect(() => {
    if (stamp.is_earned && rarityConfig.shine) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(shineAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [stamp.is_earned]);

  const shineOpacity = shineAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.5, 0],
  });

  return (
    <TouchableOpacity
      style={[
        styles.stampCard,
        {
          borderColor: stamp.is_earned ? rarityConfig.color : 'rgba(255, 255, 255, 0.1)',
          opacity: stamp.is_earned ? 1 : 0.6,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* New badge */}
      {stamp.is_new && (
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>NEW!</Text>
        </View>
      )}

      {/* Shine effect */}
      {stamp.is_earned && rarityConfig.shine && (
        <Animated.View
          style={[
            styles.shineOverlay,
            { opacity: shineOpacity },
          ]}
        />
      )}

      {/* Icon */}
      <View
        style={[
          styles.stampIcon,
          {
            backgroundColor: stamp.is_earned ? categoryConfig.color : 'rgba(255, 255, 255, 0.1)',
          },
        ]}
      >
        {stamp.is_hidden && !stamp.is_earned ? (
          <Text style={styles.stampEmoji}>❓</Text>
        ) : stamp.icon_url ? (
          <Image
            source={{ uri: stamp.icon_url }}
            style={{ width: 40, height: 40 }}
            contentFit="contain"
          />
        ) : (
          <Text style={styles.stampEmoji}>{categoryConfig.icon}</Text>
        )}
      </View>

      {/* Name */}
      <Text style={styles.stampName} numberOfLines={1}>
        {stamp.is_hidden && !stamp.is_earned ? '???' : stamp.name}
      </Text>

      {/* Progress bar (if not earned) */}
      {!stamp.is_earned && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${stamp.progress}%`,
                  backgroundColor: categoryConfig.color,
                },
              ]}
            />
          </View>
          {stamp.progress_text && (
            <Text style={styles.progressText}>{stamp.progress_text}</Text>
          )}
        </View>
      )}

      {/* Earned checkmark */}
      {stamp.is_earned && (
        <View style={[styles.earnedBadge, { backgroundColor: rarityConfig.color }]}>
          <Text style={styles.earnedText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Category Tab Component
function CategoryTab({
  category,
  label,
  icon,
  color,
  isActive,
  onPress,
  count,
  earned,
}: {
  category: StampCategory;
  label: string;
  icon: string;
  color: string;
  isActive: boolean;
  onPress: () => void;
  count: number;
  earned: number;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.categoryTab,
        isActive && { backgroundColor: color },
      ]}
      onPress={onPress}
    >
      <Text style={styles.categoryIcon}>{icon}</Text>
      <Text
        style={[
          styles.categoryLabel,
          isActive && { color: config.primary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.categoryCount,
          isActive && { color: config.primary },
        ]}
      >
        {earned}/{count}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Stamp Book Screen - V2 Feature
 * 
 * Displays all achievements (stamps) organized by category.
 * Players can track progress and view earned stamps.
 */
export default function StampBookScreen() {
  const [stamps, setStamps] = useState<StampType[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<StampCategory | 'all'>('all');
  const [selectedStamp, setSelectedStamp] = useState<StampType | null>(null);
  const [loading, setLoading] = useState(true);
  
  const { player } = useContext(AuthContext);

  // Load stamps (replace with API call)
  useFocusEffect(
    useCallback(() => {
      // Simulate API call
      setTimeout(() => {
        setStamps(MOCK_STAMPS);
        setLoading(false);
      }, 500);
    }, [])
  );

  // Filter stamps by category
  const filteredStamps = selectedCategory === 'all'
    ? stamps
    : stamps.filter((s) => s.category === selectedCategory);

  // Count stamps per category
  const getCategoryStats = (category: StampCategory) => {
    const categoryStamps = stamps.filter((s) => s.category === category);
    return {
      count: categoryStamps.length,
      earned: categoryStamps.filter((s) => s.is_earned).length,
    };
  };

  // Overall progress
  const totalStamps = stamps.filter((s) => !s.is_hidden).length;
  const earnedStamps = stamps.filter((s) => s.is_earned).length;
  const progressPercentage = totalStamps > 0 ? (earnedStamps / totalStamps) * 100 : 0;

  return (
    <Wrapper>
      <Topbar />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>📖 Stamp Book</Text>
        <View style={styles.overallProgress}>
          <Text style={styles.progressLabel}>
            {earnedStamps} / {totalStamps} Stamps
          </Text>
          <View style={styles.overallProgressBar}>
            <View
              style={[
                styles.overallProgressFill,
                { width: `${progressPercentage}%` },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryContainer}
        contentContainerStyle={styles.categoryContent}
      >
        <TouchableOpacity
          style={[
            styles.categoryTab,
            selectedCategory === 'all' && { backgroundColor: config.tertiary },
          ]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={styles.categoryIcon}>🏠</Text>
          <Text
            style={[
              styles.categoryLabel,
              selectedCategory === 'all' && { color: config.primary },
            ]}
          >
            All
          </Text>
          <Text
            style={[
              styles.categoryCount,
              selectedCategory === 'all' && { color: config.primary },
            ]}
          >
            {earnedStamps}/{totalStamps}
          </Text>
        </TouchableOpacity>

        {Object.entries(STAMP_CATEGORY_CONFIG).map(([key, cfg]) => {
          const stats = getCategoryStats(key as StampCategory);
          return (
            <CategoryTab
              key={key}
              category={key as StampCategory}
              label={cfg.label}
              icon={cfg.icon}
              color={cfg.color}
              isActive={selectedCategory === key}
              onPress={() => setSelectedCategory(key as StampCategory)}
              count={stats.count}
              earned={stats.earned}
            />
          );
        })}
      </ScrollView>

      {/* Stamps Grid */}
      <ScrollView
        style={styles.stampsContainer}
        contentContainerStyle={styles.stampsGrid}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading stamps...</Text>
          </View>
        ) : filteredStamps.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No stamps in this category yet!</Text>
          </View>
        ) : (
          <View style={styles.gridWrapper}>
            {filteredStamps.map((stamp) => (
              <StampCard
                key={stamp.id}
                stamp={stamp}
                onPress={() => setSelectedStamp(stamp)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Stamp Detail Modal */}
      {selectedStamp && (
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedStamp(null)}
        >
          <View style={styles.modalContent}>
            <View
              style={[
                styles.modalIcon,
                {
                  backgroundColor: STAMP_CATEGORY_CONFIG[selectedStamp.category].color,
                  borderColor: STAMP_RARITY_CONFIG[selectedStamp.rarity].color,
                },
              ]}
            >
              {selectedStamp.icon_url ? (
                <Image
                  source={{ uri: selectedStamp.icon_url }}
                  style={{ width: 60, height: 60 }}
                  contentFit="contain"
                />
              ) : (
                <Text style={{ fontSize: 50 }}>
                  {STAMP_CATEGORY_CONFIG[selectedStamp.category].icon}
                </Text>
              )}
            </View>

            <View
              style={[
                styles.rarityBadge,
                { backgroundColor: STAMP_RARITY_CONFIG[selectedStamp.rarity].color },
              ]}
            >
              <Text style={styles.rarityText}>
                {STAMP_RARITY_CONFIG[selectedStamp.rarity].label}
              </Text>
            </View>

            <Text style={styles.modalTitle}>{selectedStamp.name}</Text>
            <Text style={styles.modalDescription}>{selectedStamp.description}</Text>

            <View style={styles.modalRequirement}>
              <Text style={styles.requirementLabel}>Requirement:</Text>
              <Text style={styles.requirementText}>{selectedStamp.requirement_text}</Text>
            </View>

            {!selectedStamp.is_earned && selectedStamp.progress > 0 && (
              <View style={styles.modalProgress}>
                <View style={styles.modalProgressBar}>
                  <View
                    style={[
                      styles.modalProgressFill,
                      { width: `${selectedStamp.progress}%` },
                    ]}
                  />
                </View>
                <Text style={styles.modalProgressText}>
                  {selectedStamp.progress_text || `${selectedStamp.progress}%`}
                </Text>
              </View>
            )}

            <View style={styles.modalRewards}>
              <Text style={styles.rewardsLabel}>Rewards:</Text>
              <View style={styles.rewardsRow}>
                {selectedStamp.rewards.energy > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardIcon}>⚡</Text>
                    <Text style={styles.rewardValue}>+{selectedStamp.rewards.energy}</Text>
                  </View>
                )}
                {selectedStamp.rewards.tickets > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardIcon}>🎟️</Text>
                    <Text style={styles.rewardValue}>+{selectedStamp.rewards.tickets}</Text>
                  </View>
                )}
                {selectedStamp.rewards.experience > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardIcon}>⭐</Text>
                    <Text style={styles.rewardValue}>+{selectedStamp.rewards.experience}</Text>
                  </View>
                )}
                {selectedStamp.rewards.ride_parts > 0 && (
                  <View style={styles.rewardItem}>
                    <Text style={styles.rewardIcon}>🔧</Text>
                    <Text style={styles.rewardValue}>+{selectedStamp.rewards.ride_parts}</Text>
                  </View>
                )}
              </View>
              {selectedStamp.rewards.title && (
                <Text style={styles.titleReward}>
                  🏆 Title: "{selectedStamp.rewards.title}"
                </Text>
              )}
            </View>

            {selectedStamp.is_earned && (
              <View style={styles.earnedContainer}>
                <Text style={styles.earnedLabel}>✓ Earned!</Text>
                {selectedStamp.earned_at && (
                  <Text style={styles.earnedDate}>
                    {new Date(selectedStamp.earned_at).toLocaleDateString()}
                  </Text>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
      )}
    </Wrapper>
  );
}

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 48) / 3;

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontFamily: 'Shark',
    fontSize: 28,
    color: 'white',
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    marginBottom: 12,
  },
  overallProgress: {
    alignItems: 'center',
  },
  progressLabel: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 6,
  },
  overallProgressBar: {
    width: '80%',
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: '100%',
    backgroundColor: config.tertiary,
    borderRadius: 5,
  },
  categoryContainer: {
    maxHeight: 70,
  },
  categoryContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  categoryTab: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    marginRight: 8,
    minWidth: 70,
  },
  categoryIcon: {
    fontSize: 18,
  },
  categoryLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'white',
    marginTop: 2,
  },
  categoryCount: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  stampsContainer: {
    flex: 1,
  },
  stampsGrid: {
    padding: 12,
  },
  gridWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stampCard: {
    width: CARD_SIZE,
    aspectRatio: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    borderWidth: 2,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  newBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: config.red,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 10,
  },
  newBadgeText: {
    fontFamily: 'Knockout',
    fontSize: 8,
    color: 'white',
  },
  shineOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  stampIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stampEmoji: {
    fontSize: 28,
  },
  stampName: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'white',
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    marginTop: 4,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontFamily: 'Knockout',
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 2,
  },
  earnedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnedText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  // Modal styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: config.primary,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 4,
  },
  rarityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  rarityText: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: config.primary,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontFamily: 'Shark',
    fontSize: 22,
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalDescription: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalRequirement: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    marginBottom: 12,
  },
  requirementLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  requirementText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'white',
  },
  modalProgress: {
    width: '100%',
    marginBottom: 12,
  },
  modalProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  modalProgressFill: {
    height: '100%',
    backgroundColor: config.tertiary,
    borderRadius: 4,
  },
  modalProgressText: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: config.tertiary,
    textAlign: 'center',
    marginTop: 4,
  },
  modalRewards: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    marginBottom: 12,
  },
  rewardsLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  rewardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  rewardItem: {
    alignItems: 'center',
  },
  rewardIcon: {
    fontSize: 18,
  },
  rewardValue: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#4CAF50',
  },
  titleReward: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#FFD700',
    textAlign: 'center',
    marginTop: 8,
  },
  earnedContainer: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    width: '100%',
  },
  earnedLabel: {
    fontFamily: 'Knockout',
    fontSize: 18,
    color: '#4CAF50',
  },
  earnedDate: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
  },
});
