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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faArrowLeft, faLock } from '@fortawesome/free-solid-svg-icons';
import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import CoinLevelingModal from '../components/CoinLevelingModal';
import CoinUpgradeDemo from '../components/CoinUpgradeDemo';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import {
  RideCoinLevelType,
  RIDE_COIN_LEVEL_CONFIG,
} from '../models/ride-coin-level-type';
import { RIDE_PART_RARITY_CONFIG } from '../models/ride-part-type';
import getTasks from '../api/endpoints/parks/getTasks';
import visitedParks from '../api/endpoints/me/visited-parks';
import { getRideParts, RidePartsEntry } from '../api/endpoints/me/ride-parts';
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
    current_perks: level > 1 ? [
      { id: 1, name: 'Tier Upgrade', description: `${['Silver', 'Gold', 'Prismatic', 'Legendary'][Math.min(level - 2, 3)]} coin appearance`, icon_url: '', type: 'cosmetic' as const, value: level },
    ] : [],
    next_level_perks: !isMax ? [
      { id: 2, name: 'Next Tier', description: `${['Silver', 'Gold', 'Prismatic', 'Legendary'][Math.min(level - 1, 3)]} coin appearance`, icon_url: '', type: 'cosmetic' as const, value: level + 1 },
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
  const [ridePartsMap, setRidePartsMap] = useState<Record<number, number>>({}); // task_id -> amount
  const modalScale = useRef(new Animated.Value(0)).current;

  // Load coins by fetching tasks from visited parks + ride parts
  const loadCoins = useCallback(async () => {
    if (!player?.id) return;
    try {
      // Fetch ride parts first (includes both tasks AND secret tasks)
      const rideParts = await getRideParts();
      const partsMap: Record<number, number> = {};
      rideParts.forEach((entry) => {
        // Use task_id or secret_task_id as the key
        const id = entry.task_id ?? entry.secret_task_id;
        if (id) {
          partsMap[id] = entry.amount;
        }
      });
      setRidePartsMap(partsMap);

      // Fetch coins from visited parks
      const parks = await visitedParks(player.id);
      const allCoins: RideCoinLevelType[] = [];
      for (const park of parks) {
        const tasks = await getTasks(park.id);
        for (const task of tasks) {
          if (task.coin_url) {
            allCoins.push(taskToCoinLevel(task, player.level ?? 1));
          }
        }
      }
      setCoins(allCoins);
    } catch (err) {
      console.warn('Failed to load coins:', err);
    }
  }, [player?.id, player?.level]);

  // Refresh data every time screen is focused (real-time updates)
  useFocusEffect(
    useCallback(() => {
      loadCoins();
    }, [loadCoins])
  );

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

  };

  // Close modal
  const handleCloseModal = () => {
    Animated.timing(modalScale, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelectedCoin(null));
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

  // Render coin card
  const TIER_COLORS_CARD = ['#a8a29e', '#cbd5e1', '#fbbf24', '#c4b5fd', '#fb923c'];

  const renderCoinCard = (coin: RideCoinLevelType) => {
    const isMax = coin.current_level === coin.max_level;
    const tierColor = TIER_COLORS_CARD[Math.min(coin.current_level - 1, 4)];

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
            borderWidth: 2,
            borderColor: tierColor,
            opacity: coin.is_unlocked ? 1 : 0.5,
            ...(Platform.OS === 'ios' && coin.current_level >= 3 ? {
              shadowColor: tierColor,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 10,
              shadowOpacity: 0.5,
            } : {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 4,
              shadowOpacity: 0.3,
            }),
          }}
        >
          {/* Locked overlay */}
          {!coin.is_unlocked && (
            <View
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
            >
              <FontAwesomeIcon icon={faLock} size={24} color="white" />
              <Text style={{
                fontFamily: 'Knockout', fontSize: 11,
                color: 'white', marginTop: 4,
              }}>
                Level {coin.player_level_required}
              </Text>
            </View>
          )}

          {/* Animated coin with tier effects */}
          <View style={{ marginBottom: 4 }}>
            <CoinUpgradeDemo
              level={coin.current_level}
              coinUrl={coin.coin_url}
              size={56}
            />
          </View>

          {/* Max badge */}
          {isMax && (
            <View style={{
              position: 'absolute',
              top: 8, right: 8,
              backgroundColor: '#fb923c',
              paddingHorizontal: 6, paddingVertical: 2,
              borderRadius: 8,
            }}>
              <Text style={{
                fontFamily: 'Knockout', fontSize: 10,
                color: 'white', fontWeight: 'bold',
              }}>
                MAX
              </Text>
            </View>
          )}

          {/* Ride name */}
          <Text
            style={{
              fontFamily: 'Knockout', fontSize: 12,
              color: 'white', textAlign: 'center',
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {coin.ride_name}
          </Text>

          {/* Level dots */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 4 }}>
            {Array.from({ length: coin.max_level }).map((_, i) => (
              <View
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: i < coin.current_level
                    ? TIER_COLORS_CARD[Math.min(i, 4)]
                    : 'rgba(255, 255, 255, 0.15)',
                  marginHorizontal: 2,
                }}
              />
            ))}
          </View>

          {/* Times collected */}
          <Text style={{
            fontFamily: 'Knockout', fontSize: 10,
            color: 'rgba(255, 255, 255, 0.5)',
          }}>
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

      {/* ── Collection Progress Header ── */}
      <View style={{
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 4,
      }}>
        {/* Progress bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 8,
          gap: 10,
        }}>
          <Text style={{
            fontFamily: 'Knockout', fontSize: 11,
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            Park Coins
          </Text>
          <View style={{
            flex: 1, height: 6, borderRadius: 3,
            backgroundColor: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}>
            <View style={{
              height: '100%',
              width: coins.length > 0
                ? `${(coins.filter(c => c.times_collected > 0).length / coins.length) * 100}%`
                : '0%',
              borderRadius: 3,
              backgroundColor: config.tertiary,
            }} />
          </View>
          <Text style={{
            fontFamily: 'Knockout', fontSize: 12,
            color: config.tertiary,
          }}>
            {coins.filter(c => c.times_collected > 0).length}/{coins.length}
          </Text>
        </View>

        {/* Inline stats row — real player stats */}
        <View style={{
          flexDirection: 'row',
          gap: 12,
          marginBottom: 10,
        }}>
          <View style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 10,
            gap: 6,
          }}>
            <Text style={{ fontSize: 14 }}>🪙</Text>
            <Text style={{ fontFamily: 'Shark', fontSize: 18, color: config.tertiary }}>
              {player?.coins ?? 0}
            </Text>
            <Text style={{ fontFamily: 'Knockout', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
              Coins
            </Text>
          </View>
          <View style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 10,
            gap: 6,
          }}>
            <Text style={{ fontSize: 14 }}>🏰</Text>
            <Text style={{ fontFamily: 'Shark', fontSize: 18, color: '#fbbf24' }}>
              {player?.park_coins_count ?? 0}
            </Text>
            <Text style={{ fontFamily: 'Knockout', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
              Park Coins
            </Text>
          </View>
          <View style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 10,
            gap: 6,
          }}>
            <Text style={{ fontSize: 14 }}>✅</Text>
            <Text style={{ fontFamily: 'Shark', fontSize: 18, color: '#fb923c' }}>
              {player?.completed_tasks_count ?? 0}
            </Text>
            <Text style={{ fontFamily: 'Knockout', fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
              Tasks
            </Text>
          </View>
        </View>
      </View>

      {/* ── Filter Pills ── */}
      <View style={{
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 6,
        gap: 8,
      }}>
        {([
          { key: 'all' as const, label: 'All', count: coins.length },
          { key: 'unlocked' as const, label: 'Ready', count: coins.filter(c => c.is_unlocked && c.current_level < c.max_level).length },
          { key: 'max' as const, label: 'Maxed', count: coins.filter(c => c.current_level === c.max_level).length },
        ]).map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 20,
              backgroundColor: filter === f.key ? config.tertiary : 'rgba(255, 255, 255, 0.06)',
              borderWidth: 1.5,
              borderColor: filter === f.key ? config.tertiary : 'rgba(255,255,255,0.1)',
              gap: 6,
            }}
          >
            <Text style={{
              fontFamily: 'Knockout', fontSize: 13,
              color: filter === f.key ? config.primary : 'rgba(255,255,255,0.7)',
              textTransform: 'uppercase',
            }}>
              {f.label}
            </Text>
            <View style={{
              backgroundColor: filter === f.key ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)',
              borderRadius: 8,
              paddingHorizontal: 5,
              paddingVertical: 1,
            }}>
              <Text style={{
                fontFamily: 'Knockout', fontSize: 11,
                color: filter === f.key ? config.primary : 'rgba(255,255,255,0.5)',
              }}>
                {f.count}
              </Text>
            </View>
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
        {filteredCoins.length === 0 ? (
          <View style={{
            width: '100%',
            alignItems: 'center',
            paddingVertical: 40,
          }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>
              {filter === 'max' ? '🏆' : '🪙'}
            </Text>
            <Text style={{
              fontFamily: 'Knockout', fontSize: 16,
              color: 'rgba(255,255,255,0.4)',
              textAlign: 'center',
            }}>
              {filter === 'max'
                ? 'No maxed coins yet — keep leveling!'
                : filter === 'unlocked'
                  ? 'No coins ready to level up'
                  : 'Visit parks to start collecting!'}
            </Text>
          </View>
        ) : filteredCoins.map(renderCoinCard)}
      </ScrollView>

      {/* Coin Leveling Modal */}
      <CoinLevelingModal
        visible={selectedCoin !== null}
        rideCoin={selectedCoin}
        playerEnergy={player?.energy ?? 0}
        playerParts={selectedCoin ? (ridePartsMap[selectedCoin.ride_id] ?? 0) : 0}
        onClose={handleCloseModal}
        onLevelUp={async (id) => {
          // TODO: API call to level up coin
          // const res = await levelUpRideCoin(id);
          // Simulate success for now
          await new Promise(r => setTimeout(r, 1800));
          await loadCoins();
          return true;
        }}
      />
    </Wrapper>
  );
}
