import dayjs from 'dayjs';
import { Text, View } from 'react-native';
import { UserType } from '../models/user-type';

export default function Stats({ user }: { readonly user: UserType }) {
  const stats = [
    {
      label: 'Friends',
      value: user.friends_count,
      show: true,
    },
    {
      label: 'Key balance',
      value: user.keys,
      show: true,
    },
    {
      label: 'Park coins',
      value: user.park_coins_count,
      show: true,
    },
    {
      label: 'Parks visited',
      value: user.visited_parks_count,
      show: true,
    },
    {
      label: 'Shark coin balance',
      value: user.coins,
      show: true,
    },
    {
      label: 'Tasks completed',
      value: user.completed_tasks_count,
      show: true,
    },
    {
      label: 'Total XP',
      value: user.total_experience,
      show: true,
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
        {stats
          .filter((stat) => stat.show)
          .map((stat) => {
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
