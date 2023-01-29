import { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { ImageBackground, ScrollView, Text, View } from 'react-native';
import Topbar from '../components/Topbar';
import { ParkType } from '../models/park-type';
import { TaskType } from '../models/task-type';
import Progress from '../components/Progress';
import config from '../config';
import { chunk } from 'lodash';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import Button from '../components/Button';
import * as RootNavigation from '../RootNavigation';
import { SecretTaskType } from '../models/secret-task-type';
import Loading from '../components/Loading';
import TaskCoinModal from '../components/TaskCoinModal';
import getVisitedPark from '../api/endpoints/users/visited-parks/getPark';
import getCompletedTasks from '../api/endpoints/users/parks/getCompletedTasks';
import getSecretTasks from '../api/endpoints/parks/getSecretTasks';
import getTasks from '../api/endpoints/parks/getTasks';
import getCompletedSecretTasks from '../api/endpoints/users/parks/getCompletedSecretTasks';

export default function ParkScreen({ route }) {
  const { park, user } = route.params;
  const [currentPark, setCurrentPark] = useState<ParkType>();
  const [tasks, setTasks] = useState<TaskType[]>([]);
  const [secretTasks, setSecretTasks] = useState<SecretTaskType[]>([]);
  const [completedTasks, setCompletedTasks] = useState<TaskType[]>([]);
  const [completedSecretTasks, setCompletedSecretTasks] = useState<
    SecretTaskType[]
  >([]);
  const [loading, setLoading] = useState<boolean>(true);

  const hasCompletedTask = (task: number) => {
    return completedTasks.find((completedTask) => completedTask.id === task);
  };

  const hasCompletedSecretTask = (secretTask: number) => {
    return completedSecretTasks.find(
      (completedSecretTask) => completedSecretTask.id === secretTask
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

  useFocusEffect(
    useCallback(() => {
      recordActivity(
        `Viewed the Park screen${user ? ` for ${user.username}.` : '.'}`
      );
    }, [])
  );

  useEffect(() => {
    (async () => {
      setCurrentPark(await getVisitedPark(park, user));
      setTasks(await getTasks(park));
      setSecretTasks(await getSecretTasks(park));
      setCompletedTasks(await getCompletedTasks(park, user));
      setCompletedSecretTasks(await getCompletedSecretTasks(park, user));
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <Topbar
        showBackButton={true}
        text={currentPark?.name}
        button={
          <Button
            onPress={() => {
              RootNavigation.navigate('Leaderboard', {
                park: currentPark?.id,
              });
            }}
          >
            <Image
              style={{
                width: 50,
                height: 50,
                alignSelf: 'center',
              }}
              contentFit="contain"
              source={require('../../assets/images/toolbar/leaderboard.png')}
            />
          </Button>
        }
      />
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
                            width: 2,
                            height: 2,
                          },
                          textShadowRadius: 0,
                        }}
                      >
                        {currentPark.completed_tasks_count +
                          currentPark.completed_secret_tasks_count}{' '}
                        of{' '}
                        {currentPark.tasks_count +
                          currentPark.secret_tasks_count}{' '}
                        tasks completed - {currentPark.park_coins_count} park
                        coins earned
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
                    <View style={{ position: 'relative', height: 185 }}>
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
                        <Image
                          source={silver}
                          style={{
                            width: 90,
                            height: 95,
                            opacity:
                              currentPark.park_coins_count >= 50 ? 1 : 0.6,
                          }}
                        />
                        <Image
                          source={gold}
                          style={{
                            width: 100,
                            height: 140,
                            marginLeft: 16,
                            opacity:
                              currentPark.park_coins_count >= 100 ? 1 : 0.6,
                          }}
                        />
                        <Image
                          source={bronze}
                          style={{
                            width: 70,
                            height: 75,
                            marginLeft: 16,
                            opacity:
                              currentPark.park_coins_count >= 12 ? 1 : 0.6,
                          }}
                        />
                      </View>
                      <Image
                        source={require('../../assets/images/screens/park/trophyshelf.png')}
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
                                  <TaskCoinModal task={secretTask} />
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
                  {chunk(tasks, 5).map((tasks: TaskType[], index: number) => (
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
                                <TaskCoinModal task={task} />
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
                  ))}
                </View>
              </ScrollView>
            )}
          </ImageBackground>
        </View>
      )}
    </>
  );
}
