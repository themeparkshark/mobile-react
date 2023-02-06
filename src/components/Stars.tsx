import { Image } from 'expo-image';
import { View } from 'react-native';

export default function Stars({
  size,
  total,
  active,
}: {
  readonly active: number;
  readonly size: number;
  readonly total: number;
}) {
  return (
    <>
      {[...Array(active)].map((element, index) => {
        return (
          <View
            key={index}
            style={{
              paddingLeft: 1,
              paddingRight: 1,
              width: '20%',
            }}
          >
            <Image
              source={require('../../assets/images/screens/pin-collections/star.png')}
              style={{
                width: '100%',
                height: size,
              }}
              contentFit="contain"
            />
          </View>
        );
      })}
      {[...Array(total - active)].map((element, index) => {
        return (
          <View
            key={index}
            style={{
              paddingLeft: 1,
              paddingRight: 1,
              width: '20%',
            }}
          >
            <Image
              source={require('../../assets/images/screens/pin-collections/darkstar.png')}
              style={{
                width: '100%',
                height: size,
              }}
              contentFit="contain"
            />
          </View>
        );
      })}
    </>
  );
}
