import { useEffect, useState } from 'react';
import { ImageBackground, ScrollView, Text, View } from 'react-native';
import getPark from '../api/endpoints/parks/getPark';
import getTasks from '../api/endpoints/parks/getTasks';
import Topbar from '../components/Topbar';
import { ParkType } from '../models/park-type';
import { TaskType } from '../models/task-type';

export default function ParkScreen({ route }) {
  const { park } = route.params;
  const [currentPark, setCurrentPark] = useState<ParkType>();
  const [tasks, setTasks] = useState<TaskType[]>();

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
          <ScrollView
            style={{
              paddingTop: 8,
            }}
          >
            <Text>{currentPark?.completion_rate}% complete</Text>
            <Text>
              {tasks?.filter((task) => task.has_completed).length} out of{' '}
              {tasks?.length} tasks unlocked.
            </Text>
            <Text>Park tasks:</Text>
            {tasks?.map((task) => {
              return (
                <View key={task.id}>
                  <Text>Task name: {task.name}</Text>
                  <Text>Completed: {task.has_completed ? 'Yes' : 'No'}</Text>
                </View>
              );
            })}
          </ScrollView>
        </ImageBackground>
      </View>
    </>
  );
}
