import dayjs from 'dayjs';
import { Image } from 'expo-image';
import Countdown, { zeroPad } from 'react-countdown';
import { Text, View } from 'react-native';
import { useTimeoutWhen } from 'rooks';
import { RedeemableType } from '../../models/redeemable-type';

/**
 * Redeemable (swords/task items) — 100% STATIC layout (rendered inside <Marker>).
 * No Animated transforms — prevents teleporting on react-native-maps.
 */
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

  const themeColor = redeemable.theme?.currency?.color || '#9C27B0';
  const lightColor = themeColor + '30';

  return (
    <View style={{ alignItems: 'center', width: 80 }}>
      {/* Timer badge */}
      <View style={{
        backgroundColor: lightColor,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 5,
        marginBottom: 8,
        borderWidth: 2,
        borderColor: themeColor,
        shadowColor: themeColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 4,
      }}>
        <Countdown
          date={Date.parse(redeemable.active_to)}
          renderer={({ minutes, seconds }) => (
            <Text style={{
              fontFamily: 'Shark',
              fontSize: 15,
              color: themeColor,
              textAlign: 'center',
            }}>
              {minutes}:{zeroPad(seconds)}
            </Text>
          )}
        />
      </View>

      {/* Redeemable with static glow */}
      <View>
        <View style={{
          position: 'absolute',
          top: -8,
          left: -8,
          right: -8,
          bottom: -8,
          borderRadius: 35,
          backgroundColor: themeColor,
          opacity: 0.4,
        }} />
        <Image
          source={{ uri: redeemable.theme?.currency?.map_url }}
          style={{
            width: 50,
            height: 50,
          }}
          contentFit="contain"
        />
      </View>
    </View>
  );
}
