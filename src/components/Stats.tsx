import { Text, View } from 'react-native';
import { UserType } from '../models/user-type';

export default function Stats({ user }: { readonly user: UserType }) {
  const stats = [
    {
      label: 'Friends',
      value: user.friends_count,
    },
    {
      label: 'Key balance',
      value: user.keys,
    },
    {
      label: 'Park coins',
      value: user.park_coins_count,
    },
    {
      label: 'Parks visited',
      value: user.visited_parks_count,
    },
    {
      label: 'Shark coin balance',
      value: user.coins,
    },
    {
      label: 'Tasks completed',
      value: user.completed_tasks_count,
    },
    {
      label: 'Total XP',
      value: user.total_experience,
    },
  ];

  return (
    <View
      style={{
        paddingLeft: 32,
        paddingRight: 32,
      }}
    >
      <View>
        {stats.map((stat) => {
          return (
            <View
              key={stat.label}
              style={{
                flexDirection: 'row',
              }}
            >
              <Text
                style={{
                  paddingRight: 12,
                  flex: 1,
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 18,
                }}
              >
                {stat.label}
              </Text>
              <Text
                style={{
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 18,
                }}
              >
                {stat.value}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
