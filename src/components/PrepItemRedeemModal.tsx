import { Image } from 'expo-image';
import { useContext, useState, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  Text,
  View,
  Platform,
} from 'react-native';
import Modal from 'react-native-modal';
import LottieView from 'lottie-react-native';
import { PrepItemType } from '../models/prep-item-type';
import { AuthContext } from '../context/AuthProvider';
import redeemPrepItem from '../api/endpoints/me/prep-items/redeem';
import Button from './Button';
import Ribbon from './Ribbon';
import config from '../config';
import HapticPatterns from '../helpers/hapticPatterns';
import {
  FloatingNumber,
  StarBurst,
  PulseGlow,
  CelebrationLevel,
} from './CelebrationEffects';

// Map rarity number to celebration level
const RARITY_TO_CELEBRATION: Record<number, CelebrationLevel> = {
  1: 'common',
  2: 'uncommon',
  3: 'rare',
  4: 'epic',
  5: 'legendary',
};

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

  // Animation refs for collect celebration
  const itemScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const [showStarBurst, setShowStarBurst] = useState(false);
  const [showFloatingRewards, setShowFloatingRewards] = useState(false);
  const lottieRef = useRef<LottieView>(null);

  const handleCollect = async () => {
    if (!prepItem || !pivotId) return;

    setIsCollecting(true);
    
    // Trigger haptic based on rarity
    const celebrationLevel = RARITY_TO_CELEBRATION[prepItem.rarity] || 'common';
    HapticPatterns.collect(celebrationLevel);

    try {
      const response = await redeemPrepItem(
        prepItem.id,
        pivotId,
        player?.is_subscribed || false
      );

      setRewards(response.data.rewards);
      setStreakInfo(response.data.streak);
      
      // Play celebration animations
      playCollectAnimation(prepItem.rarity);
      
      setShowRewards(true);

      await refreshPlayer();
    } catch (error) {
      console.error('Failed to collect prep item:', error);
      HapticPatterns.error();
      onClose();
    } finally {
      setIsCollecting(false);
    }
  };

  // Play the collect celebration animation
  const playCollectAnimation = (rarity: number) => {
    // Item pop animation
    Animated.sequence([
      Animated.timing(itemScale, {
        toValue: 1.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(itemScale, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();

    // Screen glow for rare+
    if (rarity >= 3) {
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.4,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }

    // Star burst for rare+
    if (rarity >= 3) {
      setShowStarBurst(true);
      setTimeout(() => setShowStarBurst(false), 1000);
    }

    // Floating rewards
    setTimeout(() => setShowFloatingRewards(true), 300);
    setTimeout(() => setShowFloatingRewards(false), 2000);

    // Play Lottie confetti for epic+
    if (rarity >= 4) {
      lottieRef.current?.play();
    }
  };

  const handleDone = () => {
    HapticPatterns.buttonTap();
    setShowRewards(false);
    setRewards(null);
    setStreakInfo(null);
    setShowFloatingRewards(false);
    onCollected();
    onClose();
  };

  // Trigger haptic when modal opens
  useEffect(() => {
    if (visible && prepItem) {
      HapticPatterns.modalOpen();
    }
  }, [visible, prepItem]);

  if (!prepItem) return null;

  const rarityConfig = {
    1: { label: 'Common', color: '#4CAF50', glowColor: '#4CAF50' },
    2: { label: 'Uncommon', color: config.secondary, glowColor: config.secondary },
    3: { label: 'Rare', color: '#9C27B0', glowColor: '#9C27B0' },
    4: { label: 'Epic', color: '#E91E63', glowColor: '#E91E63' },
    5: { label: 'Legendary', color: '#FFD700', glowColor: '#FFD700' },
  }[prepItem.rarity] || { label: 'Common', color: '#4CAF50', glowColor: '#4CAF50' };

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
                {/* Screen glow for rare+ items */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: rarityConfig.glowColor,
                    opacity: glowOpacity,
                  }}
                  pointerEvents="none"
                />

                {/* Lottie confetti for epic+ items */}
                {prepItem.rarity >= 4 && (
                  <LottieView
                    ref={lottieRef}
                    source={require('../../assets/animations/confetti.json')}
                    style={{
                      position: 'absolute',
                      width: '150%',
                      height: '150%',
                      left: '-25%',
                      top: '-25%',
                    }}
                    loop={false}
                  />
                )}

                {/* Star burst effect */}
                {showStarBurst && (
                  <View style={{ position: 'absolute', top: '30%', alignSelf: 'center' }}>
                    <StarBurst visible color={rarityConfig.color} count={prepItem.rarity >= 5 ? 12 : 8} />
                  </View>
                )}

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

                      {/* Item Image with pulse glow for rare+ */}
                      <PulseGlow
                        color={rarityConfig.glowColor}
                        intensity={prepItem.rarity >= 3 ? 0.8 : 0.3}
                        speed={prepItem.rarity >= 4 ? 1000 : 2000}
                      >
                        <Animated.View
                          style={{
                            marginBottom: 16,
                            shadowColor: '#000',
                            shadowOffset: { width: 2, height: 2 },
                            shadowRadius: 0,
                            shadowOpacity: 0.3,
                            transform: [{ scale: itemScale }],
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
                        </Animated.View>
                      </PulseGlow>

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
                      {/* Floating reward numbers */}
                      {showFloatingRewards && rewards && (
                        <View style={{ position: 'absolute', top: 20, alignSelf: 'center', zIndex: 100 }}>
                          {rewards.energy > 0 && (
                            <FloatingNumber
                              value={rewards.energy}
                              emoji="⚡"
                              color="#4CAF50"
                              delay={0}
                            />
                          )}
                          {rewards.tickets > 0 && (
                            <FloatingNumber
                              value={rewards.tickets}
                              emoji="🎟️"
                              color="#FF9800"
                              delay={200}
                            />
                          )}
                          {rewards.experience > 0 && (
                            <FloatingNumber
                              value={rewards.experience}
                              label="XP"
                              color={config.tertiary}
                              delay={400}
                            />
                          )}
                        </View>
                      )}

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
                        {prepItem.rarity >= 4 ? '🔥 EPIC!' : prepItem.rarity >= 3 ? '✨ Nice!' : '🎉 Got it!'}
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
