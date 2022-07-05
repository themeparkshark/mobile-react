import { View, Text } from 'react-native';

export default function Progress({ progress }) {
  return (
    <View
      style={{
        position: 'relative',
        width: '100%',
        height: 23,
        borderRadius: 10,
        borderWidth: 3,
        borderColor: '#09268f',
        borderStyle: 'solid',
        backgroundColor: '#09268f',
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
