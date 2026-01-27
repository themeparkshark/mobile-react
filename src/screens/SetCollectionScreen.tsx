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
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faArrowLeft, faLock, faStar, faCheck, faClock, faCloud } from '@fortawesome/free-solid-svg-icons';
import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import {
  PrepItemSetType,
  PrepItemSetItemType,
  SET_THEME_CONFIG,
  SET_RARITY_CONFIG,
} from '../models/prep-item-set-type';

// Mock data for development - will be replaced with API call
const MOCK_SETS: PrepItemSetType[] = [
  {
    id: 1,
    name: 'Churro Collection',
    description: 'Collect all churro varieties!',
    icon_url: null,
    theme: 'food',
    active_from: '2025-01-01',
    active_to: '2025-01-31',
    is_active: true,
    is_monthly: true,
    is_seasonal: false,
    items: [
      { id: 1, prep_item: { id: 1, name: 'Classic Churro', description: null, icon_url: null, energy_reward: 5, ticket_reward: 1, experience_reward: 10, rarity: 1 }, is_collected: true, collected_at: '2025-01-15', quantity_collected: 3, required_quantity: 1, spawn_rarity: 'common' },
      { id: 2, prep_item: { id: 2, name: 'Chocolate Churro', description: null, icon_url: null, energy_reward: 8, ticket_reward: 1, experience_reward: 15, rarity: 2 }, is_collected: true, collected_at: '2025-01-16', quantity_collected: 1, required_quantity: 1, spawn_rarity: 'uncommon' },
      { id: 3, prep_item: { id: 3, name: 'Strawberry Churro', description: null, icon_url: null, energy_reward: 8, ticket_reward: 1, experience_reward: 15, rarity: 2 }, is_collected: false, collected_at: null, quantity_collected: 0, required_quantity: 1, spawn_rarity: 'uncommon' },
      { id: 4, prep_item: { id: 4, name: 'Golden Churro', description: null, icon_url: null, energy_reward: 20, ticket_reward: 3, experience_reward: 50, rarity: 3 }, is_collected: false, collected_at: null, quantity_collected: 0, required_quantity: 1, spawn_rarity: 'rare', hint: 'Only appears on weekends!' },
    ],
    total_items: 4,
    collected_count: 2,
    is_complete: false,
    completion_rewards: { energy: 50, tickets: 10, experience: 200 },
    rarity: 'common',
    sort_order: 1,
  },
  {
    id: 2,
    name: 'Night Explorer',
    description: 'Items that only appear after dark',
    icon_url: null,
    theme: 'night',
    active_from: '2025-01-01',
    active_to: '2025-12-31',
    is_active: true,
    is_monthly: false,
    is_seasonal: false,
    items: [
      { id: 5, prep_item: { id: 5, name: 'Glow Stick', description: null, icon_url: null, energy_reward: 10, ticket_reward: 2, experience_reward: 20, rarity: 2 }, is_collected: true, collected_at: '2025-01-14', quantity_collected: 2, required_quantity: 1, spawn_rarity: 'uncommon', time_window: { start_hour: 21, end_hour: 6 } },
      { id: 6, prep_item: { id: 6, name: 'Flashlight', description: null, icon_url: null, energy_reward: 10, ticket_reward: 2, experience_reward: 20, rarity: 2 }, is_collected: false, collected_at: null, quantity_collected: 0, required_quantity: 1, spawn_rarity: 'uncommon', time_window: { start_hour: 21, end_hour: 6 } },
      { id: 7, prep_item: { id: 7, name: 'Moon Pendant', description: null, icon_url: null, energy_reward: 25, ticket_reward: 5, experience_reward: 75, rarity: 3 }, is_collected: false, collected_at: null, quantity_collected: 0, required_quantity: 1, spawn_rarity: 'rare', time_window: { start_hour: 0, end_hour: 4 }, hint: 'Only appears midnight-4am!' },
    ],
    total_items: 3,
    collected_count: 1,
    is_complete: false,
    completion_rewards: { energy: 75, tickets: 15, experience: 300, title: 'Night Owl' },
    rarity: 'rare',
    sort_order: 2,
  },
];

