import { useIsFocused, useNavigation, useRoute, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { Text, View, Pressable } from 'react-native';
import { Marker } from '../components/map/Marker';
import useMapOpportunityClock from '../hooks/useMapOpportunityClock';
import { opportunityIsActive } from './ExploreScreen/mapOpportunityTiming';
import { TaskType } from '../models/task-type';
import currencyBalance from '../helpers/currency-balance';
import * as RootNavigation from '../RootNavigation';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Map from '../components/Map';
import RedeemModal from '../components/RedeemModal';
import PrepItemRedeemModal from '../components/PrepItemRedeemModal';
// TaskListModal removed - tasks now spawn on map Pokemon-style
import Topbar from '../components/Topbar';
import Currency from '../components/Topbar/Currency';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import UsernameBanner from '../components/Topbar/UsernameBanner';
import Wrapper from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import { LocationContext } from '../context/LocationProvider';
import { isConfirmedOutsidePark } from '../context/parkLookupPolicy';
import { ThemeContext } from '../context/ThemeProvider';
import useTripGoal from '../hooks/useTripGoal';
import AdventureTicketCard from './ExploreScreen/AdventureTicketCard';
import { adventurePlayGate, adventureRideClosed, adventureShelfArrival, rankDetours } from './ExploreScreen/adventureTicketPresentation';
import useAdventureStampMoment from './ExploreScreen/useAdventureStampMoment';
import { resolveMapQueueContext, resolveRideContextById } from '../services/lineplay/resolveRide';
import type { RideContext } from '../services/lineplay/LinePlaySession';
import checkForRedeemable from '../helpers/check-for-redeemable';
import { CurrentRedeemableType } from '../models/current-redeemable-type';
import { RedeemablesType } from '../models/redeemables-type';
import { PrepItemType } from '../models/prep-item-type';
import Coin from './ExploreScreen/Coin';
import Key from './ExploreScreen/Key';
import HomeExplore from './ExploreScreen/HomeExplore';
import { HOME_PREP_PICKUP_RADIUS_METERS } from './ExploreScreen/homePickupRange';
import { rideFocusForPark, type ParkRideMapFocus } from './ExploreScreen/parkRideMapFocus';
import ParkProjectWidget from './ExploreScreen/ParkProjectWidget';
import ParkProjectMapBeacon from './ExploreScreen/ParkProjectMapBeacon';
import type { ParkProject } from '../api/endpoints/me/park-projects';
import ItemMarker from './ExploreScreen/ItemMarker';
import GuestInvite from './ExploreScreen/GuestInvite';
import { chestMayPresent, hasFirstCatch, mapSuggestionSlots, suggestionSlotScreenTop, suggestionSlotTop } from './ExploreScreen/mapPresentationQueue';
import PermissionsNotGranted from './ExploreScreen/PermissionsNotGranted';
import RideControlBar from '../components/RideControlBar';
import { rideLook } from '../services/rideLandmark';
import type { RideControlRide } from '../api/endpoints/parks/rideControl';
import useRideControlMap from '../hooks/useRideControlMap';
import useBossMapMoment from '../hooks/useBossMapMoment';
import BossMapDeparture from '../components/boss/BossMapDeparture';
import { Circle } from '../components/map/Circle';
import { crowdHaze } from '../components/map/alive/parkPulse';
import { getParkLive, type LivePark, type LiveRide } from '../api/endpoints/parks/live';
import type { RushPick } from '../components/RushCallout';
import LiveEventsPill from '../components/LiveEventsPill';
import BossMarker from '../components/boss/BossMarker';
import BossRaidFlow, { useParkRaid } from '../components/boss/BossRaidFlow';
import useBossAttackRecovery from '../hooks/useBossAttackRecovery';
import DailyGiftModal from '../components/DailyGiftModal';
import { DailyGiftContext } from '../context/DailyGiftProvider';
import PinMarker from './ExploreScreen/PinMarker';
import Redeemable from './ExploreScreen/Redeemable';
import TaskMarker from './ExploreScreen/TaskMarker';
import MapResourcePill from './ExploreScreen/MapResourcePill';
import TooFarDialog from './ExploreScreen/TooFarDialog';
import DwellCard from './ExploreScreen/DwellCard';
import MapSuggestionStub from './ExploreScreen/MapSuggestionStub';
import { withWs2Profiler } from './ExploreScreen/ws2Profiler';
import useQueueDwell from './ExploreScreen/useQueueDwell';
import { clusterMarkers, revealDelays } from './ExploreScreen/mapMarkerPresentation';
import { gameTimestamp } from './ExploreScreen/mapOpportunityTiming';
import VaultMarker from './ExploreScreen/VaultMarker';
import CommunityCenterMarker from '../components/CommunityCenterMarker';
import CommunityCenterModal from '../components/CommunityCenterModal';
import getCommunityCenter, { CommunityCenter } from '../api/endpoints/community-center/getCommunityCenter';
// Gym Battle imports
import { GymMarker, SwordMarker } from '../components/GymBattle';
import { getGym, getSwords, getMyTeam, claimSword, getMySwords, GymData, SwordSpawn, TeamInfo } from '../api/endpoints/gym-battle';
import { useTutorial } from '../components/Tutorial';
import SignInButtons from '../components/SignInButtons';
import { GameIcon, GameRichText } from '../ui';

dayjs.extend(require('dayjs/plugin/isBetween'));

// Community Center range in meters (same as task buildings - config.mobile.redeem_radius)
const COMMUNITY_CENTER_RANGE_METERS = 14;

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

const TICKET_ICON = require('../../assets/images/ticket-icon.png');

function ExploreScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const mapFocused = useIsFocused();
  const route = useRoute();
  const focusRide = (route.params as { focusRide?: ParkRideMapFocus } | undefined)?.focusRide;
  const [redeemables, setRedeemables] = useState<RedeemablesType | null>();
  const [activeRedeemable, setActiveRedeemable] = useState<
    CurrentRedeemableType | undefined
  >();
  const [failedTaskIds, setFailedTaskIds] = useState<Set<number>>(new Set());
  const [selectedTask, setSelectedTask] = useState<TaskType | null>(null);
  const [focusedFromChecklist, setFocusedFromChecklist] = useState<TaskType | null>(null);
  // "Find" guide: a dashed path and an edge arrow toward the ride the player asked to find.
  const [findGuide, setFindGuide] = useState<{ taskId: number; latitude: number; longitude: number; requestId: number } | null>(null);
  const guideTo = useCallback((task: TaskType) => {
    setSelectedTask(task);
    setFindGuide({ taskId: task.id, latitude: Number(task.latitude), longitude: Number(task.longitude), requestId: Date.now() });
  }, []);
  const [selectedQueueRide, setSelectedQueueRide] = useState<{
    parkId: number; taskId: number; ride: RideContext;
  } | null>(null);
  
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
  const [homeCollectionVersion, setHomeCollectionVersion] = useState(0);
  const [tripGoalVersion, setTripGoalVersion] = useState(0);
  const [activeParkProject, setActiveParkProject] = useState<ParkProject | null>(null);
  const [projectOpenRequestVersion, setProjectOpenRequestVersion] = useState(0);
  
  // Community Center state
  const [communityCenter, setCommunityCenter] = useState<CommunityCenter | null>(null);
  const [showCommunityCenterModal, setShowCommunityCenterModal] = useState(false);
  const [showTooFarModal, setShowTooFarModal] = useState(false);
  // null while the player's location is unknown.
  const [tooFarMeters, setTooFarMeters] = useState<number | null>(null);
  const [tooFarRequiredMeters, setTooFarRequiredMeters] = useState(COMMUNITY_CENTER_RANGE_METERS);
  const [tooFarIsHomeItem, setTooFarIsHomeItem] = useState(false);
  
  // Gym Battle state
  const [gymData, setGymData] = useState<GymData | null>(null);
  const [swords, setSwords] = useState<SwordSpawn[]>([]);
  const [playerTeam, setPlayerTeam] = useState<TeamInfo | null>(null);
  const [playerSwordCount, setPlayerSwordCount] = useState<number>(0);
  
  const { refreshPlayer, player } = useContext(AuthContext);
  const { parkLoaded, parkLookupRecord, location, park, permissionGranted, permissionChecked } =
    useContext(LocationContext);
  const homeLocationConfirmed = isConfirmedOutsidePark(location, parkLookupRecord) && !park;

  useEffect(() => {
    if (homeLocationConfirmed) return;
    setShowPrepItemModal(false);
    setActivePrepItem(null);
    setActivePrepItemPivotId(null);
  }, [homeLocationConfirmed]);
  const { theme } = useContext(ThemeContext);
  const { currencies } = useContext(CurrencyContext);
  const { startTutorial, hasCompleted, isReady, isActive } = useTutorial();
  const { dailyGift } = useContext(DailyGiftContext);
  const [dailyGiftOccluded, setDailyGiftOccluded] = useState(false);
  const [adventureOccluded, setAdventureOccluded] = useState(false);
  const { data: tripGoalData, stale: tripGoalStale, refresh: refreshTripGoal, celebrate: celebrateTicket,
    select: selectAdventureRide, dismiss: dismissAdventure } = useTripGoal(tripGoalVersion, !!player);
  const tripGoal = tripGoalData?.goal;
  // The server flag (adventure_enabled) hides every ticket surface when off.
  const adventure = tripGoalData?.adventure_enabled !== false && tripGoalData?.adventure_ticket?.park_id === park?.id
    ? tripGoalData?.adventure_ticket ?? null : null;
  const adventureOwner = `${player?.id}:${park?.id}`;
  const adventureScope = useRef(adventureOwner); adventureScope.current = adventureOwner;
  const tripGoalTask = tripGoal?.park_id === park?.id
    ? redeemables?.tasks?.find(task => task.id === tripGoal?.task_id) : undefined;

  useEffect(() => {
    setActiveParkProject(null);
    setFocusedFromChecklist(null);
    setSelectedTask(null);
  }, [park?.id, player?.id]);

  useEffect(() => {
    let active = true;
    setSelectedQueueRide(null);
    if (park && selectedTask) {
      const parkId = park.id;
      const taskId = selectedTask.id;
      void resolveMapQueueContext(parkId, selectedTask.name).then(ride => {
        if (active && ride) setSelectedQueueRide({ parkId, taskId, ride });
      });
    }
    return () => { active = false; };
  }, [park?.id, selectedTask?.id, selectedTask?.name]);

  const queueRide = park && selectedTask && selectedQueueRide?.parkId === park.id &&
    selectedQueueRide.taskId === selectedTask.id ? selectedQueueRide.ride : null;

  useEffect(() => {
    const focusedTask = rideFocusForPark(focusRide, park?.id);
    if (!focusedTask) return;
    guideTo(focusedTask);
    setFocusedFromChecklist(focusedTask);
    navigation.setParams({ focusRide: undefined });
  }, [focusRide, navigation, park?.id, guideTo]);

  // Trigger onboarding tutorial on first visit
  useEffect(() => {
    if (mapFocused && player && isReady && parkLoaded && permissionGranted && !isActive && !hasCompleted('onboarding')) {
      const timer = setTimeout(() => {
        startTutorial('onboarding', { inPark: !!park });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [mapFocused, player, isReady, parkLoaded, permissionGranted, park?.id, isActive, hasCompleted, startTutorial]);

  // A player who learned the home hunt should meet the park loop when they
  // actually arrive. Park-first players already saw these steps in onboarding.
  useEffect(() => {
    if (!mapFocused || !player || !isReady || !parkLoaded || !permissionGranted || !park || isActive ||
      !hasCompleted('onboarding') || hasCompleted('park_arrival')) return;
    const timer = setTimeout(() => startTutorial('park_arrival'), 1500);
    return () => clearTimeout(timer);
  }, [mapFocused, player, isReady, parkLoaded, permissionGranted, park?.id, isActive, hasCompleted, startTutorial]);
  
  // One overlay at a time: a find that shows up during a tutorial waits for it.
  const [pendingFind, setPendingFind] = useState<{ item: PrepItemType; pivotId: number } | null>(null);
  const collectedOnce = useRef(false);
  const [caughtThisSession, setCaughtThisSession] = useState(false);
  const [redeemFlowOpen, setRedeemFlowOpen] = useState(false);

  // Handler for when user taps a prep item in home mode — enforce proximity
  const handlePrepItemNearby = useCallback((prepItem: PrepItemType, pivotId: number) => {
    if (!homeLocationConfirmed || !parkLoaded) return;
    if (isActive) { setPendingFind({ item: prepItem, pivotId }); return; }
    setTooFarRequiredMeters(HOME_PREP_PICKUP_RADIUS_METERS);
    setTooFarIsHomeItem(true);
    // Check distance before allowing collection
    if (prepItem.latitude != null && prepItem.longitude != null &&
        location?.latitude != null && location?.longitude != null) {
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        prepItem.latitude,
        prepItem.longitude
      );

      if (distance > HOME_PREP_PICKUP_RADIUS_METERS) {
        setTooFarMeters(distance);
        setShowTooFarModal(true);
        return;
      }
    } else {
      // No location available — show too far modal with unknown distance
      setTooFarMeters(null);
      setShowTooFarModal(true);
      return;
    }

    setActivePrepItem(prepItem);
    setActivePrepItemPivotId(pivotId);
    setShowPrepItemModal(true);
  }, [location, homeLocationConfirmed, parkLoaded, isActive]);

  // When Finn is done talking, the waiting find opens (the first catch of the game).
  useEffect(() => {
    if (isActive || !pendingFind) return;
    const find = pendingFind;
    setPendingFind(null);
    const timer = setTimeout(() => {
      handlePrepItemNearby(find.item, find.pivotId);
    }, 350);
    return () => clearTimeout(timer);
  }, [isActive, pendingFind, handlePrepItemNearby, hasCompleted]);

  // Handler for Community Center tap - check if in range
  const handleCommunityCenterPress = useCallback(() => {
    setTooFarRequiredMeters(COMMUNITY_CENTER_RANGE_METERS);
    setTooFarIsHomeItem(false);
    if (!communityCenter || !location?.latitude || !location?.longitude) {
      setTooFarMeters(null);
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
      setTooFarMeters(distance);
      setShowTooFarModal(true);
      return;
    }
    
    // Navigate to full-screen Community Center experience
    RootNavigation.navigate('CommunityCenter', { parkId: park!.id, centerId: communityCenter.id });
  }, [communityCenter, location]);

  // Ride Control: poll the park's team map while at a park, and after wins.
  const { control: rideControl, refresh: refreshRideControl } = useRideControlMap({ playerId: player?.id ?? null, parkId: park?.id ?? null });
  // Boss raids: a co-op boss surfaces at a ride at set times each park day.
  const { raid, setState: setRaidState } = useParkRaid(park?.id);
  const [bossOpen, setBossOpen] = useState(false);
  const [bossOccluded, setBossOccluded] = useState(false);
  const bossMap = useBossMapMoment({ playerId: player?.id ?? null, parkId: park?.id ?? null, control: rideControl,
    refreshControl: refreshRideControl,
    available: mapFocused && permissionGranted && !bossOpen && !bossOccluded && !isActive && !activeRedeemable &&
      !showTooFarModal && !showCommunityCenterModal && !showPrepItemModal && !dailyGiftOccluded && !adventureOccluded });
  const raidActive = raid?.status === 'active';
  const { snapshot: bossRecovery } = useBossAttackRecovery({ playerId: player?.id ?? null, parkId: park?.id ?? null, onResult: () => undefined });
  const receiptNeedsCheck = !!bossRecovery?.pending || bossRecovery?.phase === 'storage_error';

  // Live park: posted waits, rides that are down, and short-wait Rushes.
  const [livePark, setLivePark] = useState<LivePark | null>(null);
  useEffect(() => {
    let active = true;
    setLivePark(null);
    if (!park?.id) return;
    const load = () => getParkLive(park.id).then(result => { if (active) setLivePark(result); }).catch(() => undefined);
    void load();
    const id = setInterval(load, 60000);
    return () => { active = false; clearInterval(id); };
  }, [park?.id]);
  const liveByTask = useMemo(() => new globalThis.Map<number, LiveRide>(
    (livePark?.rides ?? []).map(r => [r.task_id, r])), [livePark]);
  // Park pulse: a warm haze over the busiest rides on today's map.
  const parkHaze = useMemo(() => crowdHaze((redeemables?.tasks ?? []).flatMap(task => {
    const live = liveByTask.get(task.id);
    return live ? [{ ...live, latitude: Number(task.latitude), longitude: Number(task.longitude) }] : [];
  })), [redeemables?.tasks, liveByTask]);

  // Easter-egg scenes only play for the closest themed rides, so the map
  // wakes up around you as you walk and stays light on the phone.
  const nearLat = location ? Math.round(location.latitude * 3000) / 3000 : null;
  const nearLng = location ? Math.round(location.longitude * 3000) / 3000 : null;
  const ambientTaskIds = useMemo(() => {
    if (nearLat === null || nearLng === null) return new Set<number>();
    const m = 111320;
    const k = Math.cos((nearLat * Math.PI) / 180);
    return new Set((redeemables?.tasks ?? [])
      .filter(t => rideLook(t.name).ambience.length > 0)
      .map(t => ({ id: t.id, d: Math.hypot((Number(t.latitude) - nearLat) * m, (Number(t.longitude) - nearLng) * m * k) }))
      .filter(t => t.d < 350)
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)
      .map(t => t.id));
  }, [redeemables?.tasks, nearLat, nearLng]);
  const rideControlByAsset = useMemo(() => new globalThis.Map<number, RideControlRide>(
    (rideControl?.rides ?? []).map(r => [r.asset_id, r])), [rideControl]);
  // Rushes on rides in today's list, nearest first.
  const rushes = useMemo<RushPick[]>(() => {
    const tasks = redeemables?.tasks ?? [];
    const k = nearLat !== null ? Math.cos((nearLat * Math.PI) / 180) : 1;
    const dist = (t: { latitude: unknown; longitude: unknown }) => nearLat === null || nearLng === null ? 0
      : Math.hypot(Number(t.latitude) - nearLat, (Number(t.longitude) - nearLng) * k);
    return tasks.flatMap(task => {
      const live = liveByTask.get(task.id);
      return live?.rush && live.status === 'OPERATING' ? [{ task, rush: live.rush, wait: live.wait ?? live.rush.wait }] : [];
    }).sort((a, b) => dist(a.task) - dist(b.task));
  }, [redeemables?.tasks, liveByTask, nearLat, nearLng]);
  const hasLiveEvents = !!rushes.length || raidActive || receiptNeedsCheck || !!bossMap.moment;
  const slotTop = suggestionSlotTop(hasLiveEvents);

  const mapContext = `${player?.id ?? ''}:${park?.id ?? ''}`;
  const latestMapContext = useRef(mapContext);
  latestMapContext.current = mapContext;
  const mapMounted = useRef(true);
  const mapRequest = useRef<{ context: string; promise: Promise<void> } | null>(null);
  useEffect(() => {
    mapMounted.current = true;
    return () => { mapMounted.current = false; };
  }, []);
  const refreshMapOpportunities = useCallback((): Promise<void> => {
    if (!park?.id || !player?.id) return Promise.resolve();
    if (mapRequest.current?.context === mapContext) return mapRequest.current.promise;
    const promise = currentRedeemables().then(data => {
      if (mapMounted.current && latestMapContext.current === mapContext) setRedeemables(data);
    }).finally(() => {
      if (mapRequest.current?.promise === promise) mapRequest.current = null;
    });
    mapRequest.current = { context: mapContext, promise };
    return promise;
  }, [mapContext, park?.id, player?.id]);
  const getRedeemables = useCallback(async () => {
    setActiveRedeemable(undefined);
    await refreshMapOpportunities();
  }, [refreshMapOpportunities]);
  const timedOpportunities = useMemo(() => [
    ...(redeemables?.tasks ?? []), ...(redeemables?.coins ?? []),
    ...(redeemables?.keys ?? []), ...(redeemables?.redeemables ?? []),
  ], [redeemables]);
  const mapNow = useMapOpportunityClock(timedOpportunities, refreshMapOpportunities, !!park && !!player);
  const visibleTasks = useMemo(() => (redeemables?.tasks ?? [])
    .filter(task => opportunityIsActive(task, mapNow)), [redeemables?.tasks, mapNow]);

  // Rides that open later today rest on the map with "Back 2:00 PM" instead of vanishing.
  const restingTasks = useMemo(() => (redeemables?.tasks ?? []).filter(task => {
    const from = gameTimestamp(task.active_from);
    return from !== null && from > mapNow && !opportunityIsActive(task, mapNow);
  }), [redeemables?.tasks, mapNow]);

  // Declutter: islands within 48px fold under one (+N); the coin and timer show only near you or selected.
  const [mapZoom, setMapZoom] = useState(17.6);
  const onMapZoom = useCallback((zoom: number) => setMapZoom(Math.round(zoom * 4) / 4), []);
  const playerLat = location?.latitude, playerLng = location?.longitude;
  const taskDistance = useMemo(() => {
    const out = new globalThis.Map<number, number>();
    if (playerLat == null || playerLng == null) return out;
    const k = Math.cos(playerLat * Math.PI / 180);
    for (const task of [...visibleTasks, ...restingTasks]) {
      out.set(task.id, Math.hypot((Number(task.latitude) - playerLat) * 111320, (Number(task.longitude) - playerLng) * 111320 * k));
    }
    return out;
  }, [visibleTasks, restingTasks, playerLat, playerLng]);
  const playableTaskId = activeRedeemable?.type === 'task' ? activeRedeemable.model.id : null;
  const adventureTaskId = adventure && (adventure.phase === 'discover' || adventure.phase === 'play') ? adventure.ride.task_id : null;
  const goalTaskId = tripGoal && !tripGoal.coin_owned ? tripGoal.task_id : null;
  const rideClusters = useMemo(() => clusterMarkers([...visibleTasks, ...restingTasks].map(task => ({
    id: task.id, task, latitude: Number(task.latitude), longitude: Number(task.longitude),
    pinned: task.id === selectedTask?.id,
    // A ride whose team flag is being raised (boss map moment) always leads its island.
    priority: (bossMap.flag?.asset_id === Number(task.asset_id) ? 80 : 0) + (task.id === adventureTaskId ? 50 : 0) + (task.id === goalTaskId ? 40 : 0) +
      (liveByTask.get(task.id)?.rush ? 30 : 0) + (task.id === playableTaskId ? 20 : 0) +
      ((taskDistance.get(task.id) ?? Infinity) <= 60 ? 10 : 0) + (restingTasks.includes(task) ? -5 : 0),
  })).filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)), mapZoom),
  [visibleTasks, restingTasks, selectedTask?.id, adventureTaskId, goalTaskId, liveByTask, playableTaskId, taskDistance, mapZoom, bossMap.flag?.asset_id]);
  // Living map budget: only the nearest islands spend animation (see ambientBudget).
  const aliveRanks = useMemo(() => new globalThis.Map(rideClusters.map(cluster => cluster.lead.id)
    .sort((a, b) => (taskDistance.get(a) ?? Infinity) - (taskDistance.get(b) ?? Infinity))
    .map((id, index) => [id, index])), [rideClusters, taskDistance]);
  // First reveal of a park's islands: nearest drop in first.
  const revealRef = useRef<{ context: string; delays: globalThis.Map<number, number> } | null>(null);
  if (redeemables && visibleTasks.length && revealRef.current?.context !== mapContext) {
    revealRef.current = { context: mapContext, delays: revealDelays([...visibleTasks]
      .sort((a, b) => (taskDistance.get(a.id) ?? 0) - (taskDistance.get(b.id) ?? 0)).map(task => task.id)) };
  }
  const [mapFocusRequest, setMapFocusRequest] = useState<{ latitude: number; longitude: number; zoom: number; requestId: number } | null>(null);
  const clusterRef = useRef({ rideClusters, mapZoom }); clusterRef.current = { rideClusters, mapZoom };
  // Tapping a folded island zooms into it; a lone island toggles selection.
  const handleTaskPress = useCallback((task: TaskType) => {
    const { rideClusters: clusters, mapZoom: zoom } = clusterRef.current;
    const cluster = clusters.find(item => item.lead.id === task.id);
    if (cluster && cluster.members.length > 0 && zoom < 19.5) {
      setSelectedTask(null);
      setMapFocusRequest({ latitude: Number(task.latitude), longitude: Number(task.longitude), zoom: Math.min(20, zoom + 1.5), requestId: Date.now() });
      return;
    }
    setMapFocusRequest(null);
    setSelectedTask(previous => previous?.id === task.id ? null : task);
  }, []);

  // Adventure Ticket: Play opens only in the ride's line; detours rank open, near, short waits.
  const adventureGate = useMemo(() => adventure ? adventurePlayGate(adventure, location) : undefined,
    [adventure, nearLat, nearLng]); // eslint-disable-line react-hooks/exhaustive-deps
  const adventureDetours = useMemo(() => adventure && tripGoalData ? rankDetours(tripGoalData.rides, {
    parkId: adventure.park_id, currentTaskId: adventure.ride.task_id, live: liveByTask, location,
    coords: new globalThis.Map((redeemables?.tasks ?? []).map(task => [task.id,
      { latitude: Number(task.latitude), longitude: Number(task.longitude) }])),
  }) : [], [adventure, tripGoalData, liveByTask, redeemables?.tasks, nearLat, nearLng]); // eslint-disable-line react-hooks/exhaustive-deps
  const adventureMoment = useAdventureStampMoment(adventure,
    mapFocused && !isActive && !adventureOccluded && !bossOccluded && !dailyGiftOccluded && !activeRedeemable);
  const focusAdventureRide = useCallback(() => {
    if (!adventure || !player) return;
    const task = redeemables?.tasks?.find(item => item.id === adventure.ride.task_id);
    if (task) { guideTo(task); setFocusedFromChecklist(task); }
    else RootNavigation.navigate('Park', { park: adventure.park_id, player: player.id });
  }, [adventure, player, redeemables?.tasks, guideTo]);

  useEffect(() => {
    setRedeemables(null);
    setActiveRedeemable(undefined);
    setCommunityCenter(null);
    if (!park?.id) return;
    let current = true;
    void getCommunityCenter(park.id).then(center => {
      if (current) setCommunityCenter(center);
    }).catch(() => undefined);
    return () => { current = false; };
  }, [mapContext, park?.id]);

  // Refresh community center data
  const refreshCommunityCenter = useCallback(async () => {
    if (park?.id) {
      const center = await getCommunityCenter(park.id);
      setCommunityCenter(center);
    }
  }, [park?.id]);

  // Fetch gym battle data. Owner and generation guards: a slow answer for an
  // earlier park or player never lands on the current map.
  const gymGeneration = useRef(0);
  const gymOwner = `${player?.id ?? ''}:${park?.id ?? ''}`;
  const gymOwnerRef = useRef(gymOwner); gymOwnerRef.current = gymOwner;
  const fetchGymData = useCallback(async () => {
    const generation = ++gymGeneration.current;
    const owner = gymOwner;
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
      if (generation !== gymGeneration.current || owner !== gymOwnerRef.current) return;
      setGymData(gym);
      setSwords(swordsData.swords);
    } catch (error) {
      console.log('Gym data fetch error:', error);
    }
  }, [park?.id, gymOwner]);

  // Check player team and sword count on mount
  useEffect(() => {
    let current = true;
    setPlayerTeam(null);
    setPlayerSwordCount(0);
    const checkTeamAndSwords = async () => {
      try {
        const team = await getMyTeam();
        if (!current) return;
        setPlayerTeam(team);
        const swordsData = await getMySwords();
        if (current) setPlayerSwordCount(swordsData.swords);
      } catch (error) {
        console.log('Team/swords check error:', error);
      }
    };
    if (player) {
      void checkTeamAndSwords();
    }
    return () => { current = false; };
  }, [player?.id]);

  // Fetch gym data when park changes and refresh periodically (even without team - to show marker)
  useEffect(() => {
    if (!park?.id) { setGymData(null); setSwords([]); return; }
    void fetchGymData();
    const interval = setInterval(fetchGymData, 30000); // Refresh every 30s
    return () => { clearInterval(interval); gymGeneration.current++; };
  }, [park?.id, fetchGymData]);

  // Handle gym marker press
  // Gym range in meters; separate from the community center and home pickup radii.
  const GYM_RANGE_METERS = 25;

  const handleGymPress = useCallback(() => {
    setTooFarRequiredMeters(GYM_RANGE_METERS);
    setTooFarIsHomeItem(false);
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
      setTooFarMeters(null);
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
      setTooFarMeters(distance);
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

  useEffect(() => {
    if (!mapFocused || !park || !location?.latitude || !location?.longitude || !redeemables) return;
    let current = true;
    void checkForRedeemable().then(redeemable => {
      if (!current) return;
      if (redeemable?.type === 'task' && failedTaskIds.has(redeemable.model.id)) {
        setActiveRedeemable(undefined);
      } else {
        setActiveRedeemable(redeemable);
      }
    });
    return () => { current = false; };
  }, [mapFocused, park?.id, location?.latitude, location?.longitude, redeemables, failedTaskIds]);

  // Every ride island, not the zoom-dependent clusters, so the beacon's spot stays put while zooming.
  const beaconAvoid = useMemo(() => [...visibleTasks, ...restingTasks].map(task => ({
    latitude: Number(task.latitude), longitude: Number(task.longitude) })), [visibleTasks, restingTasks]);
  const queueDwell = useQueueDwell(park?.id ?? null, mapFocused && !!player);
  const [dismissedDwell, setDismissedDwell] = useState<number | null>(null);
  const dwellShown = !!queueDwell && dismissedDwell !== queueDwell.rideId &&
    !adventureOccluded && queueDwell.rideName !== adventure?.ride.ride_name && queueDwell.rideName !== selectedTask?.name;
  const suggestionSlots = mapSuggestionSlots({
    dwell: dwellShown,
    bossMoment: !!bossMap.moment && bossMap.moment.phase !== 'settled',
    queueRide: !!(selectedTask && queueRide), adventure: !!adventure, goal: !!tripGoal, project: !!activeParkProject,
    adventureSlam: !!adventureMoment.slam?.length,
  });
  const chestReady = chestMayPresent({
    tutorialActive: isActive, findOpen: showPrepItemModal, findPending: !!pendingFind,
    firstCatchDone: hasFirstCatch(player, hasCompleted('home_first_find'), caughtThisSession),
    boss: bossOpen || bossOccluded || (!!bossMap.moment && bossMap.moment.phase !== 'settled'),
    rideOpen: redeemFlowOpen, adventureOpen: adventureOccluded,
    otherModalOpen: showTooFarModal || showCommunityCenterModal,
  });

  return (
    <Wrapper>
      <Topbar>
        {/* Topbar currencies — only for signed-in users */}
        {player ? (
          <>
            {/* Park mode: Shark Coins, Keys, Tickets as matching pills. Retired
                event currencies (and the unused legacy park coin) stay hidden. */}
            {park && theme?.currency && (
              <TopbarColumn>
                <Currency image={theme.currency.icon_url} count={currencyBalance(player, theme.currency.name)}
                  name={theme.currency.name} flyTarget="theme_currency" />
              </TopbarColumn>
            )}
            {park && currencies
              .filter((currency) => currency.icon_url &&
                (['Coins', 'Keys'].includes(currency.name) || currencyBalance(player, currency.name) > 0))
              .map((currency) => (
                <TopbarColumn key={currency.id}>
                  <Currency image={currency.icon_url} count={currencyBalance(player, currency.name)}
                    name={currency.name === 'Coins' ? 'Shark Coins' : currency.name}
                    flyTarget={currency.name === 'Coins' ? 'coins' : currency.name === 'Keys' ? 'keys' : undefined} />
                </TopbarColumn>
              ))}
            {park && (
              <TopbarColumn>
                <Currency image={TICKET_ICON} count={player.tickets ?? 0} name="Tickets" flyTarget="tickets" />
              </TopbarColumn>
            )}
            {/* TRAVEL MODE: Coins | TRAVEL MODE | Tickets */}
            {!park && (
              <>
                <TopbarColumn>
                  {currencies[0] && (
                    <Currency image={currencies[0].icon_url} count={currencyBalance(player, currencies[0].name)}
                      name="Shark Coins" flyTarget="coins" />
                  )}
                </TopbarColumn>
                <TopbarColumn>
                  <Text style={{
                    fontSize: 16,
                    color: 'white',
                    fontFamily: 'Shark',
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                    textShadowColor: '#05346e',
                    textShadowOffset: { width: 2, height: 2 },
                    textShadowRadius: 0,
                    textAlign: 'center',
                  }}>Travel Mode</Text>
                </TopbarColumn>
                <TopbarColumn>
                  <Currency image={TICKET_ICON} count={player.tickets ?? 0} name="Tickets" flyTarget="tickets" />
                </TopbarColumn>
              </>
            )}
          </>
        ) : (
          <TopbarColumn>
            <Text style={{
              fontSize: 16,
              color: 'white',
              fontFamily: 'Shark',
              textTransform: 'uppercase',
              letterSpacing: 2,
              textShadowColor: '#05346e',
              textShadowOffset: { width: 2, height: 2 },
              textShadowRadius: 0,
              textAlign: 'center',
            }}>Guest Mode</Text>
          </TopbarColumn>
        )}
      </Topbar>
      {player && <ParkProjectWidget key={`park-project-${player.id}`} parkId={park?.id ?? null} refreshVersion={homeCollectionVersion}
        onActiveProjectChange={setActiveParkProject} openRequestVersion={projectOpenRequestVersion}
        pillHidden={!!park && suggestionSlots.right !== 'project'}
        pillCollapsed={!!park && suggestionSlots.rightStub}
        topOffset={park ? suggestionSlotScreenTop(Constants.statusBarHeight ?? 0, hasLiveEvents) : undefined} />}
      {player && park && <BossRaidFlow parkId={park.id} raid={raid} open={bossOpen} onClose={() => setBossOpen(false)}
        presentationAvailable={!isActive && !dailyGiftOccluded && !showTooFarModal && !showCommunityCenterModal && !showPrepItemModal && !activeRedeemable}
        onMapOcclusionChange={setBossOccluded} onCelebrationDismiss={result => { void bossMap.enqueue(result); }}
        onState={state => { setRaidState(state); void refreshRideControl(); }} />}
      {player && permissionChecked && !permissionGranted && <PermissionsNotGranted />}
      {/* One overlay at a time: the daily chest comes last, after the first catch and never alongside a find. */}
      {mapFocused && player && permissionGranted && dailyGift && dailyGift.redeemed_at === null && hasCompleted('onboarding') && chestReady &&
        <DailyGiftModal dailyGift={dailyGift} onMapOcclusionChange={setDailyGiftOccluded} />}
      {/* Home Mode: the map always renders without a park, even before the
          first park check settles (it shows the park-check card until then).
          Gating it on parkLoaded left a blank grey screen whenever park state
          was cleared without a finished lookup. */}
      {player && !park && permissionGranted && (
        <HomeExplore key={`home-explore-${player.id}`} onPrepItemNearby={handlePrepItemNearby}
          refreshVersion={homeCollectionVersion} homeLocationConfirmed={homeLocationConfirmed} />
      )}
      {/* Guest: a bright sign-in invitation over the live map */}
      {!player && <GuestInvite />}
      
      {/* Prep Item Redeem Modal (Home Mode) */}
      <PrepItemRedeemModal
        visible={showPrepItemModal && homeLocationConfirmed && !isActive}
        prepItem={activePrepItem}
        pivotId={activePrepItemPivotId}
        onClose={() => {
          setShowPrepItemModal(false);
          setActivePrepItem(null);
          setActivePrepItemPivotId(null);
          // After the very first catch, Finn says why it matters (once).
          if (collectedOnce.current && hasCompleted('onboarding') && !hasCompleted('home_first_find')) {
            setTimeout(() => startTutorial('home_first_find'), 500);
          }
        }}
        onCollected={() => {
          collectedOnce.current = true;
          setCaughtThisSession(true);
          setHomeCollectionVersion((version) => version + 1);
        }}
        onUnavailable={() => setHomeCollectionVersion((version) => version + 1)}
        onViewSet={(slug) => RootNavigation.navigate('SetCollection', { slug })}
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
              redeemable={mapFocused ? activeRedeemable : undefined}
              park={park}
              selectedTaskId={selectedTask?.id ?? null}
              onOpenChange={setRedeemFlowOpen}
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
                    secret_tasks: (prev.secret_tasks ?? []).filter((t) => t.id !== taskId),
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
                    secret_tasks: isSecretTask ? (prev.secret_tasks ?? []).filter((t) => t.id !== taskId) : prev.secret_tasks,
                  };
                });
                setActiveRedeemable(undefined);
                if (!isSecretTask && taskId === tripGoal?.task_id) {
                  setTripGoalVersion(version => version + 1);
                }
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
            {/* Energy and Swords: bright pills in the header's Currency language. */}
            <View style={{ marginBottom: 12, gap: 6, alignItems: 'flex-end' }}>
              <MapResourcePill icon="energy" label="Energy" count={player?.energy ?? 0} />
              <MapResourcePill icon="swords" label="Swords" count={playerSwordCount} muted={playerSwordCount === 0} />
            </View>
            {/* Profile Avatar - navigates to Park Profile */}
            {player && (
              <Button
                onPress={() => {
                  RootNavigation.navigate('Park', { park: park.id, player: player.id });
                }}
              >
                <Avatar player={player} size="lg" />
              </Button>
            )}
          </View>
        </>
      )}
      {/* Park Mode: the game map */}
      {park && (
      <View
        style={{
          flex: 1,
          marginTop: -8,
        }}
      >
        {/* Ride Control floats over the map so the map runs right up to the header. */}
        {player && (
          <View style={{ position: 'absolute', top: 12, left: 0, right: 0, zIndex: 25 }} pointerEvents="box-none">
            <RideControlBar control={rideControl} tasks={visibleTasks}
              onFocusTask={(task) => setSelectedTask(task)} />
            <LiveEventsPill raid={raid} rushes={rushes} onBoss={() => setBossOpen(true)}
              mapMoment={bossMap.moment} mapFlag={bossMap.flag} onDismissMoment={bossMap.dismiss}
              onMapMoment={() => {
                const task = visibleTasks.find(task => task.id === bossMap.moment?.impact.taskId);
                if (task) setSelectedTask(task);
              }}
              pendingAttack={bossRecovery?.pending} receiptNeedsCheck={receiptNeedsCheck}
              onRush={(task) => setSelectedTask(task)} />
          </View>
        )}
        {suggestionSlots.left === 'dwell' && suggestionSlots.leftStub && queueDwell && <MapSuggestionStub side="left" top={slotTop}
          label={`In line at ${queueDwell.rideName}? Show queue games`} onPress={() => setSelectedTask(null)}>
          <GameIcon name="queue" size={32} />
        </MapSuggestionStub>}
        {suggestionSlots.left === 'dwell' && !suggestionSlots.leftStub && queueDwell && <DwellCard key={`dwell-${queueDwell.rideId}`}
          rideName={queueDwell.rideName} top={slotTop}
          onDismiss={() => setDismissedDwell(queueDwell.rideId)}
          onPlay={async () => {
            const ride = await resolveRideContextById(park.id, queueDwell.rideId)
              ?? await resolveMapQueueContext(park.id, queueDwell.rideName);
            if (!ride) throw new Error('This line could not load.');
            navigation.navigate('LinePlay', { ride });
          }} />}
        {adventure && suggestionSlots.left === 'adventure' && tripGoalData && player && <AdventureTicketCard key={`adventure-${player.id}-${park.id}-${adventure.id}`}
          ticket={adventure} data={tripGoalData} stale={tripGoalStale} gate={adventureGate} detours={adventureDetours}
          closed={adventureRideClosed(adventure, livePark, park.id, mapNow)} top={slotTop} collapsed={suggestionSlots.leftStub}
          slam={adventureMoment.slam} onSlamDone={adventureMoment.markSeen}
          onOcclusionChange={setAdventureOccluded} onRefresh={refreshTripGoal}
          onSelect={selectAdventureRide} onDismiss={dismissAdventure}
          onCelebrate={() => celebrateTicket(adventure.id)}
          onDiscover={focusAdventureRide} onFindLine={focusAdventureRide}
          onPlay={async () => {
            const ride = await resolveMapQueueContext(adventure.park_id, adventure.ride.ride_name);
            if (adventureScope.current !== adventureOwner) return;
            if (!ride) throw new Error('This queue adventure could not load.');
            navigation.navigate('LinePlay', { ride });
          }}
          onShelf={() => {
            // Hand off to the Park screen's measured shelf arrival (Profile -> park -> shelf).
            const earnedCoin = adventureShelfArrival(adventure);
            RootNavigation.navigate('Park', { park: adventure.park_id, player: player.id, ...(earnedCoin ? { earnedCoin } : {}) });
          }} />}
        {suggestionSlots.left === 'goal' && suggestionSlots.leftStub && tripGoal && player && <MapSuggestionStub side="left" top={slotTop}
          label={`Your ride goal: ${tripGoal.ride_name}. Show it`} onPress={() => {
            if (tripGoalTask) guideTo(tripGoalTask);
            else RootNavigation.navigate('Park', { park: tripGoal.park_id, player: player.id });
          }}>
          <GameIcon name="ride" size={32} />
        </MapSuggestionStub>}
        {suggestionSlots.left === 'goal' && !suggestionSlots.leftStub && tripGoal && player && <Pressable
          accessibilityRole="button"
          accessibilityLabel={tripGoal.coin_owned
            ? `Open ${tripGoal.ride_name} on my coin shelf`
            : tripGoalTask ? `Show ${tripGoal.ride_name} on the map`
              : `Open the ride guide for ${tripGoal.ride_name}`}
          onPress={() => {
            if (tripGoal.coin_owned) {
              RootNavigation.navigate('CoinShelf', { focusCoin: { assetId: tripGoal.asset_id } });
            } else if (tripGoalTask) {
              guideTo(tripGoalTask);
            } else {
              RootNavigation.navigate('Park', { park: tripGoal.park_id, player: player.id });
            }
          }}
          style={{ position: 'absolute', top: player ? slotTop : 12, left: 12, width: '43%', zIndex: 20,
            backgroundColor: '#0879ca', borderColor: '#ffffff', borderWidth: 3,
            borderRadius: 14, padding: 8 }}>
          <Text style={{ color: '#ffdc61', fontFamily: 'Knockout', fontSize: 10, letterSpacing: 0.6 }}>
            {tripGoalStale ? 'LAST CONFIRMED GOAL' : tripGoalData?.goal_plan?.maxed ? 'MAX LEVEL REACHED'
              : tripGoal.coin_owned ? 'MASTERY GOAL' : 'YOUR RIDE GOAL'}
          </Text>
          <Text style={{ color: 'white', fontFamily: 'Shark', fontSize: 14 }} numberOfLines={1}>{tripGoal.ride_name}</Text>
          <Text style={{ color: '#dff4ff', fontFamily: 'Knockout', fontSize: 11, marginTop: 2 }} numberOfLines={2}>
            {tripGoal.coin_owned && tripGoalData?.goal_plan && !tripGoalData.goal_plan.maxed
              ? `Level ${tripGoalData.goal_plan.current_level}/${tripGoalData.goal_plan.max_level} · ${tripGoalData.goal_plan.parts_needed} Parts to upgrade`
              : tripGoal.coin_owned ? 'Current max reached · Choose another ride' : tripGoal.park_id !== park.id
              ? `View at ${tripGoal.park_name}` : tripGoalTask
                ? `${tripGoalData?.wallet.tickets_needed ? `${tripGoalData.wallet.tickets_needed} more Tickets needed` : 'Tickets ready'} · Tap to spot it`
                : 'Open Ride Guide for its coin'}
          </Text>
        </Pressable>}
        {suggestionSlots.right === 'ride' && selectedTask && queueRide && <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play queue games for ${selectedTask.name}. ${queueRide.lineRewardsReady === false
            ? 'Ride Parts are not set up here yet.' : 'Ride Parts require a verified wait.'}`}
          onPress={() => navigation.navigate('LinePlay', { ride: queueRide })}
          style={{ position: 'absolute', top: player ? slotTop : 12, right: 12, width: '43%', zIndex: 20,
            backgroundColor: '#0879ca', borderColor: '#fff', borderWidth: 3,
            borderRadius: 14, padding: 8 }}>
          <GameRichText style={{ color: '#ffdc61', fontFamily: 'Shark', fontSize: 15 }} iconSize={16} numberOfLines={1}>
            {queueRide.lineRewardsReady === false ? 'QUEUE GAMES [icon:arrow]' : 'PLAY IN LINE [icon:arrow]'}
          </GameRichText>
          <Text style={{ color: '#fff', fontFamily: 'Knockout', fontSize: 11 }} numberOfLines={1}>
            {selectedTask.name}
          </Text>
          <Text style={{ color: '#dff4ff', fontFamily: 'Knockout', fontSize: 10 }} numberOfLines={1}>
            {queueRide.lineRewardsReady === false ? 'Games only · Parts not set up' : 'Parts need a verified wait'}
          </Text>
        </Pressable>}
        <Map onPress={() => { setSelectedTask(null); setFocusedFromChecklist(null); setMapFocusRequest(null); }}
          onZoomChange={onMapZoom}
          ambientPaused={redeemFlowOpen || bossOccluded || adventureOccluded || dailyGiftOccluded}
          crowdHaze={parkHaze}
          guideTarget={findGuide && selectedTask?.id === findGuide.taskId ? findGuide : null}
          controlsTop={slotTop + (queueRide ? 104 : 76)} focusCoordinate={bossMap.moment && bossMap.moment.phase !== 'settled'
            ? { ...bossMap.moment.impact.coordinate, requestId: bossMap.moment.impact.raidId } : selectedTask ? {
          latitude: Number(selectedTask.latitude), longitude: Number(selectedTask.longitude),
        } : mapFocusRequest}>
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
          {rideClusters.map(({ lead, members }) => {
            const task = lead.task;
            const resting = restingTasks.includes(task);
            const distance = taskDistance.get(task.id) ?? null;
            return <TaskMarker
              key={`${task.id}-${goalTaskId === task.id ? 'goal' : 'regular'}`}
              task={task}
              isSelected={selectedTask?.id === task.id}
              isTripGoal={goalTaskId === task.id}
              adventure={adventureTaskId === task.id}
              near={distance !== null && distance <= 60}
              playable={playableTaskId === task.id}
              clusterCount={members.length}
              restingUntil={resting ? gameTimestamp(task.active_from) : null}
              distanceMeters={selectedTask?.id === task.id ? distance : null}
              ticketCost={task.ticket_cost ?? tripGoalData?.wallet.ticket_cost ?? 1}
              revealDelay={revealRef.current?.delays.get(task.id)}
              control={rideControlByAsset.get(Number(task.asset_id))}
              flagRaiseKey={bossMap.flag?.asset_id === Number(task.asset_id) &&
                (bossMap.moment?.phase === 'flag' || bossMap.moment?.phase === 'settled') ? bossMap.moment.impact.key : undefined}
              ambient={ambientTaskIds.has(task.id)}
              live={liveByTask.get(task.id)}
              aliveRank={aliveRanks.get(task.id)}
              onPress={handleTaskPress}
            />;
          })}
          {/* After the ride islands so their ambience never prints over the label; it settles clear of them. */}
          {activeParkProject?.park_id === park.id && (
            <ParkProjectMapBeacon project={activeParkProject} avoid={beaconAvoid}
              onPress={() => setProjectOpenRequestVersion(version => version + 1)} />
          )}
          {bossMap.moment && (bossMap.moment.phase === 'exit' || bossMap.moment.phase === 'flag') &&
            <Circle center={bossMap.moment.impact.coordinate} radius={65} fillColor="rgba(255,207,59,0.12)" strokeColor="#ffcf3b" strokeWidth={2} />}
          {bossMap.moment?.phase === 'exit' && <BossMapDeparture impact={bossMap.moment.impact} onComplete={bossMap.finishExit} />}
          {raid && raidActive && <BossMarker raid={raid} animate={mapFocused && !bossOccluded && !isActive} onPress={() => setBossOpen(true)} />}
          {focusedFromChecklist && selectedTask?.id === focusedFromChecklist.id &&
            !visibleTasks.some(task => task.id === focusedFromChecklist.id) && (
              <TaskMarker task={focusedFromChecklist} isSelected isTripGoal={false}
                onPress={() => { setSelectedTask(null); setFocusedFromChecklist(null); }} />
            )}
          {redeemables?.coins
            ?.filter((coin) =>
              opportunityIsActive(coin, mapNow)
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
                    <Coin coin={coin} onExpire={() => void refreshMapOpportunities().catch(() => undefined)} />
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
              opportunityIsActive(key, mapNow)
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
                    <Key model={key} onExpire={() => void refreshMapOpportunities().catch(() => undefined)} />
                  </View>
                </Marker>
              );
            })}
          {redeemables?.redeemables
            .filter((redeemable) =>
              opportunityIsActive(redeemable, mapNow)
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
                      onExpire={() => void refreshMapOpportunities().catch(() => undefined)}
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
      
      {/* Too Far Away: ribbon + blue card with a distance meter */}
      <TooFarDialog visible={showTooFarModal} distanceMeters={tooFarMeters} requiredMeters={tooFarRequiredMeters}
        homeItem={tooFarIsHomeItem} onClose={() => setShowTooFarModal(false)} />
    </Wrapper>
  );
}

export default withWs2Profiler(ExploreScreen, 'ExploreScreen');
