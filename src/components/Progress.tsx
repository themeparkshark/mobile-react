import { View } from 'react-native';
import theme from '../config/theme';

export default function Progress({ progress }: { readonly progress: number }) {
  return (
    <View
      style={{
        position: 'relative',
        width: '100%',
        height: 23,
        borderRadius: 10,
        borderWidth: 3,
        borderColor: theme.primary,
        borderStyle: 'solid',
        backgroundColor: theme.primary,
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
