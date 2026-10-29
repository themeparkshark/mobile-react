import { Image } from 'expo-image';
import { goalCoinKind, guideShelfHint, levelUpGoalHint, shelfGuidePick, shelfNearbyPick, stalePlan } from '../services/collection/nextCoinCopy';
import { levelUpGoal } from '../services/collection/levelUpGoal';
import { chunk } from 'lodash';
import { useContext, useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFocusEffect, useIsFocused, useNavigation, type NavigationProp } from '@react-navigation/native';
import { AppState, ImageBackground, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import getWikiTimes, { type WikiLiveEntry } from '../api/endpoints/parks/queue-times/getWikiTimes';
import { loadParkShelf, peekParkShelf } from '../services/collection/parkShelfPrefetch';
import Ribbon from '../components/Ribbon';
import InformationModal from '../components/InformationModal';
import Loading from '../components/Loading';
import ParkTrophyModal from '../components/ParkTrophyModal';
import ParkShelfArtwork from '../components/ParkShelfArtwork';
import CoinShelfArrival from '../components/CoinShelfArrival';
import useEarnedShelfArrival from '../hooks/useEarnedShelfArrival';
import { isEarnedShelfArrival, resolveEarnedShelfSlot, type EarnedShelfArrival, type ShelfSection } from '../services/collection/earnedShelf';
import TaskCoinModal from '../components/TaskCoinModal';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import * as RootNavigation from '../RootNavigation';
import Wrapper, { BOTTOM_BAR_OVERHANG } from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import useCrumbs from '../hooks/useCrumbs';
import useTripGoal from '../hooks/useTripGoal';
import UnfoundCoinModal from '../components/UnfoundCoinModal';
import ParkDayRecapCard from './ParkDayRecapCard';
import ParkCollectionHeader from './ParkCollectionHeader';
import ParkRideDirectory from './ParkRideDirectory';
import { nearbyUncollectedRide } from './parkRideSuggestion';
import { reportedRideStatus } from './parkRideAvailability';
import { useTutorial } from '../components/Tutorial';
import { InformationModalEnums } from '../models/information-modal-enums';
import { ParkType } from '../models/park-type';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import { loadParkRides, prefetchRideCatalog, resolveRideContextOrOffline } from '../services/lineplay/resolveRide';
import { splitParkShelf } from '../services/collection/limitedCoins';
import type { RideType } from '../api/endpoints/rides';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { getParkDayRecap, type ParkDayRecap } from '../api/endpoints/me/park-day-recap';
import { guide } from '../services/guide/nextCoin';
import { useRung } from '../services/reveal/revealLadder';
import GameIcon from '../ui/GameIcon';
import { milestoneToday, nextTrophy, nextTrophyLine, partsWaiting, TROPHY_HELP, shelfCountLabel, shelfTabs, shelfTotals, storyOnTop,
  landingTab, recapWaitMs, shownShelfTab, tabForSlot, visibleSecretSlots, visibleTabs, type ShelfTab } from '../services/collection/shelfModel';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';

/** How long the first shelf paint waits for today's park story (the shelf never waits longer). */

export default function ParkScreen({ route }: NativeStackScreenProps<ParamListBase, 'Park'>) {
  const { width, height } = useWindowDimensions();
  // Keep the familiar five-coin rows inside their shelves on smaller phones.
  const shelfCoinSize = Math.max(40, Math.min(62, (width - 88) / 5));
  const { park, player, earnedCoin, openMastery, focusCoin } = route.params as {
    park: number; player: number; earnedCoin?: EarnedShelfArrival;
    /** "Upgrade Your Coin": open mastery as soon as the coin lands (one hop). */
    openMastery?: boolean;
    /** A coin link from elsewhere: scroll to its slot and open it. */
    focusCoin?: { assetId: number };
  };
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const isFocused = useIsFocused();
  const receivedArrival = useRef(false);
  if (isEarnedShelfArrival(earnedCoin)) receivedArrival.current = true;
  const slotRef = useRef<View>(null), contentRef = useRef<View>(null), frameRef = useRef<View>(null);
  const arrivalFrameSize = useRef<{ width: number; height: number } | null>(null);
  const wasFocused = useRef(isFocused);
  const [landedKey, setLandedKey] = useState<string | null>(null);
  const [closedKey, setClosedKey] = useState<string | null>(null);
  const [inspection, setInspection] = useState<{ section: ShelfSection; taskId: number; key: number } | null>(null);
  // "See It On Your Shelf": the win already loaded this shelf, so the first frame is the shelf
  // (never a Loading screen) and the coin can fly straight to its slot.
  const [seed] = useState(() => isEarnedShelfArrival(earnedCoin) ? peekParkShelf(Number(park), Number(player)) : null);
  const [currentPark, setCurrentPark] = useState<ParkType | undefined>(seed?.visitedPark);
  const [archivedTasks, setArchivedTasks] = useState<TaskType[]>(seed?.archived ?? []);
  const [tasks, setTasks] = useState<TaskType[]>(seed?.available ?? []);
  const [completedArchivedTasks, setCompletedArchivedTasks] = useState<
    TaskType[]
  >(seed?.completedArchived ?? []);
  const [secretTasks, setSecretTasks] = useState<SecretTaskType[]>(seed?.secret ?? []);
  const [completedTasks, setCompletedTasks] = useState<TaskType[]>(seed?.completed ?? []);
  const [limitedTasks, setLimitedTasks] = useState<TaskType[]>(seed?.limited ?? []);
  const [catalogRides, setCatalogRides] = useState<RideType[]>([]);
  const [completedSecretTasks, setCompletedSecretTasks] = useState<
    SecretTaskType[]
  >(seed?.completedSecret ?? []);
  const [loading, setLoading] = useState<boolean>(!seed);
  const [progressStale, setProgressStale] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [waitSnapshot, setWaitSnapshot] = useState<{
    parkId: number; entries: WikiLiveEntry[]; checkedAt: number;
  } | null>(null);
  const [parkCoinUrl, setParkCoinUrl] = useState<string | null>(null);
  const [rideOnly, setRideOnly] = useState(false);
  // The shelf's tabs: Rides, Sights and Limited (Past events at the bottom of Limited).
  const [tab, setTab] = useState<ShelfTab>('rides');
  useEffect(() => { setTab('rides'); }, [park]);
  // Unfound secret slots ("?") show once coin levels open (rung 3); secret coins you won always show.
  const coinLevels = useRung('coin_levels');
  // The guide's plan: GO and "Make this my next coin" both point the one guide (guide.setTarget).
  const guidePlan = useSyncExternalStore(guide.subscribe, guide.plan, guide.plan);
  // The coin the map guide holds now: the shelf's NEXT COIN names it too, so the two never disagree.
  const guideTarget = useSyncExternalStore(guide.subscribe, guide.current, guide.current);
  // Today's park day story, read once here so the card can sit on top after a park day.
  const recapCache = useRef<{ at: number; parkId: number; recap: ParkDayRecap } | null>(null);
  const [todayRecap, setTodayRecap] = useState<ParkDayRecap | null>(null);
  const [placedRecap, setPlacedRecap] = useState<ParkDayRecap | null>(null);
  useEffect(() => { setTodayRecap(null); setPlacedRecap(null); recapCache.current = null; }, [park]);
  const loadRecap = useCallback(async (parkId: number, date?: string) => {
    const cached = recapCache.current;
    if (!date && cached && cached.parkId === parkId && Date.now() - cached.at < 5_000) return cached.recap;
    const recap = await getParkDayRecap(parkId, date);
    if (!date && recap) {
      recapCache.current = { at: Date.now(), parkId, recap };
      setTodayRecap(recap);
    }
    return recap;
  }, []);
  const scrollRef = useRef<ScrollView>(null);
  const checklistOffset = useRef(0);
  const guideOffset = useRef(0);
  const secretShelfOffset = useRef(0);
  const limitedShelfOffset = useRef(0);
  const reducedMotion = useReducedGameMotion();
  useEffect(() => { setRideOnly(false); }, [park]);
  const { park: locationPark, location } = useContext(LocationContext);
  const { player: viewer } = useContext(AuthContext);
  // The owned coin GET RIDE PARTS pointed at: the shelf shows it as LEVEL UP GOAL while it is still the plan.
  // It belongs to the signed-in player: another account on this phone never sees it.
  const viewerId = viewer?.id ?? null;
  const readLevelUp = useCallback(() => levelUpGoal.getFor(viewerId), [viewerId]);
  const levelUpId = useSyncExternalStore(levelUpGoal.subscribe, readLevelUp, readLevelUp);
  useEffect(() => { levelUpGoal.forPlayer(viewerId); }, [viewerId]);
  const { labels } = useCrumbs();
  const { data: tripGoalData, stale: tripGoalStale, choose: chooseTripGoal } = useTripGoal();
  const canChooseGoal = viewer?.id === Number(player);
  const requestKey = canChooseGoal && isEarnedShelfArrival(earnedCoin)
    ? `${player}:${park}:${earnedCoin.attemptId}` : null;
  // Coin Map 2.0: permanent coins keep the Ride Coins row; limited coins get their own.
  const { permanent: permanentTasks, limited: limitedShelf, allLimited } = useMemo(
    () => splitParkShelf(tasks, limitedTasks, completedTasks), [tasks, limitedTasks, completedTasks]);
  const arrivalSlot = requestKey && !loading && !progressStale ? resolveEarnedShelfSlot(earnedCoin, {
    normal: permanentTasks, normalCompleted: completedTasks, secret: secretTasks, secretCompleted: completedSecretTasks,
    archived: archivedTasks, archivedCompleted: completedArchivedTasks,
    limited: limitedShelf, limitedCompleted: completedTasks,
  }) : null;
  const arrival = useEarnedShelfArrival({ requestKey,
    enabled: isFocused && !!arrivalSlot && closedKey !== requestKey,
    slotRef, contentRef, frameRef, scrollRef });
  const matchesArrival = (section: ShelfSection, taskId: number) =>
    arrivalSlot?.section === section && arrivalSlot.task.id === taskId;
  const inspectionKey = (section: ShelfSection, taskId: number) =>
    inspection?.section === section && inspection.taskId === taskId ? inspection.key : undefined;
  const closeArrival = () => { setClosedKey(requestKey); navigation.setParams({ earnedCoin: undefined }); };
  const inspectArrival = () => {
    if (arrivalSlot && earnedCoin) setInspection({ section: arrivalSlot.section, taskId: arrivalSlot.task.id, key: earnedCoin.attemptId });
    closeArrival();
  };
  const inspectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (inspectTimer.current) clearTimeout(inspectTimer.current); }, []);
  const landArrival = () => {
    setLandedKey(requestKey);
    if (openMastery) {
      if (inspectTimer.current) clearTimeout(inspectTimer.current);
      inspectTimer.current = setTimeout(inspectArrival, reducedMotion ? 0 : 520);
    }
  };
  useEffect(() => {
    if (wasFocused.current && !isFocused && requestKey) {
      setClosedKey(requestKey);
      navigation.setParams({ earnedCoin: undefined });
    }
    wasFocused.current = isFocused;
  }, [isFocused, requestKey, navigation]);
  useEffect(() => { setInspection(null); }, [park, player]);
  useEffect(() => { if (!isFocused) setInspection(null); }, [isFocused]);
  // A coin link from another screen lands here: scroll to its slot and open it once.
  const focusSlotRef = useRef<View>(null);
  const handledFocus = useRef<number | null>(null);
  const focusAssetId = typeof focusCoin?.assetId === 'number' ? focusCoin.assetId : null;
  const focusSlot = focusAssetId && !loading ? ((): { section: ShelfSection; task: TaskType | SecretTaskType } | null => {
    for (const [section, shelf, done] of [['normal', permanentTasks, completedTasks], ['limited', limitedShelf, completedTasks],
      ['secret', secretTasks, completedSecretTasks], ['archived', archivedTasks, completedArchivedTasks]] as const) {
      // The coin's own row: an owned limited coin sits on the Limited shelf, not Ride Coins.
      const task = (done as ReadonlyArray<TaskType | SecretTaskType>).find(item => item.asset_id === focusAssetId &&
        (shelf as ReadonlyArray<TaskType | SecretTaskType>).some(slot => slot.id === item.id));
      if (task) return { section, task };
    }
    return null;
  })() : null;
  const focusTab: ShelfTab | null = focusSlot
    ? tabForSlot(focusSlot.section, focusSlot.task.id, currentPark?.ride_passport_task_ids) : null;
  useEffect(() => {
    if (!focusSlot || !isFocused || requestKey || handledFocus.current === focusAssetId) return undefined;
    handledFocus.current = focusAssetId;
    // Open the tab that holds the linked coin first, so its slot is on screen when it is measured.
    if (focusTab) setTab(focusTab);
    const timer = setTimeout(() => {
      const content = contentRef.current;
      if (content) focusSlotRef.current?.measureLayout(content, (_x, y) => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 180), animated: !reducedMotion });
      }, () => undefined);
      setInspection({ section: focusSlot.section, taskId: focusSlot.task.id, key: Date.now() });
      navigation.setParams({ focusCoin: undefined });
    }, 250);
    return () => clearTimeout(timer);
  }, [focusSlot?.section, focusSlot?.task.id, isFocused, requestKey, focusAssetId, reducedMotion, navigation, focusTab]);
  const parkTripGoal = canChooseGoal && tripGoalData?.goal?.park_id === Number(park)
    ? tripGoalData.goal : null;
  const goalPlan = parkTripGoal?.coin_owned ? tripGoalData?.goal_plan : null;
  const ownedGoalHint = goalPlan
    ? goalPlan.maxed ? 'Top level for now. Pick another ride coin.'
      : goalPlan.parts_needed === 0 && goalPlan.energy_needed === 0
        ? 'Ready to level up. Open this coin on your shelf.'
        : `Level up needs ${goalPlan.parts_needed ?? 0} Parts · ${goalPlan.energy_needed} energy.`
    : null;
  const inThisPark = Number(locationPark?.id) === Number(park);
  useEffect(() => {
    if (canChooseGoal && inThisPark) void prefetchRideCatalog(Number(park));
  }, [park, canChooseGoal, inThisPark]);
  const openRideLinePlay = useCallback((task: TaskType) => {
    void resolveRideContextOrOffline(Number(park), task.name).then(ride => {
      RootNavigation.navigate('LinePlay', { ride });
    });
  }, [park]);
  // A cataloged ride with no coin still plays in line (Coin Guide, Coin Map 2.0).
  const openCatalogRideLinePlay = useCallback((catalogRide: RideType) => {
    void resolveRideContextOrOffline(Number(park), catalogRide.name).then(ride => {
      RootNavigation.navigate('LinePlay', { ride });
    });
  }, [park]);
  useEffect(() => {
    let active = true;
    setCatalogRides([]);
    // The same cached catalog request Line Play uses; the guide simply has no Line Play rows without it.
    loadParkRides(Number(park)).then(rides => { if (active) setCatalogRides(rides); }).catch(() => undefined);
    return () => { active = false; };
  }, [park]);
  const freshWaitEntries = waitSnapshot?.parkId === Number(park) &&
    Date.now() - waitSnapshot.checkedAt < 120_000 ? waitSnapshot.entries : null;
  const goalReportedDown = !!(parkTripGoal && !parkTripGoal.coin_owned &&
    freshWaitEntries && reportedRideStatus(freshWaitEntries, Number(park), parkTripGoal.ride_name) === 'DOWN');
  // The shelf's own next coin when the guide holds nothing here: the nearest open ride, then a ride
  // with no live answer, then a sight. A closed, down or refurbishing ride is never suggested, and at
  // night the sights stay open (or the park is closed). Pure rules: nextCoinCopy.shelfNearbyPick.
  const rideTaskIds = currentPark?.ride_passport_task_ids;
  const nearbyPick = canChooseGoal && inThisPark && !parkTripGoal ? shelfNearbyPick<TaskType>({
    feedFresh: !!freshWaitEntries?.length,
    anyRideOpen: !!freshWaitEntries?.some(entry => entry.status === 'OPERATING'),
    isSight: task => {
      if (rideTaskIds?.length) return !rideTaskIds.includes(task.id);
      const kind = (task as TaskType & { coin_kind?: string | null }).coin_kind;
      return !!kind && kind !== 'ride';
    },
    status: task => (freshWaitEntries ? reportedRideStatus(freshWaitEntries, Number(park), task.name) : null),
    nearest: eligible => nearbyUncollectedRide(tasks, completedTasks, location, eligible)?.task ?? null,
  }) : null;
  const nearbySuggestion = nearbyPick?.kind === 'coin' ? { task: nearbyPick.row } : null;
  const nearbyReportedOpenRide = nearbyPick?.kind === 'coin' && nearbyPick.reportedOpen;
  const alternateRide = goalReportedDown && freshWaitEntries
    ? nearbyUncollectedRide(tasks, completedTasks, location,
      task => reportedRideStatus(freshWaitEntries, Number(park), task.name) === 'OPERATING') : null;
  // GO on the shelf's next coin, and "Make this my next coin" on a coin card: one pointer for the
  // whole app (guide.setTarget). At this park the map opens with the path; away it is the plan.
  // Until the map resolves a target (or while it rests), the guide's plan (GO, GET RIDE PARTS, a coin pick) stands in.
  // A coin you already own is never the NEXT COIN: GO on Tiki Room, win it, and the shelf moves on.
  // GET RIDE PARTS on an owned coin is the one exception: LEVEL UP GOAL, the parts picture, GO to its line.
  const ownedIds = useMemo(() => new Set(completedTasks.map(task => task.id)), [completedTasks]);
  const shelfGuide = canChooseGoal ? shelfGuidePick({ target: guideTarget, plan: guidePlan, levelUpGoal: levelUpId,
    parkId: Number(park), atPark: inThisPark, rows: [...tasks, ...limitedTasks], owned: ownedIds }) : null;
  const guideTask = shelfGuide && !shelfGuide.levelUp ? shelfGuide.row : null;
  const levelUpTask = shelfGuide?.levelUp ? shelfGuide.row : null;
  // A plan this screen saw unowned and you now own is done: forget it so the shelf and the map pick
  // the next coin. A plan another surface set on a coin you already own is never cleared here
  // (this screen stays mounted and listening in the Profile stack).
  const watchedPlan = useRef<number | null>(null);
  const planDone = loading ? null : stalePlan(guidePlan, ownedIds, levelUpId, watchedPlan.current);
  useEffect(() => {
    if (loading) return;
    if (planDone != null && guide.plan() === planDone) guide.clearPlan();
    watchedPlan.current = guidePlan != null && !ownedIds.has(guidePlan) ? guidePlan : null;
  }, [loading, planDone, guidePlan, ownedIds]);
  // The guide's pick shows in place of the shelf's own (the goal card stays when the guide holds the goal).
  const guideOverGoal = !!shelfGuide && shelfGuide.row.id !== parkTripGoal?.task_id;
  const levelUpHint = levelUpTask
    ? parkTripGoal?.task_id === levelUpTask.id && ownedGoalHint ? ownedGoalHint
      : levelUpGoalHint(shelfGuide?.reason ?? '', !!currentPark?.ride_passport_task_ids?.length &&
        !currentPark.ride_passport_task_ids.includes(levelUpTask.id))
    : null;
  const nextCoinTask = levelUpTask ?? guideTask ?? (parkTripGoal && !parkTripGoal.coin_owned
    ? [...tasks, ...limitedTasks].find(task => task.id === parkTripGoal.task_id) ?? null
    : nearbySuggestion?.task ?? null);
  const goToCoin = useCallback((task: TaskType, source: string) => {
    guide.setTarget(task.id, source);
    if (inThisPark) RootNavigation.navigate('Explore', { focusRide: { parkId: Number(park), task } });
  }, [inThisPark, park]);
  const chooseNextCoin = useCallback(async (task: TaskType) => {
    guide.setTarget(task.id, 'shelf');
    await chooseTripGoal(task.id);
  }, [chooseTripGoal]);
  const onGoNext = canChooseGoal && nextCoinTask ? () => {
    if (inThisPark) goToCoin(nextCoinTask, levelUpTask ? 'coin_parts' : 'shelf_next');
    else void chooseNextCoin(nextCoinTask).catch(() => undefined);
  } : undefined;
  const { startTutorial, hasCompleted, isReady: tutorialReady, isActive: tutorialActive } = useTutorial();
  
  // Trigger park tutorial on first visit
  useEffect(() => {
    if (isFocused && tutorialReady && !loading && !tutorialActive && !receivedArrival.current && !hasCompleted('park')) {
      const timer = setTimeout(() => startTutorial('park'), 1000);
      return () => clearTimeout(timer);
    }
  }, [isFocused, tutorialReady, loading, tutorialActive, hasCompleted, startTutorial]);

  const silver =
    currentPark && currentPark.park_coins_count >= 50
      ? require('../../assets/images/screens/park/silver.png')
      : require('../../assets/images/screens/park/silver_placeholder.png');

  const gold =
    currentPark && currentPark.park_coins_count >= 100
      ? require('../../assets/images/screens/park/gold.png')
      : require('../../assets/images/screens/park/gold_placeholder.png');

  const bronze =
    currentPark && currentPark.park_coins_count >= 12
      ? require('../../assets/images/screens/park/bronze.png')
      : require('../../assets/images/screens/park/bronze_placeholder.png');

  const hasRideCoinProgress = typeof currentPark?.ride_coins_available === 'number';
  const rideCoinsAvailable = currentPark?.ride_coins_available ?? 0;
  const rideCoinsCollected = currentPark?.ride_coins_collected ?? 0;
  const headlineRate = hasRideCoinProgress
    ? (currentPark?.ride_coin_completion_rate ?? 0)
    : (currentPark?.completion_rate ?? 0);
  const passportMode = rideOnly && !!currentPark?.ride_passport_task_ids?.length;
  // One count everywhere: the server's shelf total (the win card reads the same numbers).
  const totals = shelfTotals(currentPark, { collected: hasRideCoinProgress ? rideCoinsCollected : 0,
    available: hasRideCoinProgress ? rideCoinsAvailable : 0 });
  const split = shelfTabs(permanentTasks, currentPark?.ride_passport_task_ids);
  const tabs = visibleTabs(split.split, split.sights.length, limitedShelf.length, archivedTasks.length);
  // A coin landing opens the tab that holds its slot from the first frame (a sight on Sights, a limited
  // or past event coin on Limited, a secret coin on Rides), so the slot is mounted when it is measured.
  // Once the coin lands the tab is free again (the effect below already moved the shelf there), so every
  // tab chip works while the "ON YOUR SHELF" chip is still up.
  const arrivalTab: ShelfTab | null = landingTab({ slot: arrivalSlot
    ? { section: arrivalSlot.section, taskId: arrivalSlot.task.id } : null,
    requestKey, landedKey, closedKey, rideTaskIds: currentPark?.ride_passport_task_ids });
  const shownTab: ShelfTab = shownShelfTab(tab, tabs, arrivalTab);
  const shownSecret = visibleSecretSlots(secretTasks, completedSecretTasks, coinLevels.open);
  // Keep the landing's tab after the coin lands, so the shelf never jumps back to Rides under it.
  useEffect(() => { if (arrivalTab) setTab(arrivalTab); }, [arrivalTab]);
  // The story's place is decided when the shelf paints (placedRecap), never after: a story that comes in
  // later sits below the shelf until the next visit, so nothing jumps over the shelf under the thumb.
  const storyTop = canChooseGoal && !!placedRecap && storyOnTop({ atPark: inThisPark,
    ridesWonToday: placedRecap.distinct_rides_won, milestone: milestoneToday(totals, placedRecap.new_coins) });
  const parkStores = inThisPark ? locationPark?.stores ?? [] : [];
  const trophyNext = currentPark ? nextTrophy(currentPark.park_coins_count) : null;

  // Today's park story is read with the shelf on first paint, capped short (recapWaitMs) and never while a
  // won coin is landing, so the shelf and the landing paint as fast as the shelf read itself.
  const shelfPainted = useRef(false);
  const landingRef = useRef(false);
  landingRef.current = !!requestKey;
  useEffect(() => { shelfPainted.current = false; }, [park, player]);
  useFocusEffect(useCallback(() => {
    let active = true;
    let recapTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const waitMs = recapWaitMs({ firstPaint: !shelfPainted.current, ownShelf: canChooseGoal, landing: landingRef.current });
        const story = waitMs > 0
          ? Promise.race([loadRecap(Number(park)).catch(() => null),
            new Promise<null>(resolve => { recapTimer = setTimeout(() => resolve(null), waitMs); })])
          : null;
        const { visitedPark, available, secret, completed, completedSecret, archived, completedArchived, limited } =
          await loadParkShelf(Number(park), Number(player));
        await story;
        if (recapTimer) clearTimeout(recapTimer);
        if (!active) return;
        shelfPainted.current = true;
        // The story's place for this visit: whatever story is in hand as the shelf paints.
        const inHand = recapCache.current;
        setPlacedRecap(canChooseGoal && inHand && inHand.parkId === Number(park) ? inHand.recap : null);
        setCurrentPark(visitedPark);
        setTasks(available);
        setLimitedTasks(limited);
        setSecretTasks(secret);
        setCompletedTasks(completed);
        setCompletedSecretTasks(completedSecret);
        setArchivedTasks(archived);
        setCompletedArchivedTasks(completedArchived);
        if (locationPark?.coin_url) setParkCoinUrl(locationPark.coin_url);
        setProgressStale(false);
      } catch {
        if (active) setProgressStale(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; if (recapTimer) clearTimeout(recapTimer); };
  }, [park, player, locationPark?.coin_url, refreshVersion, canChooseGoal, loadRecap]));

  // This is guidance, never a gate on coin collection. Unknown or stale feed
  // data leaves the saved ride goal and proximity suggestion alone.
  useFocusEffect(useCallback(() => {
    if (!canChooseGoal || !inThisPark) {
      setWaitSnapshot(null);
      return;
    }
    let active = true;
    let request: AbortController | null = null;
    const refresh = async () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const entries = await getWikiTimes(Number(park), controller.signal);
        if (active && !controller.signal.aborted) {
          setWaitSnapshot({ parkId: Number(park), entries, checkedAt: Date.now() });
        }
      } catch {
        if (active && request === controller) setWaitSnapshot(null);
      } finally {
        clearTimeout(timeout);
      }
    };
    void refresh();
    // The feed is a large download: skip it while the app is in the background.
    const interval = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 60_000);
    return () => { active = false; clearInterval(interval); request?.abort(); };
  }, [park, canChooseGoal, inThisPark]));

  // One slot size for earned coins and empty sockets, so the shelf reads as one row.
  const coinSize = Math.min(60, shelfCoinSize);
  // The last shelf must scroll clear of the compass, which rises above the tab bar, plus the
  // 1% the Wrapper content overlaps the bar, so the bottom row never ends under it.
  const shelfEndClearance = BOTTOM_BAR_OVERHANG + Math.ceil(height * 0.01) + 24;
  const shelfPanel = { backgroundColor: '#0768b9', borderWidth: 3, borderColor: '#fff', borderRadius: 20,
    paddingTop: 34, paddingHorizontal: 10, paddingBottom: 12, shadowColor: '#05346e', shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 } as const;
  const completedFor = (section: ShelfSection) => (section === 'secret' ? completedSecretTasks
    : section === 'archived' ? completedArchivedTasks : completedTasks) as ReadonlyArray<TaskType | SecretTaskType>;
  const shelfArt = (section: ShelfSection) => section === 'limited' ? 'normal' : section;
  const rideKind = (taskId: number): 'ride' | 'coin' | undefined => currentPark?.ride_passport_task_ids?.length
    ? currentPark.ride_passport_task_ids.includes(taskId) ? 'ride' : 'coin' : undefined;
  const shelfRows = (section: ShelfSection, list: ReadonlyArray<TaskType | SecretTaskType>) => chunk(list, 5).map((row, rowIndex) => (
    <View key={rowIndex} style={{ paddingBottom: 14 }}>
      <View style={{ position: 'relative', height: coinSize + 43 }}>
        <ParkShelfArtwork variant={shelfArt(section)} height={55} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', position: 'absolute', top: 4, width: '100%' }}>
          {row.map((task, index) => {
            const owned = completedFor(section).find(done => done.id === task.id);
            const arriving = matchesArrival(section, task.id);
            // The earned coin is off its slot from the first frame until it lands (never in place, then flown in).
            const hidden = arriving && landedKey !== requestKey && closedKey !== requestKey && (!!arrival.target || arrival.pending);
            const focused = focusSlot?.section === section && focusSlot.task.id === task.id;
            return <View key={task.id} style={{ paddingLeft: index === 0 ? 0 : 7 }}>
              {owned ? (
                <View collapsable={false}
                  ref={arriving ? slotRef : focused ? focusSlotRef : undefined}
                  onLayout={arriving ? arrival.notifyLayout : undefined}
                  pointerEvents={hidden ? 'none' : 'auto'}
                  style={{ width: coinSize, height: coinSize, opacity: hidden ? 0 : 1 }}>
                  <TaskCoinModal
                    openRequestKey={inspectionKey(section, task.id)}
                    size={coinSize}
                    phase={rowIndex * 5 + index}
                    task={task}
                    isSecretTask={section === 'secret'}
                    sight={section === 'normal' && rideKind(task.id) === 'coin'}
                    level={owned.coin_level ?? null}
                    igniteKey={arriving && landedKey === requestKey ? requestKey ?? undefined : undefined}
                    onPlayInLine={section === 'normal' && canChooseGoal && inThisPark &&
                      currentPark?.ride_passport_task_ids?.includes(task.id)
                      ? () => openRideLinePlay(task as TaskType) : undefined}
                    onShowOnMap={(section === 'normal' || section === 'limited') && canChooseGoal && inThisPark
                      ? () => RootNavigation.navigate('Explore', { focusRide: { parkId: Number(park), task } }) : undefined}
                    timesCompleted={owned.times_completed ?? 0}
                    readOnly={!canChooseGoal}
                  />
                </View>
              ) : section === 'normal' || section === 'limited' ? (
                <View>
                  <UnfoundCoinModal task={task} size={coinSize} kind={rideKind(task.id)}
                    limited={(task as TaskType).limited}
                    isGoal={parkTripGoal?.task_id === task.id || guidePlan === task.id}
                    onPlayInLine={canChooseGoal && inThisPark &&
                      currentPark?.ride_passport_task_ids?.includes(task.id)
                      ? () => openRideLinePlay(task as TaskType) : undefined}
                    onChooseGoal={canChooseGoal ? () => chooseNextCoin(task as TaskType) : undefined}
                    onShowOnMap={canChooseGoal && inThisPark
                      ? () => goToCoin(task as TaskType, 'shelf_slot') : undefined} />
                  {/* Parts you earned in this ride's line before winning its coin wait in its slot. */}
                  {canChooseGoal && partsWaiting(task) > 0 && <View pointerEvents="none" style={{ position: 'absolute',
                    right: -6, bottom: -4, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#fff8e4',
                    borderColor: '#ffcf3b', borderWidth: 2, borderRadius: 10, paddingHorizontal: 4, paddingVertical: 1 }}
                    accessible accessibilityLabel={`${partsWaiting(task)} Ride Parts waiting for this coin`}>
                    <GameIcon name="parts" size={14} />
                    <Text style={{ fontFamily: 'Shark', fontSize: 12, color: '#05346e' }}>{partsWaiting(task)}</Text>
                  </View>}
                </View>
              ) : (
                <UnfoundCoinModal task={task} size={coinSize} isSecret={section === 'secret'}
                  isArchived={section === 'archived'} />
              )}
            </View>;
          })}
        </View>
      </View>
    </View>
  ));

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>
            {currentPark?.display_name ?? currentPark?.name}
          </TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal id={InformationModalEnums.ParkScreen} />
        </TopbarColumn>
      </Topbar>
      {loading && <ImageBackground style={{ flex: 1, marginTop: -8 }}
        source={require('../../assets/images/screens/park/background-new.png')}>
        {/* Same underwater park art while the shelf loads, never a grey page. */}
        <Loading />
      </ImageBackground>}
      {!loading && (
        <View ref={frameRef} collapsable={false} onLayout={event => {
          const { width: frameWidth, height: frameHeight } = event.nativeEvent.layout;
          const previous = arrivalFrameSize.current;
          arrivalFrameSize.current = { width: frameWidth, height: frameHeight };
          if (arrival.target && previous &&
              (previous.width !== frameWidth || previous.height !== frameHeight)) closeArrival();
          arrival.notifyLayout();
        }}
          style={{
            flex: 1,
            marginTop: -8,
          }}
        >
          <ImageBackground
            style={{
              flex: 1,
            }}
            source={require('../../assets/images/screens/park/background-new.png')}
          >
            {progressStale && <Pressable onPress={() => setRefreshVersion(version => version + 1)}
              accessibilityRole="button" accessibilityLabel="Retry park progress refresh"
              style={{ backgroundColor: '#edfaff', padding: 12, margin: 16, borderRadius: 12,
                borderWidth: 2, borderColor: '#ffc932' }}>
              <Text style={{ color: '#075b9b', textAlign: 'center', fontFamily: 'Knockout', fontSize: 16 }}>
                {currentPark
                  ? 'Could not update your park progress. This may be old. Tap to try again.'
                  : 'Could not load your park progress. Tap to try again.'}
              </Text>
            </Pressable>}
            {currentPark && tasks && secretTasks && (
              <ScrollView ref={scrollRef}
                /* The shelf holds still only while the coin flies in; once it lands the player can scroll up to the tabs. */
                scrollEnabled={!arrival.target || landedKey === requestKey}
                onContentSizeChange={arrival.notifyLayout}>
                <View ref={contentRef} collapsable={false}>
                <View style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
                  {/* After a park day (and on 25/50/75/100% days) the day's story waits on top, with Share. */}
                  {storyTop && <ParkDayRecapCard parkId={Number(park)} atPark={inThisPark}
                    refreshVersion={refreshVersion} loadRecap={loadRecap} initialRecap={todayRecap} />}
                  <ParkCollectionHeader
                    parkName={currentPark.display_name ?? currentPark.name}
                    isOwnPark={canChooseGoal}
                    collected={totals.collected}
                    available={totals.available}
                    completionRate={hasRideCoinProgress ? headlineRate : 0}
                    holdCount={!!arrival.target && landedKey !== requestKey && !!earnedCoin?.firstCollection}
                    tickKey={landedKey && landedKey === requestKey && earnedCoin?.firstCollection ? landedKey : null}
                    ridePassportCollected={currentPark.ride_passport_collected}
                    ridePassportAvailable={currentPark.ride_passport_available}
                    limitedCollected={currentPark.limited_coins_collected}
                    limitedAvailable={currentPark.limited_coins_available}
                    limitedEndsOn={currentPark.limited_ends_on}
                    tab={shownTab}
                    tabs={tabs}
                    onTab={next => {
                      setTab(next); setRideOnly(false);
                      // The ON YOUR SHELF chip leaves on the first tab switch after the coin lands,
                      // so it never sits over another tab's coins or trophies.
                      if (requestKey && landedKey === requestKey && closedKey !== requestKey && next !== shownTab) closeArrival();
                    }}
                    trophyWins={currentPark.park_coins_count}
                    onOpenStampBook={canChooseGoal ? () => RootNavigation.navigate('StampBook') : undefined}
                    nextRideName={levelUpTask ? levelUpTask.name : guideOverGoal ? null : parkTripGoal?.ride_name}
                    nextRideOwned={levelUpTask ? true : !guideOverGoal && parkTripGoal?.coin_owned}
                    ownedGo={!!levelUpTask}
                    nextCoinKind={goalCoinKind(parkTripGoal?.task_id, tasks, completedTasks, archivedTasks)}
                    ownedGoalHint={levelUpHint ?? ownedGoalHint}
                    nearbyRideName={guideTask ? guideTask.name : guideOverGoal ? null : nearbySuggestion?.task.name}
                    nearbyReportedOpen={!guideOverGoal && !!nearbyReportedOpenRide}
                    nearbyHint={guideTask ? guideShelfHint(shelfGuide?.reason) : nearbyPick?.kind === 'coin' ? nearbyPick.hint : null}
                    parkResting={!guideTask && !guideOverGoal && nearbyPick?.kind === 'closed' ? nearbyPick : null}
                    ticketsNeeded={parkTripGoal && !parkTripGoal.coin_owned
                      ? tripGoalData?.wallet.tickets_needed ?? 0 : 0}
                    rescuePassAvailable={inThisPark && !!tripGoalData?.wallet.rescue_pass_available}
                    goalStale={tripGoalStale}
                    goalReportedDown={!guideOverGoal && !levelUpTask && goalReportedDown}
                    alternateRideName={alternateRide?.task.name}
                    secretMilestones={currentPark.completed_secret_tasks_count}
                    onGo={onGoNext}
                    goLabel={inThisPark ? 'GO' : 'PLAN'}
                    planned={!!nextCoinTask && guidePlan === nextCoinTask.id}
                    energy={canChooseGoal && coinLevels.open ? viewer?.energy ?? 0 : null}
                  />
                </View>
                <View
                  onLayout={event => { checklistOffset.current = event.nativeEvent.layout.y; }}
                  style={{ paddingHorizontal: 16, paddingBottom: shelfEndClearance }}
                >
                  {shownTab === 'rides' && permanentTasks.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ marginHorizontal: 18, marginBottom: -26, zIndex: 2 }}>
                        <Ribbon text={split.split ? 'Rides' : 'Coins'} />
                      </View>
                      <View style={shelfPanel}>
                        {shelfRows('normal', split.rides)}
                        {/* Secret coins: a "?" slot once coin levels open (rung 3). */}
                        {shownSecret.length > 0 && <View
                          onLayout={event => { secretShelfOffset.current = event.nativeEvent.layout.y; }}>
                          <Text style={{ fontFamily: 'Shark', color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 6 }}>
                            Secret coins
                          </Text>
                          {shelfRows('secret', shownSecret)}
                        </View>}
                        {/* The Rides tab's finish line: every ride earns the Ride Passport stamp. */}
                        {split.split && typeof currentPark.ride_passport_available === 'number' && currentPark.ride_passport_available > 0 &&
                          <Pressable disabled={!canChooseGoal} onPress={() => RootNavigation.navigate('StampBook')}
                            accessibilityRole={canChooseGoal ? 'button' : undefined}
                            accessibilityLabel={`Finish line: all ${currentPark.ride_passport_available} rides earn the Ride Passport stamp. ${currentPark.ride_passport_collected ?? 0} of ${currentPark.ride_passport_available} so far.`}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff8e4',
                              borderColor: '#ffcf3b', borderWidth: 2, borderRadius: 14, padding: 8, marginTop: 4 }}>
                            <Image source={require('../../assets/images/stamps/ride-passport-complete-v1.png')}
                              contentFit="contain" style={{ width: 40, height: 40,
                                opacity: (currentPark.ride_passport_collected ?? 0) >= currentPark.ride_passport_available ? 1 : 0.55 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontFamily: 'Shark', color: '#05346e', fontSize: 15 }}>
                                All {currentPark.ride_passport_available} rides: Ride Passport stamp
                              </Text>
                              <Text style={{ fontFamily: 'Knockout', color: '#3d5f8c', fontSize: 14 }}>
                                {(currentPark.ride_passport_collected ?? 0) >= currentPark.ride_passport_available
                                  ? 'Done! Claim it in your Stamp Book.'
                                  : `${currentPark.ride_passport_collected ?? 0} of ${currentPark.ride_passport_available} rides`}
                              </Text>
                            </View>
                          </Pressable>}
                        <View onLayout={event => { guideOffset.current = event.nativeEvent.layout.y; }}>
                          <ParkRideDirectory
                            rides={permanentTasks}
                            limited={allLimited}
                            catalogRides={catalogRides}
                            parkId={Number(park)}
                            completed={completedTasks}
                            isOwnPark={canChooseGoal}
                            goalTaskId={parkTripGoal?.task_id}
                            nearbyRideId={goalReportedDown ? alternateRide?.task.id : nearbySuggestion?.task.id}
                            nearbyRideReportedOpen={goalReportedDown ? !!alternateRide : !!nearbyReportedOpenRide}
                            savedGoalReportedDown={goalReportedDown}
                            rideTaskIds={currentPark.ride_passport_task_ids}
                            rideOnly={passportMode}
                            shelfCount={shelfCountLabel(totals)}
                            onChooseGoal={canChooseGoal
                              ? (taskId) => {
                                const task = [...permanentTasks, ...allLimited].find(item => item.id === taskId);
                                return task ? chooseNextCoin(task) : chooseTripGoal(taskId).then(() => undefined);
                              }
                              : undefined}
                            onShowOnMap={canChooseGoal && inThisPark
                              ? (task) => goToCoin(task, 'coin_guide') : undefined}
                            onPlayInLine={canChooseGoal && inThisPark ? openRideLinePlay : undefined}
                            onPlayRideInLine={canChooseGoal && inThisPark ? openCatalogRideLinePlay : undefined}
                          />
                        </View>
                      </View>
                    </View>
                  )}
                  {shownTab === 'sights' && split.sights.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ marginHorizontal: 18, marginBottom: -26, zIndex: 2 }}>
                        <Ribbon text="Sights" />
                      </View>
                      <View style={shelfPanel}>{shelfRows('normal', split.sights)}</View>
                    </View>
                  )}
                  {shownTab === 'limited' && limitedShelf.length > 0 && (
                    <View onLayout={event => { limitedShelfOffset.current = event.nativeEvent.layout.y; }}
                      style={{ marginBottom: 16 }}>
                      <View style={{ marginHorizontal: 18, marginBottom: -26, zIndex: 2 }}>
                        <Ribbon text="Limited Coins" />
                      </View>
                      <View style={shelfPanel}>{shelfRows('limited', limitedShelf)}</View>
                    </View>
                  )}
                  {shownTab === 'limited' && archivedTasks.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ marginHorizontal: 18, marginBottom: -26, zIndex: 2 }}>
                        <Ribbon text="Past events" />
                      </View>
                      <View style={shelfPanel}>{shelfRows('archived', archivedTasks)}</View>
                    </View>
                  )}
                  {/* The labeled trophy shelf: each trophy named, and the next one called out. */}
                  <View style={{
                    paddingBottom: 16,
                    backgroundColor: '#075d9c',
                    borderWidth: 2, borderColor: '#fff',
                    borderRadius: 18,
                    padding: 12,
                    marginBottom: 16,
                  }}>
                    <Text style={{ fontFamily: 'Shark', color: '#fff', fontSize: 18, textAlign: 'center' }}>Trophies</Text>
                    <Text style={{ fontFamily: 'Knockout', color: '#d8f1ff', fontSize: 15, textAlign: 'center', marginBottom: 4 }}>
                      {nextTrophyLine(currentPark.park_coins_count)}
                    </Text>
                    <Text style={{ fontFamily: 'Knockout', color: '#ffe07a', fontSize: 14, textAlign: 'center', marginBottom: 4 }}>
                      {TROPHY_HELP}
                    </Text>
                    <View
                      style={{
                        position: 'relative',
                        height: 205,
                      }}
                    >
                      <View
                        style={{
                          position: 'absolute',
                          zIndex: 10,
                          marginTop: 4,
                          flexDirection: 'row',
                          alignItems: 'flex-end',
                          width: '100%',
                          justifyContent: 'center',
                        }}
                      >
                        {([
                          { name: 'Silver', image: silver, at: 50, size: { width: 90, height: 95 }, align: 'flex-end' as const },
                          { name: 'Gold', image: gold, at: 100, size: { width: 100, height: 140 }, align: 'center' as const },
                          { name: 'Bronze', image: bronze, at: 12, size: { width: 70, height: 75 }, align: 'flex-start' as const },
                        ]).map(trophy => {
                          const unlocked = currentPark.park_coins_count >= trophy.at;
                          const isNext = trophyNext?.name === trophy.name;
                          return <View key={trophy.name} style={{ flex: 1, alignItems: trophy.align }}>
                            <ParkTrophyModal trophy={{ name: trophy.name, image: trophy.image, unlocked, unlockCount: trophy.at,
                              wins: currentPark.park_coins_count }}>
                              <View style={{ alignItems: 'center', marginHorizontal: 8 }}>
                                <Image source={trophy.image} style={{ ...trophy.size, opacity: unlocked ? 1 : 0.6 }} />
                                <View style={{ backgroundColor: unlocked ? '#ffcf3b' : isNext ? '#fff8e4' : '#cfe9f8',
                                  borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2, marginTop: 2 }}>
                                  <Text style={{ fontFamily: 'Shark', fontSize: 13, color: '#05346e' }}>
                                    {unlocked ? trophy.name : `${trophy.name} ${trophy.at}`}
                                  </Text>
                                </View>
                              </View>
                            </ParkTrophyModal>
                          </View>;
                        })}
                      </View>
                      <ParkShelfArtwork variant="normal" height={50} />
                    </View>
                  </View>
                  {/* Shops at this park: one tap to the same store as the map's store button (keeps its icon art). */}
                  {canChooseGoal && parkStores.length > 0 && <View style={{ backgroundColor: '#eaf9ff', borderColor: '#fff',
                    borderWidth: 2, borderRadius: 15, padding: 10, marginBottom: 16 }}>
                    <Text style={{ fontFamily: 'Shark', color: '#075a99', fontSize: 18, marginBottom: 6 }}>Shops at this park</Text>
                    {parkStores.map(store => <Pressable key={store.id} accessibilityRole="button"
                      accessibilityLabel={`Open ${store.name ?? 'this park shop'}`}
                      onPress={() => RootNavigation.navigate('Store', { store: store.id })}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',
                        borderColor: '#c5eafb', borderWidth: 2, borderRadius: 12, padding: 6, marginTop: 6,
                        transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                      <Image source={{ uri: store.icon_url }} style={{ width: 48, height: 52 }} contentFit="contain" />
                      <Text style={{ flex: 1, fontFamily: 'Shark', color: '#093e71', fontSize: 16 }} numberOfLines={1}>
                        {store.event?.title ?? store.name ?? 'Park shop'}
                      </Text>
                      <GameIcon name="arrow" size={22} />
                    </Pressable>)}
                  </View>}
                  {canChooseGoal && !storyTop && <ParkDayRecapCard parkId={Number(park)}
                    atPark={inThisPark} refreshVersion={refreshVersion} loadRecap={loadRecap} initialRecap={todayRecap} />}
                </View>
                </View>
              </ScrollView>
            )}
          </ImageBackground>
          {isFocused && arrival.target && arrivalSlot && earnedCoin && requestKey && closedKey !== requestKey && (
            <CoinShelfArrival key={requestKey} target={arrival.target} coinUrl={arrivalSlot.task.coin_url}
              rideName={arrivalSlot.task.name} firstCollection={earnedCoin.firstCollection}
              parkName={currentPark?.display_name ?? currentPark?.name}
              onLand={landArrival} onInspect={inspectArrival} onClose={closeArrival} />
          )}
          {isFocused && requestKey && closedKey !== requestKey && !loading &&
            (!arrivalSlot || arrival.failed) && <View style={{ position: 'absolute', bottom: 52, left: 20, right: 20,
              backgroundColor: '#075083', borderColor: '#A6DFF5', borderWidth: 2, borderRadius: 18, padding: 16 }}>
              <Text style={{ fontFamily: 'Shark', color: '#fff', textAlign: 'center', fontSize: 19 }}>Refresh your park to show this coin</Text>
              <Pressable accessibilityRole="button" onPress={() => { setRefreshVersion(value => value + 1); arrival.notifyLayout(); }}
                style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFD34B', borderRadius: 12, marginTop: 12 }}>
                <Text style={{ fontFamily: 'Shark', color: '#075083', fontSize: 17 }}>Retry shelf view</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={closeArrival} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'Knockout', color: '#DFF6FF', fontSize: 15 }}>Keep exploring this park</Text>
              </Pressable>
            </View>}
        </View>
      )}
    </Wrapper>
  );
}
