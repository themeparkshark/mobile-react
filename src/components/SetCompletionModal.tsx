import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import config from '../config';
import Button from './Button';
import Ribbon from './Ribbon';
import {
  PrepItemSetType,
  PrepItemSetRewardType,
  SET_THEME_CONFIG,
} from '../models/prep-item-set-type';

interface Props {
  visible: boolean;
  set: PrepItemSetType | null;
  onClose: () => void;
  onClaim: () => void;
}

// Firework particle component
function Firework({ delay, x }: { delay: number; x: number }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(translateY, {
          toValue: -80,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: '40%',
        opacity,
        transform: [{ scale }, { translateY }],
      }}
    >
      <Text style={{ fontSize: 40 }}>✨</Text>
    </Animated.View>
  );
}

// Star burst animation
function StarBurst() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    angle: (i * 30 * Math.PI) / 180,
    delay: i * 50,
  }));

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      pointerEvents="none"
    >
      {particles.map((p) => (
        <StarParticle key={p.id} angle={p.angle} delay={p.delay} />
      ))}
    </View>
  );
}

function StarParticle({ angle, delay }: { angle: number; delay: number }) {
  const distance = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay + 200),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.delay(400),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(distance, {
          toValue: 100,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const translateX = distance.interpolate({
    inputRange: [0, 100],
    outputRange: [0, Math.cos(angle) * 100],
  });

  const translateY = distance.interpolate({
    inputRange: [0, 100],
    outputRange: [0, Math.sin(angle) * 100],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        opacity,
        transform: [{ translateX }, { translateY }],
      }}
    >
      <Text style={{ fontSize: 16, color: config.tertiary }}>⭐</Text>
    </Animated.View>
  );
}

/**
 * Set Completion Modal - V2 Feature
 * 
 * Celebratory modal shown when player completes a prep item set.
 * Displays rewards and any special items earned.
 */
