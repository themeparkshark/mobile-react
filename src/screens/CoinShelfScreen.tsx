import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from '../helpers/haptics';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faArrowLeft, faLock } from '@fortawesome/free-solid-svg-icons';
import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import CoinLevelingModal from '../components/CoinLevelingModal';
import CoinUpgradeDemo from '../components/CoinUpgradeDemo';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import getRideCoins from '../api/endpoints/me/ride-coins';
import levelUpRideCoin from '../api/endpoints/me/ride-coins/level-up';
import featureRideCoin from '../api/endpoints/me/ride-coins/feature';
import { getTripGoal, setTripGoal, type TripGoalData, type TripGoalRide } from '../api/endpoints/me/trip-goal';

const previewCoins: RideCoinLevelType[] = [
  { id: 1, ride_id: 1, ride_name: 'Space Mountain', coin_url: '', current_level: 1,
    max_level: 5, times_collected: 1, available_parts: 2, energy_to_next_level: 10,
    parts_to_next_level: 2, required_parts: [], player_level_required: 1,
    is_unlocked: true, current_perks: [{ id: 2001, name: 'Park Gym Power',
      description: 'Place this coin in a park gym for 100 team points.', icon_url: '',
      type: 'gym_points', value: 100 }], next_level_perks: [{ id: 2002,
      name: 'Park Gym Power', description: 'Place this coin in a park gym for 200 team points.',
      icon_url: '', type: 'gym_points', value: 200 }] },
  { id: 2, ride_id: 2, ride_name: 'Pirates of the Caribbean', coin_url: '',
    current_level: 2, max_level: 5, times_collected: 3, available_parts: 6,
    energy_to_next_level: 25, parts_to_next_level: 6, required_parts: [],
    player_level_required: 1, is_unlocked: true,
    current_perks: [{ id: 2002, name: 'Park Gym Power',
      description: 'Place this coin in a park gym for 200 team points.', icon_url: '',
      type: 'gym_points', value: 200 }],
    next_level_perks: [{ id: 2003, name: 'Park Gym Power',
      description: 'Place this coin in a park gym for 300 team points.', icon_url: '',
      type: 'gym_points', value: 300 }],
    editions: [{ id: 1, name: 'Moonlit Voyage', color: '#9463C3',
      project_title: 'The Missing Signal', source: 'Ride challenge', earned_at: '2026-09-24' }] },
];
const previewCatalog: TripGoalData = {
  rides: [
    { task_id: 1, asset_id: 1, park_id: 1, park_name: 'Magic Kingdom', ride_name: 'Space Mountain', coin_url: '', coin_owned: true, coin_level: 1 },
    { task_id: 2, asset_id: 2, park_id: 1, park_name: 'Magic Kingdom', ride_name: 'Pirates of the Caribbean', coin_url: '', coin_owned: true, coin_level: 2 },
    { task_id: 3, asset_id: 3, park_id: 1, park_name: 'Magic Kingdom', ride_name: 'Haunted Mansion', coin_url: '', coin_owned: false, coin_level: null },
  ], goal: null, goal_unavailable: false, goal_plan: null,
  wallet: { tickets: 2, energy: 18, ticket_cost: 1, tickets_needed: 0 },
};

