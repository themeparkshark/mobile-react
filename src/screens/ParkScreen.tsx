import { Image } from 'expo-image';
import { chunk } from 'lodash';
import { useContext, useState, useEffect } from 'react';
import { Animated, ImageBackground, Platform, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import { vsprintf } from 'sprintf-js';
import getArchivedTasks from '../api/endpoints/parks/getArchivedTasks';
import getSecretTasks from '../api/endpoints/parks/getSecretTasks';
import getTasks from '../api/endpoints/parks/getTasks';
import getCompletedArchivedTasks from '../api/endpoints/players/parks/getCompletedArchivedTasks';
import getCompletedSecretTasks from '../api/endpoints/players/parks/getCompletedSecretTasks';
import getCompletedTasks from '../api/endpoints/players/parks/getCompletedTasks';
import getVisitedPark from '../api/endpoints/players/visited-parks/getPark';
import InformationModal from '../components/InformationModal';
import Loading from '../components/Loading';
import ParkTrophyModal from '../components/ParkTrophyModal';
import Progress from '../components/Progress';
import TaskCoinModal from '../components/TaskCoinModal';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import config from '../config';
import { LocationContext } from '../context/LocationProvider';
import useCrumbs from '../hooks/useCrumbs';
import UnfoundCoinModal from '../components/UnfoundCoinModal';
import { useTutorial } from '../components/Tutorial';
import { InformationModalEnums } from '../models/information-modal-enums';
import { ParkType } from '../models/park-type';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';

import { LinearGradient } from 'expo-linear-gradient';

export default function ParkScreen({ route }) {
  const { park, player } = route.params;
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
  const [parkCoinUrl, setParkCoinUrl] = useState<string | null>(null);
  const { park: locationPark } = useContext(LocationContext);
  const { labels } = useCrumbs();
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

  useAsyncEffect(async () => {
    const visitedPark = await getVisitedPark(park, player);
    setCurrentPark(visitedPark);
    // Park coin URL: try locationPark from context (has coin_url from /me/current-park)
    if (locationPark?.coin_url) {
      setParkCoinUrl(locationPark.coin_url);
    }
    setTasks(await getTasks(park));
    setSecretTasks(await getSecretTasks(park));
    setCompletedTasks(await getCompletedTasks(park, player));
    setCompletedSecretTasks(await getCompletedSecretTasks(park, player));
    setArchivedTasks(await getArchivedTasks(park));
    setCompletedArchivedTasks(await getCompletedArchivedTasks(park, player));
    setLoading(false);
  }, []);

  return (
    <>
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
            {currentPark && tasks && secretTasks && (
              <ScrollView>
                <View
                  style={{
                    paddingTop: 24,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: 24,
                  }}
                >
                  {/* ── Progress + Stats ── */}
                  <View
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      borderRadius: 18,
                      padding: 16,
                    }}
                  >
                    {/* Completion % - big and bold */}
                    <Text
                      style={{
                        fontFamily: 'Shark',
                        fontSize: 36,
                        color: 'white',
                        textAlign: 'center',
                        textShadowColor: 'rgba(0,0,0,0.5)',
                        textShadowOffset: { width: 1, height: 2 },
                        textShadowRadius: 0,
                      }}
                    >
                      {Math.round(currentPark.completion_rate)}% Complete
                    </Text>

                    {/* Progress bar */}
                    <View
                      style={{
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: 'rgba(0,0,0,0.35)',
                        overflow: 'hidden',
                        marginTop: 10,
                        marginBottom: 6,
                        borderWidth: 2,
                        borderColor: 'rgba(255,255,255,0.15)',
                      }}
                    >
                      <LinearGradient
                        colors={
                          currentPark.completion_rate >= 100
                            ? ['#fbbf24', config.tertiary]
                            : ['#4ade80', '#22c55e']
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{
                          height: '100%',
                          width: `${Math.min(currentPark.completion_rate, 100)}%`,
                          borderRadius: 6,
                        }}
                      />
                    </View>

                    {/* Task count */}
                    <Text
                      style={{
                        fontFamily: 'Shark',
                        fontSize: 14,
                        color: 'rgba(255,255,255,0.7)',
                        textAlign: 'center',
                        marginBottom: 16,
                        textShadowColor: 'rgba(0,0,0,0.3)',
                        textShadowOffset: { width: 1, height: 1 },
                        textShadowRadius: 0,
                      }}
                    >
                      {currentPark.completed_tasks_count +
                        currentPark.completed_secret_tasks_count}{' '}
                      / {currentPark.tasks_count + currentPark.secret_tasks_count}{' '}
                      Tasks
                    </Text>

                    {/* Stats row */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {[
                        {
                          value: currentPark.park_coins_count,
                          label: 'Coins',
                          coinUrl: parkCoinUrl,
                          icon: require('../../assets/images/coingold.png'),
                          emoji: '🪙',
                        },
                        {
                          value: currentPark.completed_tasks_count,
                          label: 'Tasks',
                          coinUrl: null,
                          icon: null,
                          emoji: '⭐',
                        },
                        {
                          value: currentPark.completed_secret_tasks_count,
                          label: 'Secrets',
                          coinUrl: null,
                          icon: null,
                          emoji: '🔮',
                        },
                      ].map((stat) => (
                        <View
                          key={stat.label}
                          style={{
                            flex: 1,
                            backgroundColor: 'rgba(0,0,0,0.25)',
                            borderRadius: 14,
                            paddingVertical: 12,
                            alignItems: 'center',
                            borderWidth: 1.5,
                            borderColor: 'rgba(255,255,255,0.1)',
                          }}
                        >
                          {stat.icon && stat.coinUrl ? (
                            <Image
                              source={{ uri: stat.coinUrl }}
                              style={{ width: 26, height: 26, marginBottom: 4 }}
                              contentFit="contain"
                            />
                          ) : stat.icon && !stat.coinUrl ? (
                            <Image
                              source={stat.icon}
                              style={{ width: 26, height: 26, marginBottom: 4 }}
                              contentFit="contain"
                            />
                          ) : (
                            <Text style={{ fontSize: 20, marginBottom: 4 }}>{stat.emoji}</Text>
                          )}
                          <Text
                            style={{
                              fontFamily: 'Shark',
                              fontSize: 24,
                              color: 'white',
                              textShadowColor: 'rgba(0,0,0,0.5)',
                              textShadowOffset: { width: 1, height: 1 },
                              textShadowRadius: 0,
                            }}
                          >
                            {stat.value}
                          </Text>
                          <Text
                            style={{
                              fontFamily: 'Shark',
                              fontSize: 11,
                              color: 'rgba(255,255,255,0.6)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {stat.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
                <View
                  style={{
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: 32,
                  }}
                >
                  <View style={{
                    paddingBottom: 16,
                    backgroundColor: 'rgba(0,0,0,0.6)',
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
                  {secretTasks && secretTasks.length > 0 && (
                    <View style={{
                      backgroundColor: 'rgba(0,0,0,0.6)',
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
                                      paddingLeft: index === 0 ? 0 : 12,
                                    }}
                                  >
                                    {hasCompletedSecretTask(secretTask.id) ? (
                                      <TaskCoinModal
                                        task={secretTask}
                                        isSecretTask
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
                  {tasks && tasks.length > 0 && (
                    <View style={{
                      backgroundColor: 'rgba(0,0,0,0.6)',
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
                        {labels.tasks}
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
                                      paddingLeft: index === 0 ? 0 : 12,
                                    }}
                                  >
                                    {hasCompletedTask(task.id) ? (
                                      <TaskCoinModal
                                        task={task}
                                        timesCompleted={
                                          completedTasks.find(
                                            (completedTask) =>
                                              completedTask.id === task.id
                                          )?.times_completed ?? 0
                                        }
                                      />
                                    ) : (
                                      <UnfoundCoinModal task={task} />
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
                  {archivedTasks && archivedTasks.length > 0 && (
                    <View style={{
                      backgroundColor: 'rgba(0,0,0,0.6)',
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
                                      paddingLeft: index === 0 ? 0 : 12,
                                    }}
                                  >
                                    {hasCompletedArchivedTask(
                                      archivedTask.id
                                    ) ? (
                                      <TaskCoinModal
                                        task={archivedTask}
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
    </>
  );
}
