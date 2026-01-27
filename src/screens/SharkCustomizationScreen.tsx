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

type CosmeticCategory = 'shark_skin' | 'frame' | 'badge' | 'trail';

interface CosmeticItem {
  id: number;
  name: string;
  description: string;
  icon_url: string;
  preview_url?: string;
  category: CosmeticCategory;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  is_owned: boolean;
  is_equipped: boolean;
  unlock_method?: string;
}

// Mock data - replace with API
const MOCK_COSMETICS: CosmeticItem[] = [
  // Shark Skins
  {
    id: 1,
    name: 'Default Shark',
    description: 'The classic Theme Park Shark look',
    icon_url: '',
    category: 'shark_skin',
    rarity: 'common',
    is_owned: true,
    is_equipped: true,
  },
  {
    id: 2,
    name: 'Golden Shark',
    description: 'A majestic golden shark. Shine bright!',
    icon_url: '',
    category: 'shark_skin',
    rarity: 'legendary',
    is_owned: false,
    is_equipped: false,
    unlock_method: 'Reach Level 50',
  },
  {
    id: 3,
    name: 'Neon Shark',
    description: 'Glow in the dark with this electric look',
    icon_url: '',
    category: 'shark_skin',
    rarity: 'rare',
    is_owned: true,
    is_equipped: false,
  },
  {
    id: 4,
    name: 'Pirate Shark',
    description: 'Arr! A shark fit for the seven seas',
    icon_url: '',
    category: 'shark_skin',
    rarity: 'epic',
    is_owned: false,
    is_equipped: false,
    unlock_method: 'Complete Pirates Set',
  },
  // Frames
  {
    id: 10,
    name: 'Basic Frame',
    description: 'Simple and clean',
    icon_url: '',
    category: 'frame',
    rarity: 'common',
    is_owned: true,
    is_equipped: true,
  },
  {
    id: 11,
    name: 'Fireworks Frame',
    description: 'Celebrate every moment!',
    icon_url: '',
    category: 'frame',
    rarity: 'rare',
    is_owned: false,
    is_equipped: false,
    unlock_method: 'Complete 7-day streak',
  },
  {
    id: 12,
    name: 'Royal Frame',
    description: 'Fit for theme park royalty',
    icon_url: '',
    category: 'frame',
    rarity: 'epic',
    is_owned: false,
    is_equipped: false,
    unlock_method: 'Max out 10 coins',
  },
  // Badges
  {
    id: 20,
    name: 'Newbie Badge',
    description: 'Just getting started',
    icon_url: '',
    category: 'badge',
    rarity: 'common',
    is_owned: true,
    is_equipped: false,
  },
  {
    id: 21,
    name: 'Veteran Badge',
    description: 'A true park veteran',
    icon_url: '',
    category: 'badge',
    rarity: 'rare',
    is_owned: true,
    is_equipped: true,
  },
  {
    id: 22,
    name: 'Legend Badge',
    description: 'The stuff of legends',
    icon_url: '',
    category: 'badge',
    rarity: 'legendary',
    is_owned: false,
    is_equipped: false,
    unlock_method: 'Earn all stamps',
  },
  // Trails
  {
    id: 30,
    name: 'Sparkle Trail',
    description: 'Leave magic in your wake',
    icon_url: '',
    category: 'trail',
    rarity: 'uncommon',
    is_owned: true,
    is_equipped: false,
  },
  {
    id: 31,
    name: 'Rainbow Trail',
    description: 'Colors follow wherever you go',
    icon_url: '',
    category: 'trail',
    rarity: 'rare',
    is_owned: false,
    is_equipped: false,
    unlock_method: 'Visit 5 parks',
  },
];

const CATEGORY_CONFIG: Record<CosmeticCategory, { label: string; icon: string }> = {
  shark_skin: { label: 'Shark Skins', icon: '🦈' },
  frame: { label: 'Frames', icon: '🖼️' },
  badge: { label: 'Badges', icon: '🎖️' },
  trail: { label: 'Trails', icon: '✨' },
};

const RARITY_CONFIG = {
  common: { label: 'Common', color: '#4CAF50' },
  uncommon: { label: 'Uncommon', color: '#2196F3' },
  rare: { label: 'Rare', color: '#9C27B0' },
  epic: { label: 'Epic', color: '#FF9800' },
  legendary: { label: 'Legendary', color: '#FFD700' },
};

