import { Image } from 'expo-image';
import { View } from 'react-native';

/** The unmodified generated atlas uses six equal square cells. */
export default function ProfileStatIcon({ index, size = 36 }: {
  readonly index: number;
  readonly size?: number;
}) {
  return <View accessible={false} pointerEvents="none"
    style={{ width: size, height: size, overflow: 'hidden' }}>
    <Image source={require('../../assets/images/screens/profile/stat-icons-polished-v1.png')}
      contentFit="fill" style={{ position: 'absolute', width: size * 3, height: size * 2,
        left: -(index % 3) * size, top: -Math.floor(index / 3) * size }} />
  </View>;
}
