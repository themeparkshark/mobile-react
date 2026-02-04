import { Image } from 'expo-image';
import { chunk } from 'lodash';
import { useContext, useState } from 'react';
import { ImageBackground, Platform, ScrollView, Text, View } from 'react-native';
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
import { InformationModalEnums } from '../models/information-modal-enums';
import { ParkType } from '../models/park-type';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';

// Temp: View shim for LinearGradient until dev client is rebuilt with expo-linear-gradient
const LinearGradient = ({ colors, style, children, start, end, ...rest }: any) => (
  <View style={[style, { backgroundColor: colors?.[0] }]} {...rest}>{children}</View>
);

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
            source={require('../../assets/images/screens/park/background.png')}
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
                  {/* ── Progress + Stats (Supercell-inspired) ── */}
                  <View style={{ overflow: 'hidden', borderRadius: 18 }}>
                    <LinearGradient
                      colors={['#1a3a5c', '#0d1f33']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={{
                        borderRadius: 18,
                        borderWidth: 3,
                        borderColor: '#3b82f6',
                        ...(Platform.OS === 'ios' ? {
                          shadowColor: '#3b82f6',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.4,
                          shadowRadius: 12,
                        } : {}),
                      }}
                    >
                      {/* ── Completion header band ── */}
                      <LinearGradient
                        colors={currentPark.completion_rate >= 100 ? ['#f59e0b', '#d97706'] : ['#2563eb', '#1d4ed8']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        {/* Chunky progress bar */}
                        <View style={{ flex: 1 }}>
                          <View style={{
                            height: 18, borderRadius: 9,
                            backgroundColor: 'rgba(0,0,0,0.4)',
                            overflow: 'hidden',
                            borderWidth: 2,
                            borderColor: 'rgba(255,255,255,0.25)',
                          }}>
                            <LinearGradient
                              colors={currentPark.completion_rate >= 100 ? ['#fbbf24', '#f59e0b'] : ['#4ade80', '#22c55e']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={{
                                height: '100%',
                                width: `${Math.min(currentPark.completion_rate, 100)}%`,
                                borderRadius: 7,
                              }}
                            />
                            {/* Centered text on bar */}
                            <Text style={{
                              position: 'absolute',
                              width: '100%',
                              textAlign: 'center',
                              fontFamily: 'Shark',
                              fontSize: 11,
                              color: 'white',
                              lineHeight: 14,
                              top: 0,
                              textShadowColor: 'rgba(0,0,0,0.8)',
                              textShadowOffset: { width: 1, height: 1 },
                              textShadowRadius: 0,
                            }}>
                              {currentPark.completed_tasks_count + currentPark.completed_secret_tasks_count}/{currentPark.tasks_count + currentPark.secret_tasks_count}
                            </Text>
                          </View>
                        </View>
                        {/* Completion % badge */}
                        <View style={{
                          backgroundColor: 'rgba(0,0,0,0.35)',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderWidth: 2,
                          borderColor: 'rgba(255,255,255,0.2)',
                        }}>
                          <Text style={{
                            fontFamily: 'Shark', fontSize: 16,
                            color: 'white',
                            textShadowColor: 'rgba(0,0,0,0.5)',
                            textShadowOffset: { width: 1, height: 1 },
                            textShadowRadius: 0,
                          }}>
                            {Math.round(currentPark.completion_rate)}%
                          </Text>
                        </View>
                      </LinearGradient>

                      {/* ── Stats row ── */}
                      <View style={{ flexDirection: 'row', padding: 10, gap: 8 }}>
                        {[
                          {
                            value: currentPark.park_coins_count,
                            label: 'Coins',
                            coinUrl: parkCoinUrl,
                            emoji: '🪙',
                            colors: ['#065f46', '#064e3b'] as [string, string],
                            borderColor: '#10b981',
                          },
                          {
                            value: currentPark.completed_tasks_count,
                            label: 'Tasks',
                            coinUrl: null,
                            emoji: '⭐',
                            colors: ['#7c2d12', '#6b2107'] as [string, string],
                            borderColor: '#f97316',
                          },
                          {
                            value: currentPark.completed_secret_tasks_count,
                            label: 'Secrets',
                            coinUrl: null,
                            emoji: '🔮',
                            colors: ['#4c1d95', '#3b0f7a'] as [string, string],
                            borderColor: '#8b5cf6',
                          },
                        ].map((stat) => (
                          <View key={stat.label} style={{ flex: 1, overflow: 'hidden', borderRadius: 12 }}>
                            <LinearGradient
                              colors={stat.colors}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 0, y: 1 }}
                              style={{
                                alignItems: 'center',
                                paddingVertical: 10,
                                borderRadius: 12,
                                borderWidth: 2,
                                borderColor: stat.borderColor,
                              }}
                            >
                              {stat.coinUrl ? (
                                <Image
                                  source={stat.coinUrl}
                                  style={{ width: 28, height: 28, borderRadius: 14, marginBottom: 2 }}
                                  contentFit="contain"
                                />
                              ) : (
                                <Text style={{ fontSize: 18, marginBottom: 2 }}>{stat.emoji}</Text>
                              )}
                              <Text style={{
                                fontFamily: 'Shark', fontSize: 24, color: 'white',
                                textShadowColor: 'rgba(0,0,0,0.8)',
                                textShadowOffset: { width: 2, height: 2 },
                                textShadowRadius: 0,
                              }}>
                                {stat.value}
                              </Text>
                              <Text style={{
                                fontFamily: 'Knockout', fontSize: 10,
                                color: 'rgba(255,255,255,0.7)',
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                              }}>
                                {stat.label}
                              </Text>
                            </LinearGradient>
                          </View>
                        ))}
                      </View>
                    </LinearGradient>
                  </View>
                </View>
                <View
                  style={{
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: 32,
                  }}
                >
                  <View style={{ paddingBottom: 16 }}>
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
                    <>
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
                                      <View
                                        style={{
                                          width: 60,
                                          height: 60,
                                          backgroundColor: 'rgba(0, 0, 0, .4)',
                                          borderRadius: 30,
                                          borderWidth: 2,
                                          borderColor: 'rgba(168,130,255,0.15)',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        <Text style={{
                                          fontSize: 22,
                                          color: 'rgba(168,130,255,0.2)',
                                          fontFamily: 'Shark',
                                        }}>?</Text>
                                      </View>
                                    )}
                                  </View>
                                ))}
                              </View>
                            </View>
                          </View>
                        )
                      )}
                    </>
                  )}
                  {tasks && tasks.length > 0 && (
                    <>
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
                                      <View
                                        style={{
                                          width: 60,
                                          height: 60,
                                          backgroundColor: 'rgba(0, 0, 0, .4)',
                                          borderRadius: 30,
                                          borderWidth: 2,
                                          borderColor: 'rgba(255,255,255,0.08)',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        <Text style={{
                                          fontSize: 22,
                                          color: 'rgba(255,255,255,0.15)',
                                          fontFamily: 'Shark',
                                        }}>?</Text>
                                      </View>
                                    )}
                                  </View>
                                ))}
                              </View>
                            </View>
                          </View>
                        )
                      )}
                    </>
                  )}
                  {archivedTasks && archivedTasks.length > 0 && (
                    <>
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
                        (tasks: TaskType[], index: number) => (
                          <View key={index} style={{ paddingBottom: 16 }}>
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
                                {archivedTasks.map((archivedTask, index) => (
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
                                      <View
                                        style={{
                                          width: 60,
                                          height: 60,
                                          backgroundColor: 'rgba(0, 0, 0, .4)',
                                          borderRadius: 30,
                                          borderWidth: 2,
                                          borderColor: 'rgba(255,255,255,0.08)',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        <Text style={{
                                          fontSize: 22,
                                          color: 'rgba(255,255,255,0.15)',
                                          fontFamily: 'Shark',
                                        }}>?</Text>
                                      </View>
                                    )}
                                  </View>
                                ))}
                              </View>
                            </View>
                          </View>
                        )
                      )}
                    </>
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
