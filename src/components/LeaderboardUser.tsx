import { Text, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import { UserType } from '../models/user-type';
import Avatar from './Avatar';
import Button from './Button';

export default function LeaderboardUser({ user }: { readonly user: UserType }) {
  return (
    <>
      <Button
        onPress={() => {
          RootNavigation.navigate('User', {
            user: user.id,
          });
        }}
      >
        <Avatar user={user} size="lg" />
      </Button>
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
            fontSize: 24,
            paddingTop: 8,
            paddingBottom: 8,
            textShadowColor: 'rgba(0, 0, 0, .5)',
            textShadowOffset: {
              width: 1,
              height: 1,
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
              fontSize: 24,
              textShadowColor: 'rgba(0, 0, 0, .5)',
              textShadowOffset: {
                width: 1,
                height: 1,
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
