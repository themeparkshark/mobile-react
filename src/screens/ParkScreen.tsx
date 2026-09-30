import { Image } from 'expo-image';
import { goalCoinKind } from '../services/collection/nextCoinCopy';
import { chunk } from 'lodash';
import { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect, useIsFocused, useNavigation, type NavigationProp } from '@react-navigation/native';
import { ImageBackground, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import getWikiTimes, { type WikiLiveEntry } from '../api/endpoints/parks/queue-times/getWikiTimes';
import { loadParkShelf } from '../services/collection/parkShelfPrefetch';
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
import Wrapper from '../components/Wrapper';
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
import { prefetchRideCatalog, resolveRideContextOrOffline } from '../services/lineplay/resolveRide';
import useReducedGameMotion from '../hooks/useReducedGameMotion';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';

export default function ParkScreen({ route }: NativeStackScreenProps<ParamListBase, 'Park'>) {
  const { width } = useWindowDimensions();
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
  const [currentPark, setCurrentPark] = useState<ParkType>();
  const [archivedTasks, setArchivedTasks] = useState<TaskType[]>([]);
  const [tasks, setTasks] = useState<TaskType[]>([]);
  const [completedArchivedTasks, setCompletedArchivedTasks] = useState<
    TaskType[]
  >([]);
  const [secretTasks, setSecretTasks] = useState<SecretTaskType[]>([]);
  const [completedTasks, setCompletedTasks] = useState<TaskType[]>([]);
  const [completedSecretTasks, setCompletedSecretTasks] = useState<
    SecretTaskType[]
  >([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [progressStale, setProgressStale] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [waitSnapshot, setWaitSnapshot] = useState<{
    parkId: number; entries: WikiLiveEntry[]; checkedAt: number;
  } | null>(null);
  const [parkCoinUrl, setParkCoinUrl] = useState<string | null>(null);
  const [rideOnly, setRideOnly] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const checklistOffset = useRef(0);
  const guideOffset = useRef(0);
  const secretShelfOffset = useRef(0);
  const reducedMotion = useReducedGameMotion();
  useEffect(() => { setRideOnly(false); }, [park]);
  const { park: locationPark, location } = useContext(LocationContext);
  const { player: viewer } = useContext(AuthContext);
  const { labels } = useCrumbs();
  const { data: tripGoalData, stale: tripGoalStale, choose: chooseTripGoal } = useTripGoal();
  const canChooseGoal = viewer?.id === Number(player);
  const requestKey = canChooseGoal && isEarnedShelfArrival(earnedCoin)
    ? `${player}:${park}:${earnedCoin.attemptId}` : null;
  const arrivalSlot = requestKey && !loading && !progressStale ? resolveEarnedShelfSlot(earnedCoin, {
    normal: tasks, normalCompleted: completedTasks, secret: secretTasks, secretCompleted: completedSecretTasks,
    archived: archivedTasks, archivedCompleted: completedArchivedTasks,
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
  const landArrival = () => {
    setLandedKey(requestKey);
    if (openMastery) setTimeout(inspectArrival, reducedMotion ? 0 : 520);
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
    for (const [section, done] of [['normal', completedTasks], ['secret', completedSecretTasks], ['archived', completedArchivedTasks]] as const) {
      const task = (done as ReadonlyArray<TaskType | SecretTaskType>).find(item => item.asset_id === focusAssetId);
      if (task) return { section, task };
    }
    return null;
  })() : null;
  useEffect(() => {
    if (!focusSlot || !isFocused || requestKey || handledFocus.current === focusAssetId) return undefined;
    handledFocus.current = focusAssetId;
    const timer = setTimeout(() => {
      const content = contentRef.current;
      if (content) focusSlotRef.current?.measureLayout(content, (_x, y) => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 180), animated: !reducedMotion });
      }, () => undefined);
      setInspection({ section: focusSlot.section, taskId: focusSlot.task.id, key: Date.now() });
      navigation.setParams({ focusCoin: undefined });
    }, 250);
    return () => clearTimeout(timer);
  }, [focusSlot?.section, focusSlot?.task.id, isFocused, requestKey, focusAssetId, reducedMotion, navigation]);
  const parkTripGoal = canChooseGoal && tripGoalData?.goal?.park_id === Number(park)
    ? tripGoalData.goal : null;
  const goalPlan = parkTripGoal?.coin_owned ? tripGoalData?.goal_plan : null;
  const ownedGoalHint = goalPlan
    ? goalPlan.maxed ? 'Current max reached. Choose another ride coin.'
      : goalPlan.parts_needed === 0 && goalPlan.energy_needed === 0
        ? 'Upgrade ready. Open this coin on your shelf.'
        : `${goalPlan.parts_needed ?? 0} Parts for this coin · ${goalPlan.energy_needed} Energy to upgrade.`
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
  const freshWaitEntries = waitSnapshot?.parkId === Number(park) &&
    Date.now() - waitSnapshot.checkedAt < 120_000 ? waitSnapshot.entries : null;
  const goalReportedDown = !!(parkTripGoal && !parkTripGoal.coin_owned &&
    freshWaitEntries && reportedRideStatus(freshWaitEntries, Number(park), parkTripGoal.ride_name) === 'DOWN');
  const nearbyCoin = canChooseGoal && inThisPark && !parkTripGoal
    ? nearbyUncollectedRide(tasks, completedTasks, location,
      task => !freshWaitEntries || reportedRideStatus(freshWaitEntries, Number(park), task.name) !== 'DOWN') : null;
  const nearbyReportedOpenRide = canChooseGoal && inThisPark && !parkTripGoal && freshWaitEntries
    ? nearbyUncollectedRide(tasks, completedTasks, location,
      task => reportedRideStatus(freshWaitEntries, Number(park), task.name) === 'OPERATING') : null;
  const nearbySuggestion = nearbyReportedOpenRide ?? nearbyCoin;
  const alternateRide = goalReportedDown && freshWaitEntries
    ? nearbyUncollectedRide(tasks, completedTasks, location,
      task => reportedRideStatus(freshWaitEntries, Number(park), task.name) === 'OPERATING') : null;
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

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      try {
        const { visitedPark, available, secret, completed, completedSecret, archived, completedArchived } =
          await loadParkShelf(Number(park), Number(player));
        if (!active) return;
        setCurrentPark(visitedPark);
        setTasks(available);
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
    return () => { active = false; };
  }, [park, player, locationPark?.coin_url, refreshVersion]));

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
    const interval = setInterval(() => void refresh(), 60_000);
    return () => { active = false; clearInterval(interval); request?.abort(); };
  }, [park, canChooseGoal, inThisPark]));

  // One slot size for earned coins and empty sockets, so the shelf reads as one row.
  const coinSize = Math.min(60, shelfCoinSize);
  const shelfPanel = { backgroundColor: '#0768b9', borderWidth: 3, borderColor: '#fff', borderRadius: 20,
    paddingTop: 34, paddingHorizontal: 10, paddingBottom: 12, shadowColor: '#05346e', shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 } as const;
  const completedFor = (section: ShelfSection) => (section === 'secret' ? completedSecretTasks
    : section === 'archived' ? completedArchivedTasks : completedTasks) as ReadonlyArray<TaskType | SecretTaskType>;
  const rideKind = (taskId: number): 'ride' | 'coin' | undefined => currentPark?.ride_passport_task_ids?.length
    ? currentPark.ride_passport_task_ids.includes(taskId) ? 'ride' : 'coin' : undefined;
  const shelfRows = (section: ShelfSection, list: ReadonlyArray<TaskType | SecretTaskType>) => chunk(list, 5).map((row, rowIndex) => (
    <View key={rowIndex} style={{ paddingBottom: 14 }}>
      <View style={{ position: 'relative', height: coinSize + 43 }}>
        <ParkShelfArtwork variant={section} height={55} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', position: 'absolute', top: 4, width: '100%' }}>
          {row.map((task, index) => {
            const owned = completedFor(section).find(done => done.id === task.id);
            const arriving = matchesArrival(section, task.id);
            const hidden = arriving && !!arrival.target && landedKey !== requestKey;
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
                    level={owned.coin_level ?? null}
                    igniteKey={arriving && landedKey === requestKey ? requestKey ?? undefined : undefined}
                    onPlayInLine={section === 'normal' && canChooseGoal && inThisPark &&
                      currentPark?.ride_passport_task_ids?.includes(task.id)
                      ? () => openRideLinePlay(task as TaskType) : undefined}
                    timesCompleted={owned.times_completed ?? 0}
                    readOnly={!canChooseGoal}
                  />
                </View>
              ) : section === 'normal' ? (
                <UnfoundCoinModal task={task} size={coinSize} kind={rideKind(task.id)}
                  isGoal={parkTripGoal?.task_id === task.id}
                  onPlayInLine={canChooseGoal && inThisPark &&
                    currentPark?.ride_passport_task_ids?.includes(task.id)
                    ? () => openRideLinePlay(task as TaskType) : undefined}
                  onChooseGoal={canChooseGoal ? () => chooseTripGoal(task.id).then(() => undefined) : undefined}
                  onShowOnMap={canChooseGoal && inThisPark
                    ? () => RootNavigation.navigate('Explore', {
                      focusRide: { parkId: Number(park), task },
                    }) : undefined} />
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
      {loading && <Loading />}
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
                  ? 'Park progress could not refresh. Showing the last loaded view. Tap to retry.'
                  : 'Park progress could not load. Tap to retry.'}
              </Text>
            </Pressable>}
            {currentPark && tasks && secretTasks && (
              <ScrollView ref={scrollRef} scrollEnabled={!arrival.target} onContentSizeChange={arrival.notifyLayout}>
                <View ref={contentRef} collapsable={false}>
                <View style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
                  <ParkCollectionHeader
                    parkName={currentPark.display_name ?? currentPark.name}
                    isOwnPark={canChooseGoal}
                    collected={hasRideCoinProgress ? rideCoinsCollected : 0}
                    available={hasRideCoinProgress ? rideCoinsAvailable : 0}
                    completionRate={hasRideCoinProgress ? headlineRate : 0}
                    holdCount={!!arrival.target && landedKey !== requestKey && !!earnedCoin?.firstCollection}
                    tickKey={landedKey && landedKey === requestKey && earnedCoin?.firstCollection ? landedKey : null}
                    ridePassportCollected={currentPark.ride_passport_collected}
                    ridePassportAvailable={currentPark.ride_passport_available}
                    onOpenRidePassport={currentPark.ride_passport_task_ids?.length
                      ? () => {
                        setRideOnly(true);
                        scrollRef.current?.scrollTo({ y: checklistOffset.current + guideOffset.current, animated: !reducedMotion });
                      } : undefined}
                    onOpenStampBook={canChooseGoal ? () => RootNavigation.navigate('StampBook') : undefined}
                    onBrowseSecrets={secretTasks.length > 0 ? () => scrollRef.current?.scrollTo({
                      y: Math.max(0, checklistOffset.current + secretShelfOffset.current - 12), animated: !reducedMotion,
                    }) : undefined}
                    nextRideName={parkTripGoal?.ride_name}
                    nextRideOwned={parkTripGoal?.coin_owned}
                    nextCoinKind={goalCoinKind(parkTripGoal?.task_id, tasks, completedTasks, archivedTasks)}
                    ownedGoalHint={ownedGoalHint}
                    nearbyRideName={nearbySuggestion?.task.name}
                    nearbyReportedOpen={!!nearbyReportedOpenRide}
                    ticketsNeeded={parkTripGoal && !parkTripGoal.coin_owned
                      ? tripGoalData?.wallet.tickets_needed ?? 0 : 0}
                    rescuePassAvailable={inThisPark && !!tripGoalData?.wallet.rescue_pass_available}
                    goalStale={tripGoalStale}
                    goalReportedDown={goalReportedDown}
                    alternateRideName={alternateRide?.task.name}
                    secretMilestones={currentPark.completed_secret_tasks_count}
                  />
                </View>
                <View
                  onLayout={event => { checklistOffset.current = event.nativeEvent.layout.y; }}
                  style={{ paddingHorizontal: 16, paddingBottom: 32 }}
                >
                  {tasks.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ marginHorizontal: 18, marginBottom: -26, zIndex: 2 }}>
                        <Ribbon text={passportMode ? 'Ride Passport' : 'Ride Coins'} />
                      </View>
                      <View style={shelfPanel}>
                        {shelfRows('normal', passportMode
                          ? tasks.filter(task => currentPark.ride_passport_task_ids?.includes(task.id)) : tasks)}
                        <View onLayout={event => { guideOffset.current = event.nativeEvent.layout.y; }}>
                          <ParkRideDirectory
                            rides={tasks}
                            completed={completedTasks}
                            isOwnPark={canChooseGoal}
                            goalTaskId={parkTripGoal?.task_id}
                            nearbyRideId={goalReportedDown ? alternateRide?.task.id : nearbySuggestion?.task.id}
                            nearbyRideReportedOpen={goalReportedDown ? !!alternateRide : !!nearbyReportedOpenRide}
                            savedGoalReportedDown={goalReportedDown}
                            rideTaskIds={currentPark.ride_passport_task_ids}
                            rideOnly={passportMode}
                            onRideOnlyChange={setRideOnly}
                            onChooseGoal={canChooseGoal
                              ? (taskId) => chooseTripGoal(taskId).then(() => undefined)
                              : undefined}
                            onShowOnMap={canChooseGoal && inThisPark
                              ? (task) => RootNavigation.navigate('Explore', {
                                focusRide: { parkId: Number(park), task },
                              }) : undefined}
                            onPlayInLine={canChooseGoal && inThisPark ? openRideLinePlay : undefined}
                          />
                        </View>
                      </View>
                    </View>
                  )}
                  {secretTasks.length > 0 && (
                    <View onLayout={event => { secretShelfOffset.current = event.nativeEvent.layout.y; }}
                      style={{ marginBottom: 16 }}>
                      <View style={{ marginHorizontal: 18, marginBottom: -26, zIndex: 2 }}>
                        <Ribbon text={labels.secret_tasks || 'Secret Coins'} />
                      </View>
                      <View style={shelfPanel}>{shelfRows('secret', secretTasks)}</View>
                    </View>
                  )}
                  <View style={{
                    paddingBottom: 16,
                    backgroundColor: '#075d9c',
                    borderWidth: 2, borderColor: '#fff',
                    borderRadius: 18,
                    padding: 12,
                    marginBottom: 16,
                  }}>
                    <View
                      style={{
                        position: 'relative',
                        height: 185,
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
                        <View
                          style={{
                            flex: 1,
                            alignItems: 'flex-end',
                          }}
                        >
                          <ParkTrophyModal
                            trophy={{
                              name: 'Silver',
                              image: silver,
                              unlocked: currentPark.park_coins_count >= 50,
                              unlockCount: 50,
                            }}
                          >
                            <Image
                              source={silver}
                              style={{
                                width: 90,
                                height: 95,
                                opacity:
                                  currentPark.park_coins_count >= 50 ? 1 : 0.6,
                                marginRight: 16,
                              }}
                            />
                          </ParkTrophyModal>
                        </View>
                        <View
                          style={{
                            flex: 1,
                            alignItems: 'center',
                          }}
                        >
                          <ParkTrophyModal
                            trophy={{
                              name: 'Gold',
                              image: gold,
                              unlocked: currentPark.park_coins_count >= 100,
                              unlockCount: 100,
                            }}
                          >
                            <Image
                              source={gold}
                              style={{
                                width: 100,
                                height: 140,
                                opacity:
                                  currentPark.park_coins_count >= 100 ? 1 : 0.6,
                              }}
                            />
                          </ParkTrophyModal>
                        </View>
                        <View
                          style={{
                            flex: 1,
                            alignItems: 'flex-start',
                          }}
                        >
                          <ParkTrophyModal
                            trophy={{
                              name: 'Bronze',
                              image: bronze,
                              unlocked: currentPark.park_coins_count >= 12,
                              unlockCount: 12,
                            }}
                          >
                            <Image
                              source={bronze}
                              style={{
                                width: 70,
                                height: 75,
                                opacity:
                                  currentPark.park_coins_count >= 12 ? 1 : 0.6,
                                marginLeft: 16,
                              }}
                            />
                          </ParkTrophyModal>
                        </View>
                      </View>
                      <ParkShelfArtwork variant="normal" height={50} />
                    </View>
                  </View>
                  {canChooseGoal && <ParkDayRecapCard parkId={Number(park)}
                    atPark={locationPark?.id === Number(park)} refreshVersion={refreshVersion} />}
                  {archivedTasks.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ marginHorizontal: 18, marginBottom: -26, zIndex: 2 }}>
                        <Ribbon text={labels.archived_tasks || 'Past Event Coins'} />
                      </View>
                      <View style={shelfPanel}>{shelfRows('archived', archivedTasks)}</View>
                    </View>
                  )}
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
