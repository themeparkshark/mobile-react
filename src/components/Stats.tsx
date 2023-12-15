import { Text, View } from 'react-native';
import { PlayerType } from '../models/player-type';

export default function Stats({ player }: { readonly player: PlayerType }) {
  const stats = [
    {
      label: 'Friends',
      value: player.friends_count,
      show: true,
    },
    {
      label: 'Key balance',
      value: player.keys,
      show: true,
    },
    {
      label: 'Park coins',
      value: player.park_coins_count,
      show: true,
    },
    {
      label: 'Parks visited',
      value: player.visited_parks_count,
      show: true,
    },
    {
      label: 'Shark coin balance',
      value: player.coins,
      show: true,
    },
    {
      label: 'Tasks completed',
      value: player.completed_tasks_count,
      show: true,
    },
    {
      label: 'Total XP',
      value: player.total_experience,
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
