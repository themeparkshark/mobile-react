import { useIsFocused, useNavigation, useRoute, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { Dimensions, Text, View, Pressable, StyleSheet } from 'react-native';
import useMapOpportunityClock from '../hooks/useMapOpportunityClock';
import useLivePoll from '../hooks/useLivePoll';
import useUserIdle, { idlePollInterval, markUserActivity } from '../hooks/useUserIdle';
import { nearbyOpportunityOpen, opportunityIsActive } from './ExploreScreen/mapOpportunityTiming';
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
// TaskListModal removed - tasks now spawn on map Pokemon-style
import Topbar from '../components/Topbar';
import Currency from '../components/Topbar/Currency';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import UsernameBanner from '../components/Topbar/UsernameBanner';
import Wrapper from '../components/Wrapper';
import MapLaunchCover from '../components/map/MapLaunchCover';
import { holdMapCover, launchCoverAhead, useCoverArt, useMapCovered, useMapOnScreen } from '../components/map/mapCover';
import { AuthContext } from '../context/AuthProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import { LocationContext } from '../context/LocationProvider';
import { useFrightCaptureFlow } from '../components/fright/preview/useFrightCaptureFlow';
import { isConfirmedOutsidePark, isHomeMapConfirmed, nextHomeAnchor, type ParkLookupRecord } from '../context/parkLookupPolicy';
import { ThemeContext } from '../context/ThemeProvider';
import useTripGoal from '../hooks/useTripGoal';
import AdventureTicketCard from './ExploreScreen/AdventureTicketCard';
import { adventurePlayGate, adventureRideClosed, adventureShelfArrival, rankDetours } from './ExploreScreen/adventureTicketPresentation';
import useAdventureStampMoment from './ExploreScreen/useAdventureStampMoment';
import { resolveMapQueueContext, resolveQueueStoryContext } from '../services/lineplay/resolveRide';
import type { RideContext } from '../services/lineplay/LinePlaySession';
import checkForRedeemable from '../helpers/check-for-redeemable';
import ParkMapRetryCard, { useParkMapRetry } from './ExploreScreen/ParkMapRetry';
import { CurrentRedeemableType } from '../models/current-redeemable-type';
import { RedeemablesType } from '../models/redeemables-type';
import { PrepItemType } from '../models/prep-item-type';
import Coin from './ExploreScreen/Coin';
import Key from './ExploreScreen/Key';
import HomeExplore from './ExploreScreen/HomeExplore';
import { HOME_PREP_PICKUP_RADIUS_METERS } from './ExploreScreen/homePickupRange';
import { rideFocusForPark, type ParkRideMapFocus } from './ExploreScreen/parkRideMapFocus';
import ParkProjectWidget from './ExploreScreen/ParkProjectWidget';
import { useMenuCardFade } from './ExploreScreen/menuCardFade';
import ParkProjectMapBeacon from './ExploreScreen/ParkProjectMapBeacon';
import type { ParkProject } from '../api/endpoints/me/park-projects';
import ItemMarker from './ExploreScreen/ItemMarker';
import GuestTaste from './ExploreScreen/GuestTaste';
import { attentionGate, attentionQueue, autoOpenAllowed, chestMayPresent, firstVisitChestWaits, FIRST_VISIT_CHEST_WAIT_MS, hasFirstCatch, homeIntroMayPresent, suggestionSlotScreenTop, suggestionSlotTop } from './ExploreScreen/mapPresentationQueue';
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
import RewardsButton, { rewardsButtonModel, withRewardsSummary } from '../components/map/RewardsButton';
import useRetention from '../components/retention/useRetention';
import { chestDismissed, chestShouldShow, markChestDismissed } from './ExploreScreen/dailyChestPresence';
import HomeHuntResultsHost from '../components/home/HomeHuntResultsHost';
import { DailyGiftContext } from '../context/DailyGiftProvider';
import PinMarker from './ExploreScreen/PinMarker';
import Redeemable from './ExploreScreen/Redeemable';
import TaskMarker from './ExploreScreen/TaskMarker';
import MapResourcePill from './ExploreScreen/MapResourcePill';
import TrailHost from '../components/trail/TrailHost';
import TooFarDialog from './ExploreScreen/TooFarDialog';
import { withWs2Profiler } from './ExploreScreen/ws2Profiler';
import useQueueDwell, { noteWaitEnded } from './ExploreScreen/useQueueDwell';
import useSwapTapGuard from './ExploreScreen/useSwapTapGuard';
import { revealDelays } from './ExploreScreen/mapMarkerPresentation';
import { gameTimestamp } from './ExploreScreen/mapOpportunityTiming';
import VaultMarker from './ExploreScreen/VaultMarker';
import CommunityCenterMarker from '../components/CommunityCenterMarker';
import CommunityCenterModal from '../components/CommunityCenterModal';
import getCommunityCenter, { CommunityCenter } from '../api/endpoints/community-center/getCommunityCenter';
// Gym Battle imports
import { GymMarker, SwordMarker } from '../components/GymBattle';
import { useMapFlags } from '../services/mapFlags';
import { getGym, getSwords, getMyTeam, claimSword, getMySwords, GymData, SwordSpawn, TeamInfo } from '../api/endpoints/gym-battle';
import { useTutorial } from '../components/Tutorial';
import SignInButtons from '../components/SignInButtons';
import { GameIcon, GameRichText, gameAlert, type GameDialogButton } from '../ui';
import type { FrightShopStall } from '../api/endpoints/fright/types';
import { queueHaptic } from '../gamekit/Haptics';
import { playSfx } from '../gamekit/SFX';
import { AWAY_LINE, awayHeadline, awayMessage, stallAction } from '../components/fright/halloweenShop';
import { useHelp } from '../components/help/HelpProvider';
import OneTimeTip from '../components/help/OneTimeTip';
import CoinTipPicture, { COIN_TIP_PICTURE_IMAGES } from '../components/help/CoinTipPicture';
import HelpButton from '../components/help/HelpButton';
import { mapTipReady, parkTipFor } from '../services/help/tipGate';
// Map declutter: one HUD row, and every marker placed by priority (no overlaps).
import MapStatusStack, { TONES, type StatusEntry } from '../components/map/MapStatusStack';
import { statusOrder, HUD_BOTTOM } from '../components/map/statusStack';
import { EventStatusChip, EventHomeChip, EventSheet, EventGainToast, FrenzyBanner, FrenzySweep, EventRecapCard, useRecapDue, useLiveEvent, useStarRides } from '../components/liveEvents';
import { openableKeys } from '../services/liveEvents/model';
import { createDeclutterStore } from '../components/map/declutter/store';
import type { MapDeclutterInput } from '../components/map/declutter/useMapDeclutter';
import { offsetMeters, validPoint } from '../components/map/fright/geo';
import { limitedLabel } from '../services/collection/limitedCoins';
import FindMarker from './ExploreScreen/FindMarker';
import { SLOTS, useMarkerSlots } from '../components/map/markerSlots';
import { PARKED } from '../components/map/Marker';
import { bottomLeftColumnHeight, bottomRightColumnHeight, buildParkLayout, energyGap, parkMapInsets, rideLayoutId, rideTagFor,
  type FindLayoutInput, type FixedLayoutInput, type HauntLayoutInput } from './ExploreScreen/parkMapLayout';
import { UpperText } from '../ui/upper';
import { usePlayTapHold } from '../components/guide/playTapHold';
import NextCoinCard, { GUIDE_CARD_HEIGHT, GUIDE_CARD_RIGHT } from '../components/guide/NextCoinCard';
import useNextCoinGuide from '../components/guide/useNextCoinGuide';
import { guideWallet, ownedTaskIdsFor } from '../components/guide/guideCoins';
import useClaimableTickets from '../components/guide/useClaimableTickets';
import { guide } from '../services/guide/nextCoin';
import type { GuideAction } from '../services/guide/guideCopy';
import { needTicketLines } from '../services/guide/freeTickets';
import { useGuideFlags } from '../services/guide/guideFlags';
import { currentAppOpen, useRung } from '../services/reveal/revealLadder';
import { useTrail } from '../services/trail/TrailProvider';
import { headlineBox, stepsToGo } from '../services/trail/trailModel';
import useParkDayLadder from '../components/guide/useParkDayLadder';
import { applyLiveStub, liveStubMode } from '../components/guide/liveStub';
import { useFlyAnchor, useProfileTabAnchor } from '../components/guide/flyAnchors';
import useWelcomeBack from '../components/guide/useWelcomeBack';
import { homeShelfPark } from '../components/guide/HomeShelfButton';
import type { HomeGuide } from './ExploreScreen/HomeExplore';

/**
 * Park stores move to a "Shops at this park" row on the park's shelf screen (shelf-words). The map
 * buttons leave only once that row is in the integrated build (core loop 5.1, integration check 1).
 */
const SHOPS_ROW_SHIPPED = false;
/** Dev-only live feed stub for lane walks (state D: feed off; or a daytime park at night). Never in a store or OTA bundle. */
const LIVE_STUB = liveStubMode(__DEV__, process.env.EXPO_PUBLIC_GUIDE_LIVE_STUB);
/** The guide waits at most this long for the live feed and today's Adventure before its first pick. */
const GUIDE_DATA_WAIT_MS = 4000;
/** The camera follows the shark again this long after the player pans away (core loop 5.1, must-fix 28). */
const CAMERA_RETURN_MS = 10_000;
/** The bottom-right column once Energy and Trail leave the map: 32 pt margin, the Shelf button and its label. */
const SHELF_COLUMN_HEIGHT = 32 + 84 + 22;
/** After the map cover lifts, Finn's park tips wait this long (the map, its pins and PLAY RIDE arrive first). */
const MAP_CALM_MS = 5000;
const WINDOW_WIDTH = Dimensions.get('window').width;
/** Energy and Swords sit this far above the avatar, so the Energy pill always clears PLAY RIDE's top. */
const ENERGY_GAP = energyGap(WINDOW_WIDTH);
/**
 * The two loading covers' styles, made once: the covers never re-render while they lift (a re-render
 * resets an animated view to its mount-time opacity for a frame), so their props must not change.
 */
const SKY_COVER_STYLE = { top: 70 + (Constants.statusBarHeight ?? 0), zIndex: 45 } as const;
const LAUNCH_COVER_STYLE = { zIndex: 100 } as const;
/**
 * Finn's "Tap PLAY RIDE!" card: one line and a picture, on the left just above the help button,
 * ending before the Energy pill on the right, with a pointer down at PLAY RIDE. It never covers the
 * player's shark, the chest or the right column. On a short phone (iPhone SE) Finn is smaller.
 */
const SHORT_MAP = Dimensions.get('window').height < 740;
const COIN_TIP_WIDTH = Math.min(300, WINDOW_WIDTH - 124);
/** Below this much room beside the right column, the card's title takes two lines and OK steps aside. */
const COIN_TIP_ROOMY = 236;
/** Below this much room, the card moves up a row, above the right column, instead of squeezing. */
const COIN_TIP_MIN = 180;
/**
 * The card is as wide as its content (so OK sits close) and ends at least 8 pt before the right
 * column (Energy, and the Trail Boxes pill above it when there is one, which is wider), measured
 * live. With little room it gets narrow (two-line title, no OK word); with too little it moves up a
 * row, above the column. The pointer aims at PLAY RIDE (the middle of the screen).
 */
function coinTipLayout(stores: number, column: { readonly width: number; readonly height: number }) {
  const room = WINDOW_WIDTH - 12 - 16 - column.width - 8;
  const above = room < COIN_TIP_MIN;
  const maxWidth = above ? COIN_TIP_WIDTH : Math.min(COIN_TIP_WIDTH, room);
  // On a short phone the card sits 3 pt lower (still 3 pt clear of the help button) so its top clears the player's island.
  const bottom = above ? Math.max(bottomLeftColumnHeight(stores), 32 + column.height) + 8 : bottomLeftColumnHeight(stores) + (SHORT_MAP ? 3 : 6);
  return {
    style: { position: 'absolute', left: 12, maxWidth, bottom, zIndex: 40 } as const,
    narrow: maxWidth < COIN_TIP_ROOMY,
    pointer: Math.round(Math.min(maxWidth - 36, WINDOW_WIDTH * 0.42 - 12)),
  };
}
/** Finn's park welcome: under the adventure card, ending before the right-hand button column (VIP, chest). */
const PARK_WELCOME_TIP_STYLE = { position: 'absolute', left: 12, right: 78, top: 132, zIndex: 40 } as const;

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

/** True two frames after `after` is true (one commit later), for parts of the screen that can wait. */
function useLateMount(after = true): boolean {
  // With no frame clock (a test runner) there is nothing to draw between commits: mount at once.
  const [late, setLate] = useState(typeof requestAnimationFrame !== 'function');
  useEffect(() => {
    if (late || !after) return undefined;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setLate(true)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [after]); // eslint-disable-line react-hooks/exhaustive-deps
  return late;
}
/** A player whose home never confirms (weak GPS indoors) still meets Finn after this long. */
export const ONBOARDING_FALLBACK_MS = 8000;

export function ExploreScreenBody() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const mapFocused = useIsFocused();
  // Idle (no touch, no walking for 2 min): the map's live polls slow down.
  const mapIdle = useUserIdle();
  const route = useRoute();
  const cardFade = useMenuCardFade();
  const focusRide = (route.params as { focusRide?: ParkRideMapFocus } | undefined)?.focusRide;
  // How to Play's hand-off is a one-shot: take it into state and clear the route param
  // at once, so a later focus or remount never replays an old request.
  const highlightParam = (route.params as { highlightNearestFind?: number } | undefined)?.highlightNearestFind ?? null;
  const [highlightNearestFind, setHighlightNearestFind] = useState<number | null>(null);
  useEffect(() => {
    if (highlightParam == null) return;
    setHighlightNearestFind(highlightParam);
    navigation.setParams({ highlightNearestFind: undefined });
  }, [highlightParam, navigation]);
  const [redeemables, setRedeemables] = useState<RedeemablesType | null>();
  // The last park map load failed (weak signal): the park buttons stay, a calm retry note shows.
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
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
    // One owner of the pointer: a Find from the checklist, Wait Times or Daily 3 makes this the guide's coin.
    guide.setTarget(task.id, 'find');
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
  const openParkStory = useCallback(() => setProjectOpenRequestVersion(version => version + 1), []);
  
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
  // Gym and Sword markers are an unfinished feature: hidden (still mounted) until the server turns map_gym_swords on.
  const mapFlags = useMapFlags();
  const [playerTeam, setPlayerTeam] = useState<TeamInfo | null>(null);
  const [playerSwordCount, setPlayerSwordCount] = useState<number>(0);
  
  const { refreshPlayer, player } = useContext(AuthContext);
  const { parkLoaded, parkLookupRecord, location, park, permissionGranted, permissionChecked, latestLocationSampleRef, moveDevLocation } =
    useContext(LocationContext);
  // The anchor is the newest outside-park confirmation (kept through a failed
  // re-check), so walking past the 25 m re-check never blanks the home map.
  const homeAnchorRef = useRef<ParkLookupRecord | null>(null);
  homeAnchorRef.current = nextHomeAnchor(homeAnchorRef.current, parkLookupRecord);
  const homeLocationConfirmed = !park && (isConfirmedOutsidePark(location, parkLookupRecord) ||
    isHomeMapConfirmed(location, homeAnchorRef.current));

  // The map's loading cover is up: tips, tutorials and slams wait for the map to arrive.
  const mapCovered = useMapCovered();
  // A light first mount: the map, its HUD and the launch cover mount first; the overlays that start
  // hidden (Community Center, Too Far, events, Fin-ister Nights, Home Hunt results, Daily 3 sheets)
  // join two frames later in their own commit, so the phone draws the loading bar's creep in between.
  const lateOverlays = useLateMount();
  // The first seconds after the cover lifts belong to the map, its pins and PLAY RIDE: Finn's park
  // tips wait MAP_CALM_MS, so a kid never meets a pile of cards (at most one card in that window).
  // The window starts at the first VISIBLE map frame: this screen is on top (the Splash and Loading
  // routes are gone), the cover has lifted and the map's tiles have drawn (or their wait ran out).
  // Timing it from the cover's JS lift let a busy phone spend the 5 s behind the launch screens.
  const mapOnScreen = useMapOnScreen() && mapFocused;
  const [mapCalm, setMapCalm] = useState(false);
  useEffect(() => {
    if (!mapOnScreen) { setMapCalm(false); return; }
    const timer = setTimeout(() => setMapCalm(true), MAP_CALM_MS);
    return () => clearTimeout(timer);
  }, [mapOnScreen]);
  // At launch the home map can show for a moment before the park check settles and swaps in the
  // park map. Hold the one cover (never past its deadline) until the screen knows which map it is.
  const mapChoicePending = !!player && permissionGranted && !park && !homeLocationConfirmed;
  // A park map also waits (inside the same budget) for its ride pins, so they arrive in the cover's
  // fade instead of popping in a second after it.
  const pinsPending = !!player && !!park && !redeemables && !mapLoadFailed;
  const coverHold = mapChoicePending || pinsPending;
  useEffect(() => { holdMapCover(coverHold); }, [coverHold]);
  useEffect(() => () => holdMapCover(false), []);
  useEffect(() => {
    if (homeLocationConfirmed) return;
    setShowPrepItemModal(false);
    setActivePrepItem(null);
    setActivePrepItemPivotId(null);
  }, [homeLocationConfirmed]);
  const { theme } = useContext(ThemeContext);
  const { currencies } = useContext(CurrencyContext);
  const { startTutorial, hasCompleted, isReady, isActive, findLanded } = useTutorial();
  const { explain, openHelpSheet, activeTip } = useHelp();
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
      void resolveMapQueueContext(parkId, selectedTask.name, taskId).then(ride => {
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
  // One overlay at a time: a find that shows up during a tutorial waits for it.
  const [pendingFind, setPendingFind] = useState<{ item: PrepItemType; pivotId: number } | null>(null);
  const homeFindReady = !!pendingFind;
  // Trigger onboarding tutorial on first visit. Finn only starts once the app
  // knows where the player is (in a park, or confirmed at home), so a park
  // that settles late never swaps his lines. At home he waits a few seconds
  // for the first find to land next to the player, and only says "it landed
  // right next to you" when it really did.
  useEffect(() => {
    if (!(mapOnScreen && player && isReady && permissionGranted && !isActive && !hasCompleted('onboarding') && !frightIntroOwns)) return;
    if (!parkLoaded || (!park && !homeLocationConfirmed)) {
      // Weak GPS indoors: home never confirms. Finn still comes, with the
      // honest "walk around" line (no find is promised), instead of a silent map.
      if (park) return;
      const fallback = setTimeout(() => startTutorial('onboarding', { inPark: false, findReady: false }), ONBOARDING_FALLBACK_MS);
      return () => clearTimeout(fallback);
    }
    // At home Finn says hi within a second, sniffing for the first find while it loads.
    const wait = park ? 1500 : homeFindReady ? 600 : 1000;
    const timer = setTimeout(() => {
      startTutorial('onboarding', { inPark: !!park, findReady: !park && homeFindReady, looking: !park && !homeFindReady });
    }, wait);
    return () => clearTimeout(timer);
  }, [mapOnScreen, player, isReady, parkLoaded, permissionGranted, park?.id, isActive, hasCompleted, startTutorial, frightIntroOwns,
    homeLocationConfirmed, homeFindReady]);
  // A find that lands while Finn already said "walk around" upgrades his line to "Grab it!".
  useEffect(() => { if (homeFindReady && isActive) findLanded?.(); }, [homeFindReady, isActive, findLanded]);

  // A player who learned the home hunt should meet the park loop when they
  // actually arrive. Park-first players already saw these steps in onboarding.
  useEffect(() => {
    // Finn's park lesson waits for the same calm window as his tips: the first seconds of a visible
    // map belong to the map, its pins and PLAY RIDE.
    if (!mapOnScreen || !mapCalm || !player || !isReady || !parkLoaded || !permissionGranted || !park || isActive ||
      !hasCompleted('onboarding') || hasCompleted('park_arrival') || frightIntroOwns) return;
    const timer = setTimeout(() => startTutorial('park_arrival'), 300);
    return () => clearTimeout(timer);
  }, [mapOnScreen, mapCalm, player, isReady, parkLoaded, permissionGranted, park?.id, isActive, hasCompleted, startTutorial, frightIntroOwns]);
  
  const collectedOnce = useRef(false);
  const [caughtThisSession, setCaughtThisSession] = useState(false);
  const [catchesThisVisit, setCatchesThisVisit] = useState(0);
  const [firstLineGap, setFirstLineGap] = useState(false);
  // A brand new player's first visit (no catch ever when the map first loaded): the daily chest waits for real hunting.
  const firstVisit = useRef<boolean | null>(null);
  if (firstVisit.current == null && player && isReady) firstVisit.current = !hasFirstCatch(player, hasCompleted('home_first_find'), false);
  const [huntStartedAt, setHuntStartedAt] = useState<number | null>(null);
  const [chestClock, setChestClock] = useState(0);
  // Minute one: while Finn is talking, waiting to start, or holding the first
  // find, he is the only voice. Event chips, the park story chip and the event
  // recap wait (the daily chest already waits through chestMayPresent).
  const finnOwnsMap = isActive || firstLineGap || !!pendingFind || (isReady && !hasCompleted('onboarding'));
  // A brand new player's first visit, until the first catch after Finn's tutorial find:
  // the map shows only Finn's shark, the treats and the footer (no distances, no 'Saved map').
  const firstHunt = !!firstVisit.current && catchesThisVisit < 2;
  const [homeIntroOpen, setHomeIntroOpen] = useState(false);
  // Finn's home intro is still owed: it goes first, and the daily chest waits for it (core loop 4.3 rule 1).
  const [homeIntroOwed, setHomeIntroOwed] = useState(false);
  // The generic park tip is on screen: the Fin-ister intro waits for it (never two first-run cards at once).
  const [parkTipShowing, setParkTipShowing] = useState(false);
  // The right column's widest pill (Energy, or Trail Boxes above it) and the column's height: Finn's
  // coin card ends before it (or sits above it when the pills leave too little room).
  const [rightColumnWidth, setRightColumnWidth] = useState(92);
  const [rightColumnHeight, setRightColumnHeight] = useState(0);
  const [redeemFlowOpen, setRedeemFlowOpen] = useState(false);
  // Coins won on this map (the park day record counts them for park_day_done).
  const [parkWins, setParkWins] = useState(0);
  // A sheet or dialog is still leaving: PLAY! holds presses until UIKit has taken it down (the PLAY RIDE freeze).
  const playTapHold = usePlayTapHold(redeemFlowOpen);

  // Collect moment: after a ride win, back on the map, the coin flies from its island onto the shelf button.
  const mapProjector = useRef<MapProjector | null>(null);
  const avatarRef = useRef<View>(null);
  // Energy flies to the Shelf button, XP to the Profile tab (core loop 4.2 "Where rewards fly").
  const shelfAnchor = useFlyAnchor('energy', avatarRef);
  useProfileTabAnchor(0);
  // The map's loading cover waits for the player's shark on the HUD (never an empty circle after the lift).
  const avatarArtDrawn = useCoverArt(!!player);
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

  // Handler for when user taps a prep item in home mode: enforce proximity
  // A tap catches; the server's nearby check (`auto`) only feeds Finn's first find.
  const handlePrepItemNearby = useCallback((prepItem: PrepItemType, pivotId: number, source: 'tap' | 'auto' = 'tap') => {
    if (!homeLocationConfirmed || !parkLoaded) return;
    const finnsFirstFind = isReady && !hasCompleted('onboarding');
    // Only Finn's first find ever opens by itself. A treat that comes in range later (even while
    // Finn says "Let's hunt!") just glows and hops: holding it here used to open a second catch
    // the moment he finished, with no tap, which ended the first hunt's quiet 30 s at once.
    if (source === 'auto' && !finnsFirstFind) return;
    // Finn's first find waits for him: it is held while he talks, and before
    // he starts, so his welcome can point at it and Grab it! opens it.
    if (isActive || (source === 'auto' && finnsFirstFind)) {
      setPendingFind({ item: prepItem, pivotId }); return;
    }
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
      // No location available: show too far modal with unknown distance
      setTooFarMeters(null);
      setShowTooFarModal(true);
      return;
    }

    setActivePrepItem(prepItem);
    setActivePrepItemPivotId(pivotId);
    setShowPrepItemModal(true);
  }, [location, homeLocationConfirmed, parkLoaded, isActive, isReady, hasCompleted]);

  // A find already loaded in grab range counts as Finn's first find, without waiting for a GPS update.
  const onFindInRange = useCallback((item: PrepItemType | null) => {
    if (!item?.pivot_id || !isReady || hasCompleted('onboarding')) return;
    handlePrepItemNearby(item, item.pivot_id, 'auto');
  }, [isReady, hasCompleted, handlePrepItemNearby]);

  // When Finn is done talking, the waiting find opens (the first catch of the game).
  useEffect(() => {
    if (isActive || !pendingFind) return;
    if (isReady && !hasCompleted('onboarding')) return; // Finn has not said hi yet
    if (!homeLocationConfirmed) { setPendingFind(null); return; } // left home: that find is not here any more
    // The find stays pending until it opens: clearing it first re-ran this
    // effect, whose cleanup cancelled the timer (the find never opened), and
    // left a gap where the home intro cards jumped in ahead of it.
    const find = pendingFind;
    const timer = setTimeout(() => {
      setPendingFind(null);
      handlePrepItemNearby(find.item, find.pivotId);
    }, 350);
    return () => clearTimeout(timer);
  }, [isActive, pendingFind, handlePrepItemNearby, hasCompleted, isReady, homeLocationConfirmed]);

  // Home Hunt v3: the catch plays on the map itself (HomeCatchMoment), never in a modal.
  const homeCatch = useMemo(() => (showPrepItemModal && homeLocationConfirmed && !isActive && activePrepItem &&
    activePrepItemPivotId ? { item: activePrepItem, pivotId: activePrepItemPivotId } : null),
  [showPrepItemModal, homeLocationConfirmed, isActive, activePrepItem, activePrepItemPivotId]);
  const onHomeCatchCollected = useCallback(() => {
    collectedOnce.current = true;
    setCaughtThisSession(true);
    setCatchesThisVisit(count => count + 1);
    setHomeCollectionVersion((version) => version + 1);
  }, []);
  const onHomeCatchUnavailable = useCallback(() => setHomeCollectionVersion((version) => version + 1), []);
  const onHomeCatchDone = useCallback(() => {
    setShowPrepItemModal(false);
    setActivePrepItem(null);
    setActivePrepItemPivotId(null);
    // After the very first catch, Finn says why it matters (once).
    if (collectedOnce.current && hasCompleted('onboarding') && !hasCompleted('home_first_find')) {
      setFirstLineGap(true);
      setTimeout(() => { startTutorial('home_first_find'); setFirstLineGap(false); }, 500);
    }
  }, [hasCompleted, startTutorial]);

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
  const { raid, setState: setRaidState, link: raidLink, retryLink: retryRaidLink, refresh: refreshRaid } = useParkRaid(park?.id, { focused: mapFocused, idle: mapIdle });
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
    return getParkLive(parkId).then(result => { if (liveParkId.current === parkId) setLivePark(applyLiveStub(result, LIVE_STUB, Date.now())); })
      .catch(() => { if (LIVE_STUB && liveParkId.current === parkId) setLivePark(applyLiveStub(null, LIVE_STUB, Date.now())); });
  }, [park?.id]);
  // Posted waits refresh each minute while the map is on screen; paused under
  // another screen or in the background, caught up on return.
  useLivePoll(loadLivePark, idlePollInterval(60000, mapIdle, 2), { enabled: !!park?.id, focused: mapFocused, key: park?.id ?? null });
  // Shark Events (server flag live_events): one shared poll; everything renders nothing while it is off or the route 404s.
  const liveEvt = useLiveEvent(park?.id ?? null, { poll: !!player, focused: mapFocused, enabled: !!player });
  const [eventOpen, setEventOpen] = useState(false);
  const starRides = useStarRides(park?.id ?? null);
  const [recapDue, recapSeen] = useRecapDue(liveEvt.event);
  const [trailOpenRequest, setTrailOpenRequest] = useState(0);
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
  // Dev-only scripted night (EXPO_PUBLIC_FRIGHT_CAPTURE_NAV=flow): real engine + server, no touch input.
  useFrightCaptureFlow({ night: frightNight, engine: frightEngine, location, moveDevLocation,
    storeId: Number(process.env.EXPO_PUBLIC_FRIGHT_CAPTURE_STORE) || 'shark-shop' });
  // Dev-only capture driver (EXPO_PUBLIC_FRIGHT_CAPTURE_NAV=card|profile|collection): opens that screen
  // 25 s after the map loads so simulator captures can show real flows without touch input.
  useEffect(() => {
    const target = __DEV__ ? process.env.EXPO_PUBLIC_FRIGHT_CAPTURE_NAV : undefined;
    if (!target) return;
    const timer = setTimeout(() => {
      const slug = frightNight.tonight?.event?.slug;
      if (target === 'card' && slug) (navigation as any).navigate('FrightCard', { eventSlug: slug });
      if (target === 'card-files' && slug) (navigation as any).navigate('FrightCard', { eventSlug: slug, section: 'files' });
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
  const frightNightWindow = frightNight.tonight?.night ?? null;
  const frightServerNow = frightNight.now;
  const openHalloweenShop = useCallback((stall: FrightShopStall) => {
    if (stallAction(stall) === 'open') {
      queueHaptic('tapLight');
      playSfx('ui.tap', 0.6);
      RootNavigation.navigate('Store', { store: stall.store_id });
    } else {
      queueHaptic('warning');
      playSfx('ui.select', 0.5);
      // The server clock (R5), not the phone's: "opens at" vs "closed for tonight" must agree with the stall chip.
      const now = frightServerNow();
      gameAlert(awayHeadline(stall.reason, frightNightWindow, now), `${stall.away_line || AWAY_LINE}. ${awayMessage(stall.reason, frightNightWindow, now)}`,
        [{ text: 'Got it' }], { icon: 'lock' });
    }
  }, [frightNightWindow, frightServerNow]);
  const frightMap = useMemo<FrightMapInput | null>(() => !stressOff && frightNight.tonight /* mounted for the whole event-park session: markers never churn (MapLibre insert crash); active/phase fade them */
    && frightNight.eventPark ? {
      tonight: frightNight.tonight, active: frightNight.modeOn, nowOffsetMs: frightNight.offset,
      player: location ?? null, spooky: frightEngine.spooky, doneKeys: frightEngine.doneKeys, quiet: frightEngine.quiet,
      cinematic: frightEngine.tutorial === 'intro' ? 'intro' : null, showLive: nightShow.phase === 'live',
      onHauntPress: frightEngine.openSheetAt, ambience: frightEngine.ambient,
      // Chaos Hour: tapping the encounter sprite tries the catch (the engine checks range, side and quiet).
      onEncounterPress: () => { void frightEngine.catchEncounter(); },
      // The Halloween Shop stall: only players at the event during event hours get in; everyone else gets the teaser.
      onShopPress: openHalloweenShop,
      tierCap: frightNight.tonight.config?.fx_tier_cap ?? undefined,
    } : null, [stressOff, openHalloweenShop, frightEngine.openSheetAt, frightEngine.ambient, frightEngine.catchEncounter, frightNight.tonight, frightNight.modeOn, frightNight.phase, frightNight.eventPark, frightNight.offset, location,
    frightEngine.spooky, frightEngine.doneKeys, frightEngine.quiet, frightEngine.tutorial, nightShow.phase]);
  const busyLiveSlot = !!rushes.length || raidActive || receiptNeedsCheck || !!bossMap.moment;
  // The park is open when the live feed says any ride is running (no feed: raids wait).
  const parkOpenNow = (livePark?.rides ?? []).some(ride => ride.status === 'OPERATING');
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
      if (mapMounted.current && latestMapContext.current === mapContext) { setRedeemables(data); setMapLoadFailed(false); }
    }, error => {
      if (mapMounted.current && latestMapContext.current === mapContext) setMapLoadFailed(true);
      throw error;
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
  useEffect(() => { setMapLoadFailed(false); }, [mapContext]);
  // Under a loading cover, the lift also waits for the park's ride list (never past the cover's cap),
  // so the first lifted frame has the ride islands and PLAY RIDE, not a bare park map that fills in
  // seconds later on a slow server. A failed load lifts at once (the retry note shows instead).
  useCoverArt(!!park && !!player && !redeemables && !mapLoadFailed);
  const mapRetry = useParkMapRetry(mapLoadFailed && !!park && !!player, mapFocused, refreshMapOpportunities);
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
  // The server can count a resting or closed ride as in range; it is not playable until it opens.
  const activeLiveStatus = activeRedeemable?.type === 'task' ? liveByTask.get(activeRedeemable.model.id)?.status ?? null : null;
  const openRedeemable = nearbyOpportunityOpen(activeRedeemable, activeLiveStatus, mapNow) ? activeRedeemable : undefined;
  const playableTaskId = openRedeemable?.type === 'task' ? openRedeemable.model.id : null;
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
  // Pins that land under the loading cover are simply there when it fades (no drop nobody sees);
  // pins that arrive after it lifts drop in nearest first, 40 ms apart, all landed within 0.4 s.
  if (redeemables && visibleTasks.length && revealRef.current?.context !== mapContext) {
    revealRef.current = { context: mapContext, delays: mapCovered ? new globalThis.Map<number, number>()
      : revealDelays([...visibleTasks].sort((a, b) => (taskDistance.get(a.id) ?? 0) - (taskDistance.get(b.id) ?? 0))
        .map(task => task.id), 40, 400) };
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
    // A tapped coin you do not own says "Walk closer: N m" and becomes the guide's target (core loop 4.1).
    if ((task.times_completed ?? 0) === 0) guide.setTarget(task.id, 'callout');
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
  const gymSwordsOn = mapFlags.gymSwords;
  // A different player never keeps the last one's team.
  useEffect(() => { setPlayerTeam(null); setPlayerSwordCount(0); }, [player?.id]);
  useEffect(() => {
    let current = true;
    const checkTeamAndSwords = async () => {
      try {
        const team = await getMyTeam();
        if (!current) return;
        setPlayerTeam(team);
        // Swords are part of the hidden gym feature: no request while map_gym_swords is off.
        if (!gymSwordsOn) return;
        const swordsData = await getMySwords();
        if (current) setPlayerSwordCount(swordsData.swords);
      } catch (error) {
        console.log('Team/swords check error:', error);
      }
    };
    // Re-read on every return to the map: a team picked on the team screen shows its chip at once.
    if (player && mapFocused) {
      void checkTeamAndSwords();
    }
    return () => { current = false; };
  }, [player?.id, gymSwordsOn, mapFocused]);

  // Fetch gym data when park changes and refresh periodically (even without team - to show marker)
  useEffect(() => {
    if (!park?.id) { setGymData(null); setSwords([]); return; }
    return () => { gymGeneration.current++; };
  }, [park?.id, fetchGymData]);
  // Every 30 s while the map is on screen (the gym marker reads this same data), and only while
  // map_gym_swords is on: hidden gyms never poll (battery, core loop must-fix 29).
  useLivePoll(fetchGymData, idlePollInterval(30000, mapIdle), { enabled: !!park?.id && mapFlags.gymSwords, focused: mapFocused, key: gymOwner });

  // Handle gym marker press
  // Gym range in meters; separate from the community center and home pickup radii.
  const GYM_RANGE_METERS = 25;

  const handleGymPress = useCallback(() => {
    setTooFarRequiredMeters(GYM_RANGE_METERS);
    setTooFarIsHomeItem(false);
    if (!playerTeam?.has_team) {
      RootNavigation.navigate('TeamSelection', { 
        onTeamSelected: () => {
          getMyTeam().then(setPlayerTeam).catch(() => undefined);
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

  // The first in-range check after the ride list loads: until it answers, a loading cover waits
  // (within its cap), so PLAY RIDE for the ride you stand at is on the first lifted map frame.
  const [rangeChecked, setRangeChecked] = useState(false);
  useCoverArt(!!park && !!player && !!redeemables && !!location?.latitude && !rangeChecked);
  useEffect(() => {
    if (!mapFocused || !park || !location?.latitude || !location?.longitude || !redeemables) return;
    let current = true;
    void checkForRedeemable().then(redeemable => {
      setRangeChecked(true);
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
  // In line? Only at a real queue ride, 90 s nearly still, never right after that wait ended (core loop 4.1).
  const queueDwell = useQueueDwell(park?.id ?? null, mapFocused && !!player, undefined, undefined, location ?? null);

  // The Next Coin guide (core loop 4.1): one card, one target, one button, in the one top-left slot.
  // It replaces the Adventure Ticket chip, the Next Up rail, the ride goal card, the in-line card and
  // the queue games card; every pointer in the app calls guide.setTarget.
  const guideFlags = useGuideFlags(player?.id ?? null);
  const teamRung = useRung('team');
  const coinLevelsRung = useRung('coin_levels');
  const dailyRung = useRung('daily');
  const trailRung = useRung('trail');
  const eventsRung = useRung('events');
  const claimable = useClaimableTickets(!!player && !!park && mapFocused, player?.tickets ?? 0, player?.id ?? null);
  const wallet = useMemo(() => player ? guideWallet({
    tickets: player.tickets, heldPasses: player.rescue_passes,
    freeTryReady: guideFlags.ride_rescue_pass === true && tripGoalData?.wallet?.rescue_pass_available === true,
    queueTicketsOn: guideFlags.queue_tickets === true, claimable: claimable.sources,
  }) : null, [player, guideFlags, tripGoalData?.wallet?.rescue_pass_available, claimable.sources]);
  const rushTaskIds = useMemo(() => new Set(rushes.map(pick => pick.task.id)), [rushes]);
  // The guide picks its first coin once the islands, the live feed and today's Adventure are in (or
  // GUIDE_DATA_WAIT_MS ran out: a missing feed never stalls it), so a half-loaded map never sets a
  // target that would then hold.
  const [guideWaitOver, setGuideWaitOver] = useState(false);
  const islandsIn = !!redeemables;
  useEffect(() => {
    setGuideWaitOver(false);
    if (!park || !islandsIn) return undefined;
    const timer = setTimeout(() => setGuideWaitOver(true), GUIDE_DATA_WAIT_MS);
    return () => clearTimeout(timer);
  }, [park?.id, islandsIn]); // eslint-disable-line react-hooks/exhaustive-deps
  const guideReady = islandsIn && (guideWaitOver || (!!tripGoalData && !!livePark));
  // Welcome back after 14+ days away: the guide's welcome back state comes first (core loop 4.1).
  const welcome = useWelcomeBack(player?.id ?? null);
  // The shelf's word on which coins the player owns here (the map's list of today's coins has none).
  const ownedTaskIds = useMemo(() => ownedTaskIdsFor(tripGoalData?.rides, park?.id ?? null), [tripGoalData?.rides, park?.id]);
  const nextCoin = useNextCoinGuide({
    enabled: !!player && !!park, ready: guideReady, parkId: park?.id ?? null, parkName: park?.name ?? null, location,
    tasks: visibleTasks, live: livePark, adventure, dwellRideId: queueDwell?.rideId ?? null,
    starTaskIds: starRides, rushTaskIds, ownedTaskIds,
    starRushUnlocked: coinLevelsRung.open, coinLevelsUnlocked: coinLevelsRung.open,
    wallet, queueTicketsOn: guideFlags.queue_tickets === true,
    // PLAY! itself decides "You're here": the server's range check, never the guide's geometry alone.
    playableTaskId: rangeChecked ? playableTaskId : undefined,
    daysAway: welcome.daysAway, welcomeBackDone: welcome.done,
  });
  const guideShown = !!player && !!park;
  const guideTargetId = nextCoin.target?.taskId ?? null;
  // The target's own coin art: the map list has none, so the trip goal's ride list (or PLAY!'s coin) supplies it.
  const guideCoinUrl = useMemo(() => {
    if (guideTargetId == null) return null;
    const fromMap = nextCoin.targetTask?.coin_url;
    if (fromMap) return fromMap;
    const fromTrip = tripGoalData?.rides?.find(ride => ride.task_id === guideTargetId)?.coin_url;
    if (fromTrip) return fromTrip;
    const here = activeRedeemable?.type === 'task' && (activeRedeemable.model as TaskType).id === guideTargetId
      ? (activeRedeemable.model as TaskType).coin_url : null;
    return here || null;
  }, [guideTargetId, nextCoin.targetTask, tripGoalData?.rides, activeRedeemable]);
  // Until the first coin is won, the guide's "Tap PLAY!" picture shows every time PLAY! rises.
  const hasWonACoin = (player?.completed_tasks_count ?? 0) > 0 || (player?.ride_coins_collected ?? 0) > 0 || parkWins > 0;
  // Raids reach the map only after coin levels unlock (they cost Energy) and while the park is open (core loop 5.2).
  const raidOnMap = raidActive && coinLevelsRung.open && parkOpenNow;
  const liveSlotShown = (coinLevelsRung.open && (raidOnMap || !!rushes.length)) || receiptNeedsCheck || !!bossMap.moment;
  // The team bar stays hidden until a team pick, then it is a small team chip (core loop 4.2).
  const hasTeam = !!playerTeam?.has_team;
  // The guide card's words can change under a finger (Walk to In line): swallow taps on it for a moment after a swap.
  const leftSlotKey = guideShown ? `${nextCoin.state}:${nextCoin.target?.taskId ?? 'none'}` : null;
  const leftSlotSwapGuard = useSwapTapGuard(leftSlotKey);
  // The dotted path and the edge arrow always agree with the card (one owner of the pointer).
  const [guidePathRequest, setGuidePathRequest] = useState(0);
  const guideMapTarget = useMemo(() => nextCoin.targetTask && nextCoin.target
    ? { latitude: Number(nextCoin.targetTask.latitude), longitude: Number(nextCoin.targetTask.longitude),
      requestId: nextCoin.target.taskId * 1000 + guidePathRequest } : null,
  [nextCoin.targetTask, nextCoin.target?.taskId, guidePathRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [adventureSheetRequest, setAdventureSheetRequest] = useState(0);
  // The Daily 3 / level chest overlay is up: other map moments wait their turn.
  const [retentionOccluding, setRetentionOccluding] = useState(false);
  // PLAY RIDE (or a closed ride's sign) is on screen: the declutter keeps ride art out from under it.
  const [playRideShown, setPlayRideShown] = useState(false);
  // Finn's "Let's hunt!" line closed on a first visit: free hunting starts now, and the chest may come 30 s later.
  const huntFree = caughtThisSession && !isActive && !firstLineGap && hasCompleted('home_first_find');
  useEffect(() => {
    if (!huntFree || huntStartedAt != null || !firstVisit.current) return;
    setHuntStartedAt(Date.now());
  }, [huntFree, huntStartedAt]);
  useEffect(() => {
    if (huntStartedAt == null) return undefined;
    const timer = setTimeout(() => setChestClock(tick => tick + 1), FIRST_VISIT_CHEST_WAIT_MS + 50);
    return () => clearTimeout(timer);
  }, [huntStartedAt]);
  const firstVisitHold = firstVisitChestWaits({
    // The first hunt is the home map's (home catches count it down). In a park there is no home catch
    // to make, so a park-first new player's chest and Daily 3 never wait on it (they never showed).
    firstVisit: !!firstVisit.current && !park, catchesThisVisit, huntStartedAt, now: chestClock >= 0 ? Date.now() : 0,
  });
  // The attention rules (core loop 4.3): one automatic open per app open; at a park nothing opens by
  // itself in the first 30 s, while walking to the guide target, during play or within 10 s of a win
  // card, and no chest ever opens by itself at a park. Everything else waits on its button.
  const [flowClosedAt, setFlowClosedAt] = useState<number | null>(null);
  const flowWasOpen = useRef(false);
  useEffect(() => {
    if (flowWasOpen.current && !redeemFlowOpen) setFlowClosedAt(Date.now());
    flowWasOpen.current = redeemFlowOpen;
  }, [redeemFlowOpen]);
  const [attentionClock, setAttentionClock] = useState(0);
  useEffect(() => {
    // Re-check when a quiet window ends (30 s after arriving, 10 s after a win card).
    const ends = [nextCoin.arrivedAt != null ? nextCoin.arrivedAt + 30_000 : 0, flowClosedAt != null ? flowClosedAt + 10_000 : 0]
      .map(at => at - Date.now()).filter(ms => ms > 0);
    if (!ends.length) return undefined;
    const timer = setTimeout(() => setAttentionClock(tick => tick + 1), Math.min(...ends) + 50);
    return () => clearTimeout(timer);
  }, [nextCoin.arrivedAt, flowClosedAt]);
  const appOpenId = currentAppOpen();
  const attentionFor = (kind: Parameters<typeof autoOpenAllowed>[0]) => autoOpenAllowed(kind, {
    atPark: !!park, now: attentionClock >= 0 ? Date.now() : 0, arrivedAt: nextCoin.arrivedAt,
    walkingToTarget: !!park && nextCoin.state === 'walk', playing: redeemFlowOpen, winCardClosedAt: flowClosedAt,
    autoOpenUsed: attentionQueue.used(appOpenId, kind),
  });
  // Other lanes ask the same rules through attentionGate (the ride question, the membership look).
  useEffect(() => {
    attentionGate.publish({ atPark: !!park, arrivedAt: nextCoin.arrivedAt, walkingToTarget: !!park && nextCoin.state === 'walk',
      playing: redeemFlowOpen, winCardClosedAt: flowClosedAt }, appOpenId);
  }, [park, nextCoin.arrivedAt, nextCoin.state, redeemFlowOpen, flowClosedAt, appOpenId]);
  const chestReady = !firstVisitHold && !(homeIntroOwed && !park) && attentionFor('daily_chest') && chestMayPresent({
    // In the half second between the first catch and Finn's "Nice catch!" line, the chest waits too (no flash).
    tutorialActive: isActive || firstLineGap, findOpen: showPrepItemModal, findPending: !!pendingFind,
    firstCatchDone: hasFirstCatch(player, hasCompleted('home_first_find'), caughtThisSession),
    boss: bossOpen || bossOccluded || (!!bossMap.moment && bossMap.moment.phase !== 'settled'),
    rideOpen: redeemFlowOpen, adventureOpen: adventureOccluded,
    otherModalOpen: showTooFarModal || showCommunityCenterModal || homeIntroOpen || retentionOccluding,
  });
  // The daily chest presents itself once (at home only); "Back to map" puts it away until the
  // next app open or the next day, and the Rewards button reopens it.
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
  // A chest that opened by itself took this app open's one automatic open.
  useEffect(() => { if (chestShowing && !chestRequested) attentionQueue.take(appOpenId, 'daily_chest'); }, [chestShowing, chestRequested, appOpenId]);
  const dailyGiftId = dailyGift?.id;
  const onChestClosed = useCallback((claimed: boolean) => {
    if (!claimed && dailyGiftId != null) markChestDismissed(dailyGiftId);
    setChestRequested(false);
    setChestDismissals(count => count + 1);
  }, [dailyGiftId]);
  // Daily 3, the Weekly Box and level-up chests (server flags daily_three / level_chests, off by default).
  const openParam = (route.params as { open?: string } | undefined)?.open;
  // The nearest ride coin on this park map, guided like a checklist tap.
  const guideToNearestRide = useCallback(() => {
    const here = location;
    const tasks = (redeemables?.tasks ?? []).filter(t => Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude)));
    if (!here || !tasks.length) return;
    const nearest = tasks.reduce((best, t) => calculateDistance(here.latitude, here.longitude, Number(t.latitude), Number(t.longitude))
      < calculateDistance(here.latitude, here.longitude, Number(best.latitude), Number(best.longitude)) ? t : best);
    guideTo(nearest);
  }, [location, redeemables, guideTo]);
  // A reward sheet the player opened from the Rewards button is not an automatic open.
  const rewardsTapped = useRef(false);
  const retention = useRetention({
    enabled: !!player && permissionGranted && isReady && hasCompleted('onboarding'),
    mapFocused,
    // A level chest waits for the daily chest, any find, ride, boss or tutorial to finish, and never
    // opens by itself at a park (the Rewards button holds it there).
    // A brand new player's first hunt stays open map for 30 s (or a real second catch), like the daily chest.
    screenFree: chestScreenFree && !firstVisitHold && !chestShowing && !dailyGiftOccluded && !redeemFlowOpen
      && !(chestUnclaimed && !!dailyGift && !chestDismissed(dailyGift.id)) && attentionFor('reward'),
    // Real events that can finish a goal (a ride closing is caught by the next map focus, not here).
    refreshKey: `${dailyGift?.redeemed_at ?? ''}|${homeCollectionVersion}|${collectFlight?.key ?? 0}`,
    mapCovered: redeemFlowOpen || bossOccluded || adventureOccluded || dailyGiftOccluded || showPrepItemModal,
    openRequest: openParam === 'daily3' || openParam === 'chest' ? openParam : null,
    onOpenRequestHandled: () => navigation.setParams({ open: undefined }),
    onOpenChest: () => setChestRequested(true),
    onFind: what => {
      if (what === 'snack') { setHighlightNearestFind(Date.now()); return; }
      guideToNearestRide();
    },
  });
  useEffect(() => {
    setRetentionOccluding(retention.occluding);
    if (retention.occluding && !rewardsTapped.current) attentionQueue.take(appOpenId, 'reward');
    if (!retention.occluding) rewardsTapped.current = false;
  }, [retention.occluding]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Rewards button (core loop 4.2): one chest, one number. It folds the chest button, the Daily 3
  // flame button and the Trail pill (a ring on the button once Trail Boxes unlock).
  const trail = useTrail();
  const trailBox = headlineBox(trail.state ? { ready: trail.state.ready, walking: trail.state.walking } : null);
  const dailyOpen = dailyRung.open && (guideFlags.daily_three === true || guideFlags.level_chests === true);
  const trailOpen = trailRung.open && trail.enabled && !!trail.state;
  const rewardsModel = withRewardsSummary(rewardsButtonModel({
    chestUnclaimed: chestUnclaimed && !chestShowing, trailReady: trail.state?.ready.length ?? 0,
    dailyOpen, flame: player?.daily3_streak ?? 0, trailOpen,
    trailProgress: trailBox ? (trailBox.status === 'ready' ? 1 : 1 - stepsToGo(trailBox) / Math.max(1, trailBox.goal_steps)) : null,
  }), (retention as { rewards?: unknown }).rewards);
  const openRewards = useCallback(() => {
    rewardsTapped.current = true;
    // The Rewards sheet (rewards-unlocks) when this build has it; until then the one thing, or a short choice.
    const sheet = (retention as { openRewards?: () => void }).openRewards;
    if (sheet) { sheet(); return; }
    const choices: GameDialogButton[] = [];
    if (chestUnclaimed) choices.push({ text: 'Daily chest', icon: 'chest', onPress: () => setChestRequested(true) });
    if (dailyOpen) choices.push({ text: 'Daily 3', icon: 'streak', onPress: () => navigation.setParams({ open: 'daily3' }) });
    if (trailOpen) choices.push({ text: 'Trail Boxes', icon: 'gift', onPress: () => setTrailOpenRequest(n => n + 1) });
    if (!choices.length) {
      gameAlert('Rewards', 'Nothing to claim right now. A new daily chest comes tomorrow.', [{ text: 'OK' }], { icon: 'chest' });
      return;
    }
    if (choices.length === 1) { choices[0].onPress?.(); return; }
    gameAlert('Your rewards', undefined, [...choices, { text: 'Not now', style: 'cancel' }], { equalChoices: true });
  }, [retention, chestUnclaimed, dailyOpen, trailOpen, navigation]);
  // The unlock ladder's feed and the park day events (core loop 4.4, "Who records what").
  const trailBoxCount = trail.state ? trail.state.walking.length + trail.state.waiting.length + trail.state.ready.length
    + (trail.state.lifetime?.boxes_opened ?? 0) : 0;
  useParkDayLadder({
    playerId: player?.id ?? null,
    mode: park ? 'park' : homeLocationConfirmed ? 'home' : 'unknown',
    parkId: park?.id ?? null,
    location: location ? { latitude: location.latitude, longitude: location.longitude } : null,
    winCount: parkWins,
    progress: player ? {
      coinsWon: player.ride_coins_collected ?? player.completed_tasks_count ?? 0,
      levelUpReady: false,
      level: player.player_level ?? player.experience_level?.level ?? 0,
      hasTeam,
      keysHeld: player.keys ?? 0,
      trailBoxes: trailBoxCount,
      ownsPin: false,
      revealAll: guideFlags.reveal_all === true,
      inLineNow: !!park && nextCoin.state === 'in_line',
    } : null,
    flags: guideFlags,
  });
  // The event recap comes through the attention queue (after its rung; never in the park's quiet moments).
  const recapShown = !!liveEvt.event && recapDue && mapFocused && !eventOpen && !finnOwnsMap && eventsRung.open && attentionFor('event_recap');
  useEffect(() => { if (recapShown) attentionQueue.take(appOpenId, 'event_recap'); }, [recapShown, appOpenId]);
  // A brand new player's first 30 s of hunting: no Rewards button yet, just the treats (the chest comes after).
  const mapControlsCount = firstVisitHold || !player ? 0 : 1;
  const mapControls = mapControlsCount > 0 ? <RewardsButton model={rewardsModel} onPress={openRewards} /> : null;
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
      // The guide card's "Tap PLAY!" picture replaces Finn's one-time coin card (one card at a time, core loop 4.1).
      rideCoinInRange: false });
  const parkTipReady = !mapCovered && mapCalm && mapTipReady({
    mapFocused, finnActive: isActive, rideOpen: redeemFlowOpen, findOpen: showPrepItemModal || !!pendingFind,
    dialogOpen: showTooFarModal || showCommunityCenterModal || homeIntroOpen || !!frightEngine.tutorial,
    bossOrChest: bossOpen || bossOccluded || dailyGiftOccluded || (!!bossMap.moment && bossMap.moment.phase !== 'settled'),
    adventureOpen: adventureOccluded, coinFlying: !!pendingCollect || !!collectFlight,
  });
  useEffect(() => { setParkTipShowing(!!player && !!parkTip && parkTipReady); }, [player, parkTip, parkTipReady]);
  // Park help page 1 ("Win ride coins") opens by itself once, on the first park arrival on this build,
  // only for an account that never had Finn's park lesson here (core loop 4.3 and 5.11). New players see
  // the same picture inside Finn's hand-off, so the guide card is the next thing on their screen.
  const parkLessonRan = useRef(false);
  useEffect(() => { if (isActive && park) parkLessonRan.current = true; }, [isActive, park]);
  const [helpPageSeen, setHelpPageSeen] = useState<boolean | null>(null);
  const helpPageKey = player ? `tps.help.parkPage1.v1@p${player.id}` : null;
  useEffect(() => {
    setHelpPageSeen(null);
    if (!helpPageKey) return undefined;
    let live = true;
    AsyncStorage.getItem(helpPageKey).then(value => { if (live) setHelpPageSeen(value === '1'); })
      .catch(() => { if (live) setHelpPageSeen(true); });
    return () => { live = false; };
  }, [helpPageKey]);
  const helpPageDue = !!park && helpPageSeen === false && isReady && hasCompleted('onboarding') && hasCompleted('park_arrival')
    && !parkLessonRan.current && !isActive && parkTipReady && !parkTipShowing && attentionFor('help_page');
  useEffect(() => {
    if (!helpPageDue || !helpPageKey) return undefined;
    const timer = setTimeout(() => {
      if (!attentionQueue.take(appOpenId, 'help_page')) return;
      setHelpPageSeen(true);
      void AsyncStorage.setItem(helpPageKey, '1').catch(() => undefined);
      openHelpSheet('park_map');
    }, 600);
    return () => clearTimeout(timer);
  }, [helpPageDue, helpPageKey, appOpenId, openHelpSheet]);
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
    // The guide's target island keeps a pick's priority: it never folds away or hides while it is the target (core loop 4.1).
    return { id: task.id, latitude: Number(task.latitude), longitude: Number(task.longitude), selected,
      adventure: adventureTaskId === task.id, playable: playableTaskId === task.id,
      goal: goalTaskId === task.id || guideTargetId === task.id, rush, near, closed, tag };
  }), [rideTasks, liveByTask, mapNow, restingTasks, selectedTask?.id, taskDistance, adventureTaskId, playableTaskId, goalTaskId, guideTargetId]);
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
      ...(raid && raidOnMap && raid.latitude != null && raid.longitude != null
        ? [{ id: 'boss', latitude: raid.latitude, longitude: raid.longitude, kind: 'boss' as const }] : []),
      // The Fin-ister encounter critter and its ring: fixed art nothing may cover.
      ...(frightMap && encounterLiveNow && frightEncounter
        ? [{ id: 'encounter', latitude: frightEncounter.latitude, longitude: frightEncounter.longitude, kind: 'encounter' as const, radius: frightEncounter.radius }] : []),
    ];
    return buildParkLayout({ rides, finds, haunts: frightMap ? haunts : [], reefs: frightMap ? reefs : [], fixed, nightMode });
  }, [park, rideFactsKey, findsKey, frightSpots, frightMap, gymData, communityCenter, swords, raid, raidOnMap, nightMode, // eslint-disable-line react-hooks/exhaustive-deps
    encounterLiveNow, frightEncounter]);
  // Fixed marker slot pools (see markerSlots): allocated once, a slot keeps its find while it lives.
  const liveCoins = useMemo(() => (redeemables?.coins ?? []).filter(coin => opportunityIsActive(coin, mapNow)), [redeemables, mapNow]);
  const liveKeys = useMemo(() => (redeemables?.keys ?? []).filter(key => opportunityIsActive(key, mapNow)), [redeemables, mapNow]);
  const liveRedeemables = useMemo(() => (redeemables?.redeemables ?? []).filter(item => opportunityIsActive(item, mapNow)), [redeemables, mapNow]);
  const shownItems = useMemo(() => (redeemables?.items ?? []).filter(item => !item.is_hidden), [redeemables]);
  const shownPins = useMemo(() => (redeemables?.pins ?? []).filter(item => !item.is_hidden), [redeemables]);
  const rideSlots = useMarkerSlots(orderedRides, task => String(task.id), SLOTS.rides, 'rides');
  const coinSlots = useMarkerSlots(liveCoins, coin => String(coin.id), SLOTS.coins, 'coins');
  const keySlots = useMarkerSlots(liveKeys, key => String(key.id), SLOTS.keys, 'keys');
  const redeemableSlots = useMarkerSlots(liveRedeemables, item => String(item.id), SLOTS.redeemables, 'redeemables');
  const itemSlots = useMarkerSlots(shownItems, item => String(item.id), SLOTS.items, 'items');
  const pinSlots = useMarkerSlots(shownPins, item => String(item.id), SLOTS.pins, 'pins');
  const vaultSlots = useMarkerSlots(redeemables?.vaults ?? [], vault => String(vault.id), SLOTS.vaults, 'vaults');
  const swordSlots = useMarkerSlots(swords, sword => String(sword.id), SLOTS.swords, 'swords');
  const refreshFinds = useCallback(() => { void refreshMapOpportunities().catch(() => undefined); }, [refreshMapOpportunities]);
  const checklistRide = focusedFromChecklist && selectedTask?.id === focusedFromChecklist.id &&
    !visibleTasks.some(task => task.id === focusedFromChecklist.id) ? focusedFromChecklist : null;
  const parkStores = SHOPS_ROW_SHIPPED ? 0 : park?.stores.length ?? 0;
  const declutterInsets = useMemo(() => [...parkMapInsets({
    hudBottom: slotTop,
    // The guide card is wider than the old 43% chip: its own inset below.
    left: null, right: null,
    bottomLeft: bottomLeftColumnHeight(parkStores),
    // The right column is the labeled Shelf button only (Energy and Trail left the map; swords only with the gym on).
    bottomRight: mapFlags.gymSwords ? bottomRightColumnHeight(true, ENERGY_GAP) : SHELF_COLUMN_HEIGHT,
    // While PLAY RIDE is up, a ride island mostly under the pill and its chip fades out (never half hidden).
    playRide: playRideShown ? WINDOW_WIDTH : null,
  }), ...(guideShown ? [{ left: 0, top: slotTop, width: WINDOW_WIDTH - GUIDE_CARD_RIGHT + 6, height: GUIDE_CARD_HEIGHT + 6 }] : [])],
  [slotTop, guideShown, parkStores, mapFlags.gymSwords, playRideShown]);
  const declutter = useMemo<MapDeclutterInput | null>(() => park ? { store: declutterStore, items: declutterItems, insets: declutterInsets } : null,
    [park, declutterStore, declutterItems, declutterInsets]);

  // The guide card's one button (core loop 4.1).
  const openLinePlayFor = useCallback(async (task: TaskType | null) => {
    if (!park) return;
    if (adventure && task && adventure.ride.task_id === task.id) {
      const ride = await resolveQueueStoryContext(adventure.park_id, adventure.ride.ride_id, adventure.ride.ride_name, adventure.ride.task_id);
      if (adventureScope.current === adventureOwner) navigation.navigate('LinePlay', { ride });
      return;
    }
    if (queueDwell && (!task || nextCoin.inLineTaskId === task.id)) {
      const ride = await resolveQueueStoryContext(park.id, queueDwell.rideId, queueDwell.rideName);
      noteWaitEnded(queueDwell.rideId);
      navigation.navigate('LinePlay', { ride });
      return;
    }
    const ride = task ? await resolveMapQueueContext(park.id, task.name, task.id) : null;
    const catalogRide = task ? nextCoin.rides.get(task.id) : undefined;
    if (catalogRide) noteWaitEnded(catalogRide.id);
    navigation.navigate('LinePlay', ride ? { ride } : undefined);
  }, [park, adventure, adventureOwner, queueDwell, nextCoin.inLineTaskId, nextCoin.rides, navigation]);
  const onGuideAction = useCallback((action: GuideAction) => {
    welcome.finish();
    const task = nextCoin.targetTask;
    switch (action) {
      case 'go':
        setGuidePathRequest(n => n + 1);
        if (task) setSelectedTask(task);
        return;
      case 'lineplay': void openLinePlayFor(task).catch(() => gameAlert('LinePlay', 'Could not open this line. Try again in a moment.')); return;
      case 'claim': void claimable.claim().then(() => refreshPlayer()).catch(() => undefined); return;
      case 'play': return; // PLAY! itself sits under the card (the card points at it)
      case 'see_ways':
        gameAlert('Ways to get Tickets', needTicketLines(guideFlags.queue_tickets === true).join(' '), [{ text: 'OK' }], { icon: 'ticket' });
        return;
      case 'level_up':
        if (task?.asset_id) RootNavigation.navigate('CoinShelf', { focusCoin: { assetId: Number(task.asset_id) } });
        else if (park && player) RootNavigation.navigate('Park', { park: park.id, player: player.id });
        return;
      case 'skip': guide.skipLineStory(); return;
      case 'shelf':
      case 'plan':
      default:
        if (park && player) RootNavigation.navigate('Park', { park: park.id, player: player.id });
    }
  }, [nextCoin.targetTask, openLinePlayFor, claimable, refreshPlayer, guideFlags.queue_tickets, park, player, welcome]);
  // The home guide card (core loop 4.1 "Home"): next park day, Tickets ready, the ticket meter, PLAN = your shelf.
  const homePlan = tripGoal && !tripGoal.coin_owned ? tripGoal : null;
  const homeGuide = useMemo<HomeGuide | null>(() => player && !park ? {
    parkName: tripGoal?.park_name ?? null, planName: homePlan?.ride_name ?? null, planCoinUrl: homePlan?.coin_url || null,
    tickets: player.tickets ?? 0, welcomeBack: welcome.daysAway != null && welcome.daysAway >= 14 && !welcome.done,
    onAction: () => {
      welcome.finish();
      RootNavigation.navigate('Park', { park: tripGoal?.park_id ?? homeShelfPark(player.current_park_id), player: player.id });
    },
  } : null, [player, park, tripGoal, homePlan, welcome]);
  const onGuideCardPress = useCallback(() => {
    // On today's Adventure ride the card is the ticket's frame: it opens the ticket's sheet (stamps, souvenir).
    if (nextCoin.copy.dots) { setAdventureSheetRequest(n => n + 1); return; }
    const task = nextCoin.targetTask;
    if (!task) return;
    setGuidePathRequest(n => n + 1);
    setSelectedTask(task);
  }, [nextCoin.copy.dots, nextCoin.targetTask]);

  // The HUD row is whole from the first map frame (the team bar says its plain no-leader line until
  // today's standings answer); a later lead change cross-fades inside MapStatusStack.
  // The one HUD row: the most urgent status leads, the rest wait behind "+N".
  // The HUD row shows only what is live now, after its unlock (core loop 4.2): a raid or Rush after coin
  // levels and while the park is open, events after their rung, the team chip only after a team pick.
  const statusEntries: StatusEntry[] = player && park ? statusOrder({
    live: liveSlotShown, show: nightPill ? (nightShow.phase === 'live' ? 'live' : 'teaser') : null,
    nightMode: frightNight.modeOn, control: hasTeam,
    event: liveEvt.event && eventsRung.open ? (openableKeys(liveEvt.event).length ? 'ready' : 'on') : null,
  }).map(key => {
    if (key === 'event' && liveEvt.event) return { key, label: liveEvt.event.title, tone: TONES.park, node: <EventStatusChip inline event={liveEvt.event} onPress={() => setEventOpen(true)} /> };
    if (key === 'live') return { key, label: 'Live in the park', tone: rushes.length && !raidActive && !bossMap.moment ? TONES.rush : TONES.park, node: <LiveEventsPill inline raid={raidOnMap ? raid : null} rushes={coinLevelsRung.open ? rushes : []} onBoss={() => setBossOpen(true)}
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
    return { key, label: 'Ride Control', tone: TONES.park, node: <RideControlBar inline compact control={rideControl} tasks={visibleTasks}
      hideAllOpen={hideEveryRideOpen({ modeOn: frightNight.modeOn, eventPark: frightNight.eventPark, hasNight: !!frightNight.tonight?.night })}
      onFocusTask={(task) => setSelectedTask(task)} /> };
  }) : [];

  return (
    <Wrapper>
      <Topbar>
        {/* Topbar currencies: only for signed-in users */}
        {player ? (
          <>
            {/* Park mode: Shark Coins, Keys, Tickets as matching pills. Retired
                event currencies (and the unused legacy park coin) stay hidden. */}
            {park && theme?.currency && currencyBalance(player, theme.currency.name) > 0 && (
              <TopbarColumn>
                <Currency coverArt image={theme.currency.icon_url} count={currencyBalance(player, theme.currency.name)}
                  name={theme.currency.name} flyTarget="theme_currency" />
              </TopbarColumn>
            )}
            {park && currencies
              .filter((currency) => currency.icon_url &&
                // Shark Coins always; Keys and event tokens only while held (core loop 4.2).
                (currency.name === 'Coins' || currencyBalance(player, currency.name) > 0))
              .map((currency) => (
                <TopbarColumn key={currency.id}>
                  <Currency coverArt image={currency.icon_url} count={currencyBalance(player, currency.name)}
                    name={currency.name === 'Coins' ? 'Coins' : currency.name}
                    flyTarget={currency.name === 'Coins' ? 'coins' : currency.name === 'Keys' ? 'keys' : undefined} />
                </TopbarColumn>
              ))}
            {park && (
              <TopbarColumn>
                <Currency coverArt image={TICKET_ICON} count={player.tickets ?? 0} name="Tickets" flyTarget="tickets" />
              </TopbarColumn>
            )}
            {/* Away from a park: Coins | HOME HUNT | Tickets. It names the mode the map is in. */}
            {!park && (
              <>
                <TopbarColumn>
                  {currencies[0] && (
                    <Currency coverArt image={currencies[0].icon_url} count={currencyBalance(player, currencies[0].name)}
                      name="Coins" flyTarget="coins" />
                  )}
                </TopbarColumn>
                <TopbarColumn>
                  <Pressable accessibilityRole="button" accessibilityLabel="Home Hunt" accessibilityHint="Explains Home Hunt"
                    hitSlop={8} onPress={() => explain('travel_mode')}>
                    <UpperText style={{
                      fontSize: 16,
                      color: 'white',
                      fontFamily: 'Shark',
                      textTransform: 'uppercase',
                      letterSpacing: 2,
                      textShadowColor: '#05346e',
                      textShadowOffset: { width: 2, height: 2 },
                      textShadowRadius: 0,
                      textAlign: 'center',
                    }}>Home Hunt</UpperText>
                  </Pressable>
                </TopbarColumn>
                <TopbarColumn>
                  <Currency coverArt image={TICKET_ICON} count={player.tickets ?? 0} name="Tickets" flyTarget="tickets" />
                </TopbarColumn>
              </>
            )}
          </>
        ) : (
          <TopbarColumn>
            <UpperText style={{
              fontSize: 16,
              color: 'white',
              fontFamily: 'Shark',
              textTransform: 'uppercase',
              letterSpacing: 2,
              textShadowColor: '#05346e',
              textShadowOffset: { width: 2, height: 2 },
              textShadowRadius: 0,
              textAlign: 'center',
            }}>Guest Mode</UpperText>
          </TopbarColumn>
        )}
      </Topbar>
      {/* The floating park card leaves (opacity 0, no touches) while the quick menu is open */}
      {player && <Animated.View style={[StyleSheet.absoluteFill, cardFade.style]} pointerEvents={cardFade.pointerEvents}>
        <ParkProjectWidget key={`park-project-${player.id}`} parkId={park?.id ?? null} refreshVersion={homeCollectionVersion}
        onActiveProjectChange={setActiveParkProject} openRequestVersion={projectOpenRequestVersion}
        // At home the story rides in the map's top HUD row as a small chip (HomeExplore), never a card.
        // Park Story stays hidden until it has players (core loop 5.12); the guide owns the map's top.
        pillHidden
        pillCollapsed={false}
        topOffset={park ? suggestionSlotScreenTop(Constants.statusBarHeight ?? 0) : undefined} />
      </Animated.View>}
      {player && park && <BossRaidFlow parkId={park.id} raid={raid} open={bossOpen} onClose={() => setBossOpen(false)}
        presentationAvailable={!isActive && !dailyGiftOccluded && !showTooFarModal && !showCommunityCenterModal && !showPrepItemModal && !activeRedeemable}
        onMapOcclusionChange={setBossOccluded} onCelebrationDismiss={result => { void bossMap.enqueue(result); }}
        link={raidLink} onRetryLink={retryRaidLink} onLiveRefresh={refreshRaid}
        onState={state => { setRaidState(state); void refreshRideControl(); }} />}
      {player && permissionChecked && !permissionGranted && <PermissionsNotGranted />}
      {/* One overlay at a time: the daily chest comes last, after the first catch and never alongside a find. */}
      {chestShowing && dailyGift &&
        <DailyGiftModal dailyGift={dailyGift} onMapOcclusionChange={setDailyGiftOccluded} onClosed={onChestClosed}
          simple={!!firstVisit.current} />}
      {lateOverlays && retention.overlay}
      {lateOverlays && player && liveEvt.event && <EventSheet event={liveEvt.event} visible={eventOpen} onClose={() => setEventOpen(false)} atPark={!!park}
        onShowRide={id => { const t = visibleTasks.find(task => task.id === id); if (t) { setEventOpen(false); setSelectedTask(t); } }} />}
      {lateOverlays && player && liveEvt.event && <EventRecapCard event={liveEvt.event} visible={recapShown} onClose={recapSeen}
        onOpenChests={() => { recapSeen(); setEventOpen(true); }} />}
      {/* Monday Home Hunt results come through the presentation queue, after the daily chest (2 full-screen moments per app open). */}
      {lateOverlays && <HomeHuntResultsHost enabled={!!player && !park && mapFocused && permissionGranted && hasCompleted('onboarding') && chestReady
        && !dailyGiftOccluded && !chestShowing && !(chestUnclaimed && !chestDismissed(dailyGift!.id))} />}
      {/* Home Mode: the map always renders without a park, even before the
          first park check settles (it shows the park-check card until then).
          Gating it on parkLoaded left a blank grey screen whenever park state
          was cleared without a finished lookup. */}
      {player && !park && permissionGranted && (
        <HomeExplore key={`home-explore-${player.id}`} onPrepItemNearby={handlePrepItemNearby} onFindInRange={onFindInRange}
          catching={homeCatch} onCatchCollected={onHomeCatchCollected} onCatchDone={onHomeCatchDone}
          onCatchUnavailable={onHomeCatchUnavailable}
          refreshVersion={homeCollectionVersion} homeLocationConfirmed={homeLocationConfirmed}
          introAllowed={mapOnScreen && homeIntroAllowed} introEligible={mapFocused && homeIntroEligible}
          onIntroOpenChange={setHomeIntroOpen} onIntroOwedChange={setHomeIntroOwed} chestButton={mapControls} chestButtonCount={mapControlsCount} compassHintReady={parkTipReady} highlightNearestFind={highlightNearestFind}
          parkStory={activeParkProject && !finnOwnsMap ? { title: activeParkProject.title, points: activeParkProject.total_points,
            goal: activeParkProject.goal_points, onPress: openParkStory } : null}
          eventChip={liveEvt.event?.include_home && !finnOwnsMap ? <EventHomeChip event={liveEvt.event} onPress={() => setEventOpen(true)} /> : null}
          quiet={finnOwnsMap} firstHunt={firstHunt} homeGuide={homeGuide} />
      )}
      {/* Trail Boxes (core loop 4.2): no pill on the map; the Rewards button's ring shows the walk and opens
          the boxes. The host stays mounted (no pill drawn) so its sheet and reveal open from that button. */}
      {player && permissionGranted && trailOpen && (
        <View pointerEvents="none" style={styles.trailHostHidden} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <TrailHost active={false} inPark={!!park} openRequest={trailOpenRequest} />
        </View>
      )}
      {/* Guest: play first (Finn's treat, a quick game, a coin on the shelf), then sign in to save the shark. */}
      {!player && <GuestTaste />}
      
      {/* The park buttons never wait on the map data: a failed load keeps them and shows a retry note. */}
      {/* While Finn's park tip is up, the retry note waits (one card at a time in the top half). */}
      {park && !redeemables && mapLoadFailed && !(parkTip && activeTip === parkTip) && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: 250, zIndex: 11 }}>
          <ParkMapRetryCard retrying={mapRetry.retrying || mapRetry.calm} onRetry={mapRetry.retryNow} />
        </View>
      )}
      {park && (
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
            <HelpButton sheet="park_map" size={44} style={{ marginBottom: 10, marginLeft: 13 }}
              label={frightNight.modeOn ? `How to play: ${frightNight.title} or the park` : 'How to play at the park'}
              onPress={frightNight.modeOn ? () => gameAlert('How to play', undefined, frightHelpChoices({
                title: frightNight.title, onFright: frightEngine.replayTutorial, onPark: () => openHelpSheet('park_map'),
              })) : undefined} />
            {/* Queue Times - moved from right side */}
            <View style={{ marginBottom: 8 }}>
              <Button accessibilityLabel="Wait Times"
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
            {!SHOPS_ROW_SHIPPED && park.stores.length > 0 && (
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
          {/* box-none: this holder reaches 50 pt down over the tab bar, and its zIndex lifts it above
              the bar once the plain parent views are flattened away. Without it the middle of the
              bar (STANDINGS, the map compass, SOCIAL) ignored every tap while PLAY RIDE! showed.
              Only the PLAY RIDE! button inside takes taps. */}
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              bottom: -50,
              zIndex: 10,
              left: '25%',
              width: '50%',
            }}
          >
            {/* A ride already in range when the map opens: PLAY RIDE and its chip get ready under
                the loading cover, standing still at rest (no slide, which on iOS could draw above the
                cover), and the cover's own fade reveals them with the map. One found after the lift
                slides up as before. They wait while Finn's card is up (his first adventure dims the
                map): one thing at a time. */}
            <RedeemModal
              redeemable={mapFocused && !isActive ? activeRedeemable : undefined}
              covered={mapCovered}
              park={park}
              selectedTaskId={selectedTask?.id ?? null}
              liveStatus={activeLiveStatus}
              onOpenChange={setRedeemFlowOpen}
              onShownChange={setPlayRideShown}
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
                if (!isSecretTask) setParkWins(count => count + 1);
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
            {/* Over PLAY! (never the footer) only while a sheet is still leaving: a press there can never
                present the challenge card into a half-dismissed sheet (core loop 4.3 rule 10). */}
            {playTapHold && <View testID="play-ride-tap-hold" onStartShouldSetResponder={() => true}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 50 }} />}
          </View>
          <View
            style={{
              position: 'absolute',
              right: 16,
              bottom: 32,
              zIndex: 10,
              alignItems: 'center',
            }}
            onLayout={event => setRightColumnHeight(Math.round(event.nativeEvent.layout.height))}
          >
            {/* Energy and the Trail pill left the resting map (core loop 4.2): Energy shows on the coin card and
                the shelf, Trail Boxes are a ring on the Rewards button. Swords only while the gym is on. */}
            {mapFlags.gymSwords && <View style={{ marginBottom: ENERGY_GAP, gap: 6, alignItems: 'flex-end' }}
              onLayout={event => setRightColumnWidth(Math.round(event.nativeEvent.layout.width))}>
              <MapResourcePill icon="swords" label="Swords" count={playerSwordCount} muted={playerSwordCount === 0}
                onPress={() => explain('swords', { count: playerSwordCount })} />
            </View>}
            {/* Your shark, labeled "Shelf": it opens this park's coin shelf (Profile -> park -> shelf). */}
            {player && (
              <Animated.View ref={avatarRef} collapsable={false} style={avatarPopStyle} onLayout={shelfAnchor.onLayout}>
                <Button accessibilityLabel="Shelf: your coins at this park"
                  onPress={() => {
                    RootNavigation.navigate('Park', { park: park.id, player: player.id });
                  }}
                >
                  <Avatar player={player} size="lg" onArtDrawn={avatarArtDrawn} />
                </Button>
                <View pointerEvents="none" style={styles.shelfLabel}><Text style={styles.shelfLabelText}>Shelf</Text></View>
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
        {player && parkTip && (() => {
          const coin = parkTip === 'coin_in_range'
            ? coinTipLayout(park.stores.length, { width: rightColumnWidth, height: rightColumnHeight }) : null;
          return <OneTimeTip key={parkTip} id={parkTip} ready={parkTipReady}
            small={!!coin && (SHORT_MAP || coin.narrow)} fit={!!coin} narrow={coin?.narrow}
            art={coin ? <CoinTipPicture /> : undefined} artImages={coin ? COIN_TIP_PICTURE_IMAGES : 0}
            pointerLeft={coin?.pointer}
            style={coin?.style ?? PARK_WELCOME_TIP_STYLE} />;
        })()}
        {/* One HUD row floats over the map (the map runs right up to the header). */}
        {statusEntries.length > 0 && <MapStatusStack entries={statusEntries} />}
        {/* Shark Events (after their rung): the sweep and the gain toast sit under the guide card, never over it or PLAY!. */}
        {player && liveEvt.event && eventsRung.open && <>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', zIndex: 37 }]}><FrenzySweep event={liveEvt.event} /></View>
          <View pointerEvents="none" style={{ position: 'absolute', top: slotTop + GUIDE_CARD_HEIGHT + 10, left: 0, right: 0, alignItems: 'center', zIndex: 39 }}>
            <EventGainToast gained={liveEvt.gained} gainedAt={liveEvt.gainedAt} artKey={liveEvt.event.art_key ?? null} />
            <FrenzyBanner event={liveEvt.event} />
          </View>
        </>}
        {leftSlotSwapGuard && <View testID="left-slot-swap-guard" onStartShouldSetResponder={() => true}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', top: slotTop, left: 0, right: GUIDE_CARD_RIGHT, height: GUIDE_CARD_HEIGHT + 8, zIndex: 40 }} />}
        {/* The Next Coin guide (core loop 4.1): exactly one card in the top-left slot, on every park map. */}
        {guideShown && player && <NextCoinCard copy={nextCoin.copy} state={nextCoin.state} parkName={park.name ?? null}
          coinUrl={guideCoinUrl} top={slotTop} onAction={onGuideAction} onCardPress={onGuideCardPress}
          teachPlay={!hasWonACoin} />}
        {/* Today's Adventure: its sheet stays for the stamps and the souvenir, opened from the guide card on its ride. */}
        {adventure && tripGoalData && player && <AdventureTicketCard key={`adventure-${player.id}-${park.id}-${adventure.id}`} sheetOnly
          openRequest={adventureSheetRequest}
          ticket={adventure} data={tripGoalData} stale={tripGoalStale} gate={adventureGate} detours={adventureDetours}
          closed={adventureRideClosed(adventure, livePark, park.id, mapNow)} top={slotTop}
          onOcclusionChange={setAdventureOccluded} onRefresh={refreshTripGoal}
          onSelect={selectAdventureRide} onDismiss={dismissAdventure}
          onCelebrate={() => celebrateTicket(adventure.id)}
          onDiscover={focusAdventureRide} onFindLine={focusAdventureRide}
          onPlay={async () => {
            // The ticket names its catalog ride id, so a coin label like "Tiki Room" still finds
            // "Walt Disney's Enchanted Tiki Room"; any ride without its own chapter gets the template story.
            const ride = await resolveQueueStoryContext(adventure.park_id, adventure.ride.ride_id,
              adventure.ride.ride_name, adventure.ride.task_id);
            if (adventureScope.current !== adventureOwner) return;
            navigation.navigate('LinePlay', { ride });
          }}
          onShelf={() => {
            // Hand off to the Park screen's measured shelf arrival (Profile -> park -> shelf).
            const earnedCoin = adventureShelfArrival(adventure);
            RootNavigation.navigate('Park', { park: adventure.park_id, player: player.id, ...(earnedCoin ? { earnedCoin } : {}) });
          }} />}
        <Map onPress={() => { setSelectedTask(null); setFocusedFromChecklist(null); setMapFocusRequest(null); }}
          coverHost="screen"
          hintReady={parkTipReady && !parkTipShowing}
          sharkCheer={openRedeemable?.type === 'task' || openRedeemable?.type === 'secret_task'}
          projector={mapProjector}
          onZoomChange={onMapZoom}
          ambientPaused={redeemFlowOpen || bossOccluded || adventureOccluded || dailyGiftOccluded || retentionOccluding}
          fright={frightMap}
          declutter={declutter}
          crowdHaze={parkHaze}
          guideTarget={guideMapTarget} guideSticky returnAfterMs={CAMERA_RETURN_MS}
          controlsTop={slotTop + 2} extraControls={mapControls} extraControlsCount={mapControlsCount} railFloor={rightColumnHeight > 0 ? 32 + rightColumnHeight : bottomRightColumnHeight(mapFlags.gymSwords, ENERGY_GAP)} focusCoordinate={bossMap.moment && bossMap.moment.phase !== 'settled'
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
              star={starRides.has(task.id)}
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
          <BossMarker raid={raid && raidOnMap ? raid : null} animate={mapFocused && !bossOccluded && !isActive} onPress={() => setBossOpen(true)} />
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
          <GymMarker hidden={!gymData || !mapFlags.gymSwords} leader={gymData?.leader} latitude={gymData?.gym.latitude ?? PARKED.latitude}
            longitude={gymData?.gym.longitude ?? PARKED.longitude} onPress={handleGymPress} />
          {swordSlots.map((sword, slot) => (
            <SwordMarker key={`sword-${slot}`} hidden={!sword || !mapFlags.gymSwords} id={sword?.id ?? -1}
              latitude={sword?.latitude ?? PARKED.latitude} longitude={sword?.longitude ?? PARKED.longitude}
              expiresAt={sword?.expires_at ?? PARKED_TIME} onPress={() => { if (sword) void handleSwordClaim(sword.id); }} />
          ))}
          {/* A ride focused from the checklist that is not on today's map (parked otherwise). */}
          <TaskMarker task={checklistRide ?? PARKED_TASK} parked={!checklistRide} isSelected={!!checklistRide} isTripGoal={false}
            onPress={() => { setSelectedTask(null); setFocusedFromChecklist(null); }} />
        </Map>
      </View>
      )}
      {/* A later loading sky (walking into a park) sits above every map button, card and tip (under
          the header and footer), so a kid sees one loading bar finish, then the map and its buttons in one fade. */}
      <MapLaunchCover variant="sky" blockTouches style={SKY_COVER_STYLE} />

      {/* Community Center Modal */}
      {lateOverlays && <CommunityCenterModal
        visible={showCommunityCenterModal}
        center={communityCenter}
        onClose={() => setShowCommunityCenterModal(false)}
        onAction={refreshCommunityCenter}
      />}
      
      {/* The collect moment flies over everything on the map screen. */}
      <View ref={flightLayerRef} collapsable={false} pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }}>
        {collectFlight && <CoinCollectFlight key={collectFlight.key} from={collectFlight.from} to={collectFlight.to}
          coinUrl={collectFlight.coinUrl} label={collectFlight.label} reducedMotion={reducedMotion}
          onLand={() => { avatarPop.value = reducedMotion ? 1 : withSequence(withTiming(1.22, { duration: 110 }), withSpring(1, { damping: 6, stiffness: 260 })); }}
          onDone={() => setCollectFlight(null)} />}
      </View>
      {/* Too Far Away: ribbon + blue card with a distance meter */}
      {lateOverlays && <TooFarDialog visible={showTooFarModal} distanceMeters={tooFarMeters} requiredMeters={tooFarRequiredMeters}
        homeItem={tooFarIsHomeItem} onClose={() => setShowTooFarModal(false)} />}
      {/* Fin-ister Nights overlays (sheet, rank card, tutorial, exit moment, Marquee); outside the park block on purpose. */}
      {lateOverlays && player && <FrightLayer night={frightNight} engine={frightEngine} top={slotTop + 64} />}
    </Wrapper>
  );
}

/**
 * The map screen. Under the app's first cover, the screen's first commit is only that cover (the
 * same splash, bar and fun fact the Loading screen showed), so its bar and bubbles start animating
 * on the UI thread before anything heavy runs; the whole map screen (its state, effects, map, HUD
 * and markers) mounts two frames later underneath. A profile showed the cover's bar frozen for
 * about a second when the cover started in the same commit as the map screen's render and effects.
 * A later visit (no launch cover) mounts everything at once, as before.
 */
function ExploreScreen() {
  const [deferBody] = useState(launchCoverAhead);
  const late = useLateMount();
  return (
    <>
      {(late || !deferBody) && <ExploreScreenBody />}
      {/* The app's first cover: the launch scene over the whole screen, header and footer included,
          so the splash and its one bar carry on until the park map has drawn, then the whole game
          (map, header, footer, buttons) arrives in one fade with no label swapping underneath. */}
      <MapLaunchCover variant="launch" armOnMount blockTouches style={LAUNCH_COVER_STYLE} />
    </>
  );
}

const styles = StyleSheet.create({
  // Off screen, never transparent: its sheet and reveal are native modals that must draw normally.
  trailHostHidden: { position: 'absolute', left: -2000, top: 0, width: 1, height: 1, overflow: 'hidden' },
  shelfLabel: { position: 'absolute', bottom: -14, alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 9,
    borderWidth: 2, borderColor: '#0879ca', paddingHorizontal: 8, paddingVertical: 1 },
  shelfLabelText: { color: '#05346e', fontFamily: 'Shark', fontSize: 13 },
});

export default withWs2Profiler(ExploreScreen, 'ExploreScreen');
