import { View } from 'react-native';
import { useContext } from 'react';
import { ThemeContext} from '../context/ThemeProvider';

export default function Progress({ progress }) {
  const { theme } = useContext(ThemeContext);

  return (
    <View
      style={{
        position: 'relative',
        width: '100%',
        height: 23,
        borderRadius: 10,
        borderWidth: 3,
        borderColor: theme.primary_color,
        borderStyle: 'solid',
        backgroundColor: theme.primary_color,
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
  )
};
