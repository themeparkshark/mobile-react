import { Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import getUsers from '../api/endpoints/leaderboards/users';
import { UserType } from '../models/user-type';
import { LeaderboardType } from '../models/leaderboard-type';

export default function Leaderboard({
  leaderboard,
}: {
  leaderboard: LeaderboardType;
}) {
  const [users, setUsers] = useState<UserType[]>([]);

  useEffect(() => {
    (async () => {
      const response = await getUsers(leaderboard.id);
      setUsers(response);
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
      {users &&
        users.map((user) => {
          return (
            <Text key={user.id}>
              {user.screen_name} - {user.tasks_completed}
            </Text>
          );
        })}
    </View>
  );
}
