import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { Animated, Text, View, Easing } from 'react-native';
import { useTimeoutWhen } from 'rooks';
import { RedeemableType } from '../../models/redeemable-type';

export default function Redeemable({
  redeemable,
  onExpire,
}: {
  readonly redeemable: RedeemableType;
  readonly onExpire: () => void;
}) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const sparkleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Float up and down
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -5, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.5, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Sparkle rotation
    Animated.loop(
      Animated.timing(sparkleAnim, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  useTimeoutWhen(
    () => {
      onExpire();
    },
    dayjs(redeemable.active_to).diff(dayjs()),
    !!redeemable.id
  );

  // Get theme color or default to purple
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
      
      {/* Redeemable with glow and float */}
      <Animated.View style={{
        transform: [{ translateY: floatAnim }],
      }}>
        {/* Glow ring */}
        <Animated.View style={{
          position: 'absolute',
          top: -8,
          left: -8,
          right: -8,
          bottom: -8,
          borderRadius: 35,
          backgroundColor: themeColor,
          opacity: glowAnim,
          transform: [{ scale: 1.1 }],
        }} />
        
        <Image
          source={{ uri: redeemable.theme?.currency?.map_url }}
          style={{
            width: 50,
            height: 50,
          }}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}
