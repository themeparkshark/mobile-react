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
import * as Haptics from '../helpers/haptics';
import { useNavigation } from '@react-navigation/native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faArrowLeft, faLock, faStar, faArrowUp } from '@fortawesome/free-solid-svg-icons';
import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import {
  RideCoinLevelType,
  RIDE_COIN_LEVEL_CONFIG,
} from '../models/ride-coin-level-type';
import { RIDE_PART_RARITY_CONFIG } from '../models/ride-part-type';
import getTasks from '../api/endpoints/parks/getTasks';
import visitedParks from '../api/endpoints/me/visited-parks';
import { TaskType } from '../models/task-type';

// Mock coins for initial state (replaced when API loads)
const MOCK_COINS: RideCoinLevelType[] = [];

// Helper to convert TaskType to RideCoinLevelType with real coin images
const taskToCoinLevel = (task: TaskType, playerLevel: number): RideCoinLevelType => {
  // Simulate leveling based on times_completed (until backend supports it)
  const level = Math.min(Math.floor(task.times_completed / 3), 5);
  const isMax = level >= 5;
  
  // Calculate required player level based on task experience (higher XP = harder ride)
  const requiredLevel = Math.max(1, Math.floor(task.experience / 20));
  const isUnlocked = playerLevel >= requiredLevel;
  
  return {
    id: task.id,
    ride_id: task.id,
    ride_name: task.name,
    coin_url: task.coin_url, // ← REAL COIN IMAGE!
    current_level: level,
    max_level: 5,
    times_collected: task.times_completed,
    energy_to_next_level: isMax ? 0 : (level + 1) * 10,
    parts_to_next_level: isMax ? 0 : (level + 1) * 5,
    required_parts: [],
    player_level_required: requiredLevel,
    is_unlocked: isUnlocked,
    current_perks: level > 0 ? [
      { id: 1, name: 'Coin Boost', description: `${1 + level * 0.1}x coins`, icon_url: '', type: 'multiplier', value: 1 + level * 0.1 },
    ] : [],
    next_level_perks: !isMax ? [
      { id: 2, name: 'Next Boost', description: `${1 + (level + 1) * 0.1}x coins`, icon_url: '', type: 'multiplier', value: 1 + (level + 1) * 0.1 },
    ] : [],
    current_frame_url: '',
    next_frame_url: '',
  };
};

