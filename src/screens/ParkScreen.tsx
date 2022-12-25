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

export default function ParkScreen({ route }) {
  const { park } = route.params;
  const [currentPark, setCurrentPark] = useState<ParkType>();
  const [tasks, setTasks] = useState<TaskType[]>();

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Park screen.');
    }, [])
  );

  useEffect(() => {
    getPark(park).then((response) => setCurrentPark(response));
    getTasks(park).then((response) => setTasks(response));
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
          {currentPark && tasks && (
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
                      of {currentPark.tasks_count} tasks complete -{' '}
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
                  <View style={{ position: 'relative', height: 95 }}>
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
