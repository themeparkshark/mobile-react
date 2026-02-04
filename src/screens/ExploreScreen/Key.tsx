import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useContext, useEffect, useRef } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import { Animated, Text, View, Easing } from 'react-native';
import { useTimeoutWhen } from 'rooks';
import { CurrencyContext } from '../../context/CurrencyProvider';
import { KeyType } from '../../models/key-type';

export default function Key({
  model,
  onExpire,
}: {
  readonly model: KeyType;
  readonly onExpire: () => void;
}) {
  const { currencies } = useContext(CurrencyContext);
  
  // Gentle floating animation
  const floatAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;
  // Subtle rotation wobble for keys
  const wobbleAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    // Float up and down
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -4, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
    
    // Subtle glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.6, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    
    // Little wobble rotation
    Animated.loop(
      Animated.sequence([
        Animated.timing(wobbleAnim, { toValue: 8, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(wobbleAnim, { toValue: -8, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

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
      
      {/* Key with glow, float and wobble */}
      <Animated.View style={{
        transform: [
          { translateY: floatAnim },
          { rotate: wobbleAnim.interpolate({
            inputRange: [-8, 8],
            outputRange: ['-8deg', '8deg'],
          })},
        ],
      }}>
        {/* Glow ring behind key */}
        <Animated.View style={{
          position: 'absolute',
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          borderRadius: 20,
          backgroundColor: '#4FC3F7',
          opacity: glowAnim,
          transform: [{ scale: 1.1 }],
        }} />
        <Image
          source={{ uri: currencies[1]?.map_url }}
          style={{
            width: 34,
            height: 34,
          }}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}
