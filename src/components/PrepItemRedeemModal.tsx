import { Image } from 'expo-image';
import { useContext, useState, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { PrepItemType } from '../models/prep-item-type';
import { AuthContext } from '../context/AuthProvider';
import redeemPrepItem from '../api/endpoints/me/prep-items/redeem';
import Button from './Button';
import Ribbon from './Ribbon';
import config from '../config';

// Simple confetti particle component
function ConfettiParticle({ delay, color }: { delay: number; color: string }) {
  const translateY = useRef(new Animated.Value(-50)).current;
  const translateX = useRef(
    new Animated.Value(Math.random() * 200 - 100)
  ).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 400,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 360,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
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
        width: 10,
        height: 10,
        backgroundColor: color,
        borderRadius: 2,
        transform: [{ translateY }, { translateX }, { rotate: spin }],
        opacity,
      }}
    />
  );
}

function Confetti() {
  const colors = [
    config.tertiary,
    config.red,
    '#4CAF50',
    config.secondary,
    '#9C27B0',
    '#FF9800',
  ];
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    delay: Math.random() * 500,
    color: colors[Math.floor(Math.random() * colors.length)],
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
        overflow: 'hidden',
      }}
      pointerEvents="none"
    >
      {particles.map((p) => (
        <ConfettiParticle key={p.id} delay={p.delay} color={p.color} />
      ))}
    </View>
  );
}

interface Props {
  visible: boolean;
  prepItem: PrepItemType | null;
  pivotId: number | null;
  onClose: () => void;
  onCollected: () => void;
}

/**
 * Modal for collecting a prep item.
 * Styled to match app's AAA quality standards.
 */