export default function CoinShelfScreen() {
  const navigation = useNavigation();
  const { player } = useContext(AuthContext);
  const [coins, setCoins] = useState<RideCoinLevelType[]>(MOCK_COINS);
  const [selectedCoin, setSelectedCoin] = useState<RideCoinLevelType | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'max'>('all');
  const [showLevelUp, setShowLevelUp] = useState(false);

  const modalScale = useRef(new Animated.Value(0)).current;
  const coinRotate = useRef(new Animated.Value(0)).current;

  // Load coins from API (TODO: implement)
  const loadCoins = useCallback(async () => {
    // const response = await getCoins();
    // setCoins(response.data);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCoins();
    setRefreshing(false);
  }, [loadCoins]);

  // Filter coins
  const filteredCoins = coins.filter(coin => {
    if (filter === 'unlocked') return coin.is_unlocked && coin.current_level < coin.max_level;
    if (filter === 'max') return coin.current_level === coin.max_level;
    return true;
  });

  // Handle coin selection
  const handleSelectCoin = (coin: RideCoinLevelType) => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSelectedCoin(coin);
    modalScale.setValue(0);
    Animated.spring(modalScale, {
      toValue: 1,
      friction: 6,
      useNativeDriver: true,
    }).start();

    // Spin animation for the coin
    coinRotate.setValue(0);
    Animated.loop(
      Animated.timing(coinRotate, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();
  };

  // Close modal
  const handleCloseModal = () => {
    Animated.timing(modalScale, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelectedCoin(null));
  };

  // Handle level up
  const handleLevelUp = async () => {
    if (!selectedCoin || !selectedCoin.is_unlocked) return;
    
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    setShowLevelUp(true);
    
    // TODO: API call to level up
    // await levelUpCoin(selectedCoin.id);
    
    // Simulate level up
    setTimeout(() => {
      setShowLevelUp(false);
      // Refresh coins list
      loadCoins();
    }, 2000);
  };

  // Get level color
  const getLevelColor = (level: number, maxLevel: number): string => {
    if (level === maxLevel) return '#FFD700'; // Gold for max
    if (level >= 4) return '#9C27B0'; // Purple for 4+
    if (level >= 3) return '#2196F3'; // Blue for 3+
    if (level >= 2) return '#4CAF50'; // Green for 2+
    return '#888'; // Gray for 1
  };

  // Get frame style based on level
  const getFrameStyle = (level: number) => {
    const styles = {
      0: { borderColor: '#666', borderWidth: 2 },
      1: { borderColor: '#CD7F32', borderWidth: 3 }, // Bronze
      2: { borderColor: '#C0C0C0', borderWidth: 3 }, // Silver
      3: { borderColor: '#C0C0C0', borderWidth: 4, shadowColor: '#C0C0C0' },
      4: { borderColor: '#FFD700', borderWidth: 4 }, // Gold
      5: { borderColor: '#FFD700', borderWidth: 5, shadowColor: '#FFD700' }, // Max gold
    };
    return styles[Math.min(level, 5) as keyof typeof styles];
  };

  const coinSpin = coinRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Render coin card
  const renderCoinCard = (coin: RideCoinLevelType) => {
    const frameStyle = getFrameStyle(coin.current_level);
    const levelColor = getLevelColor(coin.current_level, coin.max_level);
    const isMax = coin.current_level === coin.max_level;

    return (
      <TouchableOpacity
        key={coin.id}
        onPress={() => coin.is_unlocked && handleSelectCoin(coin)}
        activeOpacity={coin.is_unlocked ? 0.8 : 1}
        style={{
          width: (Dimensions.get('window').width - 48) / 2,
          marginBottom: 16,
        }}
      >
        <View
          style={{
            backgroundColor: config.primary,
            borderRadius: 16,
            padding: 12,
            alignItems: 'center',
            borderWidth: frameStyle.borderWidth,
            borderColor: frameStyle.borderColor,
            opacity: coin.is_unlocked ? 1 : 0.5,
            shadowColor: frameStyle.shadowColor || '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: frameStyle.shadowColor ? 10 : 4,
            shadowOpacity: frameStyle.shadowColor ? 0.5 : 0.3,
          }}
        >
          {/* Locked overlay */}
          {!coin.is_unlocked && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
            >
              <FontAwesomeIcon icon={faLock} size={24} color="white" />
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 11,
                  color: 'white',
                  marginTop: 4,
                }}
              >
                Level {coin.player_level_required}
              </Text>
            </View>
          )}

          {/* Coin image */}
          <View
            style={{
              width: 70,
              height: 70,
              borderRadius: 35,
              backgroundColor: levelColor,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
              borderWidth: 3,
              borderColor: 'white',
            }}
          >
            {coin.coin_url ? (
              <Image
                source={{ uri: coin.coin_url }}
                style={{ width: 50, height: 50 }}
                contentFit="contain"
              />
            ) : (
              <Text style={{ fontSize: 32 }}>🪙</Text>
            )}
          </View>

          {/* Max badge */}
          {isMax && (
            <View
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: '#FFD700',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 10,
                  color: config.primary,
                  fontWeight: 'bold',
                }}
              >
                MAX
              </Text>
            </View>
          )}

          {/* Ride name */}
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 12,
              color: 'white',
              textAlign: 'center',
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {coin.ride_name}
          </Text>

          {/* Level indicator */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              marginBottom: 4,
            }}
          >
            {Array.from({ length: coin.max_level }).map((_, i) => (
              <View
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i < coin.current_level ? levelColor : 'rgba(255, 255, 255, 0.2)',
                  marginHorizontal: 2,
                }}
              />
            ))}
          </View>

          {/* Times collected */}
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 10,
              color: 'rgba(255, 255, 255, 0.5)',
            }}
          >
            ×{coin.times_collected} collected
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

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
          Coin Shelf
        </Text>
        <View style={{ width: 40 }} />
      </Topbar>

      {/* Stats summary */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingVertical: 12,
          paddingHorizontal: 16,
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          marginHorizontal: 16,
          marginTop: 8,
          borderRadius: 12,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Shark', fontSize: 24, color: config.tertiary }}>
            {coins.filter(c => c.is_unlocked).length}
          </Text>
          <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            Unlocked
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Shark', fontSize: 24, color: '#FFD700' }}>
            {coins.filter(c => c.current_level === c.max_level).length}
          </Text>
          <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            Maxed
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Shark', fontSize: 24, color: '#4CAF50' }}>
            {coins.reduce((sum, c) => sum + c.times_collected, 0)}
          </Text>
          <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            Total Collected
          </Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 16,
          paddingVertical: 8,
          gap: 8,
        }}
      >
        {(['all', 'unlocked', 'max'] as const).map((f) => (
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
              {f === 'max' ? 'Maxed' : f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Coins grid */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          padding: 16,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" />
        }
      >
        {filteredCoins.map(renderCoinCard)}
      </ScrollView>

      {/* Coin Detail Modal */}
      {selectedCoin && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={handleCloseModal}
          />

          <Animated.View
            style={{
              backgroundColor: config.primary,
              borderRadius: 20,
              padding: 24,
              width: Dimensions.get('window').width - 48,
              alignItems: 'center',
              transform: [{ scale: modalScale }],
              borderWidth: 3,
              borderColor: getLevelColor(selectedCoin.current_level, selectedCoin.max_level),
            }}
          >
            {/* Spinning coin */}
            <Animated.View
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: getLevelColor(selectedCoin.current_level, selectedCoin.max_level),
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                borderWidth: 4,
                borderColor: 'white',
                transform: [{ rotateY: coinSpin }],
              }}
            >
              <Text style={{ fontSize: 50 }}>🪙</Text>
            </Animated.View>

            {/* Ride name */}
            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 24,
                color: 'white',
                textTransform: 'uppercase',
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              {selectedCoin.ride_name}
            </Text>

            {/* Level */}
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 18,
                color: config.tertiary,
                marginBottom: 16,
              }}
            >
              Level {selectedCoin.current_level}/{selectedCoin.max_level}
            </Text>

            {/* Level dots */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              {Array.from({ length: selectedCoin.max_level }).map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: i < selectedCoin.current_level
                      ? getLevelColor(selectedCoin.current_level, selectedCoin.max_level)
                      : 'rgba(255, 255, 255, 0.2)',
                    marginHorizontal: 4,
                    borderWidth: 2,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                  }}
                />
              ))}
            </View>

            {/* Current perks */}
            {selectedCoin.current_perks.length > 0 && (
              <View style={{ width: '100%', marginBottom: 16 }}>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 14,
                    color: 'rgba(255, 255, 255, 0.7)',
                    marginBottom: 8,
                  }}
                >
                  Current Perks:
                </Text>
                {selectedCoin.current_perks.map((perk) => (
                  <View
                    key={perk.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: 'rgba(76, 175, 80, 0.2)',
                      padding: 8,
                      borderRadius: 8,
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ fontSize: 16, marginRight: 8 }}>✓</Text>
                    <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: '#4CAF50' }}>
                      {perk.description}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Next level perks */}
            {selectedCoin.current_level < selectedCoin.max_level && selectedCoin.next_level_perks.length > 0 && (
              <View style={{ width: '100%', marginBottom: 16 }}>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 14,
                    color: 'rgba(255, 255, 255, 0.7)',
                    marginBottom: 8,
                  }}
                >
                  Next Level Unlocks:
                </Text>
                {selectedCoin.next_level_perks.map((perk) => (
                  <View
                    key={perk.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      padding: 8,
                      borderRadius: 8,
                      marginBottom: 4,
                    }}
                  >
                    <FontAwesomeIcon icon={faStar} size={14} color={config.tertiary} style={{ marginRight: 8 }} />
                    <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: 'white' }}>
                      {perk.description}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Level up button */}
            {selectedCoin.current_level < selectedCoin.max_level && (
              <View style={{ width: '100%', alignItems: 'center' }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'center',
                    marginBottom: 12,
                    gap: 16,
                  }}
                >
                  <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                    ⚡ {selectedCoin.energy_to_next_level} Energy
                  </Text>
                  <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                    🔧 {selectedCoin.parts_to_next_level} Parts
                  </Text>
                </View>

                <Button onPress={handleLevelUp}>
                  <View
                    style={{
                      backgroundColor: config.tertiary,
                      paddingHorizontal: 32,
                      paddingVertical: 14,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <FontAwesomeIcon icon={faArrowUp} size={16} color={config.primary} style={{ marginRight: 8 }} />
                    <Text
                      style={{
                        fontFamily: 'Shark',
                        fontSize: 18,
                        color: config.primary,
                        textTransform: 'uppercase',
                      }}
                    >
                      Level Up!
                    </Text>
                  </View>
                </Button>
              </View>
            )}

            {/* Max level celebration */}
            {selectedCoin.current_level === selectedCoin.max_level && (
              <View
                style={{
                  backgroundColor: 'rgba(255, 215, 0, 0.2)',
                  padding: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🏆</Text>
                <Text
                  style={{
                    fontFamily: 'Shark',
                    fontSize: 18,
                    color: '#FFD700',
                    textTransform: 'uppercase',
                  }}
                >
                  Max Level!
                </Text>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 14,
                    color: 'rgba(255, 255, 255, 0.7)',
                    marginTop: 4,
                  }}
                >
                  Boss challenge available!
                </Text>
              </View>
            )}

            {/* Close button */}
            <TouchableOpacity
              onPress={handleCloseModal}
              style={{
                marginTop: 16,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 14,
                  color: 'rgba(255, 255, 255, 0.6)',
                }}
              >
                Close
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </Wrapper>
  );
}
