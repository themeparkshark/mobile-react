import { Image } from 'expo-image';
import { View } from 'react-native';
import config from '../config';
import { UserType } from '../models/user-type';

export default function Avatar({
  user,
  size = 'md',
}: {
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
  readonly user: UserType;
}) {
  const sizes = {
    sm: 50,
    md: 60,
    lg: 70,
    xl: 80,
  };

  const borderWidths = {
    sm: 1,
    md: 2,
    lg: 3,
    xl: 4,
  };

  return (
    <View
      style={{
        width: sizes[size],
        height: sizes[size],
        position: 'relative',
        marginLeft: size === 'md' ? 0 : 'auto',
        marginRight: size === 'md' ? 0 : 'auto',
      }}
    >
      {!!user.verified_at && (
        <Image
          source={require('../../assets/images/screens/profile/verified.png')}
          style={{
            width: sizes[size] / 4,
            height: sizes[size] / 4,
            position: 'absolute',
            bottom: 0,
            right: 0,
            zIndex: 10,
          }}
          contentFit="cover"
        />
      )}
      {user.inventory && (
        <Image
          source={{
            uri: user.inventory.pin_item.icon_url,
          }}
          style={{
            width: sizes[size] / 4,
            height: sizes[size] / 4,
            position: 'absolute',
            bottom: 0,
            left: 0,
            zIndex: 10,
          }}
          contentFit="contain"
        />
      )}
      <View
        style={{
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: borderWidths[size],
          },
          shadowRadius: 0,
          shadowOpacity: 0.35,
        }}
      >
        <View
          style={{
            borderWidth: borderWidths[size],
            borderColor: config.lightBlue,
            overflow: 'hidden',
            borderRadius: 50,
            width: sizes[size],
            height: sizes[size],
          }}
        >
          <Image
            source={user.avatar_url}
            style={{
              width: sizes[size] * 1.2,
              height: sizes[size] * 1.2,
              position: 'absolute',
              left: '-10%',
            }}
          />
        </View>
      </View>
    </View>
  );
}
