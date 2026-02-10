import { Image } from 'expo-image';
import { Gyroscope } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import {
  Dimensions,
  Pressable,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PinType } from '../models/pin-type';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PIN_SIZE = SCREEN_WIDTH * 0.7;
const MAX_ANGLE = 15;
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.5 };
const DECAY_FACTOR = 0.95; // Drift back to center

export default function HoloPinPreview({
  pin,
  visible,
  onClose,
}: {
  pin: PinType;
  visible: boolean;
  onClose: () => void;
}) {
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const gyroX = useSharedValue(0);
  const gyroY = useSharedValue(0);
  const scale = useSharedValue(0.85);

  // Apply gyro input + decay on every frame for smooth motion
  useFrameCallback(() => {
    if (!visible) return;
    // Apply gyro velocity
    let newX = rotateX.value + gyroX.value * 0.8;
    let newY = rotateY.value - gyroY.value * 0.8;
    // Decay toward center
    newX *= DECAY_FACTOR;
    newY *= DECAY_FACTOR;
    // Clamp
    rotateX.value = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, newX));
    rotateY.value = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, newY));
    // Reset gyro input after applying
    gyroX.value = 0;
    gyroY.value = 0;
  });

  useEffect(() => {
    if (!visible) {
      rotateX.value = withSpring(0, SPRING_CONFIG);
      rotateY.value = withSpring(0, SPRING_CONFIG);
      scale.value = withTiming(0.85, { duration: 200 });
      return;
    }

    // Haptic on open
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    scale.value = withSpring(1, { damping: 12, stiffness: 100 });

    Gyroscope.setUpdateInterval(16);
    const sub = Gyroscope.addListener(({ x, y }) => {
      gyroX.value = x;
      gyroY.value = y;
    });

    return () => sub.remove();
  }, [visible]);

  // Normalized -1 to 1
  const normX = useDerivedValue(() => rotateX.value / MAX_ANGLE);
  const normY = useDerivedValue(() => rotateY.value / MAX_ANGLE);

  // Card 3D tilt
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` },
      { scale: scale.value },
    ],
  }));

  // Light reflection — soft radial glow that follows tilt
  const lightStyle = useAnimatedStyle(() => {
    const x = interpolate(normY.value, [-1, 1], [-PIN_SIZE * 0.5, PIN_SIZE * 0.5]);
    const y = interpolate(normX.value, [-1, 1], [-PIN_SIZE * 0.5, PIN_SIZE * 0.5]);
    const intensity = Math.abs(normX.value) + Math.abs(normY.value);
    return {
      transform: [{ translateX: x }, { translateY: y }],
      opacity: interpolate(intensity, [0, 0.5, 2], [0.03, 0.2, 0.35]),
    };
  });

  // Rainbow holo overlay
  const holoStyle = useAnimatedStyle(() => {
    const intensity = Math.abs(normX.value) + Math.abs(normY.value);
    const shiftX = interpolate(normY.value, [-1, 1], [-40, 40]);
    const shiftY = interpolate(normX.value, [-1, 1], [-40, 40]);
    return {
      opacity: interpolate(intensity, [0, 0.3, 2], [0.0, 0.12, 0.3]),
      transform: [{ translateX: shiftX }, { translateY: shiftY }],
    };
  });

  // Sparkle dots that appear at tilt
  const sparkleStyle = useAnimatedStyle(() => {
    const intensity = Math.abs(normX.value) + Math.abs(normY.value);
    return {
      opacity: interpolate(intensity, [0, 0.5, 2], [0, 0.3, 0.7]),
    };
  });

  const SPARKLES = [
    { top: '15%', left: '20%', size: 4 },
    { top: '25%', left: '70%', size: 3 },
    { top: '45%', left: '15%', size: 3 },
    { top: '55%', left: '80%', size: 4 },
    { top: '70%', left: '35%', size: 3 },
    { top: '80%', left: '65%', size: 4 },
    { top: '35%', left: '50%', size: 3 },
    { top: '65%', left: '25%', size: 3 },
  ];

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onSwipeComplete={onClose}
      swipeDirection="down"
      animationIn="fadeIn"
      animationOut="fadeOut"
      backdropOpacity={0.9}
      hideModalContentWhileAnimating
      useNativeDriverForBackdrop
    >
      <Pressable
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View style={{ alignItems: 'center' }}>
            {/* 3D tilting card */}
            <Animated.View
              style={[
                {
                  width: PIN_SIZE,
                  height: PIN_SIZE,
                  overflow: 'hidden',
                  borderRadius: 16,
                },
                cardStyle,
              ]}
            >
              {/* Pin image */}
              <Image
                source={pin.item.icon_url}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
              />

              {/* Rainbow holo bands */}
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: -50,
                    left: -50,
                    right: -50,
                    bottom: -50,
                  },
                  holoStyle,
                ]}
              >
                {[
                  { color: 'rgba(255,50,50,0.35)', top: '0%' },
                  { color: 'rgba(255,180,0,0.3)', top: '14%' },
                  { color: 'rgba(255,255,50,0.3)', top: '28%' },
                  { color: 'rgba(50,255,100,0.3)', top: '42%' },
                  { color: 'rgba(50,200,255,0.3)', top: '56%' },
                  { color: 'rgba(130,50,255,0.3)', top: '70%' },
                  { color: 'rgba(255,50,200,0.3)', top: '84%' },
                ].map((band, i) => (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      top: band.top,
                      left: 0,
                      right: 0,
                      height: '18%',
                      backgroundColor: band.color,
                      transform: [{ rotate: '35deg' }],
                    }}
                  />
                ))}
              </Animated.View>

              {/* Soft light reflection (multiple layers for soft edge) */}
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    width: PIN_SIZE * 1.2,
                    height: PIN_SIZE * 1.2,
                    borderRadius: PIN_SIZE * 0.6,
                    backgroundColor: 'rgba(255,255,255,0.15)',
                  },
                  lightStyle,
                ]}
              />
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    width: PIN_SIZE * 0.7,
                    height: PIN_SIZE * 0.7,
                    borderRadius: PIN_SIZE * 0.35,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                  },
                  lightStyle,
                ]}
              />

              {/* Sparkle dots */}
              <Animated.View
                style={[
                  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
                  sparkleStyle,
                ]}
              >
                {SPARKLES.map((s, i) => (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      top: s.top,
                      left: s.left,
                      width: s.size,
                      height: s.size,
                      borderRadius: s.size / 2,
                      backgroundColor: 'white',
                      shadowColor: 'white',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 1,
                      shadowRadius: 3,
                    }}
                  />
                ))}
              </Animated.View>
            </Animated.View>

            {/* Pin name */}
            <View
              style={{
                marginTop: 24,
                backgroundColor: 'rgba(0,0,0,0.6)',
                borderRadius: 12,
                paddingHorizontal: 24,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Shark',
                  fontSize: 20,
                  color: 'white',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                }}
              >
                {pin.item.name}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 14,
                color: pin.item.has_purchased ? '#4ade80' : 'rgba(255,255,255,0.5)',
                marginTop: 8,
                textAlign: 'center',
              }}
            >
              {pin.item.has_purchased ? 'Collected' : 'Not Yet Collected'}
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
