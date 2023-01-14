import { View } from 'react-native';
import config from '../config';

export default function Progress({ progress }: { readonly progress: number }) {
  return (
    <View
      style={{
        position: 'relative',
        width: '100%',
        height: 23,
        borderRadius: 10,
        borderWidth: 3,
        borderColor: config.primary,
        backgroundColor: config.primary,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: `${progress}%`,
          height: '100%',
          backgroundColor: 'white',
        }}
      />
    </View>
  );
}
