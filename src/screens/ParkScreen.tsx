import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';
import getPark from '../api/endpoints/parks/getPark';
import getTasks from '../api/endpoints/parks/getTasks';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';

export default function ParkScreen({ route }) {
  const { park } = route.params;
  const [currentPark, setCurrentPark] = useState(null);
  const [tasks, setTasks] = useState(null);

  useEffect(() => {
    getPark(park).then((response) => {
      setCurrentPark(response);
    });

    getTasks(park).then((response) => {
      setTasks(response);
    });
  }, []);

  return (
    <>
      <Topbar showBackButton={true} text={currentPark?.name} />
      <ScrollView
        style={{
          flex: 1,
          marginTop: -8,
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
    </>
  );
}
