import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useContext } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { ImageBackground, Text, View } from 'react-native';
import { useTimeoutWhen } from 'rooks';
import config from '../../config';
import { CurrencyContext } from '../../context/CurrencyProvider';
import { CoinType } from '../../models/coin-type';

export default function Coin({
  coin,
  onExpire,
}: {
  readonly coin: CoinType;
  readonly onExpire: () => void;
}) {
  const { currencies } = useContext(CurrencyContext);

  useTimeoutWhen(
    () => {
      onExpire();
    },
    dayjs(coin.active_to).diff(dayjs()),
    !!coin.id
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
          source={{
            uri: currencies[0].map_url,
          }}
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
