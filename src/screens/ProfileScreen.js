import { useEffect, useState } from 'react';
import { Button, SafeAreaView, Text } from 'react-native';
import me from '../api/endpoints/me/me';
import Wrapper from '../components/Wrapper';

export default function NewsScreen({ navigation }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    me().then((response) => {
      setUser(response);
    });
  }, []);

  return (
    <Wrapper>
      <SafeAreaView>
        <Text>Username: {user?.username}</Text>
        <Text>Level: {user?.experience_level.level}</Text>
        <Text>
          Experience: {user?.experience} / {user?.experience_level.experience}
        </Text>
        <Text style={{ fontWeight: 'bold' }}>Total activity</Text>
        <Text>Total shark coins earned: {user?.total_coins}</Text>
        <Text>Shark coin balance: {user?.coins}</Text>
        <Text>Parks visited: {user?.parks_visited}</Text>
        <Text style={{ fontWeight: 'bold' }}>Visited parks</Text>
        {user?.visited_parks.map((visit) => {
          return (
            <Button
              key={visit.park.id}
              title={`- ${visit.park.name} ---- ${visit.park.completion_rate}% complete.`}
              onPress={() =>
                navigation.navigate('Park', { park: visit.park.id })
              }
            />
          );
        })}
      </SafeAreaView>
    </Wrapper>
  );
}