export default function SetCompletionModal({
  visible,
  set,
  onClose,
  onClaim,
}: Props) {
  const [claimed, setClaimed] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Trophy entrance animation
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      rotateAnim.setValue(0);
      setClaimed(false);
    }
  }, [visible]);

  const handleClaim = () => {
    setClaimed(true);
    onClaim();
  };

  if (!set) return null;

  const themeConfig = SET_THEME_CONFIG[set.theme];
  const rewards = set.completion_bonus;

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      isVisible={visible}
      onBackdropPress={claimed ? onClose : undefined}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Fireworks */}
        <Firework delay={0} x={50} />
        <Firework delay={200} x={Dimensions.get('window').width - 90} />
        <Firework delay={400} x={Dimensions.get('window').width / 2 - 20} />

        <View
          style={{
            width: Dimensions.get('window').width - 40,
            position: 'relative',
            alignItems: 'center',
          }}
        >
          {/* Ribbon Header */}
          <Ribbon text="Set Complete!" />

          {/* Main Content Box */}
          <View
            style={{
              backgroundColor: config.primary,
              marginTop: '-10%',
              width: '90%',
              zIndex: 10,
              shadowColor: '#000',
              shadowOffset: { width: 2, height: 2 },
              shadowRadius: 0,
              shadowOpacity: 0.4,
              borderColor: 'rgba(0, 0, 0, 0.4)',
              borderWidth: 2,
              borderRadius: 16,
            }}
          >
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <ImageBackground
                source={require('../../assets/images/modals/daily_gift.png')}
                resizeMode="cover"
                style={{ width: '100%' }}
              >
                <StarBurst />

                <View
                  style={{
                    paddingTop: 32,
                    paddingHorizontal: 16,
                    paddingBottom: 24,
                    alignItems: 'center',
                  }}
                >
                  {/* Trophy / Set Icon */}
                  <Animated.View
                    style={{
                      marginBottom: 16,
                      transform: [{ scale: scaleAnim }, { rotate: spin }],
                    }}
                  >
                    <View
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: 50,
                        backgroundColor: themeConfig.color,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 4,
                        borderColor: config.tertiary,
                        shadowColor: config.tertiary,
                        shadowOffset: { width: 0, height: 0 },
                        shadowRadius: 20,
                        shadowOpacity: 0.8,
                      }}
                    >
                      {set.icon_url ? (
                        <Image
                          source={{ uri: set.icon_url }}
                          style={{ width: 60, height: 60 }}
                          contentFit="contain"
                        />
                      ) : (
                        <Text style={{ fontSize: 50 }}>{themeConfig.icon}</Text>
                      )}
                    </View>
                  </Animated.View>

                  {/* Set Name */}
                  <Text
                    style={{
                      fontFamily: 'Shark',
                      fontSize: 26,
                      color: config.tertiary,
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      textShadowColor: 'rgba(0, 0, 0, 0.5)',
                      textShadowOffset: { width: 2, height: 2 },
                      textShadowRadius: 0,
                      marginBottom: 8,
                    }}
                  >
                    {set.name}
                  </Text>

                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 14,
                      color: 'rgba(255, 255, 255, 0.8)',
                      textAlign: 'center',
                      marginBottom: 20,
                    }}
                  >
                    {set.description}
                  </Text>

                  {/* Items Collected */}
                  <View
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 16,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        fontSize: 16,
                        color: '#4CAF50',
                        textAlign: 'center',
                      }}
                    >
                      ✓ {set.total_items}/{set.total_items} Items Collected!
                    </Text>
                  </View>

                  {/* Rewards */}
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 12,
                      color: 'rgba(255, 255, 255, 0.6)',
                      textTransform: 'uppercase',
                      marginBottom: 12,
                    }}
                  >
                    Bonus Rewards
                  </Text>

                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                      marginBottom: 20,
                      gap: 12,
                    }}
                  >
                    {rewards.energy > 0 && (
                      <View
                        style={{
                          alignItems: 'center',
                          backgroundColor: 'rgba(0, 0, 0, 0.2)',
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 12,
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>⚡</Text>
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 20,
                            color: '#4CAF50',
                          }}
                        >
                          +{rewards.energy}
                        </Text>
                      </View>
                    )}
                    {rewards.tickets > 0 && (
                      <View
                        style={{
                          alignItems: 'center',
                          backgroundColor: 'rgba(0, 0, 0, 0.2)',
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 12,
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>🎟️</Text>
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 20,
                            color: '#4CAF50',
                          }}
                        >
                          +{rewards.tickets}
                        </Text>
                      </View>
                    )}
                    {rewards.experience > 0 && (
                      <View
                        style={{
                          alignItems: 'center',
                          backgroundColor: 'rgba(0, 0, 0, 0.2)',
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 12,
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>⭐</Text>
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 20,
                            color: '#4CAF50',
                          }}
                        >
                          +{rewards.experience}
                        </Text>
                      </View>
                    )}
                    {rewards.ride_parts > 0 && (
                      <View
                        style={{
                          alignItems: 'center',
                          backgroundColor: 'rgba(0, 0, 0, 0.2)',
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 12,
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>🔧</Text>
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 20,
                            color: '#4CAF50',
                          }}
                        >
                          +{rewards.ride_parts}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Special Item Reward */}
                  {rewards.special_item && (
                    <View
                      style={{
                        backgroundColor: 'rgba(255, 215, 0, 0.2)',
                        borderRadius: 12,
                        padding: 16,
                        marginBottom: 20,
                        borderWidth: 2,
                        borderColor: '#FFD700',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 12,
                          color: '#FFD700',
                          textTransform: 'uppercase',
                          marginBottom: 8,
                        }}
                      >
                        🏆 Special Reward!
                      </Text>
                      {rewards.special_item.icon_url && (
                        <Image
                          source={{ uri: rewards.special_item.icon_url }}
                          style={{ width: 60, height: 60, marginBottom: 8 }}
                          contentFit="contain"
                        />
                      )}
                      <Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 18,
                          color: '#FFD700',
                        }}
                      >
                        {rewards.special_item.name}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 12,
                          color: 'rgba(255, 255, 255, 0.7)',
                          textAlign: 'center',
                        }}
                      >
                        {rewards.special_item.description}
                      </Text>
                    </View>
                  )}

                  {/* Claim/Done Button */}
                  <Button onPress={claimed ? onClose : handleClaim}>
                    <ImageBackground
                      source={require('../../assets/images/yellow_button.png')}
                      style={{
                        paddingHorizontal: 48,
                        paddingVertical: 14,
                        alignItems: 'center',
                      }}
                      resizeMode="stretch"
                    >
                      <Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 22,
                          color: config.primary,
                          textTransform: 'uppercase',
                        }}
                      >
                        {claimed ? 'Awesome!' : 'Claim Rewards!'}
                      </Text>
                    </ImageBackground>
                  </Button>
                </View>
              </ImageBackground>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
