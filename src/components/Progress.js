import { View, Text } from 'react-native';

export default function Progress({ progress }) {
  return (
    <View
      style={{
        position: 'relative',
        width: '100%',
        height: 20,
        borderRadius: 5,
        border: 3,
        borderColor: 'red',
        borderStyle: 'solid',
        backgroundColor: 'blue',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: `${progress}%`,
          height: '100%',
          backgroundColor: 'green',
        }}
      />
    </View>
  )
};
