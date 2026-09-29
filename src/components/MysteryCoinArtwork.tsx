import { Image } from 'expo-image';
import { View } from 'react-native';

/** Three equal square cells, retaining the generated atlas's original alpha. */
export default function MysteryCoinArtwork({ size = 62, variant = 'normal' }: {
  readonly size?: number;
  readonly variant?: 'normal' | 'secret' | 'archived';
}) {
  const index = variant === 'secret' ? 1 : variant === 'archived' ? 2 : 0;
  const cell = size * 1.16;
  return <View pointerEvents="none" accessible={false}
    style={{ width: size, height: size, overflow: 'hidden' }}>
    <Image source={require('../../assets/images/screens/park/mystery-coins-polished-v1.png')}
      contentFit="fill" style={{ position: 'absolute', width: cell * 3, height: cell,
        left: (size - cell) / 2 - index * cell, top: (size - cell) / 2 }} />
  </View>;
}
