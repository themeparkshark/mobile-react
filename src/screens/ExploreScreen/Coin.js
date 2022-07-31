import { Image, ImageBackground, Text, View } from 'react-native';
import { useEffect, useContext } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import dayjs from 'dayjs';
import detachCoin from '../../api/endpoints/me/coins/detach-coin';
import cloud from '../../../assets/images/screens/explore/cloud.png';
import { ThemeContext } from '../../context/ThemeProvider';

export default function Coin({coin, onExpire}) {
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
          source={cloud}
        >
          <Countdown
            date={Date.parse(coin.pivot.active_to)}
            renderer={
              ({
               minutes,
               seconds,
              }) => {
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
              }
            }
          />
        </ImageBackground>
        <Image
          source={{
            uri: 'https://static.wikia.nocookie.net/club-penguin-rewritten/images/d/d9/Coin_Icon.png/revision/latest/scale-to-width-down/1970?cb=20190112081805',
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
