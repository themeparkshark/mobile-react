import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import config from '../config';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';

export default function Verified() {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const pulse = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const wiggleAnim = useRef(new Animated.Value(0)).current;
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1],
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

    setShowPopup(true);
  };

  return (
    <>
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
            colors={[config.secondary, '#0090dd', config.secondary]}
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
              shadowColor: config.secondary,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.4,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Image
              source={require('../../assets/images/screens/profile/verified.png')}
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
                color: 'white',
                letterSpacing: 1,
                textShadowColor: 'rgba(0,0,0,0.2)',
                textShadowRadius: 2,
                flexShrink: 1,
              }}
            >
              Verified
            </Text>
          </LinearGradient>
        </Animated.View>
      </Pressable>

      {/* Verified popup */}
      <Modal
        visible={showPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPopup(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
          activeOpacity={1}
          onPress={() => setShowPopup(false)}
        >
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 24,
              padding: 28,
              marginHorizontal: 40,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 10,
            }}
          >
            <Image
              source={require('../../assets/images/screens/profile/verified.png')}
              style={{ width: 56, height: 56, marginBottom: 16 }}
              contentFit="contain"
            />
            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 18,
                color: config.primary,
                textTransform: 'uppercase',
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              Verified Shark
            </Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 16,
                color: '#64748b',
                textAlign: 'center',
                lineHeight: 22,
              }}
            >
              This popular shark has been verified
            </Text>
            <TouchableOpacity
              onPress={() => setShowPopup(false)}
              style={{
                marginTop: 20,
                backgroundColor: config.secondary,
                paddingHorizontal: 32,
                paddingVertical: 12,
                borderRadius: 14,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Shark',
                  fontSize: 14,
                  color: 'white',
                  textTransform: 'uppercase',
                }}
              >
                Cool!
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
