import { UserType } from '../models/user-type';
import { Image, Text, View } from 'react-native';
import LeaderboardAvatar from './LeaderboardAvatar';

export default function LeaderboardUser({
  user,
  size,
}: {
  readonly size: number;
  readonly user: UserType;
}) {
  const avatar = {
    1: 100,
    2: 80,
    3: 60,
  };

  const text = {
    1: 26,
    2: 22,
    3: 18,
  };

  return (
    <>
      <LeaderboardAvatar size={avatar[size]} user={user} />
      <View
        style={{
          width: '50%',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <Text
          style={{
            textAlign: 'center',
            fontFamily: 'Shark',
            textTransform: 'uppercase',
            color: 'white',
            fontSize: text[size],
            paddingTop: 8,
            paddingBottom: 8,
            textShadowColor: 'rgba(0, 0, 0, .5)',
            textShadowOffset: {
              width: 2,
              height: 2,
            },
            textShadowRadius: 0,
          }}
        >
          {user.screen_name}
        </Text>
        <View
          style={{
            borderRadius: 6,
            backgroundColor: 'rgba(0, 0, 0, .5)',
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 4,
            paddingBottom: 4,
            alignSelf: 'flex-start',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <Text
            style={{
              fontFamily: 'Shark',
              textTransform: 'uppercase',
              color: 'white',
              fontSize: text[size] * 1.4,
              textShadowColor: 'rgba(0, 0, 0, .5)',
              textShadowOffset: {
                width: 2,
                height: 2,
              },
              textShadowRadius: 0,
              textAlign: 'center',
            }}
          >
            {user.park_coins}
          </Text>
        </View>
      </View>
    </>
  );
}
