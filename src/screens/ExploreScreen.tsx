import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import React, { useCallback, useContext, useState, useEffect, Suspense } from 'react';
import { Text, TouchableOpacity, View, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Modal from 'react-native-modal';
import { Marker } from 'react-native-maps';
import { useAsyncEffect } from 'rooks';
import { TaskType } from '../models/task-type';
import * as RootNavigation from '../RootNavigation';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
// Lazy load ARView to prevent camera module crash
const ARView = React.lazy(() => import('../components/ARView'));
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Map from '../components/Map';
import RedeemModal from '../components/RedeemModal';
import PrepItemRedeemModal from '../components/PrepItemRedeemModal';
// TaskListModal removed - tasks now spawn on map Pokemon-style
import Topbar from '../components/Topbar';
import Currency from '../components/Topbar/Currency';
import TappableCurrency from '../components/Topbar/TappableCurrency';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import UsernameBanner from '../components/Topbar/UsernameBanner';
import Wrapper from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import { LocationContext } from '../context/LocationProvider';
import { ThemeContext } from '../context/ThemeProvider';
import checkForRedeemable from '../helpers/check-for-redeemable';
import { CurrentRedeemableType } from '../models/current-redeemable-type';
import { RedeemablesType } from '../models/redeemables-type';
import { PrepItemType } from '../models/prep-item-type';
import Coin from './ExploreScreen/Coin';
import Key from './ExploreScreen/Key';
import HomeExplore from './ExploreScreen/HomeExplore';
import ItemMarker from './ExploreScreen/ItemMarker';
import NotSignedIn from './ExploreScreen/NotSignedIn';
import PermissionsNotGranted from './ExploreScreen/PermissionsNotGranted';
import PinMarker from './ExploreScreen/PinMarker';
import Redeemable from './ExploreScreen/Redeemable';
import TaskMarker from './ExploreScreen/TaskMarker';
import VaultMarker from './ExploreScreen/VaultMarker';
import CommunityCenterMarker from '../components/CommunityCenterMarker';
import CommunityCenterModal from '../components/CommunityCenterModal';
import getCommunityCenter, { CommunityCenter } from '../api/endpoints/community-center/getCommunityCenter';
// Gym Battle imports
import { BattleHUD, GymMarker, SwordMarker } from '../components/GymBattle';
import { getGym, getSwords, getMyTeam, claimSword, getMySwords, GymData, SwordSpawn, TeamInfo } from '../api/endpoints/gym-battle';
import { useTutorial } from '../components/Tutorial';
import SignInButtons from '../components/SignInButtons';

dayjs.extend(require('dayjs/plugin/isBetween'));

// Community Center range in meters (same as task buildings - config.mobile.redeem_radius)
const COMMUNITY_CENTER_RANGE_METERS = 14;

// Prep item range in meters (same as community center)
const PREP_ITEM_RANGE_METERS = 28;

// Calculate distance between two coordinates in meters (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ExploreScreen() {
  const [redeemables, setRedeemables] = useState<RedeemablesType | null>();
  const [activeRedeemable, setActiveRedeemable] = useState<
    CurrentRedeemableType | undefined
  >();
  const [failedTaskIds, setFailedTaskIds] = useState<Set<number>>(new Set());
  const [selectedTask, setSelectedTask] = useState<TaskType | null>(null);
  
  // Persist failed task IDs to storage (survives app restart, resets daily)
  const FAILED_TASKS_KEY = 'failed_task_ids';
  const FAILED_TASKS_DATE_KEY = 'failed_task_ids_date';
  
  // Load failed task IDs from storage on mount (reset if new day)
  useEffect(() => {
    const loadFailedTasks = async () => {
      try {
        const storedDate = await SecureStore.getItemAsync(FAILED_TASKS_DATE_KEY);
        const today = dayjs().format('YYYY-MM-DD');
        
        // Reset failed tasks if it's a new day
        if (storedDate !== today) {
          await SecureStore.deleteItemAsync(FAILED_TASKS_KEY);
          await SecureStore.setItemAsync(FAILED_TASKS_DATE_KEY, today);
          setFailedTaskIds(new Set());
          return;
        }
        
        // Load stored failed tasks
        const stored = await SecureStore.getItemAsync(FAILED_TASKS_KEY);
        if (stored) {
          const ids = JSON.parse(stored) as number[];
          setFailedTaskIds(new Set(ids));
        }
      } catch (e) {
        console.warn('Failed to load failed task IDs:', e);
      }
    };
    loadFailedTasks();
  }, []);
  
  // Save failed task IDs to storage whenever they change
  useEffect(() => {
    if (failedTaskIds.size > 0) {
      SecureStore.setItemAsync(FAILED_TASKS_KEY, JSON.stringify([...failedTaskIds]));
      SecureStore.setItemAsync(FAILED_TASKS_DATE_KEY, dayjs().format('YYYY-MM-DD'));
    }
  }, [failedTaskIds]);
  // Home mode state for prep items
  const [activePrepItem, setActivePrepItem] = useState<PrepItemType | null>(null);
  const [activePrepItemPivotId, setActivePrepItemPivotId] = useState<number | null>(null);
  const [showPrepItemModal, setShowPrepItemModal] = useState(false);
  const [arMode, setArMode] = useState(false);
  
  // Community Center state
  const [communityCenter, setCommunityCenter] = useState<CommunityCenter | null>(null);
  const [showCommunityCenterModal, setShowCommunityCenterModal] = useState(false);
  const [showTooFarModal, setShowTooFarModal] = useState(false);
  const [tooFarDistance, setTooFarDistance] = useState<string>('');
  
  // Gym Battle state
  const [gymData, setGymData] = useState<GymData | null>(null);
  const [swords, setSwords] = useState<SwordSpawn[]>([]);
  const [playerTeam, setPlayerTeam] = useState<TeamInfo | null>(null);
  const [playerSwordCount, setPlayerSwordCount] = useState<number>(0);
  
  const { refreshPlayer, player } = useContext(AuthContext);
  const { parkLoaded, location, park, permissionGranted } =
    useContext(LocationContext);
  const { theme } = useContext(ThemeContext);
  const { currencies } = useContext(CurrencyContext);
  const { startTutorial, hasCompleted, registerRef } = useTutorial();
  
  // Trigger onboarding tutorial on first visit
  useEffect(() => {
    if (player && !hasCompleted('onboarding')) {
      const timer = setTimeout(() => {
        startTutorial('onboarding');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [player]);
  
  // Handler for when user taps a prep item in home mode — enforce proximity
  const handlePrepItemNearby = useCallback((prepItem: PrepItemType, pivotId: number) => {
    // Check distance before allowing collection
    if (prepItem.latitude && prepItem.longitude && location?.latitude && location?.longitude) {
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        prepItem.latitude,
        prepItem.longitude
      );

      if (distance > PREP_ITEM_RANGE_METERS) {
        const distanceText = distance > 1000
          ? `${(distance / 1000).toFixed(1)}km`
          : `${Math.round(distance)}m`;
        setTooFarDistance(distanceText);
        setShowTooFarModal(true);
        return;
      }
    } else if (!location?.latitude || !location?.longitude) {
      // No location available — show too far modal with unknown distance
      setTooFarDistance('unknown');
      setShowTooFarModal(true);
      return;
    }

    setActivePrepItem(prepItem);
    setActivePrepItemPivotId(pivotId);
    setShowPrepItemModal(true);
  }, [location]);

  // Handler for Community Center tap - check if in range
  const handleCommunityCenterPress = useCallback(() => {
    if (!communityCenter || !location?.latitude || !location?.longitude) {
      setTooFarDistance('unknown');
      setShowTooFarModal(true);
      return;
    }
    
    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      communityCenter.latitude,
      communityCenter.longitude
    );
    
    if (distance > COMMUNITY_CENTER_RANGE_METERS) {
      const distanceText = distance > 1000 
        ? `${(distance / 1000).toFixed(1)}km` 
        : `${Math.round(distance)}m`;
      setTooFarDistance(distanceText);
      setShowTooFarModal(true);
      return;
    }
    
    // Navigate to full-screen Community Center experience
    RootNavigation.navigate('CommunityCenter', { parkId: park!.id, centerId: communityCenter.id });
  }, [communityCenter, location]);

  const getRedeemables = async () => {
    setActiveRedeemable(undefined);
    const data = await currentRedeemables();
    console.log('🎯 Redeemables fetched:', {
      tasks: data?.tasks?.length ?? 0,
      coins: data?.coins?.length ?? 0,
      keys: data?.keys?.length ?? 0,
    });
    if (data?.tasks?.length > 0) {
      console.log('🎯 First task:', data.tasks[0]);
    }
    setRedeemables(data);
  };

  useAsyncEffect(async () => {
    if (!park) {
      setRedeemables(null);
      setActiveRedeemable(undefined);
      setCommunityCenter(null);
      return;
    }

    await getRedeemables();
    
    // Fetch community center for this park
    const center = await getCommunityCenter(park.id);
    setCommunityCenter(center);
  }, [park?.id]);
  
  // Refresh community center data
  const refreshCommunityCenter = useCallback(async () => {
    if (park?.id) {
      const center = await getCommunityCenter(park.id);
      setCommunityCenter(center);
    }
  }, [park?.id]);

  // Fetch gym battle data
  const fetchGymData = useCallback(async () => {
    if (!park?.id) {
      setGymData(null);
      setSwords([]);
      return;
    }
    try {
      const [gym, swordsData] = await Promise.all([
        getGym(park.id).catch(() => null),
        getSwords(park.id).catch(() => ({ swords: [] })),
      ]);
      setGymData(gym);
      setSwords(swordsData.swords);
    } catch (error) {
      console.log('Gym data fetch error:', error);
    }
  }, [park?.id]);

  // Check player team and sword count on mount
  useEffect(() => {
    const checkTeamAndSwords = async () => {
      try {
        const team = await getMyTeam();
        setPlayerTeam(team);
        
        // Also fetch sword count
        const swordsData = await getMySwords();
        setPlayerSwordCount(swordsData.swords);
      } catch (error) {
        console.log('Team/swords check error:', error);
      }
    };
    if (player) {
      checkTeamAndSwords();
    }
  }, [player?.id]);

  // Fetch gym data when park changes and refresh periodically (even without team - to show marker)
  useEffect(() => {
    if (park?.id) {
      fetchGymData();
      const interval = setInterval(fetchGymData, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [park?.id, fetchGymData]);

  // Handle gym marker press
  // Gym range in meters (same as community center)
  const GYM_RANGE_METERS = 25;

  const handleGymPress = useCallback(() => {
    if (!playerTeam?.has_team) {
      RootNavigation.navigate('TeamSelection', { 
        onTeamSelected: () => {
          getMyTeam().then(setPlayerTeam);
        }
      });
      return;
    }
    
    // Check distance to gym
    if (!gymData || !location?.latitude || !location?.longitude) {
      setTooFarDistance('unknown');
      setShowTooFarModal(true);
      return;
    }
    
    const distance = calculateDistance(
      location.latitude,
      location.longitude,
      gymData.gym.latitude,
      gymData.gym.longitude
    );
    
    if (distance > GYM_RANGE_METERS) {
      const distanceText = distance > 1000 
        ? `${(distance / 1000).toFixed(1)}km` 
        : `${Math.round(distance)}m`;
      setTooFarDistance(distanceText);
      setShowTooFarModal(true);
      return;
    }
    
    if (park?.id) {
      RootNavigation.navigate('GymBattle', { parkId: park.id, coinUrl: park.coin_url });
    }
  }, [playerTeam, park?.id, gymData, location]);

  // Handle sword claim
  const handleSwordClaim = useCallback(async (swordId: number) => {
    try {
      const result = await claimSword(swordId);
      setPlayerSwordCount(result.total_swords); // Update sword count in topbar
      fetchGymData(); // Refresh to update sword list on map
    } catch (error: any) {
      console.log('Sword claim error:', error.response?.data?.error || error);
    }
  }, [fetchGymData]);

  useAsyncEffect(async () => {
    if (!park || !location?.latitude || !location?.longitude || !redeemables) {
      return;
    }

    const redeemable = await checkForRedeemable();
    
    // Don't show redeemable if it's a task that was failed locally
    if (redeemable?.type === 'task' && failedTaskIds.has(redeemable.model.id)) {
      setActiveRedeemable(undefined);
      return;
    }
    
    setActiveRedeemable(redeemable);
  }, [park?.id, location?.latitude, location?.longitude, redeemables, failedTaskIds]);

  return (
    <Wrapper>
      <Topbar>
        {/* Topbar currencies — only for signed-in users */}
        {player ? (
          <>
            {/* Park mode: show park coins */}
            {park && (
              <TopbarColumn>
                <Currency
                  image={park?.coin_url}
                  count={park?.park_coins_count}
                  name="Park Coins"
                  flyTarget="park_coins"
                />
              </TopbarColumn>
            )}
            {/* Park mode: theme currency and other currencies */}
            {park && theme?.currency && (
              <TopbarColumn>
                <Currency
                  image={theme.currency.icon_url}
                  count={player[theme.currency.name.toLowerCase()]}
                  name="Park Coins"
                  flyTarget="theme_currency"
                />
              </TopbarColumn>
            )}
            {park && currencies.map((currency, index) => (
              <TopbarColumn key={currency.id}>
                <Currency
                  image={currency.icon_url}
                  count={player[currency.name.toLowerCase()]}
                  name={currency.name === 'Coins' ? 'Shark Coins' : currency.name}
                  flyTarget={index === 0 ? 'coins' : 'keys'}
                />
              </TopbarColumn>
            ))}
            {/* TRAVEL MODE: Coins | TRAVEL MODE | Keys */}
            {!park && (
              <>
                {/* Left: First currency (Shark Coins) */}
                <TopbarColumn>
                  {currencies[0] && (
                    <Currency
                      image={currencies[0].icon_url}
                      count={player[currencies[0].name.toLowerCase()]}
                      name="Shark Coins"
                      flyTarget="coins"
                    />
                  )}
                </TopbarColumn>
                {/* Center: TRAVEL MODE */}
                <TopbarColumn>
                  <Text style={{
                    fontSize: 16,
                    color: 'white',
                    fontFamily: 'Shark',
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                    textShadowColor: 'rgba(0, 0, 0, .5)',
                    textShadowOffset: { width: 2, height: 2 },
                    textShadowRadius: 0,
                    textAlign: 'center',
                  }}>Travel Mode</Text>
                </TopbarColumn>
                {/* Right: Tickets (keys hidden - replaced by swords) */}
                <TopbarColumn>
                  <TappableCurrency name="Tickets" count={player.tickets ?? 0}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Image
                        source={require('../../assets/images/ticket-icon.png')}
                        style={{ width: 28, height: 28, marginRight: 4 }}
                        contentFit="contain"
                      />
                      <Text style={{
                        fontSize: 24,
                        color: 'white',
                        fontFamily: 'Shark',
                        textShadowColor: 'rgba(0, 0, 0, .5)',
                        textShadowOffset: { width: 2, height: 2 },
                        textShadowRadius: 0,
                      }}>{player.tickets ?? 0}</Text>
                    </View>
                  </TappableCurrency>
                </TopbarColumn>
              </>
            )}
            {/* Park mode: show tickets if player has any */}
            {park && (player.tickets ?? 0) > 0 && (
              <TopbarColumn>
                <TappableCurrency name="Tickets" count={player.tickets ?? 0}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Image
                      source={require('../../assets/images/ticket-icon.png')}
                      style={{ width: 28, height: 28, marginRight: 4 }}
                      contentFit="contain"
                    />
                    <Text style={{
                      fontSize: 24,
                      color: 'white',
                      fontFamily: 'Shark',
                      textShadowColor: 'rgba(0, 0, 0, .5)',
                      textShadowOffset: { width: 2, height: 2 },
                      textShadowRadius: 0,
                    }}>{player.tickets ?? 0}</Text>
                  </View>
                </TappableCurrency>
              </TopbarColumn>
            )}
            {/* Swords moved to bottom bar with energy */}
          </>
        ) : (
          <TopbarColumn>
            <Text style={{
              fontSize: 16,
              color: 'white',
              fontFamily: 'Shark',
              textTransform: 'uppercase',
              letterSpacing: 2,
              textShadowColor: 'rgba(0, 0, 0, .5)',
              textShadowOffset: { width: 2, height: 2 },
              textShadowRadius: 0,
              textAlign: 'center',
            }}>Guest Mode</Text>
          </TopbarColumn>
        )}
      </Topbar>
      {player && !permissionGranted && <PermissionsNotGranted />}
      {/* Home Mode: Show prep items map instead of "Not at Park" message */}
      {player && parkLoaded && !park && permissionGranted && (
        <HomeExplore onPrepItemNearby={handlePrepItemNearby} />
      )}
      {/* Guest: Sign-in prompt */}
      {!player && (
        <View style={{ flex: 1, backgroundColor: '#d9d9d9', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Image
            source={require('../../assets/images/screens/login/logo.png')}
            style={{ width: 260, height: 260 * (322 / 1284), marginBottom: 24 }}
            contentFit="contain"
          />
          <Text style={{ color: '#333', fontFamily: 'Shark', fontSize: 22, textAlign: 'center', marginBottom: 8 }}>
            Welcome to Theme Park Shark!
          </Text>
          <Text style={{ color: 'rgba(0,0,0,0.5)', fontFamily: 'Knockout', fontSize: 15, textAlign: 'center', marginBottom: 28, lineHeight: 22 }}>
            Sign in to collect coins, battle at gyms, customize your shark, and explore theme parks!
          </Text>
          <SignInButtons />
        </View>
      )}
      
      {/* Prep Item Redeem Modal (Home Mode) */}
      <PrepItemRedeemModal
        visible={showPrepItemModal}
        prepItem={activePrepItem}
        pivotId={activePrepItemPivotId}
        onClose={() => {
          setShowPrepItemModal(false);
          setActivePrepItem(null);
          setActivePrepItemPivotId(null);
        }}
        onCollected={() => {
          // Modal will be closed by onClose
        }}
      />
      {park && redeemables && (
        <>
          <View
            style={{
              position: 'absolute',
              left: 16,
              bottom: 32,
              zIndex: 10,
            }}
          >
            {/* Queue Times - moved from right side */}
            <View style={{ marginBottom: 8 }}>
              <Button
                onPress={() => {
                  RootNavigation.navigate('QueueTimes', {
                    park: park.id,
                  });
                }}
              >
                <Image
                  style={{
                    width: 70,
                    height: 72,
                  }}
                  source={require('../../assets/images/screens/explore/queuetimes.png')}
                  contentFit="contain"
                />
              </Button>
            </View>
            {park.stores.length > 0 && (
              <View
                style={{
                  marginBottom: 8,
                  rowGap: 8,
                }}
              >
                {park.stores.map((store) => {
                  return (
                    <Button
                      key={store.id}
                      onPress={() => {
                        RootNavigation.navigate('Store', {
                          store: store.id,
                        });
                      }}
                    >
                      <Image
                        style={{
                          width: 70,
                          height: 75,
                        }}
                        source={{
                          uri: store.icon_url,
                        }}
                        contentFit="contain"
                      />
                    </Button>
                  );
                })}
              </View>
            )}
{/* TaskListModal removed - tasks now spawn on map like Pokemon! */}
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: -50,
              zIndex: 10,
              left: '25%',
              width: '50%',
            }}
          >
            <RedeemModal
              redeemable={activeRedeemable}
              park={park}
              onPress={async () => {
                await getRedeemables();
                await refreshPlayer();
              }}
              onTaskFailed={(taskId) => {
                // Track failed task so it doesn't reappear
                setFailedTaskIds((prev) => new Set([...prev, taskId]));
                // Remove failed task from local state immediately (check both tasks AND secret_tasks)
                setRedeemables((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    tasks: prev.tasks.filter((t) => t.id !== taskId),
                    secret_tasks: prev.secret_tasks.filter((t) => t.id !== taskId),
                  };
                });
                setActiveRedeemable(undefined);
              }}
              onTaskCompleted={(taskId, isSecretTask) => {
                // Remove completed task from local state immediately
                setRedeemables((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    tasks: isSecretTask ? prev.tasks : prev.tasks.filter((t) => t.id !== taskId),
                    secret_tasks: isSecretTask ? prev.secret_tasks.filter((t) => t.id !== taskId) : prev.secret_tasks,
                  };
                });
                setActiveRedeemable(undefined);
              }}
            />
          </View>
          <View
            style={{
              position: 'absolute',
              right: 16,
              bottom: 32,
              zIndex: 10,
              alignItems: 'center',
            }}
          >
            {/* Energy & Swords Display - Vertical Stack */}
            <View
              style={{
                marginBottom: 12,
                backgroundColor: '#1a1a2e',
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderWidth: 3,
                borderColor: '#FBBF24',
                shadowColor: '#FBBF24',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
                elevation: 8,
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {/* Energy */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  backgroundColor: '#FBBF24',
                  borderRadius: 8,
                  padding: 4,
                  marginRight: 6,
                }}>
                  <Text style={{ fontSize: 14 }}>⚡</Text>
                </View>
                <Text style={{ 
                  fontSize: 20, 
                  color: '#FBBF24', 
                  fontFamily: 'Shark',
                  textShadowColor: 'rgba(251, 191, 36, 0.6)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 10,
                }}>{player?.energy ?? 0}</Text>
              </View>
              {/* Swords */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Image
                  source={require('../../assets/images/sword-icon.png')}
                  style={{ width: 20, height: 20, marginRight: 6 }}
                  contentFit="contain"
                />
                <Text style={{ 
                  fontSize: 20, 
                  color: playerSwordCount > 0 ? '#FBBF24' : '#64748B', 
                  fontFamily: 'Shark',
                  textShadowColor: 'rgba(251, 191, 36, 0.6)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 10,
                }}>{playerSwordCount}</Text>
              </View>
            </View>
            {/* Profile Avatar */}
            {player?.inventory && (
              <Button
                onPress={() => {
                  RootNavigation.navigate('Inventory');
                }}
              >
                <Avatar player={player} size="lg" />
              </Button>
            )}
          </View>
        </>
      )}
      {/* AR Toggle removed - feature disabled */}
      {/* Gym Battle HUD - Always visible when in park with a team */}
      {park && playerTeam?.has_team && gymData && (
        <BattleHUD parkId={park.id} />
      )}
      {/* Park Mode View - Map or AR */}
      {park && arMode && redeemables && (
        <View style={{ flex: 1, marginTop: -8 }}>
          <Suspense fallback={<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" /></View>}>
            <ARView redeemables={redeemables} onRefresh={() => getRedeemables()} />
          </Suspense>
        </View>
      )}
      {park && !arMode && (
      <View
        style={{
          flex: 1,
          marginTop: -8,
        }}
      >
        <Map onPress={() => setSelectedTask(null)}>
          {redeemables?.items
            .filter((item) => !item.is_hidden)
            .map((item) => (
              <ItemMarker key={item.id} item={item} />
            ))}
          {redeemables?.pins
            .filter((item) => !item.is_hidden)
            .map((item) => (
              <PinMarker key={item.id} item={item} />
            ))}
          {redeemables?.tasks?.map((task) => (
            <TaskMarker
              key={task.id}
              task={task}
              isSelected={selectedTask?.id === task.id}
              onPress={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
            />
          ))}
          {redeemables?.coins
            ?.filter((coin) =>
              !coin.active_from || !coin.active_to || dayjs().isBetween(dayjs(coin.active_from), dayjs(coin.active_to))
            )
            .map((coin) => {
              return (
                <Marker
                  key={coin.id}
                  coordinate={{
                    latitude: Number(coin.latitude),
                    longitude: Number(coin.longitude),
                  }}
                  tappable={false}
                  flat={true}
                  tracksViewChanges={false}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View pointerEvents="none">
                    <Coin coin={coin} onExpire={() => getRedeemables()} />
                  </View>
                </Marker>
              );
            })}
          {redeemables?.vaults.map((vault) => (
            <VaultMarker key={vault.id} vault={vault} />
          ))}
          {/* Keys - rare spawns! */}
          {redeemables?.keys
            ?.filter((key) =>
              !key.active_from || !key.active_to || dayjs().isBetween(dayjs(key.active_from), dayjs(key.active_to))
            )
            .map((key) => {
              return (
                <Marker
                  key={key.id}
                  coordinate={{
                    latitude: Number(key.latitude),
                    longitude: Number(key.longitude),
                  }}
                  tappable={false}
                  flat={true}
                  tracksViewChanges={false}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View pointerEvents="none">
                    <Key model={key} onExpire={() => getRedeemables()} />
                  </View>
                </Marker>
              );
            })}
          {redeemables?.redeemables
            .filter((redeemable) =>
              dayjs().isBetween(
                dayjs(redeemable.active_from),
                dayjs(redeemable.active_to)
              )
            )
            .map((redeemable) => {
              return (
                <Marker
                  key={redeemable.id}
                  coordinate={{
                    latitude: Number(redeemable.latitude),
                    longitude: Number(redeemable.longitude),
                  }}
                  tappable={false}
                  flat={true}
                  tracksViewChanges={false}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View pointerEvents="none">
                    <Redeemable
                      redeemable={redeemable}
                      onExpire={() => getRedeemables()}
                    />
                  </View>
                </Marker>
              );
            })}
          {/* Community Center Marker */}
          {communityCenter && (
            <CommunityCenterMarker
              center={communityCenter}
              onPress={handleCommunityCenterPress}
            />
          )}
          {/* Gym Marker - show even without team so players can discover it */}
          {gymData && (
            <GymMarker
              parkId={park.id}
              latitude={gymData.gym.latitude}
              longitude={gymData.gym.longitude}
              onPress={handleGymPress}
            />
          )}
          {/* Sword Markers */}
          {swords.map((sword) => (
            <SwordMarker
              key={sword.id}
              id={sword.id}
              latitude={sword.latitude}
              longitude={sword.longitude}
              expiresAt={sword.expires_at}
              onPress={() => handleSwordClaim(sword.id)}
            />
          ))}
        </Map>
      </View>
      )}
      
      {/* Community Center Modal */}
      <CommunityCenterModal
        visible={showCommunityCenterModal}
        center={communityCenter}
        onClose={() => setShowCommunityCenterModal(false)}
        onAction={refreshCommunityCenter}
      />
      
      {/* Too Far Away Modal */}
      <Modal
        isVisible={showTooFarModal}
        onBackdropPress={() => setShowTooFarModal(false)}
        animationIn="zoomIn"
        animationOut="zoomOut"
      >
        <View style={tooFarStyles.container}>
          <View style={tooFarStyles.iconContainer}>
            <Text style={tooFarStyles.icon}>📍</Text>
          </View>
          <View style={tooFarStyles.content}>
            <Text style={tooFarStyles.title}>Too Far Away!</Text>
            <Text style={tooFarStyles.message}>
              Walk closer to interact with this location.
            </Text>
            <View style={tooFarStyles.distanceBox}>
              <View style={tooFarStyles.distanceRow}>
                <Text style={tooFarStyles.distanceLabel}>You are</Text>
                <Text style={tooFarStyles.distanceValue}>{tooFarDistance}</Text>
              </View>
              <View style={tooFarStyles.distanceDivider} />
              <View style={tooFarStyles.distanceRow}>
                <Text style={tooFarStyles.distanceLabel}>Need to be within</Text>
                <Text style={tooFarStyles.distanceValueGreen}>28m</Text>
              </View>
            </View>
            <TouchableOpacity
              style={tooFarStyles.button}
              onPress={() => setShowTooFarModal(false)}
            >
              <Text style={tooFarStyles.buttonText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Wrapper>
  );
}

const tooFarStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a3a5c',
    borderWidth: 4,
    borderColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    marginBottom: -40,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  icon: {
    fontSize: 36,
  },
  content: {
    backgroundColor: '#1a3a5c',
    borderRadius: 20,
    width: '90%',
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderWidth: 3,
    borderColor: '#3b82f6',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Shark',
    fontSize: 26,
    color: '#f59e0b',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  distanceBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 24,
  },
  distanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  distanceDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 4,
  },
  distanceLabel: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  distanceValue: {
    fontFamily: 'Shark',
    fontSize: 20,
    color: '#ef4444',
  },
  distanceValueGreen: {
    fontFamily: 'Shark',
    fontSize: 20,
    color: '#4ade80',
  },
  button: {
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 14,
    shadowColor: '#4ade80',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
  },
});
