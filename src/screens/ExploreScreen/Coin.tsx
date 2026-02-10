import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useContext } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { Text, View } from 'react-native';
import { useTimeoutWhen } from 'rooks';
import { CurrencyContext } from '../../context/CurrencyProvider';
import { CoinType } from '../../models/coin-type';

/**
 * Coin — 100% STATIC layout (rendered inside <Marker>).
 * No Animated transforms — prevents teleporting on react-native-maps.
 */
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
    <View style={{ alignItems: 'center', width: 70 }}>
      {/* Timer badge */}
      <View style={{
        backgroundColor: '#FFF8E7',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 5,
        marginBottom: 8,
        borderWidth: 2,
        borderColor: '#FFD700',
        shadowColor: '#FFD700',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
      }}>
        <Countdown
          date={Date.parse(coin.active_to)}
          renderer={({ minutes, seconds }) => (
            <Text style={{
              fontFamily: 'Shark',
              fontSize: 15,
              color: '#B8860B',
              textAlign: 'center',
            }}>
              {minutes}:{zeroPad(seconds)}
            </Text>
          )}
        />
      </View>

      {/* Coin with static glow */}
      <View>
        <View style={{
          position: 'absolute',
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          borderRadius: 20,
          backgroundColor: '#FFD700',
          opacity: 0.5,
        }} />
        <Image
          source={{ uri: currencies[0]?.map_url }}
          style={{
            width: 29,
            height: 29,
          }}
          contentFit="contain"
        />
      </View>
    </View>
  );
}
