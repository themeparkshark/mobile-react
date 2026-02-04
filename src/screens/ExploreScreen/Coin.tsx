import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useContext, useEffect, useRef } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { Animated, Text, View, Easing } from 'react-native';
import { useTimeoutWhen } from 'rooks';
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
  
  // Gentle floating animation
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;
  
  useEffect(() => {
    // Float up and down
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -4, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
    
    // Subtle glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.6, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

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
      
      {/* Coin with glow and float */}
      <Animated.View style={{
        transform: [{ translateY: floatAnim }],
      }}>
        {/* Glow ring behind coin */}
        <Animated.View style={{
          position: 'absolute',
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          borderRadius: 20,
          backgroundColor: '#FFD700',
          opacity: glowAnim,
          transform: [{ scale: 1.1 }],
        }} />
        <Image
          source={{ uri: currencies[0]?.map_url }}
          style={{
            width: 29,
            height: 29,
          }}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}
