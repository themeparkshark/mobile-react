import { useCallback, useEffect, useState } from 'react';
import { Image, ImageBackground, ScrollView, Text, View } from 'react-native';
import getPark from '../api/endpoints/parks/getPark';
import getTasks from '../api/endpoints/parks/getTasks';
import Topbar from '../components/Topbar';
import { ParkType } from '../models/park-type';
import { TaskType } from '../models/task-type';
import Progress from '../components/Progress';
import config from '../config/theme';
import { chunk } from 'lodash';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import Button from '../components/Button';
import * as RootNavigation from '../RootNavigation';
import {SecretTaskType} from '../models/secret-task-type';
import getSecretTasks from '../api/endpoints/parks/getSecretTasks';

export default function ParkScreen({ route }) {
  const { park } = route.params;
  const [currentPark, setCurrentPark] = useState<ParkType>();
  const [tasks, setTasks] = useState<TaskType[]>();
  const [secretTasks, setSecretTasks] = useState<SecretTaskType[]>();

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Park screen.');
    }, [])
  );

  useEffect(() => {
    getPark(park).then((response) => setCurrentPark(response));
    getTasks(park).then((response) => setTasks(response));
    getSecretTasks(park).then((response) => setSecretTasks(response));
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
                resizeMode: 'contain',
                alignSelf: 'center',
              }}
              source={require('../../assets/images/toolbar/leaderboard.png')}
            />
          </Button>
        }
      />
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
            <ScrollView
              style={{
                paddingTop: 32,
              }}
            >
              <View
                style={{
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
                        textShadowColor: config.primary,
                        textShadowRadius: 5,
                      }}
                    >
                      {currentPark.completed_tasks_count +
                        currentPark.completed_secret_tasks_count}{' '}
                      of {currentPark.tasks_count} tasks completed -{' '}
                      {currentPark.park_coins} park coins earned
                    </Text>
                  </View>
                </View>
              </View>
              <View
                style={{
                  paddingTop: 16,
                  paddingLeft: 16,
                  paddingRight: 16,
                }}
              >
                <View style={{ paddingBottom: 16 }}>
                  <View style={{ position: 'relative', height: 145 }}>
                    <Image
                      source={require('../../assets/images/screens/park/silver.png')}
                      style={{
                        width: 90,
                        height: 90,
                        zIndex: 15,
                        position: 'absolute',
                        left: 45,
                        top: 10,
                      }}
                    />
                    <Image
                      source={require('../../assets/images/screens/park/gold.png')}
                      style={{
                        width: 100,
                        height: 140,
                        zIndex: 15,
                        position: 'absolute',
                        left: 140,
                        top: -37,
                      }}
                    />
                    <Image
                      source={require('../../assets/images/screens/park/bronze.png')}
                      style={{
                        width: 70,
                        height: 75,
                        zIndex: 15,
                        position: 'absolute',
                        left: 250,
                        top: 25,
                      }}
                    />
                    <View
                      style={{
                        display: 'none',
                        position: 'absolute',
                        zIndex: 10,
                        width: '100%',
                        height: 100,
                      }}
                    >
                      <Image
                        source={require('../../assets/images/screens/park/placeholder.png')}
                        style={{
                          height: '100%',
                          width: '100%',
                        }}
                        resizeMode={'contain'}
                      />
                    </View>
                    <Image
                      source={require('../../assets/images/screens/park/trophyshelf.png')}
                      resizeMode="contain"
                      style={{
                        width: '100%',
                        height: 50,
                        bottom: 0,
                        position: 'absolute',
                      }}
                    />
                  </View>
                </View>
                {chunk(secretTasks, 6).map((secretTasks: SecretTaskType[], index: number) => (
                  <View key={index} style={{ paddingBottom: 16 }}>
                    <View style={{ position: 'relative', height: 95 }}>
                      <Image
                        source={require('../../assets/images/screens/park/secretshelf.png')}
                        resizeMode="contain"
                        style={{
                          width: '100%',
                          height: 50,
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
                            {secretTask.has_completed && (
                              <Image
                                source={{
                                  uri: secretTask.coin_url,
                                }}
                                style={{
                                  width: 53,
                                  height: 50,
                                  borderWidth: 2,
                                  borderColor: '#fff',
                                  borderRadius: 50,
                                }}
                              />
                            )}
                            {!secretTask.has_completed && (
                              <View
                                style={{
                                  width: 53,
                                  height: 50,
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
                {chunk(tasks, 6).map((tasks: TaskType[], index: number) => (
                  <View key={index} style={{ paddingBottom: 16 }}>
                    <View style={{ position: 'relative', height: 95 }}>
                      <Image
                        source={require('../../assets/images/screens/park/shelf.png')}
                        resizeMode="contain"
                        style={{
                          width: '100%',
                          height: 50,
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
                            {task.has_completed && (
                              <Image
                                source={{
                                  uri: task.coin_url,
                                }}
                                style={{
                                  width: 53,
                                  height: 50,
                                  borderWidth: 2,
                                  borderColor: '#fff',
                                  borderRadius: 50,
                                }}
                              />
                            )}
                            {!task.has_completed && (
                              <View
                                style={{
                                  width: 53,
                                  height: 50,
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
    </>
  );
}
