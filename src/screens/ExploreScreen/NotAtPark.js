import { Dimensions, Text } from 'react-native';
import { BlurView } from 'expo-blur';

export default function NotAtPark() {
  return (
    <BlurView
      intensity={80}
      tint="dark"
      style={{
        zIndex: 10,
        resizeMode: 'contain',
        alignSelf: 'center',
        position: 'absolute',
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: 'white',
          fontSize: 32,
          paddingLeft: 48,
          paddingRight: 48,
          textAlign: 'center',
        }}
      >
        You are not at a park right now.
      </Text>
    </BlurView>
  );
};
