import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useContext } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTimeoutWhen } from 'rooks';
import { hash01 } from '../../components/map/alive/ambientBudget';
import { useMapAlive } from '../../components/map/alive/MapAliveContext';
import { CurrencyContext } from '../../context/CurrencyProvider';
import { CoinType } from '../../models/coin-type';

const SPARKLE = require('../../../assets/images/map/fx/sparkle.png');

/**
 * A timed coin on the map. The marker pins the outer view by its anchor
 * (MapLibre), so the coin itself may move: it bobs on the map's ambient clock
 * with a shadow that tightens as it rises and a glint every few seconds.
 * Calm (Reduce Motion) keeps it still.
 */
export default function Coin({
  coin,
  onExpire,
}: {
  readonly coin: CoinType;
  readonly onExpire: () => void;
}) {
  const { currencies } = useContext(CurrencyContext);
  const { clock, tier } = useMapAlive();
  const moving = tier !== 'calm';
  const phase = hash01(coin.id);
  const bob = useAnimatedStyle(() => ({
    transform: [{ translateY: moving ? -3 + Math.sin((clock.value / 2.2 + phase) * Math.PI * 2) * 4 : 0 }],
  }));
  const shadow = useAnimatedStyle(() => {
    const rise = moving ? (Math.sin((clock.value / 2.2 + phase) * Math.PI * 2) + 1) / 2 : 0.5;
    return { opacity: 0.32 - rise * 0.14, transform: [{ scaleX: 1 - rise * 0.3 }] };
  });
  const glint = useAnimatedStyle(() => {
    const p = moving ? (clock.value / 3.1 + phase) % 1 : 0.5;
    const k = p < 0.16 ? Math.sin((p / 0.16) * Math.PI) : 0;
    return { opacity: k, transform: [{ scale: 0.3 + k * 0.8 }, { rotate: `${p * 120}deg` }] };
  });

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

      {/* The coin floats over its shadow, with a soft glow and a glint. */}
      <Animated.View style={[{ position: 'absolute', bottom: -6, width: 24, height: 6, borderRadius: 12,
        backgroundColor: 'rgba(5,52,110,0.9)' }, shadow]} />
      <Animated.View style={bob}>
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
        <Animated.Image source={SPARKLE} tintColor="#ffffff" resizeMode="contain"
          style={[{ position: 'absolute', top: -5, right: -7, width: 14, height: 14 }, glint]} />
      </Animated.View>
    </View>
  );
}
