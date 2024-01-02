import { Image } from 'expo-image';
import { chunk } from 'lodash';
import { useState } from 'react';
import { ImageBackground, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import { vsprintf } from 'sprintf-js';
import getArchivedTasks from '../api/endpoints/players/parks/getArchivedTasks';
import getSecretTasks from '../api/endpoints/players/parks/getSecretTasks';
import getTasks from '../api/endpoints/players/parks/getTasks';
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
import useCrumbs from '../hooks/useCrumbs';
import { InformationModalEnums } from '../models/information-modal-enums';
import { ParkType } from '../models/park-type';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import ParkItemModal from "../components/ParkItemModal";

export default function ParkScreen({ route }) {
  const { park, player } = route.params;
  const [currentPark, setCurrentPark] = useState<ParkType>();
  const [archivedTasks, setArchivedTasks] = useState<TaskType[]>([]);
  const [tasks, setTasks] = useState<TaskType[]>([]);
  const [secretTasks, setSecretTasks] = useState<SecretTaskType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { labels } = useCrumbs();

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
    setCurrentPark(await getVisitedPark(park, player));
    setTasks(await getTasks(park, player));
    setSecretTasks(await getSecretTasks(park, player));
    setArchivedTasks(await getArchivedTasks(park, player));
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
                      marginBottom: 16,
                      columnGap: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                      }}
                    >
                      <Image
                        source={{
                          uri: currentPark.image_url,
                        }}
                        style={{
                          borderColor: 'white',
                          borderWidth: 3,
                          borderRadius: 10,
                          height: 88,
                          width: '100%',
                        }}
                        contentFit="cover"
                      />
                    </View>
                    {currentPark.completion_item && (
                      <View
                        style={{
                          width: 100,
                        }}
                      >
                        <ImageBackground
                          source={require('../../assets/images/screens/store/gradient.png')}
                          resizeMode="cover"
                          style={{
                            borderColor: 'white',
                            borderWidth: 3,
                            borderRadius: 10,
                            overflow: 'hidden',
                            flex: 1,
                          }}
                        >
                          <View
                            style={{
                              padding: 10,
                              justifyContent: 'center',
                              flex: 1,
                            }}
                          >
                            <ParkItemModal item={currentPark.completion_item}>
                              {currentPark.completion_item.item_type.id === 4 ? (
                                <ImageBackground
                                  source={require('../../assets/images/screens/inventory/shark.png')}
                                  style={{
                                    aspectRatio: 1 / 0.8,
                                  }}
                                >
                                  <Image
                                    source={currentPark.completion_item.paper_url}
                                    style={{
                                      aspectRatio: 1 / 0.8,
                                    }}
                                    contentFit="cover"
                                  />
                                </ImageBackground>
                              ) : (
                                <Image
                                  source={currentPark.completion_item.icon_url}
                                  style={{
                                    width: 80,
                                    aspectRatio: 1 / 0.8,
                                  }}
                                  contentFit="contain"
                                />
                              )}
                            </ParkItemModal>
                          </View>
                        </ImageBackground>
                      </View>
                    )}
                  </View>
                  <View
                    style={{
                      backgroundColor: config.secondary,
                      borderColor: 'white',
                      borderWidth: 3,
                      borderRadius: 10,
                      padding: 8,
                    }}
                  >
                    <Progress progress={currentPark.completion_rate} />
                    <View
                      style={{
                        paddingTop: 8,
                        rowGap: 4,
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
                        {vsprintf(labels.park_completion_rate, [
                          currentPark.completion_rate,
                        ])}
                      </Text>
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
                        ])}
                      </Text>
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
                        {vsprintf(labels.park_coins, [
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
                                    {secretTask.has_completed ? (
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
                                    {task.has_completed ? (
                                      <TaskCoinModal
                                        task={task}
                                        timesCompleted={
                                          task.times_completed ?? 0
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
                                    {archivedTask.has_completed ? (
                                      <TaskCoinModal
                                        task={archivedTask}
                                        timesCompleted={
                                          archivedTask.times_completed ?? 0
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
