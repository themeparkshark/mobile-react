import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import config from '../config';
import Button from './Button';
import Ribbon from './Ribbon';
import { AuthContext } from '../context/AuthProvider';
import {
  RideCoinLevelType,
  RideCoinPerkType,
  RIDE_COIN_LEVEL_CONFIG,
} from '../models/ride-coin-level-type';
import { RIDE_PART_RARITY_CONFIG } from '../models/ride-part-type';

interface Props {
  visible: boolean;
  rideCoin: RideCoinLevelType | null;
  playerEnergy: number;
  playerParts: number;
  onClose: () => void;
  onLevelUp: (rideCoinId: number) => Promise<boolean>;
}

type LevelUpState = 'idle' | 'leveling' | 'success' | 'error';

/**
 * Coin Leveling Modal - V2 Feature
 * 
 * Allows players to spend Energy + Ride Parts to level up their ride coins.
 * Each level unlocks cosmetic upgrades and perks.
 */
export default function CoinLevelingModal({
  visible,
  rideCoin,
  playerEnergy,
  playerParts,
  onClose,
  onLevelUp,
}: Props) {
  const [state, setState] = useState<LevelUpState>('idle');
  const [error, setError] = useState<string | null>(null);
  
  const progressAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  
  const { refreshPlayer } = useContext(AuthContext);

  // Glow animation for max level coins
  useEffect(() => {
    if (rideCoin?.current_level === rideCoin?.max_level) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
    return () => glowAnim.setValue(0);
  }, [rideCoin?.current_level]);

  const canLevelUp = (): boolean => {
    if (!rideCoin) return false;
    if (rideCoin.current_level >= rideCoin.max_level) return false;
    if (!rideCoin.is_unlocked) return false;
    if (playerEnergy < rideCoin.energy_to_next_level) return false;
    if (playerParts < rideCoin.parts_to_next_level) return false;
    return true;
  };

  const handleLevelUp = async () => {
    if (!rideCoin || !canLevelUp()) return;

    setState('leveling');
    setError(null);

    // Animate progress
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: false,
    }).start();

    try {
      const success = await onLevelUp(rideCoin.id);
      
      if (success) {
        setState('success');
        await refreshPlayer();
      } else {
        throw new Error('Level up failed');
      }
    } catch (err: any) {
      setState('error');
      setError(err?.message || 'Failed to level up coin');
      
      // Shake animation for error
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  };

  const handleDone = () => {
    setState('idle');
    setError(null);
    progressAnim.setValue(0);
    onClose();
  };

  const getLevelColor = (level: number): string => {
    if (level >= 5) return '#FFD700'; // Gold
    if (level >= 4) return '#C0C0C0'; // Silver enhanced
    if (level >= 3) return '#A0A0A0'; // Silver
    if (level >= 2) return '#CD7F32'; // Bronze enhanced
    return '#8B4513'; // Bronze
  };

  if (!rideCoin) return null;

  const isMaxLevel = rideCoin.current_level >= rideCoin.max_level;
  const isLocked = !rideCoin.is_unlocked;
  const hasResources = playerEnergy >= rideCoin.energy_to_next_level && 
                       playerParts >= rideCoin.parts_to_next_level;

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal
      animationIn="zoomIn"
      animationOut="zoomOut"
      isVisible={visible}
      onBackdropPress={state === 'idle' ? onClose : undefined}
    >
      <Animated.View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateX: shakeAnim }],
        }}
      >
        <View
          style={{
            width: Dimensions.get('window').width - 32,
            position: 'relative',
            alignItems: 'center',
          }}
        >
          {/* Ribbon Header */}
          <Ribbon text={isMaxLevel ? 'Max Level!' : 'Level Up Coin'} />

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
              maxHeight: Dimensions.get('window').height * 0.7,
            }}
          >
            <ScrollView
              style={{ borderRadius: 16 }}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              <ImageBackground
                source={require('../../assets/images/modals/daily_gift.png')}
                resizeMode="cover"
                style={{ width: '100%' }}
              >
                <View
                  style={{
                    paddingTop: 32,
                    paddingHorizontal: 16,
                    paddingBottom: 16,
                    alignItems: 'center',
                  }}
                >
                  {/* Locked State */}
                  {isLocked && (
                    <View
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        padding: 20,
                        borderRadius: 12,
                        alignItems: 'center',
                        marginBottom: 16,
                      }}
                    >
                      <Text style={{ fontSize: 40, marginBottom: 8 }}>🔒</Text>
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 16,
                          color: config.tertiary,
                          textAlign: 'center',
                        }}
                      >
                        Requires Level {rideCoin.player_level_required}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 14,
                          color: 'rgba(255, 255, 255, 0.7)',
                          textAlign: 'center',
                          marginTop: 4,
                        }}
                      >
                        Keep earning XP to unlock!
                      </Text>
                    </View>
                  )}

                  {/* Coin Display */}
                  <View
                    style={{
                      marginBottom: 16,
                      position: 'relative',
                    }}
                  >
                    {/* Glow effect for max level */}
                    {isMaxLevel && (
                      <Animated.View
                        style={{
                          position: 'absolute',
                          top: -20,
                          left: -20,
                          right: -20,
                          bottom: -20,
                          backgroundColor: '#FFD700',
                          borderRadius: 80,
                          opacity: glowOpacity,
                        }}
                      />
                    )}
                    
                    {/* Frame based on level */}
                    <View
                      style={{
                        padding: 8,
                        borderRadius: 60,
                        borderWidth: 4,
                        borderColor: getLevelColor(rideCoin.current_level),
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      <Image
                        source={{ uri: rideCoin.coin_url }}
                        style={{
                          width: 100,
                          height: 100,
                          opacity: isLocked ? 0.3 : 1,
                        }}
                        contentFit="contain"
                      />
                    </View>

                    {/* Level badge */}
                    <View
                      style={{
                        position: 'absolute',
                        bottom: -10,
                        right: -10,
                        backgroundColor: getLevelColor(rideCoin.current_level),
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 3,
                        borderColor: config.primary,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 18,
                          color: config.primary,
                        }}
                      >
                        {rideCoin.current_level}
                      </Text>
                    </View>
                  </View>

                  {/* Coin Name */}
                  <Text
                    style={{
                      fontFamily: 'Shark',
                      fontSize: 22,
                      color: 'white',
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      textShadowColor: 'rgba(0, 0, 0, 0.5)',
                      textShadowOffset: { width: 2, height: 2 },
                      textShadowRadius: 0,
                      marginBottom: 4,
                    }}
                  >
                    {rideCoin.ride_name}
                  </Text>
                  
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 14,
                      color: 'rgba(255, 255, 255, 0.7)',
                      marginBottom: 16,
                    }}
                  >
                    Collected {rideCoin.times_collected} times
                  </Text>

                  {/* Current Perks */}
                  {rideCoin.current_perks.length > 0 && (
                    <View
                      style={{
                        width: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 16,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 12,
                          color: 'rgba(255, 255, 255, 0.6)',
                          textTransform: 'uppercase',
                          marginBottom: 8,
                        }}
                      >
                        Current Perks
                      </Text>
                      {rideCoin.current_perks.map((perk, index) => (
                        <View
                          key={perk.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginBottom: index < rideCoin.current_perks.length - 1 ? 6 : 0,
                          }}
                        >
                          <Text style={{ fontSize: 14, marginRight: 8 }}>✓</Text>
                          <Text
                            style={{
                              fontFamily: 'Knockout',
                              fontSize: 14,
                              color: '#4CAF50',
                              flex: 1,
                            }}
                          >
                            {perk.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Level Up Requirements (not max level) */}
                  {!isMaxLevel && !isLocked && (
                    <>
                      {/* Next Level Perks */}
                      {rideCoin.next_level_perks.length > 0 && (
                        <View
                          style={{
                            width: '100%',
                            backgroundColor: 'rgba(254, 201, 14, 0.2)',
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 16,
                            borderWidth: 2,
                            borderColor: config.tertiary,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: 'Knockout',
                              fontSize: 12,
                              color: config.tertiary,
                              textTransform: 'uppercase',
                              marginBottom: 8,
                            }}
                          >
                            Level {rideCoin.current_level + 1} Unlocks
                          </Text>
                          {rideCoin.next_level_perks.map((perk, index) => (
                            <View
                              key={perk.id}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginBottom: index < rideCoin.next_level_perks.length - 1 ? 6 : 0,
                              }}
                            >
                              <Text style={{ fontSize: 14, marginRight: 8 }}>⭐</Text>
                              <Text
                                style={{
                                  fontFamily: 'Knockout',
                                  fontSize: 14,
                                  color: config.tertiary,
                                  flex: 1,
                                }}
                              >
                                {perk.name}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Requirements */}
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 12,
                          color: 'rgba(255, 255, 255, 0.6)',
                          textTransform: 'uppercase',
                          marginBottom: 8,
                        }}
                      >
                        Requirements
                      </Text>
                      
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'center',
                          marginBottom: 16,
                          gap: 20,
                        }}
                      >
                        {/* Energy Cost */}
                        <View
                          style={{
                            alignItems: 'center',
                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderRadius: 12,
                            borderWidth: 2,
                            borderColor: playerEnergy >= rideCoin.energy_to_next_level 
                              ? '#4CAF50' 
                              : config.red,
                          }}
                        >
                          <Text style={{ fontSize: 24 }}>⚡</Text>
                          <Text
                            style={{
                              fontFamily: 'Knockout',
                              fontSize: 20,
                              color: playerEnergy >= rideCoin.energy_to_next_level 
                                ? '#4CAF50' 
                                : config.red,
                            }}
                          >
                            {playerEnergy}/{rideCoin.energy_to_next_level}
                          </Text>
                          <Text
                            style={{
                              fontFamily: 'Knockout',
                              fontSize: 11,
                              color: 'rgba(255, 255, 255, 0.6)',
                            }}
                          >
                            Energy
                          </Text>
                        </View>

                        {/* Parts Cost */}
                        <View
                          style={{
                            alignItems: 'center',
                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderRadius: 12,
                            borderWidth: 2,
                            borderColor: playerParts >= rideCoin.parts_to_next_level 
                              ? '#4CAF50' 
                              : config.red,
                          }}
                        >
                          <Text style={{ fontSize: 24 }}>🔧</Text>
                          <Text
                            style={{
                              fontFamily: 'Knockout',
                              fontSize: 20,
                              color: playerParts >= rideCoin.parts_to_next_level 
                                ? '#4CAF50' 
                                : config.red,
                            }}
                          >
                            {playerParts}/{rideCoin.parts_to_next_level}
                          </Text>
                          <Text
                            style={{
                              fontFamily: 'Knockout',
                              fontSize: 11,
                              color: 'rgba(255, 255, 255, 0.6)',
                            }}
                          >
                            Ride Parts
                          </Text>
                        </View>
                      </View>

                      {/* Leveling Progress Bar (during level up) */}
                      {state === 'leveling' && (
                        <View
                          style={{
                            width: '100%',
                            height: 20,
                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                            borderRadius: 10,
                            marginBottom: 16,
                            overflow: 'hidden',
                          }}
                        >
                          <Animated.View
                            style={{
                              height: '100%',
                              width: progressWidth,
                              backgroundColor: config.tertiary,
                              borderRadius: 10,
                            }}
                          />
                        </View>
                      )}

                      {/* Level Up Button */}
                      <Button
                        onPress={handleLevelUp}
                        hasPermission={canLevelUp() && state === 'idle'}
                      >
                        <ImageBackground
                          source={require('../../assets/images/yellow_button.png')}
                          style={{
                            paddingHorizontal: 40,
                            paddingVertical: 12,
                            alignItems: 'center',
                            opacity: canLevelUp() ? 1 : 0.5,
                          }}
                          resizeMode="stretch"
                        >
                          <Text
                            style={{
                              fontFamily: 'Shark',
                              fontSize: 20,
                              color: config.primary,
                              textTransform: 'uppercase',
                            }}
                          >
                            {state === 'leveling' ? 'Leveling...' : 'Level Up!'}
                          </Text>
                        </ImageBackground>
                      </Button>

                      {/* Not enough resources message */}
                      {!hasResources && state === 'idle' && (
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 12,
                            color: 'rgba(255, 255, 255, 0.5)',
                            textAlign: 'center',
                            marginTop: 8,
                          }}
                        >
                          Collect more {playerEnergy < rideCoin.energy_to_next_level ? 'energy' : 'ride parts'}!
                        </Text>
                      )}
                    </>
                  )}

                  {/* Success State */}
                  {state === 'success' && (
                    <View style={{ alignItems: 'center', marginTop: 16 }}>
                      <Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 28,
                          color: config.tertiary,
                          marginBottom: 12,
                        }}
                      >
                        🎉 Level Up!
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 16,
                          color: 'white',
                          textAlign: 'center',
                          marginBottom: 20,
                        }}
                      >
                        Your coin is now Level {rideCoin.current_level + 1}!
                      </Text>
                      <Button onPress={handleDone}>
                        <ImageBackground
                          source={require('../../assets/images/yellow_button.png')}
                          style={{
                            paddingHorizontal: 40,
                            paddingVertical: 12,
                            alignItems: 'center',
                          }}
                          resizeMode="stretch"
                        >
                          <Text
                            style={{
                              fontFamily: 'Shark',
                              fontSize: 20,
                              color: config.primary,
                              textTransform: 'uppercase',
                            }}
                          >
                            Awesome!
                          </Text>
                        </ImageBackground>
                      </Button>
                    </View>
                  )}

                  {/* Error State */}
                  {state === 'error' && (
                    <View style={{ alignItems: 'center', marginTop: 16 }}>
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 16,
                          color: config.red,
                          textAlign: 'center',
                          marginBottom: 12,
                        }}
                      >
                        {error}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setState('idle')}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.2)',
                          paddingHorizontal: 24,
                          paddingVertical: 10,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 14,
                            color: 'white',
                          }}
                        >
                          Try Again
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Max Level State */}
                  {isMaxLevel && (
                    <View style={{ alignItems: 'center' }}>
                      <Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 24,
                          color: '#FFD700',
                          marginBottom: 8,
                        }}
                      >
                        ⭐ MAXED OUT ⭐
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 14,
                          color: 'rgba(255, 255, 255, 0.7)',
                          textAlign: 'center',
                          marginBottom: 16,
                        }}
                      >
                        This coin is at maximum power!
                        {'\n'}Boss challenge available!
                      </Text>
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#9C27B0',
                          paddingHorizontal: 24,
                          paddingVertical: 12,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: 'rgba(255, 255, 255, 0.3)',
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: 'Shark',
                            fontSize: 16,
                            color: 'white',
                            textTransform: 'uppercase',
                          }}
                        >
                          🎮 Boss Challenge
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </ImageBackground>
            </ScrollView>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}
