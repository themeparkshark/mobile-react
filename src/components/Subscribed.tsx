import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import config from '../config';
import * as RootNavigation from '../RootNavigation';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';

export default function Subscribed() {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const shimmer = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const wiggleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const glowOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  const wiggleRotate = wiggleAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-4deg', '0deg', '4deg'],
  });

  const handlePress = () => {
    playSound(require('../../assets/sounds/button_press.mp3'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 300,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.timing(wiggleAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(wiggleAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(wiggleAnim, { toValue: 0.6, duration: 60, useNativeDriver: true }),
      Animated.timing(wiggleAnim, { toValue: -0.4, duration: 50, useNativeDriver: true }),
      Animated.timing(wiggleAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();

    // Navigate to Membership page
    RootNavigation.navigate('Membership');
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        style={{
          marginTop: 0,
          marginHorizontal: 0,
          opacity: glowOpacity,
          flex: 1,
          transform: [
            { scale: scaleAnim },
            { rotate: wiggleRotate },
          ],
        }}
      >
        <LinearGradient
          colors={[config.tertiary, '#f0b800', config.tertiary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            paddingHorizontal: 12,
            borderRadius: 16,
            minHeight: 56,
            shadowColor: config.tertiary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <Image
            source={require('../../assets/images/screens/profile/subscribed.png')}
            style={{
              width: 28,
              height: 28,
              marginRight: 12,
            }}
            contentFit="contain"
          />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{
              fontFamily: 'Shark',
              textTransform: 'uppercase',
              fontSize: 16,
              color: '#1a1a2e',
              letterSpacing: 1,
              flexShrink: 1,
            }}
          >
            VIP Member
          </Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}
