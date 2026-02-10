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
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COIN_SIZE = SCREEN_WIDTH * 0.6;
const MAX_ANGLE = 15;
const DECAY_FACTOR = 0.95;

interface Props {
  visible: boolean;
  coinUrl: string;
  name?: string;
  onClose: () => void;
}

export default function HoloCoinPreview({ visible, coinUrl, name, onClose }: Props) {
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const gyroX = useSharedValue(0);
  const gyroY = useSharedValue(0);
  const scale = useSharedValue(0.85);

  useFrameCallback(() => {
    if (!visible) return;
    let newX = rotateX.value + gyroX.value * 0.8;
    let newY = rotateY.value - gyroY.value * 0.8;
    newX *= DECAY_FACTOR;
    newY *= DECAY_FACTOR;
    rotateX.value = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, newX));
    rotateY.value = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, newY));
    gyroX.value = 0;
    gyroY.value = 0;
  });

  useEffect(() => {
    if (!visible) {
      rotateX.value = withSpring(0);
      rotateY.value = withSpring(0);
      scale.value = withTiming(0.85, { duration: 200 });
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(1, { damping: 12, stiffness: 100 });

    Gyroscope.setUpdateInterval(16);
    const sub = Gyroscope.addListener(({ x, y }) => {
      gyroX.value = x;
      gyroY.value = y;
    });

    return () => sub.remove();
  }, [visible]);

  const normX = useDerivedValue(() => rotateX.value / MAX_ANGLE);
  const normY = useDerivedValue(() => rotateY.value / MAX_ANGLE);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` },
      { scale: scale.value },
    ],
  }));

  const lightStyle = useAnimatedStyle(() => {
    const x = interpolate(normY.value, [-1, 1], [-COIN_SIZE * 0.5, COIN_SIZE * 0.5]);
    const y = interpolate(normX.value, [-1, 1], [-COIN_SIZE * 0.5, COIN_SIZE * 0.5]);
    const intensity = Math.abs(normX.value) + Math.abs(normY.value);
    return {
      transform: [{ translateX: x }, { translateY: y }],
      opacity: interpolate(intensity, [0, 0.5, 2], [0.03, 0.2, 0.35]),
    };
  });

  const holoStyle = useAnimatedStyle(() => {
    const intensity = Math.abs(normX.value) + Math.abs(normY.value);
    const shiftX = interpolate(normY.value, [-1, 1], [-40, 40]);
    const shiftY = interpolate(normX.value, [-1, 1], [-40, 40]);
    return {
      opacity: interpolate(intensity, [0, 0.3, 2], [0.0, 0.12, 0.3]),
      transform: [{ translateX: shiftX }, { translateY: shiftY }],
    };
  });

  const sparkleStyle = useAnimatedStyle(() => {
    const intensity = Math.abs(normX.value) + Math.abs(normY.value);
    return { opacity: interpolate(intensity, [0, 0.5, 2], [0, 0.3, 0.7]) };
  });

  const SPARKLES = [
    { top: '15%', left: '25%', size: 4 },
    { top: '20%', left: '70%', size: 3 },
    { top: '45%', left: '12%', size: 3 },
    { top: '50%', left: '82%', size: 4 },
    { top: '72%', left: '30%', size: 3 },
    { top: '78%', left: '68%', size: 4 },
  ];

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      onSwipeComplete={onClose}
      swipeDirection="down"
      animationIn="fadeIn"
      animationOut="fadeOut"
      backdropOpacity={0.92}
      hideModalContentWhileAnimating
      useNativeDriverForBackdrop
    >
      <Pressable
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View style={{ alignItems: 'center' }}>
            <Animated.View
              style={[
                {
                  width: COIN_SIZE,
                  height: COIN_SIZE,
                  overflow: 'hidden',
                  borderRadius: COIN_SIZE / 2,
                },
                cardStyle,
              ]}
            >
              <Image
                source={coinUrl}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
              />

              {/* Rainbow holo */}
              <Animated.View
                style={[
                  { position: 'absolute', top: -50, left: -50, right: -50, bottom: -50 },
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

              {/* Light reflections */}
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    width: COIN_SIZE * 1.2,
                    height: COIN_SIZE * 1.2,
                    borderRadius: COIN_SIZE * 0.6,
                    backgroundColor: 'rgba(255,255,255,0.15)',
                  },
                  lightStyle,
                ]}
              />
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    width: COIN_SIZE * 0.7,
                    height: COIN_SIZE * 0.7,
                    borderRadius: COIN_SIZE * 0.35,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                  },
                  lightStyle,
                ]}
              />

              {/* Sparkles */}
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

            {/* Coin name */}
            {name && (
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
                  {name}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