export default function CoinShelfScreen({ route }: {
  readonly route?: { readonly params?: { readonly focusCoin?: { readonly assetId: number } } };
}) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const preview = __DEV__ && process.env.EXPO_PUBLIC_COIN_SHELF_PREVIEW === '1';
  const { player, refreshPlayer } = useContext(AuthContext);
  const [coins, setCoins] = useState<RideCoinLevelType[]>(preview ? previewCoins : []);
  const [selectedCoin, setSelectedCoin] = useState<RideCoinLevelType | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'max'>('all');
  const [loadError, setLoadError] = useState(false);
  const [catalog, setCatalog] = useState<TripGoalData | null>(preview ? previewCatalog : null);
  const [catalogStale, setCatalogStale] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const modalScale = useRef(new Animated.Value(0)).current;
  const openedWinCoinRef = useRef<number | null>(null);

  // The server owns coin identity, levels, costs and available parts.
  const loadCoins = useCallback(async () => {
    if (preview) return previewCoins;
    if (!player?.id) return null;
    try {
      const response = await getRideCoins();
      setCoins(response.data);
      setLoadError(false);
      return response.data;
    } catch (err) {
      console.warn('Failed to load coins:', err);
      setLoadError(true);
      return null;
    }
  }, [player?.id, preview]);

  const loadCatalog = useCallback(async () => {
    if (preview) return;
    if (!player?.id) return;
    try {
      setCatalog(await getTripGoal());
      setCatalogStale(false);
    } catch {
      setCatalogStale(true);
    }
  }, [player?.id, preview]);

  // Refresh data every time screen is focused (real-time updates)
  useFocusEffect(
    useCallback(() => {
      if (preview) return;
      void loadCoins();
      void loadCatalog();
    }, [loadCoins, loadCatalog, preview])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadCoins(), loadCatalog()]);
    setRefreshing(false);
  }, [loadCoins, loadCatalog]);

  // One collectible asset counts once, even if an event publishes multiple tasks for it.
  const currentCatalog = Array.from(new Map((catalog?.rides ?? []).map(ride => [ride.asset_id, ride])).values());
  const currentOwned = currentCatalog.filter(ride => ride.coin_owned).length;
  const missingCoins = currentCatalog.filter(ride => !ride.coin_owned);
  const earnedParkId = currentCatalog.find(ride => ride.asset_id === route?.params?.focusCoin?.assetId)?.park_id;
  const nextCoin = catalog?.goal && !catalog.goal.coin_owned
    ? missingCoins.find(ride => ride.asset_id === catalog.goal?.asset_id) ?? missingCoins[0]
    : missingCoins.find(ride => ride.park_id === (earnedParkId ?? catalog?.goal?.park_id)) ?? missingCoins[0];

  const chooseNextCoin = async (ride: TripGoalRide) => {
    if (preview) {
      setCatalog(current => current ? { ...current, goal: ride } : current);
      return;
    }
    if (goalSaving) return;
    setGoalSaving(true);
    try {
      setCatalog(await setTripGoal(ride.task_id));
      setCatalogStale(false);
    } catch {
      setCatalogStale(true);
    } finally {
      setGoalSaving(false);
    }
  };

  // Filter coins
  const isUpgradeReady = (coin: RideCoinLevelType) => coin.is_unlocked &&
    coin.current_level < coin.max_level &&
    (coin.available_parts ?? 0) >= coin.parts_to_next_level &&
    (preview ? 18 : (player?.energy ?? 0)) >= coin.energy_to_next_level;
  const filteredCoins = coins.filter(coin => {
    if (filter === 'unlocked') return isUpgradeReady(coin);
    if (filter === 'max') return coin.current_level === coin.max_level;
    return true;
  });

  const renderMissingCoinCard = (ride: TripGoalRide) => (
    <TouchableOpacity key={`missing-${ride.asset_id}`} accessibilityRole="button"
      accessibilityLabel={`Set ${ride.ride_name} at ${ride.park_name} as your next coin goal`}
      disabled={goalSaving} onPress={() => void chooseNextCoin(ride)}
      style={{ width: (Dimensions.get('window').width - 48) / 2, marginBottom: 16 }}>
      <View style={{ borderRadius: 16, padding: 12,
        alignItems: 'center', borderWidth: 3,
        borderColor: catalog?.goal?.asset_id === ride.asset_id ? '#F3BA3F' : '#84C6E8',
        backgroundColor: '#E7F8FF', minHeight: 178 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2,
          borderStyle: 'dashed', borderColor: '#2288C5',
          alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
          <Image source={require('../../assets/images/coingold.png')}
            style={{ width: 47, height: 47, opacity: 0.5 }} contentFit="contain" />
        </View>
        <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: '#194A70', textAlign: 'center' }} numberOfLines={2}>
          {ride.ride_name}
        </Text>
        <Text style={{ fontFamily: 'Knockout', fontSize: 11, color: '#4C7795', textAlign: 'center' }} numberOfLines={1}>
          {ride.park_name}
        </Text>
        <Text style={{ fontFamily: 'Knockout', fontSize: 11, color: '#925A0A', marginTop: 8 }}>
          {catalog?.goal?.asset_id === ride.asset_id ? 'YOUR NEXT GOAL' : 'SET AS GOAL'}
        </Text>
      </View>
    </TouchableOpacity>
  );

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

  useEffect(() => {
    if (!isFocused) {
      openedWinCoinRef.current = null;
      return;
    }
    const assetId = route?.params?.focusCoin?.assetId;
    if (!assetId || openedWinCoinRef.current === assetId) return;
    const earned = coins.find(coin => coin.id === assetId && coin.times_collected > 0);
    if (!earned) return;
    openedWinCoinRef.current = assetId;
    handleSelectCoin(earned);
  }, [coins, isFocused, route?.params?.focusCoin?.assetId]);

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
    const latestEdition = coin.editions?.[0];
    const ready = isUpgradeReady(coin);
    const energyNeeded = Math.max(0, coin.energy_to_next_level - (preview ? 18 : (player?.energy ?? 0)));
    const partsNeeded = Math.max(0, coin.parts_to_next_level - (coin.available_parts ?? 0));

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
            backgroundColor: '#F5FCFF',
            borderRadius: 16,
            padding: 12,
            alignItems: 'center',
            borderWidth: 3,
            borderColor: ready ? '#F3BA3F' : '#84C6E8',
            minHeight: 178,
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
              backgroundColor: 'rgba(10, 85, 143, 0.86)',
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

          {/* Tier effects stay still in the shelf so a full collection remains smooth. */}
          <View style={{ marginBottom: 4, borderWidth: latestEdition ? 2 : 0,
            borderColor: latestEdition?.color, borderRadius: 50, padding: latestEdition ? 3 : 0 }}>
            <CoinUpgradeDemo
              level={coin.current_level}
              coinUrl={coin.coin_url}
              size={56}
              labelColor="#315D7B"
              animate={false}
            />
          </View>

          {/* Max badge */}
          {coin.is_featured && (
            <View style={{ position: 'absolute', top: 8, left: 8,
              backgroundColor: '#F4CD72', paddingHorizontal: 6, paddingVertical: 2,
              borderRadius: 8 }}>
              <Text style={{ fontFamily: 'Knockout', fontSize: 10, color: '#182A39' }}>FEATURED</Text>
            </View>
          )}
          {isMax && (
            <View style={{
              position: 'absolute',
              top: 8, right: 8,
              backgroundColor: '#D48420',
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
              color: '#194A70', textAlign: 'center',
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {coin.ride_name}
          </Text>
          {latestEdition && <Text numberOfLines={1} style={{
            fontFamily: 'Knockout', fontSize: 10, color: '#7650A9',
            textAlign: 'center', marginBottom: 5,
          }}>
            {latestEdition.name.toUpperCase()}{(coin.editions?.length ?? 0) > 1 ? ` · +${(coin.editions?.length ?? 1) - 1}` : ''}
          </Text>}

          {/* Level dots */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 4 }}>
            {Array.from({ length: coin.max_level }).map((_, i) => (
              <View
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: i < coin.current_level
                    ? TIER_COLORS_CARD[Math.min(i, 4)]
                    : '#AED5E8',
                  marginHorizontal: 2,
                }}
              />
            ))}
          </View>

          {/* One base coin; event editions are collected separately. */}
          <View style={{ marginTop: 3, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
            backgroundColor: ready ? '#FFF0C1' : '#DDF1FB' }}>
            <Text style={{ fontFamily: 'Knockout', fontSize: 11,
              color: ready ? '#86530B' : '#376783', textAlign: 'center' }}>
              {ready ? '★ UPGRADE READY' : coin.current_level >= coin.max_level
                ? 'MAX POWER'
                : partsNeeded > 0
                  ? `${coin.available_parts ?? 0}/${coin.parts_to_next_level} RIDE PARTS`
                  : `NEED ${energyNeeded} ENERGY`}
            </Text>
          </View>
          {!!coin.editions?.length && <Text style={{ fontFamily: 'Knockout', fontSize: 10,
            color: '#4C7795', marginTop: 3 }}>
            {coin.editions.length} project edition{coin.editions.length === 1 ? '' : 's'}
          </Text>}
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

      <ImageBackground source={require('../../assets/images/water_background.png')}
        resizeMode="cover" style={{ flex: 1 }}>

      {/* ── Collection Progress Header ── */}
      <View style={{
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 9,
        backgroundColor: '#DDF5FF',
        borderColor: '#FFFFFF',
        borderWidth: 3,
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingTop: 12,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 9, gap: 9 }}>
          <Image source={require('../../assets/images/coingold.png')}
            style={{ width: 35, height: 35 }} contentFit="contain" />
          <Text style={{ fontFamily: 'Shark', fontSize: 19, color: '#17476B' }}>YOUR RIDE COINS</Text>
        </View>
        {/* Progress bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 8,
          gap: 10,
        }}>
          <Text style={{
            fontFamily: 'Knockout', fontSize: 11,
            color: '#285B7C',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            {catalogStale ? 'Last known collection' : 'Across all parks'}
          </Text>
          <View style={{
            flex: 1, height: 6, borderRadius: 3,
            backgroundColor: '#B4D9E9',
            overflow: 'hidden',
          }}>
            <View style={{
              height: '100%',
              width: currentCatalog.length > 0
                ? `${(currentOwned / currentCatalog.length) * 100}%`
                : '0%',
              borderRadius: 3,
              backgroundColor: '#F0B634',
            }} />
          </View>
          <Text style={{
            fontFamily: 'Knockout', fontSize: 12,
            color: '#85530B',
          }}>
            {catalog ? `${currentOwned}/${currentCatalog.length}` : '—'}
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
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 10,
            gap: 6,
          }}>
            <Image source={require('../../assets/images/coingold.png')} style={{ width: 18, height: 18 }} contentFit="contain" />
            <Text style={{ fontFamily: 'Shark', fontSize: 18, color: '#9B620A' }}>
              {preview ? 117 : (player?.coins ?? 0)}
            </Text>
            <Text style={{ fontFamily: 'Knockout', fontSize: 10, color: '#3D6E8F', textTransform: 'uppercase' }}>
              Coins
            </Text>
          </View>
          <View style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 10,
            gap: 6,
          }}>
            <Image source={require('../../assets/images/coingold.png')} style={{ width: 18, height: 18 }} contentFit="contain" />
            <Text style={{ fontFamily: 'Shark', fontSize: 18, color: '#9B620A' }}>
              {preview ? 2 : (player?.park_coins_count ?? 0)}
            </Text>
            <Text style={{ fontFamily: 'Knockout', fontSize: 10, color: '#3D6E8F', textTransform: 'uppercase' }}>
              Park Coins
            </Text>
          </View>
          <View style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 10,
            gap: 6,
          }}>
            <Text style={{ fontSize: 14, color: '#1284C6' }}>★</Text>
            <Text style={{ fontFamily: 'Shark', fontSize: 18, color: '#0877BB' }}>
              {preview ? 7 : (player?.completed_tasks_count ?? 0)}
            </Text>
            <Text style={{ fontFamily: 'Knockout', fontSize: 10, color: '#3D6E8F', textTransform: 'uppercase' }}>
              Tasks
            </Text>
          </View>
        </View>
      </View>

      {nextCoin && <TouchableOpacity accessibilityRole="button" disabled={goalSaving}
        onPress={() => void chooseNextCoin(nextCoin)}
        style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: '#FFF1C5',
          borderWidth: 3, borderColor: '#F4C453', borderRadius: 14,
          paddingHorizontal: 12, paddingVertical: 10 }}>
        <Text style={{ color: '#805007', fontFamily: 'Knockout', fontSize: 12 }}>
          {catalog?.goal?.asset_id === nextCoin.asset_id ? 'YOUR NEXT COIN' : 'PICK YOUR NEXT COIN'}
        </Text>
        <Text style={{ color: '#17476B', fontFamily: 'Shark', fontSize: 17, lineHeight: 20 }} numberOfLines={2}>
          {nextCoin.ride_name}
        </Text>
        <Text style={{ color: '#376783', fontFamily: 'Knockout', fontSize: 12, marginTop: 2 }} numberOfLines={2}>
          {nextCoin.park_name}
        </Text>
        <Text style={{ color: '#376783', fontFamily: 'Knockout', fontSize: 12, marginTop: 2 }}>
          {catalog?.goal?.asset_id === nextCoin.asset_id ? 'Chosen for your next park visit' : 'Tap to set this ride as your goal'}
        </Text>
      </TouchableOpacity>}

      {/* ── Filter Pills ── */}
      <View style={{
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 6,
        gap: 8,
      }}>
        {([
          { key: 'all' as const, label: 'All', count: coins.length + missingCoins.length },
          { key: 'unlocked' as const, label: 'Ready', count: coins.filter(isUpgradeReady).length },
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
              backgroundColor: filter === f.key ? '#F9C94C' : '#E4F6FE',
              borderWidth: 1.5,
              borderColor: filter === f.key ? '#B67E15' : '#79BBD9',
              gap: 6,
            }}
          >
            <Text style={{
              fontFamily: 'Knockout', fontSize: 13,
              color: '#17476B',
              textTransform: 'uppercase',
            }}>
              {f.label}
            </Text>
            <View style={{
              backgroundColor: filter === f.key ? '#FFF2C4' : '#C3E7F5',
              borderRadius: 8,
              paddingHorizontal: 5,
              paddingVertical: 1,
            }}>
              <Text style={{
                fontFamily: 'Knockout', fontSize: 11,
                color: '#17476B',
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0877BB" />
        }
      >
        {filteredCoins.length === 0 && (filter !== 'all' || missingCoins.length === 0) ? (
          <View style={{ width: '100%', alignItems: 'center', padding: 24,
            backgroundColor: '#E4F6FE', borderColor: '#FFFFFF', borderWidth: 3,
            borderRadius: 18, marginTop: 16 }}>
            <Image source={require('../../assets/images/coingold.png')}
              style={{ width: 64, height: 64, marginBottom: 12 }} contentFit="contain" />
            <Text style={{
              fontFamily: 'Knockout', fontSize: 16,
              color: '#17476B',
              textAlign: 'center',
            }}>
              {filter === 'max'
                ? 'No maxed coins yet — keep leveling!'
                : filter === 'unlocked'
                  ? 'No coins ready to level up'
                  : loadError ? 'Could not load your ride coins. Pull down to try again.' : 'Visit parks to start collecting!'}
            </Text>
          </View>
        ) : <>{filteredCoins.map(renderCoinCard)}{filter === 'all' && missingCoins.map(renderMissingCoinCard)}</>}
      </ScrollView>
      </ImageBackground>

      {/* Coin Leveling Modal */}
      <CoinLevelingModal
        visible={selectedCoin !== null}
        rideCoin={selectedCoin}
        playerEnergy={preview ? 18 : (player?.energy ?? 0)}
        playerParts={selectedCoin?.available_parts ?? 0}
        onClose={handleCloseModal}
        onFeature={async (assetId) => {
          if (preview) return false;
          let saved = false;
          try {
            await featureRideCoin(assetId);
            saved = true;
          } catch (err) {
            console.warn('Failed to feature ride coin:', err);
          }
          const latest = await loadCoins();
          if (latest) {
            saved = assetId === null
              ? latest.every(coin => !coin.is_featured)
              : latest.some(coin => coin.id === assetId && coin.is_featured);
          }
          if (saved) await refreshPlayer().catch(() => {});
          return saved;
        }}
        onLevelUp={async (id) => {
          if (preview) return false;
          if (!selectedCoin) return false;
          try {
            await levelUpRideCoin(id, selectedCoin.current_level);
            await loadCoins();
            return true;
          } catch {
            // A dropped response can follow a committed upgrade. Reconcile with
            // the server before offering another spend from the old level.
            const latest = await loadCoins();
            return !!latest?.some(coin =>
              coin.id === id && coin.current_level > selectedCoin.current_level);
          }
        }}
      />
    </Wrapper>
  );
}