// Cosmetic Card Component
function CosmeticCard({
  item,
  isSelected,
  onPress,
}: {
  item: CosmeticItem;
  isSelected: boolean;
  onPress: () => void;
}) {
  const rarityConfig = RARITY_CONFIG[item.rarity];
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isSelected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSelected]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Animated.View
        style={[
          styles.cosmeticCard,
          {
            borderColor: isSelected ? rarityConfig.color : item.is_owned 
              ? 'rgba(255, 255, 255, 0.3)' 
              : 'rgba(255, 255, 255, 0.1)',
            opacity: item.is_owned ? 1 : 0.5,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        {/* Equipped badge */}
        {item.is_equipped && (
          <View style={styles.equippedBadge}>
            <Text style={styles.equippedText}>✓</Text>
          </View>
        )}

        {/* Rarity indicator */}
        <View style={[styles.rarityDot, { backgroundColor: rarityConfig.color }]} />

        {/* Icon */}
        <View
          style={[
            styles.cosmeticIcon,
            {
              backgroundColor: item.is_owned
                ? `${rarityConfig.color}40`
                : 'rgba(255, 255, 255, 0.1)',
            },
          ]}
        >
          {item.icon_url ? (
            <Image
              source={{ uri: item.icon_url }}
              style={{ width: 50, height: 50 }}
              contentFit="contain"
            />
          ) : (
            <Text style={styles.placeholderEmoji}>
              {CATEGORY_CONFIG[item.category].icon}
            </Text>
          )}

          {/* Lock overlay for unowned */}
          {!item.is_owned && (
            <View style={styles.lockOverlay}>
              <Text style={styles.lockEmoji}>🔒</Text>
            </View>
          )}
        </View>

        {/* Name */}
        <Text style={styles.cosmeticName} numberOfLines={1}>
          {item.name}
        </Text>

        {/* Rarity label */}
        <Text style={[styles.rarityLabel, { color: rarityConfig.color }]}>
          {rarityConfig.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Preview Panel Component
function PreviewPanel({
  cosmetic,
  onEquip,
  onUnequip,
}: {
  cosmetic: CosmeticItem | null;
  onEquip: () => void;
  onUnequip: () => void;
}) {
  const shineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (cosmetic?.rarity === 'legendary' || cosmetic?.rarity === 'epic') {
      Animated.loop(
        Animated.timing(shineAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [cosmetic]);

  if (!cosmetic) {
    return (
      <View style={styles.previewEmpty}>
        <Text style={styles.previewEmptyText}>Select an item to preview</Text>
      </View>
    );
  }

  const rarityConfig = RARITY_CONFIG[cosmetic.rarity];

  return (
    <View style={styles.previewPanel}>
      {/* Preview image/icon */}
      <View style={styles.previewImageContainer}>
        <View
          style={[
            styles.previewImage,
            { borderColor: rarityConfig.color },
          ]}
        >
          {cosmetic.preview_url || cosmetic.icon_url ? (
            <Image
              source={{ uri: cosmetic.preview_url || cosmetic.icon_url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
          ) : (
            <Text style={styles.previewEmoji}>
              {CATEGORY_CONFIG[cosmetic.category].icon}
            </Text>
          )}
        </View>
      </View>

      {/* Info */}
      <View style={styles.previewInfo}>
        <Text style={styles.previewName}>{cosmetic.name}</Text>
        <View style={[styles.previewRarity, { backgroundColor: rarityConfig.color }]}>
          <Text style={styles.previewRarityText}>{rarityConfig.label}</Text>
        </View>
        <Text style={styles.previewDescription}>{cosmetic.description}</Text>

        {/* Action button */}
        {cosmetic.is_owned ? (
          <TouchableOpacity
            style={[
              styles.actionButton,
              cosmetic.is_equipped
                ? styles.unequipButton
                : { backgroundColor: rarityConfig.color },
            ]}
            onPress={cosmetic.is_equipped ? onUnequip : onEquip}
          >
            <Text style={styles.actionButtonText}>
              {cosmetic.is_equipped ? 'Unequip' : 'Equip'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.unlockInfo}>
            <Text style={styles.unlockLabel}>How to unlock:</Text>
            <Text style={styles.unlockMethod}>{cosmetic.unlock_method || 'Coming soon...'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Shark Customization Screen - V2 Feature
 * 
 * Allows players to customize their shark avatar with
 * skins, frames, badges, and trails.
 */
export default function SharkCustomizationScreen() {
  const [cosmetics, setCosmetics] = useState<CosmeticItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CosmeticCategory>('shark_skin');
  const [selectedCosmetic, setSelectedCosmetic] = useState<CosmeticItem | null>(null);
  const [loading, setLoading] = useState(true);

  const { player, refreshPlayer } = useContext(AuthContext);

  // Load cosmetics
  useFocusEffect(
    useCallback(() => {
      // Simulate API call
      setTimeout(() => {
        setCosmetics(MOCK_COSMETICS);
        setLoading(false);
      }, 500);
    }, [])
  );

  // Filter by category
  const filteredCosmetics = cosmetics.filter((c) => c.category === selectedCategory);

  // Owned counts per category
  const getCategoryStats = (category: CosmeticCategory) => {
    const categoryItems = cosmetics.filter((c) => c.category === category);
    return {
      owned: categoryItems.filter((c) => c.is_owned).length,
      total: categoryItems.length,
    };
  };

  const handleEquip = async () => {
    if (!selectedCosmetic) return;
    
    // TODO: Call API to equip
    console.log('Equipping:', selectedCosmetic.name);
    
    // Update local state
    setCosmetics((prev) =>
      prev.map((c) => ({
        ...c,
        is_equipped:
          c.category === selectedCosmetic.category
            ? c.id === selectedCosmetic.id
            : c.is_equipped,
      }))
    );
    setSelectedCosmetic({ ...selectedCosmetic, is_equipped: true });
    await refreshPlayer();
  };

  const handleUnequip = async () => {
    if (!selectedCosmetic) return;
    
    // TODO: Call API to unequip
    console.log('Unequipping:', selectedCosmetic.name);
    
    // Update local state
    setCosmetics((prev) =>
      prev.map((c) => ({
        ...c,
        is_equipped: c.id === selectedCosmetic.id ? false : c.is_equipped,
      }))
    );
    setSelectedCosmetic({ ...selectedCosmetic, is_equipped: false });
    await refreshPlayer();
  };

  return (
    <Wrapper>
      <Topbar />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🦈 Customize Your Shark</Text>
      </View>

      {/* Category Tabs */}
      <View style={styles.categoryTabs}>
        {(Object.keys(CATEGORY_CONFIG) as CosmeticCategory[]).map((category) => {
          const cfg = CATEGORY_CONFIG[category];
          const stats = getCategoryStats(category);
          const isActive = selectedCategory === category;

          return (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryTab,
                isActive && styles.categoryTabActive,
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={styles.categoryIcon}>{cfg.icon}</Text>
              <Text
                style={[
                  styles.categoryLabel,
                  isActive && styles.categoryLabelActive,
                ]}
              >
                {cfg.label}
              </Text>
              <Text style={styles.categoryCount}>
                {stats.owned}/{stats.total}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Preview Panel */}
      <PreviewPanel
        cosmetic={selectedCosmetic}
        onEquip={handleEquip}
        onUnequip={handleUnequip}
      />

      {/* Cosmetics Grid */}
      <View style={styles.gridContainer}>
        <Text style={styles.gridTitle}>
          {CATEGORY_CONFIG[selectedCategory].icon}{' '}
          {CATEGORY_CONFIG[selectedCategory].label}
        </Text>
        <ScrollView
          style={styles.gridScroll}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading cosmetics...</Text>
            </View>
          ) : filteredCosmetics.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No cosmetics in this category</Text>
            </View>
          ) : (
            <View style={styles.gridWrapper}>
              {filteredCosmetics.map((item) => (
                <CosmeticCard
                  key={item.id}
                  item={item}
                  isSelected={selectedCosmetic?.id === item.id}
                  onPress={() => setSelectedCosmetic(item)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Wrapper>
  );
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 52) / 3;

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: 'white',
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  categoryTabs: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  categoryTab: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 12,
  },
  categoryTabActive: {
    backgroundColor: config.tertiary,
  },
  categoryIcon: {
    fontSize: 20,
  },
  categoryLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'white',
    marginTop: 2,
  },
  categoryLabelActive: {
    color: config.primary,
  },
  categoryCount: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  previewPanel: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    marginHorizontal: 12,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    minHeight: 140,
  },
  previewEmpty: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    marginHorizontal: 12,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmptyText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  previewImageContainer: {
    marginRight: 12,
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmoji: {
    fontSize: 50,
  },
  previewInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  previewName: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: 'white',
    marginBottom: 4,
  },
  previewRarity: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 8,
  },
  previewRarityText: {
    fontFamily: 'Knockout',
    fontSize: 11,
    color: config.primary,
    textTransform: 'uppercase',
  },
  previewDescription: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 10,
  },
  actionButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  unequipButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionButtonText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'white',
  },
  unlockInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 10,
    borderRadius: 8,
  },
  unlockLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 2,
  },
  unlockMethod: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: config.tertiary,
  },
  gridContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  gridTitle: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'white',
    marginBottom: 8,
  },
  gridScroll: {
    flex: 1,
  },
  gridContent: {
    paddingBottom: 20,
  },
  gridWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cosmeticCard: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    borderWidth: 2,
    padding: 8,
    alignItems: 'center',
  },
  equippedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  equippedText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rarityDot: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cosmeticIcon: {
    width: 60,
    height: 60,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  placeholderEmoji: {
    fontSize: 32,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockEmoji: {
    fontSize: 20,
  },
  cosmeticName: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: 'white',
    textAlign: 'center',
  },
  rarityLabel: {
    fontFamily: 'Knockout',
    fontSize: 9,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
});
