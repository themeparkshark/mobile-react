import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Dimensions, Text } from 'react-native';

export default function NotAtPark() {
  const [seconds, setSeconds] = useState<number>(5);

  useEffect(() => {
    const interval = setInterval(() => {
      if (seconds === 1) {
        setSeconds(5);
      } else {
        setSeconds(seconds - 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [seconds]);

  return (
    <BlurView
      intensity={80}
      tint="dark"
      style={{
        zIndex: 10,
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
          fontFamily: 'Shark',
          textTransform: 'uppercase',
          textShadowColor: 'rgba(0, 0, 0, .5)',
          textShadowOffset: {
            width: 2,
            height: 2,
          },
          textShadowRadius: 0,
          fontSize: 32,
          paddingLeft: 48,
          paddingRight: 48,
          textAlign: 'center',
        }}
      >
        You are not at a park right now.
      </Text>
      <Text
        style={{
          color: 'white',
          fontFamily: 'Knockout',
          fontSize: 20,
          paddingTop: 30,
          textShadowColor: 'rgba(0, 0, 0, .5)',
          textShadowOffset: {
            width: 2,
            height: 2,
          },
          textShadowRadius: 0,
        }}
      >
        Checking again in {seconds} second{seconds === 1 ? '' : 's'}...
      </Text>
    </BlurView>
  );
}
