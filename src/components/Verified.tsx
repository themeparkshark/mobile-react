import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import useCrumbs from '../hooks/useCrumbs';

export default function Verified() {
  const { labels } = useCrumbs();

  return (
    <View
      style={{
        marginTop: 32,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image
        source={require('../../assets/images/screens/profile/verified.png')}
        style={{
          width: 30,
          height: 30,
        }}
        contentFit="contain"
      />
      <View
        style={{
          paddingLeft: 16,
        }}
      >
        <Text
          style={{
            fontFamily: 'Knockout',
            textTransform: 'uppercase',
            fontSize: 16,
          }}
        >
          {labels.verified_user}
        </Text>
      </View>
    </View>
  );
}
