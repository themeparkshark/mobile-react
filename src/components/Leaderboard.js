import { Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import getUsers from '../api/endpoints/leaderboards/users';

export default function Leaderboard({ leaderboard })
{
  const [users, setUsers] = useState([]);

  useEffect(() => {
    (async () => {
      const response = await getUsers(leaderboard.id);
      setUsers(response.data);
    })();
  }, []);

  return (
    <View>
      <Text
        style={{
          fontWeight: 'bold',
          paddingBottom: 8,
          paddingTop: 8,
        }}
      >
        {leaderboard.duration_text}
      </Text>
      {users && users.map((user) => {
        return (
          <Text
            key={user.id}
          >
            {user.username} - {user.pivot.tasks_completed}
          </Text>
        )
      })}
    </View>
  );
}
