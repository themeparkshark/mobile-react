import { Image, ImageBackground, Text, View } from 'react-native';
import { useEffect, useContext } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import dayjs from 'dayjs';
import detachCoin from '../../api/endpoints/me/coins/detach-coin';
import { ThemeContext } from '../../context/ThemeProvider';
import { CoinType } from '../../models/coin-type';

export default function Coin({
  coin,
  onExpire,
}: {
  readonly coin: CoinType;
  readonly onExpire: () => void;
}) {
  const { theme } = useContext(ThemeContext);

  useEffect(() => {
    const interval = setInterval(async () => {
      await detachCoin(coin);
      onExpire();
    }, dayjs(coin.pivot.active_to).diff(dayjs()));

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
          top: -55,
          left: -40,
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
            date={Date.parse(coin.pivot.active_to)}
            renderer={({ minutes, seconds }) => {
              return (
                <Text
                  style={{
                    textAlign: 'center',
                    paddingTop: 9,
                    fontFamily: 'Shark',
                    textTransform: 'uppercase',
                    fontSize: 18,
                    color: theme.primary_color,
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
            uri: theme.coin_animation_url,
          }}
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