export default function SetCollectionScreen() {
  const navigation = useNavigation();
  const { player } = useContext(AuthContext);
  const [sets, setSets] = useState<PrepItemSetType[]>(MOCK_SETS);
  const [selectedSet, setSelectedSet] = useState<PrepItemSetType | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'complete'>('all');
  
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Load sets from API (TODO: implement)
  const loadSets = useCallback(async () => {
    // const response = await getSets();
    // setSets(response.data);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSets();
    setRefreshing(false);
  }, [loadSets]);

  // Filter sets
  const filteredSets = sets.filter(set => {
    if (filter === 'active') return set.is_active && !set.is_complete;
    if (filter === 'complete') return set.is_complete;
    return true;
  });

  // Handle set selection
  const handleSelectSet = (set: PrepItemSetType) => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedSet(set);
    Animated.spring(slideAnim, {
      toValue: 1,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  // Close set detail
  const handleCloseDetail = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelectedSet(null));
  };

  // Calculate progress percentage
  const getProgressPercentage = (set: PrepItemSetType): number => {
    return Math.round((set.collected_count / set.total_items) * 100);
  };

  // Render set card
  const renderSetCard = (set: PrepItemSetType) => {
    const themeConfig = SET_THEME_CONFIG[set.theme];
    const rarityConfig = SET_RARITY_CONFIG[set.rarity];
    const progress = getProgressPercentage(set);

    return (
      <TouchableOpacity
        key={set.id}
        onPress={() => handleSelectSet(set)}
        activeOpacity={0.8}
        style={{
          marginBottom: 16,
          borderRadius: 16,
          overflow: 'hidden',
          shadowColor: rarityConfig.color,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 8,
          shadowOpacity: 0.3,
        }}
      >
        <View
          style={{
            backgroundColor: config.primary,
            borderWidth: 3,
            borderColor: rarityConfig.color,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {/* Header with theme color */}
          <View
            style={{
              backgroundColor: themeConfig.color,
              paddingVertical: 8,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 12,
                color: 'white',
                textTransform: 'uppercase',
              }}
            >
              {themeConfig.label}
            </Text>
            {set.is_monthly && (
              <View
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontFamily: 'Knockout', fontSize: 10, color: 'white' }}>
                  MONTHLY
                </Text>
              </View>
            )}
          </View>

          {/* Content */}
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* Icon */}
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: rarityConfig.glow,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                  borderWidth: 2,
                  borderColor: rarityConfig.color,
                }}
              >
                {set.icon_url ? (
                  <Image
                    source={{ uri: set.icon_url }}
                    style={{ width: 40, height: 40 }}
                    contentFit="contain"
                  />
                ) : (
                  <Text style={{ fontSize: 28 }}>
                    {set.theme === 'food' ? '🍿' :
                     set.theme === 'gear' ? '🎒' :
                     set.theme === 'night' ? '🌙' :
                     set.theme === 'weather' ? '🌧️' : '🎁'}
                  </Text>
                )}
              </View>

              {/* Info */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: 'Shark',
                    fontSize: 18,
                    color: 'white',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  {set.name}
                </Text>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 13,
                    color: 'rgba(255, 255, 255, 0.7)',
                  }}
                >
                  {set.collected_count}/{set.total_items} collected
                </Text>
              </View>

              {/* Completion badge */}
              {set.is_complete && (
                <View
                  style={{
                    backgroundColor: '#4CAF50',
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: 'white',
                  }}
                >
                  <FontAwesomeIcon icon={faCheck} size={18} color="white" />
                </View>
              )}
            </View>

            {/* Progress bar */}
            <View style={{ marginTop: 12 }}>
              <View
                style={{
                  height: 12,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 6,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${progress}%`,
                    backgroundColor: set.is_complete ? '#4CAF50' : config.tertiary,
                    borderRadius: 5,
                  }}
                />
              </View>
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 12,
                  color: set.is_complete ? '#4CAF50' : config.tertiary,
                  textAlign: 'right',
                  marginTop: 4,
                }}
              >
                {progress}%
              </Text>
            </View>

            {/* Rewards preview */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-start',
                marginTop: 8,
                gap: 12,
              }}
            >
              {set.completion_rewards.energy > 0 && (
                <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  ⚡{set.completion_rewards.energy}
                </Text>
              )}
              {set.completion_rewards.tickets > 0 && (
                <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  🎟️{set.completion_rewards.tickets}
                </Text>
              )}
              {set.completion_rewards.experience > 0 && (
                <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  ⭐{set.completion_rewards.experience}
                </Text>
              )}
              {set.completion_rewards.title && (
                <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: '#FFD700' }}>
                  🏆 "{set.completion_rewards.title}"
                </Text>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Render item in set detail
  const renderSetItem = (item: PrepItemSetItemType) => {
    const rarityColors = {
      common: '#4CAF50',
      uncommon: '#2196F3',
      rare: '#9C27B0',
      epic: '#FF9800',
      legendary: '#FFD700',
    };
    const color = rarityColors[item.spawn_rarity];

    return (
      <View
        key={item.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: item.is_collected 
            ? 'rgba(76, 175, 80, 0.1)' 
            : 'rgba(255, 255, 255, 0.05)',
          padding: 12,
          borderRadius: 12,
          marginBottom: 8,
          borderWidth: 2,
          borderColor: item.is_collected ? '#4CAF50' : 'rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Item icon */}
        <View
          style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: item.is_collected ? color : 'rgba(255, 255, 255, 0.1)',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
            opacity: item.is_collected ? 1 : 0.5,
          }}
        >
          {!item.is_collected && (
            <FontAwesomeIcon icon={faLock} size={20} color="rgba(255,255,255,0.5)" />
          )}
          {item.is_collected && item.prep_item.icon_url ? (
            <Image
              source={{ uri: item.prep_item.icon_url }}
              style={{ width: 35, height: 35 }}
              contentFit="contain"
            />
          ) : item.is_collected && (
            <Text style={{ fontSize: 24 }}>✓</Text>
          )}
        </View>

        {/* Item info */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 16,
              color: item.is_collected ? 'white' : 'rgba(255, 255, 255, 0.5)',
            }}
          >
            {item.prep_item.name}
          </Text>
          
          {/* Rarity & conditions */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
            <View
              style={{
                backgroundColor: color,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                opacity: item.is_collected ? 1 : 0.5,
              }}
            >
              <Text style={{ fontFamily: 'Knockout', fontSize: 10, color: 'white', textTransform: 'uppercase' }}>
                {item.spawn_rarity}
              </Text>
            </View>
            
            {item.time_window && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesomeIcon icon={faClock} size={10} color="rgba(255,255,255,0.5)" />
                <Text style={{ fontFamily: 'Knockout', fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>
                  {item.time_window.start_hour}:00-{item.time_window.end_hour}:00
                </Text>
              </View>
            )}
            
            {item.weather_required && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesomeIcon icon={faCloud} size={10} color="rgba(255,255,255,0.5)" />
              </View>
            )}
          </View>

          {/* Hint for uncollected items */}
          {!item.is_collected && item.hint && (
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 11,
                color: config.tertiary,
                fontStyle: 'italic',
                marginTop: 4,
              }}
            >
              💡 {item.hint}
            </Text>
          )}
        </View>

        {/* Collection status */}
        {item.is_collected && (
          <View
            style={{
              backgroundColor: '#4CAF50',
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FontAwesomeIcon icon={faCheck} size={14} color="white" />
          </View>
        )}
      </View>
    );
  };

  // Detail slide panel translate
  const detailTranslate = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Dimensions.get('window').height, 0],
  });

  return (
    <Wrapper>
      <Topbar>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ padding: 8 }}
        >
          <FontAwesomeIcon icon={faArrowLeft} size={24} color="white" />
        </TouchableOpacity>
        <Text
          style={{
            fontFamily: 'Shark',
            fontSize: 22,
            color: 'white',
            textTransform: 'uppercase',
            flex: 1,
            textAlign: 'center',
            textShadowColor: 'rgba(0, 0, 0, 0.5)',
            textShadowOffset: { width: 2, height: 2 },
            textShadowRadius: 0,
          }}
        >
          Collections
        </Text>
        <View style={{ width: 40 }} />
      </Topbar>

      {/* Filter tabs */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 16,
          paddingVertical: 8,
          gap: 8,
        }}
      >
        {(['all', 'active', 'complete'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: filter === f ? config.tertiary : 'rgba(255, 255, 255, 0.1)',
            }}
          >
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 14,
                color: filter === f ? config.primary : 'white',
                textTransform: 'uppercase',
              }}
            >
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sets list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" />
        }
      >
        {filteredSets.map(renderSetCard)}

        {filteredSets.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📦</Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 18,
                color: 'rgba(255, 255, 255, 0.5)',
                textAlign: 'center',
              }}
            >
              No sets found
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Set Detail Panel */}
      {selectedSet && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            transform: [{ translateY: detailTranslate }],
          }}
        >
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 60 }}>
            {/* Close button */}
            <TouchableOpacity
              onPress={handleCloseDetail}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: 'white', fontSize: 24 }}>×</Text>
            </TouchableOpacity>

            {/* Set header */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: SET_RARITY_CONFIG[selectedSet.rarity].glow,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 3,
                  borderColor: SET_RARITY_CONFIG[selectedSet.rarity].color,
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 40 }}>
                  {selectedSet.theme === 'food' ? '🍿' :
                   selectedSet.theme === 'gear' ? '🎒' :
                   selectedSet.theme === 'night' ? '🌙' :
                   selectedSet.theme === 'weather' ? '🌧️' : '🎁'}
                </Text>
              </View>

              <Text
                style={{
                  fontFamily: 'Shark',
                  fontSize: 28,
                  color: 'white',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  textShadowColor: 'rgba(0, 0, 0, 0.5)',
                  textShadowOffset: { width: 2, height: 2 },
                  textShadowRadius: 0,
                }}
              >
                {selectedSet.name}
              </Text>

              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 14,
                  color: 'rgba(255, 255, 255, 0.7)',
                  textAlign: 'center',
                  marginTop: 8,
                }}
              >
                {selectedSet.description}
              </Text>

              {/* Progress */}
              <View style={{ width: '100%', marginTop: 16 }}>
                <View
                  style={{
                    height: 16,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      width: `${getProgressPercentage(selectedSet)}%`,
                      backgroundColor: selectedSet.is_complete ? '#4CAF50' : config.tertiary,
                    }}
                  />
                </View>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 16,
                    color: config.tertiary,
                    textAlign: 'center',
                    marginTop: 8,
                  }}
                >
                  {selectedSet.collected_count}/{selectedSet.total_items} Collected
                </Text>
              </View>
            </View>

            {/* Completion rewards */}
            <View
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 24,
                borderWidth: 2,
                borderColor: selectedSet.is_complete ? '#4CAF50' : 'rgba(255, 255, 255, 0.1)',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Shark',
                  fontSize: 16,
                  color: 'white',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                {selectedSet.is_complete ? '✅ Rewards Claimed!' : '🎁 Completion Rewards'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {selectedSet.completion_rewards.energy > 0 && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24 }}>⚡</Text>
                    <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: '#4CAF50' }}>
                      +{selectedSet.completion_rewards.energy}
                    </Text>
                  </View>
                )}
                {selectedSet.completion_rewards.tickets > 0 && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24 }}>🎟️</Text>
                    <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: '#4CAF50' }}>
                      +{selectedSet.completion_rewards.tickets}
                    </Text>
                  </View>
                )}
                {selectedSet.completion_rewards.experience > 0 && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24 }}>⭐</Text>
                    <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: '#4CAF50' }}>
                      +{selectedSet.completion_rewards.experience}
                    </Text>
                  </View>
                )}
                {selectedSet.completion_rewards.title && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 24 }}>🏆</Text>
                    <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: '#FFD700' }}>
                      "{selectedSet.completion_rewards.title}"
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Items list */}
            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 18,
                color: 'white',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Items in Set
            </Text>
            {selectedSet.items.map(renderSetItem)}
          </ScrollView>
        </Animated.View>
      )}
    </Wrapper>
  );
}
