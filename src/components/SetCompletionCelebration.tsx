import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  Platform,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import * as Haptics from '../helpers/haptics';
import { Image } from 'expo-image';
import Button from './Button';
import Ribbon from './Ribbon';
import config from '../config';
import {
  PrepItemSetType,
  SET_THEME_CONFIG,
  SET_RARITY_CONFIG,
} from '../models/prep-item-set-type';

interface Props {
  visible: boolean;
  set: PrepItemSetType | null;
  onClose: () => void;
  onClaim: () => void;
}

// Confetti particle
function ConfettiParticle({ delay, color, startX }: { delay: number; color: string; startX: number }) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const translateX = useRef(new Animated.Value(startX)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const wobble = Math.random() * 100 - 50;
    
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: Dimensions.get('window').height + 100,
          duration: 3000 + Math.random() * 1000,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: startX + wobble,
          duration: 3000 + Math.random() * 1000,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 720 + Math.random() * 360,
          duration: 3000 + Math.random() * 1000,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(2000),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, []);

  const spin = rotate.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: 12,
        height: 12,
        backgroundColor: color,
        borderRadius: 2,
        transform: [{ translateY }, { translateX }, { rotate: spin }],
        opacity,
      }}
    />
  );
}

// Firework burst
function Firework({ x, y, color, delay }: { x: number; y: number; color: string; delay: number }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 3,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(500),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x - 30,
        top: y - 30,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: color,
        transform: [{ scale }],
        opacity,
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 20,
        shadowOpacity: 0.8,
      }}
    />
  );
}

/**
 * Celebration modal when a set is completed.
 * Full of confetti, fireworks, and dopamine!
 */
