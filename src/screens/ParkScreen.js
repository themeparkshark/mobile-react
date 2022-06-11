import { useEffect, useState } from 'react';
import { SafeAreaView, Text } from 'react-native';
import getPark from '../api/endpoints/parks/getPark';
import getTasks from '../api/endpoints/parks/getTasks';

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
    <SafeAreaView>
      <Text>{currentPark?.name}</Text>
      <Text>{currentPark?.completion_rate}% complete</Text>
      <Text>
        {tasks?.filter((task) => task.has_completed).length} out of{' '}
        {tasks?.length} tasks unlocked.
      </Text>
      <Text>Park tasks:</Text>
      {tasks?.map((task) => {
        return (
          <>
            <Text>Task name: {task.name}</Text>
            <Text>Completed: {task.has_completed ? 'Yes' : 'No'}</Text>
          </>
        );
      })}
    </SafeAreaView>
  );
}
