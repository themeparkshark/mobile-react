import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import shortenNumber from '../../helpers/shorten-number';

export default function Currency({ image, count }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Image
        source={{
          uri: image,
        }}
        style={{
          width: 35,
          height: 35,
          marginRight: 8,
        }}
        contentFit="contain"
      />
      <Text
        style={{
          textAlign: 'center',
          fontSize: 24,
          color: 'white',
          fontFamily: 'Shark',
          textTransform: 'uppercase',
          textShadowColor: 'rgba(0, 0, 0, .5)',
          textShadowOffset: {
            width: 2,
            height: 2,
          },
          textShadowRadius: 0,
        }}
      >
        {shortenNumber(count)}
      </Text>
    </View>
  );
}