export default function SetCompletionCelebration({
  visible,
  set,
  onClose,
  onClaim,
}: Props) {
  const [showRewards, setShowRewards] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const iconScale = useRef(new Animated.Value(0)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const rewardsScale = useRef(new Animated.Value(0)).current;

  // Generate confetti and fireworks
  const colors = [config.tertiary, '#4CAF50', '#FF9800', '#E91E63', '#9C27B0', '#2196F3'];
  const confetti = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    delay: Math.random() * 1000,
    color: colors[Math.floor(Math.random() * colors.length)],
    startX: Math.random() * Dimensions.get('window').width - Dimensions.get('window').width / 2,
  }));

  const fireworks = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    x: Math.random() * (Dimensions.get('window').width - 100) + 50,
    y: Math.random() * 200 + 100,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: i * 300 + Math.random() * 200,
  }));

  // Entrance animation
  useEffect(() => {
    if (visible && set) {
      // Haptic celebration
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 300);
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 600);
      }

      // Icon animation
      iconScale.setValue(0);
      iconRotate.setValue(0);
      Animated.parallel([
        Animated.spring(iconScale, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(iconRotate, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start();

      // Title fade in
      titleOpacity.setValue(0);
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 500,
        delay: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, set]);

  // Handle claim
  const handleClaim = async () => {
    setIsClaiming(true);
    
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    // Show rewards animation
    setShowRewards(true);
    rewardsScale.setValue(0);
    Animated.spring(rewardsScale, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();

    // Trigger claim after animation
    setTimeout(() => {
      onClaim();
    }, 2000);
  };

  if (!set) return null;

  const themeConfig = SET_THEME_CONFIG[set.theme];
  const rarityConfig = SET_RARITY_CONFIG[set.rarity];

  const spin = iconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      isVisible={visible}
      backdropOpacity={0.9}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {/* Confetti */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
          }}
          pointerEvents="none"
        >
          {confetti.map((c) => (
            <ConfettiParticle key={c.id} {...c} />
          ))}
        </View>

        {/* Fireworks */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          pointerEvents="none"
        >
          {fireworks.map((f) => (
            <Firework key={f.id} {...f} />
          ))}
        </View>

        {/* Main content */}
        <View
          style={{
            width: Dimensions.get('window').width - 48,
            alignItems: 'center',
          }}
        >
          {/* Trophy/Set Icon */}
          <Animated.View
            style={{
              transform: [{ scale: iconScale }, { rotate: spin }],
              marginBottom: 24,
            }}
          >
            <View
              style={{
                width: 120,
                height: 120,
                borderRadius: 60,
                backgroundColor: rarityConfig.color,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 4,
                borderColor: 'white',
                shadowColor: rarityConfig.color,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 30,
                shadowOpacity: 0.8,
              }}
            >
              {set.icon_url ? (
                <Image
                  source={{ uri: set.icon_url }}
                  style={{ width: 70, height: 70 }}
                  contentFit="contain"
                />
              ) : (
                <Text style={{ fontSize: 60 }}>🏆</Text>
              )}
            </View>
          </Animated.View>

          {/* Title */}
          <Animated.View style={{ opacity: titleOpacity, alignItems: 'center' }}>
            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 32,
                color: config.tertiary,
                textAlign: 'center',
                textTransform: 'uppercase',
                textShadowColor: 'rgba(0, 0, 0, 0.5)',
                textShadowOffset: { width: 2, height: 2 },
                textShadowRadius: 4,
                marginBottom: 8,
              }}
            >
              Set Complete!
            </Text>

            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 24,
                color: 'white',
                textAlign: 'center',
                textTransform: 'uppercase',
                marginBottom: 24,
              }}
            >
              {set.name}
            </Text>
          </Animated.View>

          {/* Rewards (after claim) */}
          {showRewards && (
            <Animated.View
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderRadius: 16,
                padding: 24,
                marginBottom: 24,
                transform: [{ scale: rewardsScale }],
                borderWidth: 2,
                borderColor: '#4CAF50',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 18,
                  color: '#4CAF50',
                  textAlign: 'center',
                  marginBottom: 16,
                }}
              >
                Rewards Claimed!
              </Text>
              
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
                {set.completion_rewards.energy > 0 && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 32 }}>⚡</Text>
                    <Text style={{ fontFamily: 'Shark', fontSize: 28, color: '#4CAF50' }}>
                      +{set.completion_rewards.energy}
                    </Text>
                  </View>
                )}
                {set.completion_rewards.tickets > 0 && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 32 }}>🎟️</Text>
                    <Text style={{ fontFamily: 'Shark', fontSize: 28, color: '#4CAF50' }}>
                      +{set.completion_rewards.tickets}
                    </Text>
                  </View>
                )}
                {set.completion_rewards.experience > 0 && (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 32 }}>⭐</Text>
                    <Text style={{ fontFamily: 'Shark', fontSize: 28, color: '#4CAF50' }}>
                      +{set.completion_rewards.experience}
                    </Text>
                  </View>
                )}
              </View>

              {set.completion_rewards.title && (
                <View style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 24 }}>🏆</Text>
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 16,
                      color: '#FFD700',
                      marginTop: 4,
                    }}
                  >
                    New Title: "{set.completion_rewards.title}"
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* Claim button (before claim) */}
          {!showRewards && (
            <Button onPress={handleClaim} hasPermission={!isClaiming}>
              <View
                style={{
                  backgroundColor: config.tertiary,
                  paddingHorizontal: 48,
                  paddingVertical: 16,
                  borderRadius: 16,
                  borderWidth: 3,
                  borderColor: 'white',
                  shadowColor: '#000',
                  shadowOffset: { width: 4, height: 4 },
                  shadowRadius: 0,
                  shadowOpacity: 0.3,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Shark',
                    fontSize: 24,
                    color: config.primary,
                    textTransform: 'uppercase',
                  }}
                >
                  {isClaiming ? 'Claiming...' : 'Claim Rewards!'}
                </Text>
              </View>
            </Button>
          )}

          {/* Close button (after rewards shown) */}
          {showRewards && (
            <Button onPress={onClose}>
              <View
                style={{
                  backgroundColor: '#4CAF50',
                  paddingHorizontal: 48,
                  paddingVertical: 16,
                  borderRadius: 16,
                  borderWidth: 3,
                  borderColor: 'white',
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Shark',
                    fontSize: 24,
                    color: 'white',
                    textTransform: 'uppercase',
                  }}
                >
                  Amazing!
                </Text>
              </View>
            </Button>
          )}
        </View>
      </View>
    </Modal>
  );
}
