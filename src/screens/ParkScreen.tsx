import { Image } from 'expo-image';
import { chunk } from 'lodash';
import { useState } from 'react';
import { ImageBackground, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import { vsprintf } from 'sprintf-js';
import getArchivedTasks from '../api/endpoints/parks/getArchivedTasks';
import getSecretTasks from '../api/endpoints/parks/getSecretTasks';
import getTasks from '../api/endpoints/parks/getTasks';
import getCompletedArchivedTasks from '../api/endpoints/users/parks/getCompletedArchivedTasks';
import getCompletedSecretTasks from '../api/endpoints/users/parks/getCompletedSecretTasks';
import getCompletedTasks from '../api/endpoints/users/parks/getCompletedTasks';
import getVisitedPark from '../api/endpoints/users/visited-parks/getPark';
import InformationModal from '../components/InformationModal';
import Loading from '../components/Loading';
import ParkTrophyModal from '../components/ParkTrophyModal';
import Progress from '../components/Progress';
import TaskCoinModal from '../components/TaskCoinModal';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import config from '../config';
import useCrumbs from '../hooks/useCrumbs';
import { InformationModalEnums } from '../models/information-modal-enums';
import { ParkType } from '../models/park-type';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';

export default function ParkScreen({ route }) {
  const { park, user } = route.params;
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
    setCurrentPark(await getVisitedPark(park, user));
    setTasks(await getTasks(park));
    setSecretTasks(await getSecretTasks(park));
    setCompletedTasks(await getCompletedTasks(park, user));
    setCompletedSecretTasks(await getCompletedSecretTasks(park, user));
    setArchivedTasks(await getArchivedTasks(park));
    setCompletedArchivedTasks(await getCompletedArchivedTasks(park, user));
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
                    paddingTop: 32,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: 32,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: config.secondary,
                      borderColor: 'white',
                      borderWidth: 3,
                      borderRadius: 10,
                    }}
                  >
                    <View
                      style={{
                        padding: 8,
                      }}
                    >
                      <Progress progress={currentPark.completion_rate} />
                    </View>
                    <View
                      style={{
                        padding: 8,
                        borderTopColor: config.primary,
                        borderTopWidth: 3,
                      }}
                    >
                      <Text
                        style={{
                          color: 'white',
                          fontSize: 16,
                          textAlign: 'center',
                          fontFamily: 'Knockout',
                          textTransform: 'uppercase',
                          textShadowColor: 'rgba(0, 0, 0, .5)',
                          textShadowOffset: {
                            width: 1,
                            height: 1,
                          },
                          textShadowRadius: 0,
                        }}
                      >
                        {vsprintf(labels.park_tasks, [
                          currentPark.completed_tasks_count +
                            currentPark.completed_secret_tasks_count,
                          currentPark.tasks_count +
                            currentPark.secret_tasks_count,
                          currentPark.park_coins_count,
                          `coin${
                            currentPark.park_coins_count === 1 ? '' : 's'
                          }`,
                        ])}
                      </Text>
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
                                          backgroundColor: 'rgba(0, 0, 0, .5)',
                                          borderRadius: 50,
                                        }}
                                      />
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
                                          backgroundColor: 'rgba(0, 0, 0, .5)',
                                          borderRadius: 50,
                                        }}
                                      />
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
                                          backgroundColor: 'rgba(0, 0, 0, .5)',
                                          borderRadius: 50,
                                        }}
                                      />
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
