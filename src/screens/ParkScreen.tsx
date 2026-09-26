import { Image } from 'expo-image';
import { chunk } from 'lodash';
import { useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ImageBackground, Pressable, ScrollView, Text, View } from 'react-native';
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

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';

export default function ParkScreen({ route }: NativeStackScreenProps<ParamListBase, 'Park'>) {
  const { park, player } = route.params as { park: number; player: number };
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
  useEffect(() => { setRideOnly(false); }, [park]);
  const { park: locationPark, location } = useContext(LocationContext);
  const { player: viewer } = useContext(AuthContext);
  const { labels } = useCrumbs();
  const { data: tripGoalData, stale: tripGoalStale, choose: chooseTripGoal } = useTripGoal();
  const canChooseGoal = viewer?.id === Number(player);
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
  const { startTutorial, hasCompleted } = useTutorial();
  
  // Trigger park tutorial on first visit
  useEffect(() => {
    if (!hasCompleted('park')) {
      const timer = setTimeout(() => startTutorial('park'), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

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
        <View
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
              <ScrollView ref={scrollRef}>
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
                        scrollRef.current?.scrollTo({ y: checklistOffset.current, animated: true });
                      } : undefined}
                    onOpenStampBook={canChooseGoal ? () => RootNavigation.navigate('StampBook') : undefined}
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
                      <Text style={{ fontFamily: 'Shark', color: '#fff',
                        fontSize: 19, textAlign: 'center', marginTop: 18,
                        marginBottom: 8 }}>
                        COIN SHELF
                      </Text>
                      {chunk(tasks, 5).map(
                        (tasks: TaskType[], index: number) => (
                          <View key={index} style={{ paddingBottom: 16 }}>
                            <View style={{ position: 'relative', height: 105 }}>
                              <Image
                                source={require('../../assets/images/screens/park/shelf.png')}
                                contentFit="contain"
                                style={{
                                  width: '100%',
                                  height: 55,
                                  bottom: 0,
                                  position: 'absolute',
                                }}
                              />
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
                                      <TaskCoinModal
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
                                    ) : (
                                      <UnfoundCoinModal task={task}
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
                        {labels.secret_tasks}
                      </Text>
                      {chunk(secretTasks, 5).map(
                        (secretTasks: SecretTaskType[], index: number) => (
                          <View key={index} style={{ paddingBottom: 16 }}>
                            <View style={{ position: 'relative', height: 105 }}>
                              <Image
                                source={require('../../assets/images/screens/park/secretshelf.png')}
                                contentFit="contain"
                                style={{
                                  width: '100%',
                                  height: 55,
                                  bottom: 0,
                                  position: 'absolute',
                                }}
                              />
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
                                      <TaskCoinModal
                                        task={secretTask}
                                        isSecretTask
                                        readOnly={!canChooseGoal}
                                        timesCompleted={completedSecretTasks.find(
                                          completed => completed.id === secretTask.id
                                        )?.times_completed}
                                      />
                                    ) : (
                                      <UnfoundCoinModal task={secretTask} isSecret />
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
                      <Image
                        source={require('../../assets/images/screens/park/shelf.png')}
                        contentFit="contain"
                        style={{
                          width: '100%',
                          height: 50,
                          bottom: 0,
                          position: 'absolute',
                        }}
                      />
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
                              <Image
                                source={require('../../assets/images/screens/park/archivedshelf.png')}
                                contentFit="contain"
                                style={{
                                  width: '100%',
                                  height: 55,
                                  bottom: 0,
                                  position: 'absolute',
                                }}
                              />
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
                                      <TaskCoinModal
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
                                    ) : (
                                      <UnfoundCoinModal task={archivedTask} isArchived />
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
              </ScrollView>
            )}
          </ImageBackground>
        </View>
      )}
    </Wrapper>
  );
}
