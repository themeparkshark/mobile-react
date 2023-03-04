import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { Dimensions, Text } from 'react-native';
import { useIntervalWhen } from 'rooks';
import { vsprintf } from 'sprintf-js';
import useCrumbs from '../../hooks/useCrumbs';

export default function NotAtPark() {
  const [seconds, setSeconds] = useState<number>(5);
  const { labels, warnings } = useCrumbs();

  useIntervalWhen(
    () => {
      if (seconds === 1) {
        setSeconds(5);
      } else {
        setSeconds(seconds - 1);
      }
    },
    1000,
    !!seconds
  );

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
        {warnings.not_at_a_park}
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
        {vsprintf(labels.checking_again, [
          seconds,
          `second${seconds === 1 ? '' : 's'}`,
        ])}
      </Text>
    </BlurView>
  );
}
