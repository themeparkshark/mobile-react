import { UserType } from '../models/user-type';
import { View } from 'react-native';
import { Image } from 'expo-image';
import Button from './Button';
import * as RootNavigation from '../RootNavigation';

export default function Avatar({
  user,
  size,
}: {
  readonly size: number;
  readonly user: UserType;
}) {
  return (
    <Button
      onPress={() =>
        RootNavigation.navigate('User', {
          user: user.id,
        })
      }
    >
      <View
        style={{
          shadowColor: '#000',
          shadowOffset: {
            width: 3,
            height: 3,
          },
          shadowRadius: 0,
          shadowOpacity: 0.4,
          width: size,
          height: size,
          position: 'relative',
          marginLeft: size === 50 ? 0 : 'auto',
          marginRight: size === 50 ? 0 : 'auto',
        }}
      >
        <View
          style={{
            borderWidth: 3,
            borderColor: 'white',
            overflow: 'hidden',
            borderRadius: 50,
            width: size,
            height: size,
          }}
        >
          <Image
            source={user.avatar_url}
            style={{
              width: size,
              height: size,
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          />
        </View>
      </View>
    </Button>
  );
}
