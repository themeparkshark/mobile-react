import { Image } from 'expo-image';
import { chunk } from 'lodash';
import { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect, useIsFocused, useNavigation, type NavigationProp } from '@react-navigation/native';
import { ImageBackground, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import getArchivedTasks from '../api/endpoints/parks/getArchivedTasks';
import getSecretTasks from '../api/endpoints/parks/getSecretTasks';
import getTasks from '../api/endpoints/parks/getTasks';
import getWikiTimes, { type WikiLiveEntry } from '../api/endpoints/parks/queue-times/getWikiTimes';
import getCompletedArchivedTasks from '../api/endpoints/players/parks/getCompletedArchivedTasks';
import getCompletedSecretTasks from '../api/endpoints/players/parks/getCompletedSecretTasks';
import getCompletedTasks from '../api/endpoints/players/parks/getCompletedTasks';
import getVisitedPark from '../api/endpoints/players/visited-parks/getPark';
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
  const { park, player, earnedCoin } = route.params as { park: number; player: number; earnedCoin?: EarnedShelfArrival };
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
  const coinShelfOffset = useRef(0);
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
  useEffect(() => {
    if (wasFocused.current && !isFocused && requestKey) {
      setClosedKey(requestKey);
      navigation.setParams({ earnedCoin: undefined });
    }
    wasFocused.current = isFocused;
  }, [isFocused, requestKey, navigation]);
  useEffect(() => { setInspection(null); }, [park, player]);
  useEffect(() => { if (!isFocused) setInspection(null); }, [isFocused]);
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

  const hasCompletedTask = (task: number) => {
    return completedTasks.find((completedTask) => completedTask.id === task);
  };

  const hasCompletedSecretTask = (secretTask: number) => {
    return completedSecretTasks.find(
      (completedSecretTask) => completedSecretTask.id === secretTask
    );
  };

  const hasCompletedArchivedTask = (task: number) => {
    return completedArchivedTasks.find(
      (archivedTask) => archivedTask.id === task
    );
  };

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
        const [visitedPark, available, secret, completed, completedSecret, archived, completedArchived] =
          await Promise.all([
            getVisitedPark(park, player), getTasks(park), getSecretTasks(park),
            getCompletedTasks(park, player), getCompletedSecretTasks(park, player),
            getArchivedTasks(park), getCompletedArchivedTasks(park, player),
          ]);
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
                <View
                  style={{
                    paddingTop: 24,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: 24,
                  }}
                >
                  <ParkCollectionHeader
                    parkName={currentPark.display_name ?? currentPark.name}
                    isOwnPark={canChooseGoal}
                    collected={hasRideCoinProgress ? rideCoinsCollected : 0}
                    available={hasRideCoinProgress ? rideCoinsAvailable : 0}
                    completionRate={hasRideCoinProgress ? headlineRate : 0}
                    ridePassportCollected={currentPark.ride_passport_collected}
                    ridePassportAvailable={currentPark.ride_passport_available}
                    onOpenRidePassport={currentPark.ride_passport_task_ids?.length
                      ? () => {
                        setRideOnly(true);
                        scrollRef.current?.scrollTo({ y: checklistOffset.current, animated: !reducedMotion });
                      } : undefined}
                    onOpenStampBook={canChooseGoal ? () => RootNavigation.navigate('StampBook') : undefined}
                    onBrowseCoins={tasks.length > 0 ? () => scrollRef.current?.scrollTo({
                      y: Math.max(0, checklistOffset.current + coinShelfOffset.current - 12), animated: !reducedMotion,
                    }) : undefined}
                    onBrowseSecrets={secretTasks.length > 0 ? () => scrollRef.current?.scrollTo({
                      y: Math.max(0, checklistOffset.current + secretShelfOffset.current - 12), animated: !reducedMotion,
                    }) : undefined}
                    nextRideName={parkTripGoal?.ride_name}
                    nextRideOwned={parkTripGoal?.coin_owned}
                    ownedGoalHint={ownedGoalHint}
                    nearbyRideName={nearbySuggestion?.task.name}
                    nearbyReportedOpen={!!nearbyReportedOpenRide}
                    ticketsNeeded={parkTripGoal && !parkTripGoal.coin_owned
                      ? tripGoalData?.wallet.tickets_needed ?? 0 : 0}
                    rescuePassAvailable={inThisPark && !!tripGoalData?.wallet.rescue_pass_available}
                    goalStale={tripGoalStale}
                    goalReportedDown={goalReportedDown}
                    alternateRideName={alternateRide?.task.name}
                    parkCoins={currentPark.park_coins_count}
                    taskMilestones={currentPark.completed_tasks_count}
                    secretMilestones={currentPark.completed_secret_tasks_count}
                  />
                </View>
                <View
                  onLayout={event => { checklistOffset.current = event.nativeEvent.layout.y; }}
                  style={{
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: 32,
                  }}
                >
                  {tasks && tasks.length > 0 && (
                    <View style={{
                      backgroundColor: '#075d9c',
                      borderWidth: 2, borderColor: '#fff',
                      borderRadius: 18,
                      padding: 12,
                      marginBottom: 16,
                    }}>
                      <Text
                        style={{
                          textAlign: 'center',
                          paddingBottom: 16,
                          fontFamily: 'Shark',
                          textTransform: 'uppercase',
                          fontSize: 28,
                          color: 'white',
                          textShadowColor: 'rgba(0, 0, 0, .5)',
                          textShadowOffset: {
                            width: 1,
                            height: 1,
                          },
                          textShadowRadius: 0,
                        }}
                      >
                        {passportMode ? 'RIDE PASSPORT CHECKLIST' : 'PARK COIN CHECKLIST'}
                      </Text>
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
                      <Text onLayout={event => { coinShelfOffset.current = event.nativeEvent.layout.y; }}
                        style={{ fontFamily: 'Shark', color: '#fff',
                        fontSize: 19, textAlign: 'center', marginTop: 18,
                        marginBottom: 8 }}>
                        COIN SHELF
                      </Text>
                      {chunk(tasks, 5).map(
                        (tasks: TaskType[], index: number) => (
                          <View key={index} style={{ paddingBottom: 16 }}>
                            <View style={{ position: 'relative', height: 105 }}>
                              <ParkShelfArtwork variant="normal" height={55} />
                              <View
                                style={{
                                  flexDirection: 'row',
                                  justifyContent: 'center',
                                  position: 'absolute',
                                  top: 0,
                                  width: '100%',
                                }}
                              >
                                {tasks.map((task, index) => (
                                  <View
                                    key={task.id}
                                    style={{
                                      paddingLeft: index === 0 ? 0 : 6,
                                      borderRadius: 12,
                                      borderWidth: parkTripGoal?.task_id === task.id ? 2 : 0,
                                      borderColor: '#fbbf24',
                                    }}
                                  >
                                    {hasCompletedTask(task.id) ? (
                                      <View collapsable={false}
                                        ref={matchesArrival('normal', task.id) ? slotRef : undefined}
                                        onLayout={matchesArrival('normal', task.id) ? arrival.notifyLayout : undefined}
                                        pointerEvents={matchesArrival('normal', task.id) && arrival.target && landedKey !== requestKey ? 'none' : 'auto'}
                                        style={{ width: Math.min(60, shelfCoinSize), height: Math.min(60, shelfCoinSize),
                                          opacity: matchesArrival('normal', task.id) && arrival.target && landedKey !== requestKey ? 0 : 1 }}>
                                      <TaskCoinModal
                                        openRequestKey={inspectionKey('normal', task.id)}
                                        size={Math.min(60, shelfCoinSize)}
                                        task={task}
                                        onPlayInLine={canChooseGoal && inThisPark &&
                                          currentPark.ride_passport_task_ids?.includes(task.id)
                                          ? () => openRideLinePlay(task) : undefined}
                                        timesCompleted={
                                          completedTasks.find(
                                            (completedTask) =>
                                              completedTask.id === task.id
                                          )?.times_completed ?? 0
                                        }
                                        readOnly={!canChooseGoal}
                                      />
                                      </View>
                                    ) : (
                                      <UnfoundCoinModal task={task} size={shelfCoinSize}
                                        onPlayInLine={canChooseGoal && inThisPark &&
                                          currentPark.ride_passport_task_ids?.includes(task.id)
                                          ? () => openRideLinePlay(task) : undefined}
                                        onChooseGoal={canChooseGoal ? () => chooseTripGoal(task.id).then(() => undefined) : undefined}
                                        onShowOnMap={canChooseGoal && inThisPark
                                          ? () => RootNavigation.navigate('Explore', {
                                            focusRide: { parkId: Number(park), task },
                                          }) : undefined} />
                                    )}
                                  </View>
                                ))}
                              </View>
                            </View>
                          </View>
                        )
                      )}
                    </View>
                  )}
                  {secretTasks && secretTasks.length > 0 && (
                    <View onLayout={event => { secretShelfOffset.current = event.nativeEvent.layout.y; }} style={{
                      backgroundColor: '#075d9c',
                      borderWidth: 2, borderColor: '#fff',
                      borderRadius: 18,
                      padding: 12,
                      marginBottom: 16,
                    }}>
                      <Text
                        style={{
                          textAlign: 'center',
                          paddingBottom: 16,
                          fontFamily: 'Shark',
                          textTransform: 'uppercase',
                          fontSize: 28,
                          color: 'white',
                          textShadowColor: 'rgba(0, 0, 0, .5)',
                          textShadowOffset: {
                            width: 1,
                            height: 1,
                          },
                          textShadowRadius: 0,
                        }}
                      >
                        {labels.secret_tasks}
                      </Text>
                      {chunk(secretTasks, 5).map(
                        (secretTasks: SecretTaskType[], index: number) => (
                          <View key={index} style={{ paddingBottom: 16 }}>
                            <View style={{ position: 'relative', height: 105 }}>
                              <ParkShelfArtwork variant="secret" height={55} />
                              <View
                                style={{
                                  flexDirection: 'row',
                                  justifyContent: 'center',
                                  position: 'absolute',
                                  top: 0,
                                  width: '100%',
                                }}
                              >
                                {secretTasks.map((secretTask, index) => (
                                  <View
                                    key={secretTask.id}
                                    style={{
                                      paddingLeft: index === 0 ? 0 : 6,
                                    }}
                                  >
                                    {hasCompletedSecretTask(secretTask.id) ? (
                                      <View collapsable={false}
                                        ref={matchesArrival('secret', secretTask.id) ? slotRef : undefined}
                                        onLayout={matchesArrival('secret', secretTask.id) ? arrival.notifyLayout : undefined}
                                        pointerEvents={matchesArrival('secret', secretTask.id) && arrival.target && landedKey !== requestKey ? 'none' : 'auto'}
                                        style={{ width: Math.min(60, shelfCoinSize), height: Math.min(60, shelfCoinSize),
                                          opacity: matchesArrival('secret', secretTask.id) && arrival.target && landedKey !== requestKey ? 0 : 1 }}>
                                      <TaskCoinModal
                                        openRequestKey={inspectionKey('secret', secretTask.id)}
                                        size={Math.min(60, shelfCoinSize)}
                                        task={secretTask}
                                        isSecretTask
                                        readOnly={!canChooseGoal}
                                        timesCompleted={completedSecretTasks.find(
                                          completed => completed.id === secretTask.id
                                        )?.times_completed}
                                      />
                                      </View>
                                    ) : (
                                      <UnfoundCoinModal task={secretTask} isSecret size={shelfCoinSize} />
                                    )}
                                  </View>
                                ))}
                              </View>
                            </View>
                          </View>
                        )
                      )}
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
                  {archivedTasks && archivedTasks.length > 0 && (
                    <View style={{
                      backgroundColor: '#075d9c',
                      borderWidth: 2, borderColor: '#fff',
                      borderRadius: 18,
                      padding: 12,
                      marginBottom: 16,
                    }}>
                      <Text
                        style={{
                          textAlign: 'center',
                          paddingBottom: 16,
                          fontFamily: 'Shark',
                          textTransform: 'uppercase',
                          fontSize: 28,
                          color: 'white',
                          textShadowColor: 'rgba(0, 0, 0, .5)',
                          textShadowOffset: {
                            width: 1,
                            height: 1,
                          },
                          textShadowRadius: 0,
                        }}
                      >
                        {labels.archived_tasks}
                      </Text>
                      {chunk(archivedTasks, 5).map(
                        (rowTasks: TaskType[], rowIndex: number) => (
                          <View key={rowIndex} style={{ paddingBottom: 16 }}>
                            <View style={{ position: 'relative', height: 105 }}>
                              <ParkShelfArtwork variant="archived" height={55} />
                              <View
                                style={{
                                  flexDirection: 'row',
                                  justifyContent: 'center',
                                  position: 'absolute',
                                  top: 0,
                                  width: '100%',
                                }}
                              >
                                {rowTasks.map((archivedTask, index) => (
                                  <View
                                    key={archivedTask.id}
                                    style={{
                                      paddingLeft: index === 0 ? 0 : 6,
                                    }}
                                  >
                                    {hasCompletedArchivedTask(
                                      archivedTask.id
                                    ) ? (
                                      <View collapsable={false}
                                        ref={matchesArrival('archived', archivedTask.id) ? slotRef : undefined}
                                        onLayout={matchesArrival('archived', archivedTask.id) ? arrival.notifyLayout : undefined}
                                        pointerEvents={matchesArrival('archived', archivedTask.id) && arrival.target && landedKey !== requestKey ? 'none' : 'auto'}
                                        style={{ width: Math.min(60, shelfCoinSize), height: Math.min(60, shelfCoinSize),
                                          opacity: matchesArrival('archived', archivedTask.id) && arrival.target && landedKey !== requestKey ? 0 : 1 }}>
                                      <TaskCoinModal
                                        openRequestKey={inspectionKey('archived', archivedTask.id)}
                                        size={Math.min(60, shelfCoinSize)}
                                        task={archivedTask}
                                        readOnly={!canChooseGoal}
                                        timesCompleted={
                                          completedArchivedTasks.find(
                                            (completedTask) =>
                                              completedTask.id ===
                                              archivedTask.id
                                          )?.times_completed ?? 0
                                        }
                                      />
                                      </View>
                                    ) : (
                                      <UnfoundCoinModal task={archivedTask} isArchived size={shelfCoinSize} />
                                    )}
                                  </View>
                                ))}
                              </View>
                            </View>
                          </View>
                        )
                      )}
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
              onLand={() => setLandedKey(requestKey)} onInspect={inspectArrival} onClose={closeArrival} />
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
