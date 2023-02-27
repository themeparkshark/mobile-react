import { Image } from 'expo-image';
import { View } from 'react-native';
import { UserType } from '../models/user-type';
import config from '../config';

export default function Avatar({
  user,
  size,
}: {
  readonly size: number;
  readonly user: UserType;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        position: 'relative',
        marginLeft: size === 50 ? 0 : 'auto',
        marginRight: size === 50 ? 0 : 'auto',
      }}
    >
      {!!user.verified_at && (
        <Image
          source={require('../../assets/images/screens/profile/verified.png')}
          style={{
            width: size / 4,
            height: size / 4,
            position: 'absolute',
            bottom: 0,
            left: 0,
            zIndex: 10,
          }}
          contentFit="cover"
        />
      )}
      <View
        style={{
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: 4,
          },
          shadowRadius: 0,
          shadowOpacity: 0.4,
        }}
      >
        <View
          style={{
            borderWidth: 4,
            borderColor: config.lightBlue,
            overflow: 'hidden',
            borderRadius: 50,
            width: size,
            height: size,
          }}
        >
          <Image
            source={user.avatar_url}
            style={{
              width: size * 1.2,
              height: size * 1.2,
              position: 'absolute',
              left: '-10%',
            }}
          />
        </View>
      </View>
    </View>
  );
}
