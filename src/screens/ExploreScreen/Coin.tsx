import { Image, ImageBackground, Text, View } from 'react-native';
import { useEffect } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import dayjs from 'dayjs';
import { CoinType } from '../../models/coin-type';
import config from '../../config';

export default function Coin({
  coin,
  onExpire,
}: {
  readonly coin: CoinType;
  readonly onExpire: () => void;
}) {
  useEffect(() => {
    const interval = setInterval(async () => {
      onExpire();
    }, dayjs(coin.active_to).diff(dayjs()));

    return () => clearInterval(interval);
  }, [coin.id]);

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
            date={Date.parse(coin.active_to)}
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
          source={require('../../../assets/images/screens/explore/coin.gif')}
          style={{
            width: 30,
            height: 30,
            resizeMode: 'contain',
          }}
        />
      </View>
    </View>
  );
}
