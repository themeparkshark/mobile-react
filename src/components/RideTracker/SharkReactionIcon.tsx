import { Image } from 'expo-image';
import { View } from 'react-native';

// Keep saved reaction codes compatible with existing memories and API responses.
export const SHARK_REACTIONS = [
  { code: '🤯', label: 'Mind blown' },
  { code: '😂', label: 'Laughing' },
  { code: '😴', label: 'Sleepy' },
  { code: '🤢', label: 'Queasy' },
  { code: '🔥', label: 'Loved it' },
] as const;

export default function SharkReactionIcon({ reaction, size = 32 }: {
  readonly reaction: string;
  readonly size?: number;
}) {
  const found = SHARK_REACTIONS.findIndex(item => item.code === reaction);
  const index = found < 0 ? 5 : found;
  return <View accessible={false} pointerEvents="none"
    style={{ width: size, height: size, overflow: 'hidden' }}>
    <Image source={require('../../../assets/images/screens/profile/shark-reactions-polished-v1.png')}
      contentFit="fill" style={{ position: 'absolute', width: size * 3, height: size * 2,
        left: -(index % 3) * size, top: -Math.floor(index / 3) * size }} />
  </View>;
}
