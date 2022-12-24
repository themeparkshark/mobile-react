import { useEffect, useState } from 'react';
import { ImageBackground, ScrollView, Text, View } from 'react-native';
import getPark from '../api/endpoints/parks/getPark';
import getTasks from '../api/endpoints/parks/getTasks';
import Topbar from '../components/Topbar';
import { ParkType } from '../models/park-type';
import { TaskType } from '../models/task-type';
import Progress from '../components/Progress';
import config from '../config/theme';
import { chunk } from 'lodash';

export default function ParkScreen({ route }) {
  const { park } = route.params;
  const [currentPark, setCurrentPark] = useState<ParkType>();
  const [tasks, setTasks] = useState<TaskType[]>();

  const completedTasks = tasks?.filter((task) => task.has_completed).length;

  useEffect(() => {
    getPark(park).then((response) => setCurrentPark(response));
    getTasks(park).then((response) => setTasks(response));
  }, []);

  return (
    <>
      <Topbar showBackButton={true} text={currentPark?.name} />
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
                  paddingLeft: 32,
                  paddingRight: 32,
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
                        textShadowOffset: {
                          width: -1,
                        },
                        textShadowColor: config.primary,
                        textShadowRadius: 5,
                      }}
                    >
                      {completedTasks} of {tasks.length} tasks complete - 100 park
                      coins earned
                    </Text>
                  </View>
                </View>
              </View>
              <View
                style={{
                  paddingTop: 32,
                  paddingBottom: 32,
                  paddingLeft: 32,
                  paddingRight: 32,
                  backgroundColor: 'rgba(255, 255, 255, .6)',
                }}
              >
                {chunk(tasks, 5).map((tasks: TaskType[], index: number) => {
                  return (
                    <View key={index} style={{ paddingBottom: 32 }}>
                      {tasks.map((task) => {
                        return (
                          <View>
                            <Text>Task name: {task.name}</Text>
                            <Text>Completed: {task.has_completed ? 'Yes' : 'No'}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </ImageBackground>
      </View>
    </>
  );
}
