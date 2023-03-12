import dayjs from 'dayjs';
import { Image } from 'expo-image';
import Countdown, { zeroPad } from 'react-countdown';
import { ImageBackground, Text, View } from 'react-native';
import { useTimeoutWhen } from 'rooks';
import config from '../../config';
import { KeyType } from '../../models/key-type';

export default function Key({
  keyModel,
  onExpire,
}: {
  readonly keyModel: KeyType;
  readonly onExpire: () => void;
}) {
  const key = keyModel;

  useTimeoutWhen(
    () => {
      onExpire();
    },
    dayjs(key.active_to).diff(dayjs()),
    !!key.id
  );

  return (
    <View
      style={{
        position: 'relative',
      }}
    >
      <View
        style={{
          position: 'absolute',
          alignItems: 'center',
          top: -35,
          left: -30,
        }}
      >
        <ImageBackground
          style={{
            width: 60,
            height: 40,
          }}
          source={require('../../../assets/images/screens/explore/cloud.png')}
        >
          <Countdown
            date={Date.parse(key.active_to)}
            renderer={({ minutes, seconds }) => {
              return (
                <Text
                  style={{
                    textAlign: 'center',
                    paddingTop: 9,
                    fontFamily: 'Shark',
                    textTransform: 'uppercase',
                    fontSize: 18,
                    color: config.primary,
                  }}
                >
                  {minutes}:{zeroPad(seconds)}
                </Text>
              );
            }}
          />
        </ImageBackground>
        <Image
          source={require('../../../assets/images/screens/explore/key.png')}
          style={{
            width: 30,
            height: 30,
          }}
          contentFit="contain"
        />
      </View>
    </View>
  );
}
