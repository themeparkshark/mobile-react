import { useIsFocused, useNavigation, useRoute, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { Text, View, Pressable } from 'react-native';
import useMapOpportunityClock from '../hooks/useMapOpportunityClock';
import useLivePoll from '../hooks/useLivePoll';
import useUserIdle, { idlePollInterval, markUserActivity } from '../hooks/useUserIdle';
import { opportunityIsActive } from './ExploreScreen/mapOpportunityTiming';
import { TaskType } from '../models/task-type';
import currencyBalance from '../helpers/currency-balance';
import * as RootNavigation from '../RootNavigation';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Map, { type MapProjector } from '../components/Map';
import { CoinCollectFlight } from '../components/map/alive/CoinCollectFlight';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
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
import { isConfirmedOutsidePark, isHomeMapConfirmed, nextHomeAnchor, type ParkLookupRecord } from '../context/parkLookupPolicy';
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
import { chestMayPresent, hasFirstCatch, homeIntroMayPresent, mapSuggestionSlots, suggestionSlotScreenTop, suggestionSlotTop } from './ExploreScreen/mapPresentationQueue';
import PermissionsNotGranted from './ExploreScreen/PermissionsNotGranted';
import RideControlBar from '../components/RideControlBar';
import { rideLook } from '../services/rideLandmark';
import type { RideControlRide } from '../api/endpoints/parks/rideControl';
import useRideControlMap from '../hooks/useRideControlMap';
import useBossMapMoment from '../hooks/useBossMapMoment';
import BossMapDeparture from '../components/boss/BossMapDeparture';
import { Circle } from '../components/map/Circle';
import { clampAliveRank } from '../components/map/alive/ambientBudget';
import { crowdHaze } from '../components/map/alive/parkPulse';
import { ghostSharks } from '../components/map/alive/friendsNearby';
import { GhostSharks } from '../components/map/alive/GhostSharks';
import { NightShowLayer } from '../components/map/alive/NightShowLayer';
import NightShowPill from '../components/map/alive/NightShowPill';
import useNightShow from '../components/map/alive/useNightShow';
// Fin-ister Nights (Halloween night mode layered on the park game).
import useFrightNight from '../hooks/useFrightNight';
import { FrightLayer, FrightPill, useFrightEngine } from '../components/fright';
import { frightHelpChoices, frightOwnsParkTips, hideEveryRideOpen } from '../services/fright/hooks';
import type { FrightMapInput } from '../components/map/fright';
import { getParkLive, type LivePark, type LiveRide } from '../api/endpoints/parks/live';
import type { RushPick } from '../components/RushCallout';
import LiveEventsPill from '../components/LiveEventsPill';
import BossMarker from '../components/boss/BossMarker';
import BossRaidFlow, { useParkRaid } from '../components/boss/BossRaidFlow';
import useBossAttackRecovery from '../hooks/useBossAttackRecovery';
import DailyGiftModal from '../components/DailyGiftModal';
import ChestMapButton from '../components/map/ChestMapButton';
import { chestDismissed, chestShouldShow, markChestDismissed } from './ExploreScreen/dailyChestPresence';
import HomeHuntResultsHost from '../components/home/HomeHuntResultsHost';
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
import useSwapTapGuard from './ExploreScreen/useSwapTapGuard';
import { revealDelays } from './ExploreScreen/mapMarkerPresentation';
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
import { GameIcon, GameRichText, gameAlert } from '../ui';
import { useHelp } from '../components/help/HelpProvider';
import OneTimeTip from '../components/help/OneTimeTip';
import HelpButton from '../components/help/HelpButton';
import { mapTipReady, parkTipFor } from '../services/help/tipGate';
// Map declutter: one HUD row, and every marker placed by priority (no overlaps).
import MapStatusStack, { TONES, type StatusEntry } from '../components/map/MapStatusStack';
import { statusOrder } from '../components/map/statusStack';
import { createDeclutterStore } from '../components/map/declutter/store';
import type { MapDeclutterInput } from '../components/map/declutter/useMapDeclutter';
import { offsetMeters, validPoint } from '../components/map/fright/geo';
import { limitedLabel } from '../services/collection/limitedCoins';
import FindMarker from './ExploreScreen/FindMarker';
import { SLOTS, useMarkerSlots } from '../components/map/markerSlots';
import { PARKED } from '../components/map/Marker';
import { BOTTOM_RIGHT_COLUMN, bottomLeftColumnHeight, buildParkLayout, parkMapInsets, rideLayoutId, rideTagFor,
  type FindLayoutInput, type FixedLayoutInput, type HauntLayoutInput } from './ExploreScreen/parkMapLayout';

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
// An empty ride slot's stand-in (parked, never drawn) and an empty slot's 1 pt content.
const PARKED_TASK = { id: -1, name: '', latitude: '0', longitude: '0', coin_url: '', coins: 0, completion_goal: 0, experience: 0,
  times_completed: 0, asset_id: -1, ticket_cost: 1 } as unknown as TaskType;
const PARKED_BOX = { width: 1, height: 1 } as const;
const PARKED_TIME = '2000-01-01T00:00:00Z';
// Friends drawn as ghost sharks at most (the closest).
const GHOST_CAP = 5;

function ExploreScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const mapFocused = useIsFocused();
  // Idle (no touch, no walking for 2 min): the map's live polls slow down.
  const mapIdle = useUserIdle();
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
  const { parkLoaded, parkLookupRecord, location, park, permissionGranted, permissionChecked, latestLocationSampleRef } =
    useContext(LocationContext);
  // The anchor is the newest outside-park confirmation (kept through a failed
  // re-check), so walking past the 25 m re-check never blanks the home map.
  const homeAnchorRef = useRef<ParkLookupRecord | null>(null);
  homeAnchorRef.current = nextHomeAnchor(homeAnchorRef.current, parkLookupRecord);
  const homeLocationConfirmed = !park && (isConfirmedOutsidePark(location, parkLookupRecord) ||
    isHomeMapConfirmed(location, homeAnchorRef.current));

  useEffect(() => {
    if (homeLocationConfirmed) return;
    setShowPrepItemModal(false);
    setActivePrepItem(null);
    setActivePrepItemPivotId(null);
  }, [homeLocationConfirmed]);
  const { theme } = useContext(ThemeContext);
  const { currencies } = useContext(CurrencyContext);
  const { startTutorial, hasCompleted, isReady, isActive } = useTutorial();
  const { explain, openHowToPlay } = useHelp();
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

  // On an event night the Fin-ister intro owns the first open; Finn's onboarding waits for it.
  const [frightIntroOwns, setFrightIntroOwns] = useState(false);
  // Trigger onboarding tutorial on first visit
  useEffect(() => {
    if (mapFocused && player && isReady && parkLoaded && permissionGranted && !isActive && !hasCompleted('onboarding') && !frightIntroOwns) {
      const timer = setTimeout(() => {
        startTutorial('onboarding', { inPark: !!park });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [mapFocused, player, isReady, parkLoaded, permissionGranted, park?.id, isActive, hasCompleted, startTutorial, frightIntroOwns]);

  // A player who learned the home hunt should meet the park loop when they
  // actually arrive. Park-first players already saw these steps in onboarding.
  useEffect(() => {
    if (!mapFocused || !player || !isReady || !parkLoaded || !permissionGranted || !park || isActive ||
      !hasCompleted('onboarding') || hasCompleted('park_arrival') || frightIntroOwns) return;
    const timer = setTimeout(() => startTutorial('park_arrival'), 1500);
    return () => clearTimeout(timer);
  }, [mapFocused, player, isReady, parkLoaded, permissionGranted, park?.id, isActive, hasCompleted, startTutorial, frightIntroOwns]);
  
  // One overlay at a time: a find that shows up during a tutorial waits for it.
  const [pendingFind, setPendingFind] = useState<{ item: PrepItemType; pivotId: number } | null>(null);
  const collectedOnce = useRef(false);
  const [caughtThisSession, setCaughtThisSession] = useState(false);
  const [homeIntroOpen, setHomeIntroOpen] = useState(false);
  // The generic park tip is on screen: the Fin-ister intro waits for it (never two first-run cards at once).
  const [parkTipShowing, setParkTipShowing] = useState(false);
  const [redeemFlowOpen, setRedeemFlowOpen] = useState(false);

  // Collect moment: after a ride win, back on the map, the coin flies from its island onto the shelf button.
  const mapProjector = useRef<MapProjector | null>(null);
  const avatarRef = useRef<View>(null);
  const flightLayerRef = useRef<View>(null);
  const reducedMotion = useReducedGameMotion();
  const [pendingCollect, setPendingCollect] = useState<{ latitude: number; longitude: number; coinUrl: string | null; first: boolean } | null>(null);
  const [collectFlight, setCollectFlight] = useState<{ key: number; from: { x: number; y: number }; to: { x: number; y: number };
    coinUrl: string | null; label: string | null } | null>(null);
  const avatarPop = useSharedValue(1);
  const avatarPopStyle = useAnimatedStyle(() => ({ transform: [{ scale: avatarPop.value }] }));
  const mapFocusedRef = useRef(mapFocused); mapFocusedRef.current = mapFocused;
  useEffect(() => {
    if (!pendingCollect || redeemFlowOpen) return;
    // Let the reward sheet finish sliding away; "View coin" navigates off the map instead.
    const timer = setTimeout(async () => {
      const collect = pendingCollect;
      setPendingCollect(null);
      if (!mapFocusedRef.current) return;
      const measure = (ref: { current: View | null }) => new Promise<{ x: number; y: number; width: number; height: number } | null>(resolve => {
        if (!ref.current) { resolve(null); return; }
        ref.current.measureInWindow((x, y, width, height) => resolve(Number.isFinite(x) ? { x, y, width, height } : null));
      });
      const [start, avatar, layer] = await Promise.all([
        mapProjector.current?.(collect.latitude, collect.longitude) ?? null, measure(avatarRef), measure(flightLayerRef)]);
      if (!avatar || !layer || !mapFocusedRef.current) return;
      const from = start ?? { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
      setCollectFlight({ key: Date.now(), coinUrl: collect.coinUrl, label: collect.first ? 'New coin on your shelf!' : null,
        from: { x: from.x - layer.x, y: from.y - layer.y },
        to: { x: avatar.x + avatar.width / 2 - layer.x, y: avatar.y + avatar.height / 2 - layer.y } });
    }, 650);
    return () => clearTimeout(timer);
  }, [pendingCollect, redeemFlowOpen]);

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
  const { control: rideControl, refresh: refreshRideControl } = useRideControlMap({ playerId: player?.id ?? null, parkId: park?.id ?? null, focused: mapFocused, idle: mapIdle });
  // Boss raids: a co-op boss surfaces at a ride at set times each park day.
  const { raid, setState: setRaidState, link: raidLink, retryLink: retryRaidLink } = useParkRaid(park?.id, { focused: mapFocused, idle: mapIdle });
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
  const liveParkId = useRef(park?.id); liveParkId.current = park?.id;
  useEffect(() => { setLivePark(null); }, [park?.id]);
  const loadLivePark = useCallback(() => {
    const parkId = park?.id;
    if (!parkId) return;
    return getParkLive(parkId).then(result => { if (liveParkId.current === parkId) setLivePark(result); }).catch(() => undefined);
  }, [park?.id]);
  // Posted waits refresh each minute while the map is on screen; paused under
  // another screen or in the background, caught up on return.
  useLivePoll(loadLivePark, idlePollInterval(60000, mapIdle, 2), { enabled: !!park?.id, focused: mapFocused, key: park?.id ?? null });
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
  // Tonight's night show: real showtimes; the pill takes the live slot only when nothing else needs it.
  const nightShow = useNightShow(park?.id ?? null, mapFocused && !!player);
  // Fin-ister Nights: tonight's state (server clock, phases, polling) and the in-park engine.
  const frightNight = useFrightNight(player ? park?.id ?? null : null, mapFocused && !!player);
  const frightEngine = useFrightEngine(frightNight, { parkId: park?.id ?? null, focused: mapFocused, location,
    sampleRef: latestLocationSampleRef, blocked: !isReady || isActive || homeIntroOpen || parkTipShowing });
  useEffect(() => { setFrightIntroOwns(frightEngine.introPending); }, [frightEngine.introPending]);
  const frightStressSpots = useRef<readonly { latitude: number; longitude: number }[]>([]);
  frightStressSpots.current = frightNight.tonight?.spots ?? [];
  // Dev-only capture driver (EXPO_PUBLIC_FRIGHT_CAPTURE_NAV=card|profile|collection): opens that screen
  // 25 s after the map loads so simulator captures can show real flows without touch input.
  useEffect(() => {
    const target = __DEV__ ? process.env.EXPO_PUBLIC_FRIGHT_CAPTURE_NAV : undefined;
    if (!target) return;
    const timer = setTimeout(() => {
      const slug = frightNight.tonight?.event?.slug;
      if (target === 'card' && slug) (navigation as any).navigate('FrightCard', { eventSlug: slug });
      if (target === 'profile') (navigation as any).navigate('Profile');
      if (target === 'collection') (navigation as any).navigate('SetCollection');
    }, 25_000);
    return () => clearTimeout(timer);
  }, [frightNight.tonight?.event?.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  // Dev-only stress (EXPO_PUBLIC_FRIGHT_STRESS=1): every 45 s the mode turns off for 15 s (the map input
  // goes away and comes back), exercising the one-time mount and unmount of the fright markers.
  const [stressOff, setStressOff] = useState(false);
  useEffect(() => {
    if (!__DEV__ || process.env.EXPO_PUBLIC_FRIGHT_STRESS !== '1') return;
    let off = false;
    const timer = setInterval(() => { off = !off; setStressOff(off); }, off ? 15_000 : 30_000);
    return () => clearInterval(timer);
  }, []);
  const frightMap = useMemo<FrightMapInput | null>(() => !stressOff && frightNight.tonight /* mounted for the whole event-park session: markers never churn (MapLibre insert crash); active/phase fade them */
    && frightNight.eventPark ? {
      tonight: frightNight.tonight, active: frightNight.modeOn, nowOffsetMs: frightNight.offset,
      player: location ?? null, spooky: frightEngine.spooky, doneKeys: frightEngine.doneKeys, quiet: frightEngine.quiet,
      cinematic: frightEngine.tutorial === 'intro' ? 'intro' : null, showLive: nightShow.phase === 'live',
      onHauntPress: frightEngine.openSheetAt, ambience: frightEngine.ambient,
      tierCap: frightNight.tonight.config?.fx_tier_cap ?? undefined,
    } : null, [stressOff, frightEngine.openSheetAt, frightEngine.ambient, frightNight.tonight, frightNight.modeOn, frightNight.phase, frightNight.eventPark, frightNight.offset, location,
    frightEngine.spooky, frightEngine.doneKeys, frightEngine.quiet, frightEngine.tutorial, nightShow.phase]);
  const busyLiveSlot = !!rushes.length || raidActive || receiptNeedsCheck || !!bossMap.moment;
  const nightPill = !!nightShow.show && (nightShow.phase === 'teaser' || nightShow.phase === 'live');
  // One HUD row over the map, always: the suggestion row never moves.
  const slotTop = suggestionSlotTop();
  // Friends who share their spot in this park, as ghost sharks (only if the live feed carries them).
  const ghosts = useMemo(() => ghostSharks(livePark?.friends_nearby, location ?? null, Date.now(), GHOST_CAP),
    [livePark, nearLat, nearLng]); // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => { if (playerLat != null) markUserActivity(); }, [playerLat, playerLng]);
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
  // Every ride island stays mounted, keyed by ride and in first-seen order (new ones append):
  // mounting, unmounting or reordering MapView children mid-list crashes MapLibre
  // (-[MLRNMapView insertReactSubview:atIndex:]). Folding and hiding are the declutter's
  // job and only change what each island draws.
  const rideTasks = useMemo(() => {
    const seen = new Set<number>();
    const out: TaskType[] = [];
    for (const task of [...visibleTasks, ...restingTasks]) {
      if (seen.has(task.id) || !Number.isFinite(Number(task.latitude)) || !Number.isFinite(Number(task.longitude))) continue;
      seen.add(task.id);
      out.push(task);
    }
    return out;
  }, [visibleTasks, restingTasks]);
  const rideOrder = useRef<{ context: string; ids: number[]; known: Set<number> }>({ context: '', ids: [], known: new Set() });
  if (rideOrder.current.context !== mapContext) rideOrder.current = { context: mapContext, ids: [], known: new Set() };
  for (const task of rideTasks) {
    if (rideOrder.current.known.has(task.id)) continue;
    rideOrder.current.known.add(task.id);
    rideOrder.current.ids.push(task.id);
  }
  const orderedRides = useMemo(() => {
    const byId = new globalThis.Map(rideTasks.map(task => [task.id, task]));
    return rideOrder.current.ids.flatMap(id => { const task = byId.get(id); return task ? [task] : []; });
  }, [rideTasks]);
  // Living map budget: only the nearest islands spend animation (see ambientBudget).
  const aliveRanks = useMemo(() => new globalThis.Map(rideTasks.map(task => task.id)
    .sort((a, b) => (taskDistance.get(a) ?? Infinity) - (taskDistance.get(b) ?? Infinity))
    .map((id, index) => [id, index])), [rideTasks, taskDistance]);
  // First reveal of a park's islands: nearest drop in first.
  const revealRef = useRef<{ context: string; delays: globalThis.Map<number, number> } | null>(null);
  if (redeemables && visibleTasks.length && revealRef.current?.context !== mapContext) {
    revealRef.current = { context: mapContext, delays: revealDelays([...visibleTasks]
      .sort((a, b) => (taskDistance.get(a.id) ?? 0) - (taskDistance.get(b.id) ?? 0)).map(task => task.id)) };
  }
  const [mapFocusRequest, setMapFocusRequest] = useState<{ latitude: number; longitude: number; zoom: number; requestId: number } | null>(null);
  // Dev-only stress for the MapLibre marker guard (EXPO_PUBLIC_FRIGHT_STRESS=1): pans and zooms
  // across every Fin-ister spot every 2.5 s so culling and LOD churn as hard as a walking guest.
  useEffect(() => {
    if (!__DEV__ || process.env.EXPO_PUBLIC_FRIGHT_STRESS !== '1') return;
    let i = 0;
    const timer = setInterval(() => {
      const spots = frightStressSpots.current;
      if (!spots.length) return;
      const s = spots[i % spots.length];
      const zoom = [15.2, 16.4, 17.6, 18.6][i % 4];
      i += 1;
      setMapFocusRequest({ latitude: s.latitude, longitude: s.longitude, zoom, requestId: Date.now() });
    }, 2500);
    return () => clearInterval(timer);
  }, []);
  const zoomRef = useRef(mapZoom); zoomRef.current = mapZoom;
  const declutterStore = useRef(createDeclutterStore()).current;
  // Tapping an island with "+N" zooms into it; a lone island toggles selection.
  const handleTaskPress = useCallback((task: TaskType) => {
    const zoom = zoomRef.current;
    const folded = declutterStore.get(rideLayoutId(task.id))?.folded ?? 0;
    if (folded > 0 && zoom < 19.5) {
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
    return () => { gymGeneration.current++; };
  }, [park?.id, fetchGymData]);
  // Every 30 s while the map is on screen (the gym marker reads this same data).
  useLivePoll(fetchGymData, idlePollInterval(30000, mapIdle), { enabled: !!park?.id, focused: mapFocused, key: gymOwner });

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
  // The left chip can turn from the Adventure Ticket into "In line at X?" under
  // a finger; swallow taps on that slot for a moment after any swap.
  const leftSlotKey = suggestionSlots.left == null ? null : [suggestionSlots.left,
    suggestionSlots.leftStub ? 'stub' : 'full',
    suggestionSlots.left === 'dwell' ? queueDwell?.rideId : suggestionSlots.left === 'adventure' ? adventure?.id : tripGoal?.ride_name,
  ].join(':');
  const leftSlotSwapGuard = useSwapTapGuard(leftSlotKey);
  const chestReady = chestMayPresent({
    tutorialActive: isActive, findOpen: showPrepItemModal, findPending: !!pendingFind,
    firstCatchDone: hasFirstCatch(player, hasCompleted('home_first_find'), caughtThisSession),
    boss: bossOpen || bossOccluded || (!!bossMap.moment && bossMap.moment.phase !== 'settled'),
    rideOpen: redeemFlowOpen, adventureOpen: adventureOccluded,
    otherModalOpen: showTooFarModal || showCommunityCenterModal || homeIntroOpen,
  });
  // The daily chest presents itself once; "Back to map" puts it away until the
  // next app open or the next day, and the map's chest button reopens it.
  const [chestRequested, setChestRequested] = useState(false);
  const [, setChestDismissals] = useState(0);
  const chestUnclaimed = !!player && permissionGranted && !!dailyGift && dailyGift.redeemed_at === null
    && hasCompleted('onboarding');
  const chestScreenFree = chestMayPresent({
    tutorialActive: isActive, findOpen: showPrepItemModal, findPending: !!pendingFind, firstCatchDone: true,
    boss: bossOpen || bossOccluded || (!!bossMap.moment && bossMap.moment.phase !== 'settled'),
    rideOpen: redeemFlowOpen, adventureOpen: adventureOccluded,
    otherModalOpen: showTooFarModal || showCommunityCenterModal || homeIntroOpen,
  });
  const chestShowing = mapFocused && !!dailyGift && chestShouldShow({
    unclaimed: chestUnclaimed, autoReady: chestReady, screenFree: chestScreenFree,
    requested: chestRequested, dismissed: chestDismissed(dailyGift.id),
  });
  const dailyGiftId = dailyGift?.id;
  const onChestClosed = useCallback((claimed: boolean) => {
    if (!claimed && dailyGiftId != null) markChestDismissed(dailyGiftId);
    setChestRequested(false);
    setChestDismissals(count => count + 1);
  }, [dailyGiftId]);
  const chestButton = chestUnclaimed && !chestShowing
    ? <ChestMapButton onPress={() => setChestRequested(true)} /> : null;
  const homeIntroQueue = {
    homeConfirmed: homeLocationConfirmed, onboardingDone: isReady && hasCompleted('onboarding'),
    tutorialActive: isActive, findOpen: showPrepItemModal, findPending: !!pendingFind,
    otherModalOpen: showTooFarModal || showCommunityCenterModal, chestShowing: dailyGiftOccluded,
    caughtThisSession, firstFindLineDone: hasCompleted('home_first_find'),
  };
  const homeIntroAllowed = homeIntroMayPresent(homeIntroQueue);
  // While Fin-ister Nights is on (or its exit / Marquee card is up) the generic park tip stays away.
  const parkTip = frightOwnsParkTips({ modeOn: frightNight.modeOn, recapUp: !!frightEngine.recapOffer || !!frightEngine.marquee })
    ? null : parkTipFor({ inPark: !!park, arrivalLessonDone: isReady && hasCompleted('park_arrival'),
      rideCoinInRange: activeRedeemable?.type === 'task' || activeRedeemable?.type === 'secret_task' });
  const parkTipReady = mapTipReady({
    mapFocused, finnActive: isActive, rideOpen: redeemFlowOpen, findOpen: showPrepItemModal || !!pendingFind,
    dialogOpen: showTooFarModal || showCommunityCenterModal || homeIntroOpen || !!frightEngine.tutorial,
    bossOrChest: bossOpen || bossOccluded || dailyGiftOccluded || (!!bossMap.moment && bossMap.moment.phase !== 'settled'),
    adventureOpen: adventureOccluded, coinFlying: !!pendingCollect || !!collectFlight,
  });
  useEffect(() => { setParkTipShowing(!!player && !!parkTip && parkTipReady); }, [player, parkTip, parkTipReady]);
  // Would present but for a find: home finds hold their auto-open until the intro is seen.
  const homeIntroEligible = homeIntroMayPresent({ ...homeIntroQueue, findOpen: false, findPending: false });

  // Declutter inputs, rebuilt only when what the solver sees changes (the camera side runs in Map).
  // The opportunity clock and GPS fixes tick often; they reach the layout only through these
  // signatures (which chips show, which rides are near, which finds are live).
  const nightMode = !!frightMap?.active;
  const frightSpots = frightMap?.tonight.spots;
  const frightEncounter = frightMap?.tonight.encounter ?? null;
  const rideFacts = useMemo(() => rideTasks.map(task => {
    const live = liveByTask.get(task.id);
    const rush = !!live?.rush && live.status === 'OPERATING' && Date.parse(live.rush.ends_at) > mapNow;
    const closed = live?.status === 'DOWN' || live?.status === 'CLOSED' || live?.status === 'REFURBISHMENT' || restingTasks.includes(task);
    const selected = selectedTask?.id === task.id;
    const near = (taskDistance.get(task.id) ?? Infinity) <= 60;
    const tag = rideTagFor({ selected, rush, adventure: adventureTaskId === task.id, goal: goalTaskId === task.id,
      owned: (task.times_completed ?? 0) > 0, limitedText: task.limited?.active ? limitedLabel(task.limited) : null,
      expiresAt: gameTimestamp(task.active_to), near, now: mapNow, closed });
    return { id: task.id, latitude: Number(task.latitude), longitude: Number(task.longitude), selected,
      adventure: adventureTaskId === task.id, playable: playableTaskId === task.id, goal: goalTaskId === task.id, rush, near, closed, tag };
  }), [rideTasks, liveByTask, mapNow, restingTasks, selectedTask?.id, taskDistance, adventureTaskId, playableTaskId, goalTaskId]);
  const rideFactsKey = rideFacts.map(f => `${f.id}:${f.latitude},${f.longitude}:${+f.selected}${+f.adventure}${+f.playable}${+f.goal}${+f.rush}${+f.near}${+f.closed}:${f.tag ? `${f.tag.w}x${f.tag.h}` : '-'}`).join('|');
  const liveFinds = useMemo<FindLayoutInput[]>(() => [
    ...(redeemables?.coins ?? []).filter(coin => opportunityIsActive(coin, mapNow))
      .map(coin => ({ id: `coin:${coin.id}`, latitude: Number(coin.latitude), longitude: Number(coin.longitude), kind: 'coin' as const })),
    ...(redeemables?.keys ?? []).filter(key => opportunityIsActive(key, mapNow))
      .map(key => ({ id: `key:${key.id}`, latitude: Number(key.latitude), longitude: Number(key.longitude), kind: 'key' as const })),
    ...(redeemables?.redeemables ?? []).filter(item => opportunityIsActive(item, mapNow))
      .map(item => ({ id: `redeemable:${item.id}`, latitude: Number(item.latitude), longitude: Number(item.longitude), kind: 'redeemable' as const })),
    ...(redeemables?.items ?? []).filter(item => !item.is_hidden)
      .map(item => ({ id: `item:${item.id}`, latitude: Number(item.latitude), longitude: Number(item.longitude), kind: 'item' as const })),
    ...(redeemables?.pins ?? []).filter(item => !item.is_hidden)
      .map(item => ({ id: `pin:${item.id}`, latitude: Number(item.latitude), longitude: Number(item.longitude), kind: 'pin' as const })),
    ...(redeemables?.vaults ?? [])
      .map(vault => ({ id: `vault:${vault.id}`, latitude: Number(vault.latitude), longitude: Number(vault.longitude), kind: 'vault' as const })),
  ], [redeemables, mapNow]);
  const findsKey = liveFinds.map(f => f.id).join('|');
  const encounterLiveNow = !!frightEncounter && validPoint(frightEncounter) &&
    Date.parse(frightEncounter.starts_at) <= mapNow && mapNow < Date.parse(frightEncounter.ends_at);
  const latestFacts = useRef({ rideFacts, liveFinds }); latestFacts.current = { rideFacts, liveFinds };
  const declutterItems = useMemo(() => {
    if (!park) return [];
    const { rideFacts: rides, liveFinds: finds } = latestFacts.current;
    // Haunts at their drawn spot (the entrance offset), reefs at their centre with their radius.
    const haunts: HauntLayoutInput[] = (frightSpots ?? []).filter(spot => spot.kind === 'haunt' && validPoint(spot)).map(spot => {
      const offset = spot.fx?.offset;
      const at = offset && offset.length === 2 ? offsetMeters(spot, Number(offset[0]) || 0, Number(offset[1]) || 0) : spot;
      return { key: spot.key, latitude: at.latitude, longitude: at.longitude,
        closed: spot.status === 'CLOSED' || spot.status === 'DOWN' || spot.status === 'REFURBISHMENT' };
    });
    const reefs = (frightSpots ?? []).filter(spot => spot.kind === 'reef' && validPoint(spot))
      .map(spot => ({ key: spot.key, latitude: spot.latitude, longitude: spot.longitude, radius: spot.radius }));
    const fixed: FixedLayoutInput[] = [
      ...(gymData ? [{ id: 'gym', latitude: gymData.gym.latitude, longitude: gymData.gym.longitude, kind: 'gym' as const }] : []),
      ...(communityCenter ? [{ id: 'community', latitude: communityCenter.latitude, longitude: communityCenter.longitude, kind: 'community' as const }] : []),
      ...swords.map(sword => ({ id: `sword:${sword.id}`, latitude: sword.latitude, longitude: sword.longitude, kind: 'sword' as const })),
      ...(raid && raidActive && raid.latitude != null && raid.longitude != null
        ? [{ id: 'boss', latitude: raid.latitude, longitude: raid.longitude, kind: 'boss' as const }] : []),
      // The Fin-ister encounter critter and its ring: fixed art nothing may cover.
      ...(frightMap && encounterLiveNow && frightEncounter
        ? [{ id: 'encounter', latitude: frightEncounter.latitude, longitude: frightEncounter.longitude, kind: 'encounter' as const, radius: frightEncounter.radius }] : []),
    ];
    return buildParkLayout({ rides, finds, haunts: frightMap ? haunts : [], reefs: frightMap ? reefs : [], fixed, nightMode });
  }, [park, rideFactsKey, findsKey, frightSpots, frightMap, gymData, communityCenter, swords, raid, raidActive, nightMode, // eslint-disable-line react-hooks/exhaustive-deps
    encounterLiveNow, frightEncounter]);
  // Fixed marker slot pools (see markerSlots): allocated once, a slot keeps its find while it lives.
  const liveCoins = useMemo(() => (redeemables?.coins ?? []).filter(coin => opportunityIsActive(coin, mapNow)), [redeemables, mapNow]);
  const liveKeys = useMemo(() => (redeemables?.keys ?? []).filter(key => opportunityIsActive(key, mapNow)), [redeemables, mapNow]);
  const liveRedeemables = useMemo(() => (redeemables?.redeemables ?? []).filter(item => opportunityIsActive(item, mapNow)), [redeemables, mapNow]);
  const shownItems = useMemo(() => (redeemables?.items ?? []).filter(item => !item.is_hidden), [redeemables]);
  const shownPins = useMemo(() => (redeemables?.pins ?? []).filter(item => !item.is_hidden), [redeemables]);
  const rideSlots = useMarkerSlots(orderedRides, task => String(task.id), SLOTS.rides);
  const coinSlots = useMarkerSlots(liveCoins, coin => String(coin.id), SLOTS.coins);
  const keySlots = useMarkerSlots(liveKeys, key => String(key.id), SLOTS.keys);
  const redeemableSlots = useMarkerSlots(liveRedeemables, item => String(item.id), SLOTS.redeemables);
  const itemSlots = useMarkerSlots(shownItems, item => String(item.id), SLOTS.items);
  const pinSlots = useMarkerSlots(shownPins, item => String(item.id), SLOTS.pins);
  const vaultSlots = useMarkerSlots(redeemables?.vaults ?? [], vault => String(vault.id), SLOTS.vaults);
  const swordSlots = useMarkerSlots(swords, sword => String(sword.id), SLOTS.swords);
  const refreshFinds = useCallback(() => { void refreshMapOpportunities().catch(() => undefined); }, [refreshMapOpportunities]);
  const checklistRide = focusedFromChecklist && selectedTask?.id === focusedFromChecklist.id &&
    !visibleTasks.some(task => task.id === focusedFromChecklist.id) ? focusedFromChecklist : null;
  const projectPillShown = !!activeParkProject && suggestionSlots.right === 'project';
  const declutterInsets = useMemo(() => parkMapInsets({
    hudBottom: slotTop,
    left: suggestionSlots.left ? { top: slotTop, stub: suggestionSlots.leftStub } : null,
    right: suggestionSlots.right === 'ride' || projectPillShown ? { top: slotTop, stub: suggestionSlots.rightStub } : null,
    bottomLeft: bottomLeftColumnHeight(park?.stores.length ?? 0),
    bottomRight: BOTTOM_RIGHT_COLUMN,
  }), [slotTop, suggestionSlots.left, suggestionSlots.leftStub, suggestionSlots.right, suggestionSlots.rightStub, projectPillShown, park?.stores.length]);
  const declutter = useMemo<MapDeclutterInput | null>(() => park ? { store: declutterStore, items: declutterItems, insets: declutterInsets } : null,
    [park, declutterStore, declutterItems, declutterInsets]);

  // The one HUD row: the most urgent status leads, the rest wait behind "+N".
  const statusEntries: StatusEntry[] = player && park ? statusOrder({
    live: busyLiveSlot, show: nightPill ? (nightShow.phase === 'live' ? 'live' : 'teaser') : null,
    nightMode: frightNight.modeOn, control: true,
  }).map(key => {
    if (key === 'live') return { key, label: 'Live in the park', tone: rushes.length && !raidActive && !bossMap.moment ? TONES.rush : TONES.park, node: <LiveEventsPill inline raid={raid} rushes={rushes} onBoss={() => setBossOpen(true)}
      mapMoment={bossMap.moment} mapFlag={bossMap.flag} onDismissMoment={bossMap.dismiss}
      onMapMoment={() => {
        const task = visibleTasks.find(task => task.id === bossMap.moment?.impact.taskId);
        if (task) setSelectedTask(task);
      }}
      pendingAttack={bossRecovery?.pending} receiptNeedsCheck={receiptNeedsCheck}
      onRush={(task) => setSelectedTask(task)} /> };
    if (key === 'show') return { key, label: nightShow.show?.label ?? 'Tonight\'s show', tone: TONES.show, node: nightShow.show ? <NightShowPill inline show={nightShow.show} phase={nightShow.phase}
      onSee={() => {
        const anchor = nightShow.show?.anchor;
        if (anchor) { setSelectedTask(null); setMapFocusRequest({ ...anchor, zoom: 17.2, requestId: Date.now() }); }
      }} /> : null };
    // No own "?": the map's one "?" offers the Fin-ister tutorial while the mode is on.
    if (key === 'fright') return { key, label: frightNight.title, tone: TONES.night, node: <FrightPill inline night={frightNight} engine={frightEngine} /> };
    return { key, label: 'Ride Control', tone: TONES.park, node: <RideControlBar inline control={rideControl} tasks={visibleTasks}
      hideAllOpen={hideEveryRideOpen({ modeOn: frightNight.modeOn, eventPark: frightNight.eventPark, hasNight: !!frightNight.tonight?.night })}
      onFocusTask={(task) => setSelectedTask(task)} /> };
  }) : [];

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
                <Currency image={TICKET_ICON} count={player.tickets ?? 0} name="Park Tickets" flyTarget="tickets" />
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
                  <Pressable accessibilityRole="button" accessibilityLabel="Travel Mode" accessibilityHint="Explains Travel Mode"
                    hitSlop={8} onPress={() => explain('travel_mode')}>
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
                  </Pressable>
                </TopbarColumn>
                <TopbarColumn>
                  <Currency image={TICKET_ICON} count={player.tickets ?? 0} name="Park Tickets" flyTarget="tickets" />
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
        topOffset={park ? suggestionSlotScreenTop(Constants.statusBarHeight ?? 0) : undefined} />}
      {player && park && <BossRaidFlow parkId={park.id} raid={raid} open={bossOpen} onClose={() => setBossOpen(false)}
        presentationAvailable={!isActive && !dailyGiftOccluded && !showTooFarModal && !showCommunityCenterModal && !showPrepItemModal && !activeRedeemable}
        onMapOcclusionChange={setBossOccluded} onCelebrationDismiss={result => { void bossMap.enqueue(result); }}
        link={raidLink} onRetryLink={retryRaidLink}
        onState={state => { setRaidState(state); void refreshRideControl(); }} />}
      {player && permissionChecked && !permissionGranted && <PermissionsNotGranted />}
      {/* One overlay at a time: the daily chest comes last, after the first catch and never alongside a find. */}
      {chestShowing && dailyGift &&
        <DailyGiftModal dailyGift={dailyGift} onMapOcclusionChange={setDailyGiftOccluded} onClosed={onChestClosed} />}
      {/* Monday Home Hunt results come through the presentation queue, after the daily chest (2 full-screen moments per app open). */}
      <HomeHuntResultsHost enabled={!!player && !park && mapFocused && permissionGranted && hasCompleted('onboarding') && chestReady
        && !dailyGiftOccluded && !chestShowing && !(chestUnclaimed && !chestDismissed(dailyGift!.id))} />
      {/* Home Mode: the map always renders without a park, even before the
          first park check settles (it shows the park-check card until then).
          Gating it on parkLoaded left a blank grey screen whenever park state
          was cleared without a finished lookup. */}
      {player && !park && permissionGranted && (
        <HomeExplore key={`home-explore-${player.id}`} onPrepItemNearby={handlePrepItemNearby}
          refreshVersion={homeCollectionVersion} homeLocationConfirmed={homeLocationConfirmed}
          introAllowed={mapFocused && homeIntroAllowed} introEligible={mapFocused && homeIntroEligible}
          onIntroOpenChange={setHomeIntroOpen} chestButton={chestButton} />
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
            {/* How to play, reachable at the park too (the home menu is not shown here). */}
            {/* One "?": while Fin-ister Nights is on it offers the Fin-ister tutorial or the park help. */}
            <HelpButton topic="park" size={44} style={{ marginBottom: 10, marginLeft: 13 }}
              label={frightNight.modeOn ? `How to play: ${frightNight.title} or the park` : 'How to play at the park'}
              onPress={frightNight.modeOn ? () => gameAlert('How to play', undefined, frightHelpChoices({
                title: frightNight.title, onFright: frightEngine.replayTutorial, onPark: () => openHowToPlay('park'),
              })) : undefined} />
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
                const won = isSecretTask ? undefined : redeemables?.tasks.find(t => t.id === taskId);
                if (won && Number.isFinite(Number(won.latitude)) && Number.isFinite(Number(won.longitude))) {
                  setPendingCollect({ latitude: Number(won.latitude), longitude: Number(won.longitude),
                    coinUrl: won.coin_url || null, first: (won.times_completed ?? 0) === 0 });
                }
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
              <MapResourcePill icon="energy" label="Energy" count={player?.energy ?? 0}
                onPress={() => explain('energy', { count: player?.energy ?? 0 })} />
              <MapResourcePill icon="swords" label="Swords" count={playerSwordCount} muted={playerSwordCount === 0}
                onPress={() => explain('swords', { count: playerSwordCount })} />
            </View>
            {/* Profile Avatar - navigates to Park Profile */}
            {player && (
              <Animated.View ref={avatarRef} collapsable={false} style={avatarPopStyle}>
                <Button
                  onPress={() => {
                    RootNavigation.navigate('Park', { park: park.id, player: player.id });
                  }}
                >
                  <Avatar player={player} size="lg" />
                </Button>
              </Animated.View>
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
        {/* One-time Finn tips: the park welcome, then the first ride coin in range. Never over a game or dialog. */}
        {player && parkTip && (
          <OneTimeTip key={parkTip} id={parkTip} ready={parkTipReady}
            style={parkTip === 'coin_in_range'
              ? { position: 'absolute', left: 12, right: 12, bottom: 196, zIndex: 40 }
              : { position: 'absolute', left: 12, right: 12, top: 132, zIndex: 40 }} />
        )}
        {/* One HUD row floats over the map (the map runs right up to the header). */}
        {statusEntries.length > 0 && <MapStatusStack entries={statusEntries} />}
        {leftSlotSwapGuard && <View testID="left-slot-swap-guard" onStartShouldSetResponder={() => true}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: slotTop, left: 0, width: '52%', height: 120, zIndex: 40 }} />}
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
          projector={mapProjector}
          onZoomChange={onMapZoom}
          ambientPaused={redeemFlowOpen || bossOccluded || adventureOccluded || dailyGiftOccluded}
          fright={frightMap}
          declutter={declutter}
          crowdHaze={parkHaze}
          guideTarget={findGuide && selectedTask?.id === findGuide.taskId ? findGuide : null}
          controlsTop={slotTop + (queueRide ? 104 : 76)} extraControls={chestButton} focusCoordinate={bossMap.moment && bossMap.moment.phase !== 'settled'
            ? { ...bossMap.moment.impact.coordinate, requestId: bossMap.moment.impact.raidId } : selectedTask ? {
          latitude: Number(selectedTask.latitude), longitude: Number(selectedTask.longitude),
        } : mapFocusRequest}>
          {/* Every marker below is a fixed slot or an always-mounted singleton: finds spawning and
              expiring, rides coming and going, a boss landing or a show starting only change what a
              slot draws. MapView children never mount, unmount or reorder (MapLibre insert crash). */}
          {itemSlots.map((item, slot) => <ItemMarker key={`item-${slot}`} item={item} />)}
          {pinSlots.map((item, slot) => <PinMarker key={`pin-${slot}`} item={item} />)}
          {rideSlots.map((task, slot) => {
            if (!task) return <TaskMarker key={`ride-${slot}`} task={PARKED_TASK} parked isSelected={false} onPress={handleTaskPress} />;
            const resting = restingTasks.includes(task);
            const distance = taskDistance.get(task.id) ?? null;
            return <TaskMarker
              key={`ride-${slot}`}
              task={task}
              isSelected={selectedTask?.id === task.id}
              isTripGoal={goalTaskId === task.id}
              adventure={adventureTaskId === task.id}
              near={distance !== null && distance <= 60}
              playable={playableTaskId === task.id}
              restingUntil={resting ? gameTimestamp(task.active_from) : null}
              distanceMeters={selectedTask?.id === task.id ? distance : null}
              ticketCost={task.ticket_cost ?? tripGoalData?.wallet.ticket_cost ?? 1}
              revealDelay={revealRef.current?.delays.get(task.id)}
              control={rideControlByAsset.get(Number(task.asset_id))}
              flagRaiseKey={bossMap.flag?.asset_id === Number(task.asset_id) &&
                (bossMap.moment?.phase === 'flag' || bossMap.moment?.phase === 'settled') ? bossMap.moment.impact.key : undefined}
              ambient={ambientTaskIds.has(task.id)}
              live={liveByTask.get(task.id)}
              aliveRank={clampAliveRank(aliveRanks.get(task.id))}
              onPress={handleTaskPress}
            />;
          })}
          <GhostSharks ghosts={ghosts} />
          <NightShowLayer show={nightShow.show ?? null} live={nightShow.phase === 'live'} />
          {/* After the ride islands so their ambience never prints over the label; it settles clear of them. */}
          <ParkProjectMapBeacon project={activeParkProject?.park_id === park.id ? activeParkProject : null} avoid={beaconAvoid}
            onPress={() => setProjectOpenRequestVersion(version => version + 1)} />
          <Circle hidden={!(bossMap.moment && (bossMap.moment.phase === 'exit' || bossMap.moment.phase === 'flag'))}
            center={bossMap.moment?.impact.coordinate ?? PARKED} radius={65} fillColor="rgba(255,207,59,0.12)" strokeColor="#ffcf3b" strokeWidth={2} />
          <BossMapDeparture impact={bossMap.moment?.phase === 'exit' ? bossMap.moment.impact : null} onComplete={bossMap.finishExit} />
          <BossMarker raid={raid && raidActive ? raid : null} animate={mapFocused && !bossOccluded && !isActive} onPress={() => setBossOpen(true)} />
          {coinSlots.map((coin, slot) => (
            <FindMarker key={`coin-${slot}`} id={coin ? `coin:${coin.id}` : ''} hidden={!coin}
              latitude={coin ? Number(coin.latitude) : PARKED.latitude} longitude={coin ? Number(coin.longitude) : PARKED.longitude}>
              {tag => coin ? <Coin key={coin.id} coin={coin} tag={tag} onExpire={refreshFinds} /> : <View style={PARKED_BOX} />}
            </FindMarker>
          ))}
          {vaultSlots.map((vault, slot) => <VaultMarker key={`vault-${slot}`} vault={vault} />)}
          {/* Keys - rare spawns! */}
          {keySlots.map((key, slot) => (
            <FindMarker key={`key-${slot}`} id={key ? `key:${key.id}` : ''} hidden={!key}
              latitude={key ? Number(key.latitude) : PARKED.latitude} longitude={key ? Number(key.longitude) : PARKED.longitude}>
              {tag => key ? <Key key={key.id} model={key} tag={tag} onExpire={refreshFinds} /> : <View style={PARKED_BOX} />}
            </FindMarker>
          ))}
          {redeemableSlots.map((redeemable, slot) => (
            <FindMarker key={`redeemable-${slot}`} id={redeemable ? `redeemable:${redeemable.id}` : ''} hidden={!redeemable}
              latitude={redeemable ? Number(redeemable.latitude) : PARKED.latitude}
              longitude={redeemable ? Number(redeemable.longitude) : PARKED.longitude}>
              {tag => redeemable ? <Redeemable key={redeemable.id} redeemable={redeemable} tag={tag} onExpire={refreshFinds} /> : <View style={PARKED_BOX} />}
            </FindMarker>
          ))}
          <CommunityCenterMarker center={communityCenter} onPress={handleCommunityCenterPress} />
          {/* Gym Marker - show even without team so players can discover it */}
          <GymMarker hidden={!gymData} leader={gymData?.leader} latitude={gymData?.gym.latitude ?? PARKED.latitude}
            longitude={gymData?.gym.longitude ?? PARKED.longitude} onPress={handleGymPress} />
          {swordSlots.map((sword, slot) => (
            <SwordMarker key={`sword-${slot}`} hidden={!sword} id={sword?.id ?? -1}
              latitude={sword?.latitude ?? PARKED.latitude} longitude={sword?.longitude ?? PARKED.longitude}
              expiresAt={sword?.expires_at ?? PARKED_TIME} onPress={() => { if (sword) void handleSwordClaim(sword.id); }} />
          ))}
          {/* A ride focused from the checklist that is not on today's map (parked otherwise). */}
          <TaskMarker task={checklistRide ?? PARKED_TASK} parked={!checklistRide} isSelected={!!checklistRide} isTripGoal={false}
            onPress={() => { setSelectedTask(null); setFocusedFromChecklist(null); }} />
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
      
      {/* The collect moment flies over everything on the map screen. */}
      <View ref={flightLayerRef} collapsable={false} pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }}>
        {collectFlight && <CoinCollectFlight key={collectFlight.key} from={collectFlight.from} to={collectFlight.to}
          coinUrl={collectFlight.coinUrl} label={collectFlight.label} reducedMotion={reducedMotion}
          onLand={() => { avatarPop.value = reducedMotion ? 1 : withSequence(withTiming(1.22, { duration: 110 }), withSpring(1, { damping: 6, stiffness: 260 })); }}
          onDone={() => setCollectFlight(null)} />}
      </View>
      {/* Too Far Away: ribbon + blue card with a distance meter */}
      <TooFarDialog visible={showTooFarModal} distanceMeters={tooFarMeters} requiredMeters={tooFarRequiredMeters}
        homeItem={tooFarIsHomeItem} onClose={() => setShowTooFarModal(false)} />
      {/* Fin-ister Nights overlays (sheet, rank card, tutorial, exit moment, Marquee); outside the park block on purpose. */}
      {player && <FrightLayer night={frightNight} engine={frightEngine} top={slotTop + 64} />}
    </Wrapper>
  );
}

export default withWs2Profiler(ExploreScreen, 'ExploreScreen');