export default function PrepItemRedeemModal({
  visible,
  prepItem,
  pivotId,
  onClose,
  onCollected,
}: Props) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [rewards, setRewards] = useState<{
    energy: number;
    tickets: number;
    experience: number;
  } | null>(null);
  const [streakInfo, setStreakInfo] = useState<{
    current: number;
    multiplier: number;
  } | null>(null);
  const { player, refreshPlayer } = useContext(AuthContext);

  const handleCollect = async () => {
    if (!prepItem || !pivotId) return;

    setIsCollecting(true);
    try {
      const response = await redeemPrepItem(
        prepItem.id,
        pivotId,
        player?.is_subscribed || false
      );

      setRewards(response.data.rewards);
      setStreakInfo(response.data.streak);
      setShowRewards(true);

      await refreshPlayer();
    } catch (error) {
      console.error('Failed to collect prep item:', error);
      onClose();
    } finally {
      setIsCollecting(false);
    }
  };

  const handleDone = () => {
    setShowRewards(false);
    setRewards(null);
    setStreakInfo(null);
    onCollected();
    onClose();
  };

  if (!prepItem) return null;

  const rarityConfig = {
    1: { label: 'Common', color: '#4CAF50' },
    2: { label: 'Uncommon', color: config.secondary },
    3: { label: 'Rare', color: '#9C27B0' },
  }[prepItem.rarity] || { label: 'Common', color: '#4CAF50' };

  return (
    <Modal
      animationIn="zoomIn"
      animationOut="zoomOut"
      isVisible={visible}
      onBackdropPress={onClose}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: Dimensions.get('window').width - 40,
            position: 'relative',
            alignItems: 'center',
          }}
        >
          {/* Ribbon Header */}
          <Ribbon text={showRewards ? 'Collected!' : 'Prep Item'} />

          {/* Main Content Box */}
          <View
            style={{
              backgroundColor: config.secondary,
              marginTop: '-10%',
              width: '85%',
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
                <Confetti />

                <View
                  style={{
                    paddingTop: 32,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingBottom: 24,
                    alignItems: 'center',
                  }}
                >
                  {!showRewards ? (
                    // Pre-collect view
                    <>
                      {/* Rarity Badge */}
                      <View
                        style={{
                          backgroundColor: rarityConfig.color,
                          paddingHorizontal: 16,
                          paddingVertical: 6,
                          borderRadius: 12,
                          marginBottom: 16,
                          borderWidth: 2,
                          borderColor: 'rgba(255, 255, 255, 0.3)',
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 14,
                            color: 'white',
                            textTransform: 'uppercase',
                            textShadowColor: 'rgba(0, 0, 0, 0.5)',
                            textShadowOffset: { width: 1, height: 1 },
                            textShadowRadius: 0,
                          }}
                        >
                          {rarityConfig.label}
                        </Text>
                      </View>

                      {/* Item Image */}
                      <View
                        style={{
                          marginBottom: 16,
                          shadowColor: '#000',
                          shadowOffset: { width: 2, height: 2 },
                          shadowRadius: 0,
                          shadowOpacity: 0.3,
                        }}
                      >
                        {prepItem.icon_url ? (
                          <Image
                            source={{ uri: prepItem.icon_url }}
                            style={{ width: 100, height: 100 }}
                            contentFit="contain"
                          />
                        ) : (
                          <View
                            style={{
                              width: 100,
                              height: 100,
                              borderRadius: 50,
                              backgroundColor: rarityConfig.color,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ fontSize: 50 }}>🎁</Text>
                          </View>
                        )}
                      </View>

                      {/* Item Name */}
                      <Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 24,
                          color: 'white',
                          textAlign: 'center',
                          textTransform: 'uppercase',
                          textShadowColor: 'rgba(0, 0, 0, 0.5)',
                          textShadowOffset: { width: 2, height: 2 },
                          textShadowRadius: 0,
                          marginBottom: 8,
                        }}
                      >
                        {prepItem.name}
                      </Text>

                      {prepItem.description && (
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 14,
                            color: 'rgba(255, 255, 255, 0.8)',
                            textAlign: 'center',
                            marginBottom: 16,
                          }}
                        >
                          {prepItem.description}
                        </Text>
                      )}

                      {/* Rewards Preview */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'center',
                          marginBottom: 20,
                          gap: 12,
                        }}
                      >
                        {prepItem.energy_reward > 0 && (
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
                                fontSize: 18,
                                color: config.tertiary,
                              }}
                            >
                              +{prepItem.energy_reward}
                            </Text>
                          </View>
                        )}
                        {prepItem.ticket_reward > 0 && (
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
                                fontSize: 18,
                                color: config.tertiary,
                              }}
                            >
                              +{prepItem.ticket_reward}
                            </Text>
                          </View>
                        )}
                        {prepItem.experience_reward > 0 && (
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
                                fontSize: 18,
                                color: config.tertiary,
                              }}
                            >
                              +{prepItem.experience_reward}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Collect Button */}
                      <Button
                        onPress={handleCollect}
                        hasPermission={!isCollecting}
                      >
                        <ImageBackground
                          source={require('../../assets/images/yellow_button.png')}
                          style={{
                            paddingHorizontal: 40,
                            paddingVertical: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
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
                            {isCollecting ? 'Collecting...' : 'Collect!'}
                          </Text>
                        </ImageBackground>
                      </Button>
                    </>
                  ) : (
                    // Post-collect view
                    <>
                      <Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 28,
                          color: config.tertiary,
                          textAlign: 'center',
                          textTransform: 'uppercase',
                          textShadowColor: 'rgba(0, 0, 0, 0.5)',
                          textShadowOffset: { width: 2, height: 2 },
                          textShadowRadius: 0,
                          marginBottom: 8,
                          marginTop: 16,
                        }}
                      >
                        🎉 Nice!
                      </Text>

                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 18,
                          color: 'white',
                          textAlign: 'center',
                          marginBottom: 20,
                        }}
                      >
                        {prepItem.name}
                      </Text>

                      {/* Rewards Received */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'center',
                          marginBottom: 20,
                          gap: 16,
                        }}
                      >
                        {rewards?.energy && rewards.energy > 0 && (
                          <View style={{ alignItems: 'center' }}>
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 28,
                                color: '#4CAF50',
                              }}
                            >
                              +{rewards.energy}
                            </Text>
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 12,
                                color: 'rgba(255, 255, 255, 0.7)',
                              }}
                            >
                              ⚡ Energy
                            </Text>
                          </View>
                        )}
                        {rewards?.tickets && rewards.tickets > 0 && (
                          <View style={{ alignItems: 'center' }}>
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 28,
                                color: '#4CAF50',
                              }}
                            >
                              +{rewards.tickets}
                            </Text>
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 12,
                                color: 'rgba(255, 255, 255, 0.7)',
                              }}
                            >
                              🎟️ Tickets
                            </Text>
                          </View>
                        )}
                        {rewards?.experience && rewards.experience > 0 && (
                          <View style={{ alignItems: 'center' }}>
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 28,
                                color: '#4CAF50',
                              }}
                            >
                              +{rewards.experience}
                            </Text>
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 12,
                                color: 'rgba(255, 255, 255, 0.7)',
                              }}
                            >
                              ⭐ XP
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Streak Info */}
                      {streakInfo && streakInfo.current > 0 && (
                        <View
                          style={{
                            alignItems: 'center',
                            marginBottom: 20,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: 'Knockout',
                              fontSize: 18,
                              color: '#FF9800',
                            }}
                          >
                            🔥 {streakInfo.current} day streak!
                          </Text>
                          {streakInfo.multiplier > 1 && (
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 14,
                                color: config.tertiary,
                              }}
                            >
                              {streakInfo.multiplier}x bonus applied!
                            </Text>
                          )}
                        </View>
                      )}

                      {/* Done Button */}
                      <Button onPress={handleDone}>
                        <ImageBackground
                          source={require('../../assets/images/yellow_button.png')}
                          style={{
                            paddingHorizontal: 40,
                            paddingVertical: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
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
                            Awesome!
                          </Text>
                        </ImageBackground>
                      </Button>
                    </>
                  )}
                </View>
              </ImageBackground>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
