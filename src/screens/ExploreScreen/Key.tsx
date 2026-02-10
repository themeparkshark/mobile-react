import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useContext } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { Text, View } from 'react-native';
import { useTimeoutWhen } from 'rooks';
import { CurrencyContext } from '../../context/CurrencyProvider';
import { KeyType } from '../../models/key-type';

/**
 * Key — 100% STATIC layout (rendered inside <Marker>).
 * No Animated transforms — prevents teleporting on react-native-maps.
 */
export default function Key({
  model,
  onExpire,
}: {
  readonly model: KeyType;
  readonly onExpire: () => void;
}) {
  const { currencies } = useContext(CurrencyContext);

  useTimeoutWhen(
    () => {
      onExpire();
    },
    dayjs(model.active_to).diff(dayjs()),
    !!model.id
  );

  return (
    <View style={{ alignItems: 'center', width: 70 }}>
      {/* Timer badge */}
      <View style={{
        backgroundColor: '#E8F4FD',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 5,
        marginBottom: 8,
        borderWidth: 2,
        borderColor: '#4FC3F7',
        shadowColor: '#4FC3F7',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
      }}>
        <Countdown
          date={Date.parse(model.active_to)}
          renderer={({ minutes, seconds }) => (
            <Text style={{
              fontFamily: 'Shark',
              fontSize: 15,
              color: '#0288D1',
              textAlign: 'center',
            }}>
              {minutes}:{zeroPad(seconds)}
            </Text>
          )}
        />
      </View>

      {/* Key with static glow */}
      <View>
        <View style={{
          position: 'absolute',
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          borderRadius: 20,
          backgroundColor: '#4FC3F7',
          opacity: 0.5,
        }} />
        <Image
          source={{ uri: currencies[1]?.map_url }}
          style={{
            width: 34,
            height: 34,
          }}
          contentFit="contain"
        />
      </View>
    </View>
  );
}
