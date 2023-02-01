import { Text, View } from 'react-native';
import config from '../config';
import { UserType } from '../models/user-type';

export default function Activity({ user }: { readonly user: UserType }) {
  const activities = [
    {
      label: 'Parks Visited',
      value: user.visited_parks_count,
    },
    {
      label: 'Shark coin balance',
      value: user.coins,
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
        {activities.map((activity) => {
          return (
            <View
              key={activity.label}
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
                  fontSize: 16,
                }}
              >
                {activity.label}
              </Text>
              <Text
                style={{
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 16,
                  color: config.primary,
                }}
              >
                {activity.value}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
