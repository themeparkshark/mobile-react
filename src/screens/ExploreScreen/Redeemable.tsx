import dayjs from 'dayjs';
import { Image } from 'expo-image';
import Countdown, { zeroPad } from 'react-countdown';
import { ImageBackground, Text, View } from 'react-native';
import { useTimeoutWhen } from 'rooks';
import config from '../../config';
import { RedeemableType } from '../../models/redeemable-type';

export default function Redeemable({
  redeemable,
  onExpire,
}: {
  readonly redeemable: RedeemableType;
  readonly onExpire: () => void;
}) {
  useTimeoutWhen(
    () => {
      onExpire();
    },
    dayjs(redeemable.active_to).diff(dayjs()),
    !!redeemable.id
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
            date={Date.parse(redeemable.active_to)}
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
          source={{
            uri: redeemable.currency.map_url,
          }}
          style={{
            width: 60,
            height: 60,
          }}
          contentFit="contain"
        />
      </View>
    </View>
  );
}
