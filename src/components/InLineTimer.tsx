import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { Image } from 'expo-image';
import config from '../config';
import Button from './Button';
import Ribbon from './Ribbon';
import { RIDE_PART_RARITY_CONFIG } from '../models/ride-part-type';

interface RidePartDrop {
  id: number;
  name: string;
  icon_url: string;
  rarity: keyof typeof RIDE_PART_RARITY_CONFIG;
}

interface Props {
  visible: boolean;
  rideName: string;
  rideIconUrl?: string;
  estimatedWaitMinutes: number;
  onClose: () => void;
  onComplete: (earnedParts: RidePartDrop[], bonusEnergy: number) => void;
}

type TimerState = 'waiting' | 'mini_game_available' | 'complete';

/**
 * In-Line Timer Modal - V2 Feature
 * 
 * Tracks time spent waiting in line:
 * - Passive Ride Part earning every 5 minutes
 * - Mini-game prompts for bonus rewards
 * - Completion rewards when ride is done
 */
export default function InLineTimer({
  visible,
  rideName,
  rideIconUrl,
  estimatedWaitMinutes,
  onClose,
  onComplete,
}: Props) {
  const [state, setState] = useState<TimerState>('waiting');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [earnedParts, setEarnedParts] = useState<RidePartDrop[]>([]);
  const [bonusEnergy, setBonusEnergy] = useState(0);
  const [lastPartDrop, setLastPartDrop] = useState<RidePartDrop | null>(null);
  const [showPartDrop, setShowPartDrop] = useState(false);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const dropAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Passive earning interval (5 minutes = 300 seconds)
  const PASSIVE_INTERVAL_SECONDS = 300;
  // Mini-game prompt interval (10 minutes = 600 seconds)
  const MINI_GAME_INTERVAL_SECONDS = 600;

  // Pulsing animation for timer
  useEffect(() => {
    if (state === 'waiting') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
    return () => pulseAnim.setValue(1);
  }, [state]);

  // Timer countdown
  useEffect(() => {
    if (!visible || state === 'complete') return;

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        const newTime = prev + 1;
        
        // Check for passive part drop
        if (newTime > 0 && newTime % PASSIVE_INTERVAL_SECONDS === 0) {
          dropRidePart();
        }
        
        // Check for mini-game prompt
        if (newTime > 0 && newTime % MINI_GAME_INTERVAL_SECONDS === 0) {
          setState('mini_game_available');
        }
        
        return newTime;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [visible, state]);

  // Simulated ride part drop
  const dropRidePart = () => {
    const rarities = Object.keys(RIDE_PART_RARITY_CONFIG) as Array<keyof typeof RIDE_PART_RARITY_CONFIG>;
    let roll = Math.random() * 100;
    let selectedRarity: keyof typeof RIDE_PART_RARITY_CONFIG = 'common';
    
    for (const rarity of rarities) {
      if (roll <= RIDE_PART_RARITY_CONFIG[rarity].chance) {
        selectedRarity = rarity;
        break;
      }
      roll -= RIDE_PART_RARITY_CONFIG[rarity].chance;
    }

    const newPart: RidePartDrop = {
      id: Date.now(),
      name: `${rideName} Part`,
      icon_url: '', // Would come from API
      rarity: selectedRarity,
    };

    setEarnedParts((prev) => [...prev, newPart]);
    setLastPartDrop(newPart);
    setShowPartDrop(true);

    // Animate part drop
    dropAnim.setValue(0);
    Animated.sequence([
      Animated.timing(dropAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.delay(1500),
      Animated.timing(dropAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setShowPartDrop(false));
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMiniGameDismiss = () => {
    setState('waiting');
    // Add bonus energy for dismissing mini-game prompt
    setBonusEnergy((prev) => prev + 5);
  };

  const handleRideComplete = () => {
    setState('complete');
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    // Calculate completion bonus
    const completionBonus = Math.floor(elapsedSeconds / 60); // 1 energy per minute waited
    setBonusEnergy((prev) => prev + completionBonus);
  };

  const handleDone = () => {
    onComplete(earnedParts, bonusEnergy);
    // Reset state
    setElapsedSeconds(0);
    setEarnedParts([]);
    setBonusEnergy(0);
    setState('waiting');
    onClose();
  };

  const dropOpacity = dropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const dropTranslate = dropAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-50, 0],
  });

  return (
    <Modal
      animationIn="slideInUp"
      animationOut="slideOutDown"
      isVisible={visible}
      onBackdropPress={state === 'complete' ? handleDone : undefined}
      style={{ margin: 0, justifyContent: 'flex-end' }}
    >
      <View
        style={{
          backgroundColor: config.primary,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingBottom: 40,
        }}
      >
        {/* Handle bar */}
        <View
          style={{
            width: 40,
            height: 4,
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            borderRadius: 2,
            alignSelf: 'center',
            marginTop: 12,
            marginBottom: 8,
          }}
        />

        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          {rideIconUrl ? (
            <Image
              source={{ uri: rideIconUrl }}
              style={{ width: 50, height: 50, marginRight: 12 }}
              contentFit="contain"
            />
          ) : (
            <View
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: config.secondary,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <Text style={{ fontSize: 24 }}>🎢</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 18,
                color: 'white',
                textTransform: 'uppercase',
              }}
            >
              {rideName}
            </Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 12,
                color: 'rgba(255, 255, 255, 0.7)',
              }}
            >
              Est. wait: {estimatedWaitMinutes} min
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: 18 }}>×</Text>
          </TouchableOpacity>
        </View>

        {/* Main Timer Display */}
        {state !== 'complete' && (
          <Animated.View
            style={{
              alignItems: 'center',
              paddingVertical: 20,
              transform: [{ scale: pulseAnim }],
            }}
          >
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 14,
                color: 'rgba(255, 255, 255, 0.6)',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              ⏱️ Time in Line
            </Text>
            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 56,
                color: config.tertiary,
                textShadowColor: 'rgba(0, 0, 0, 0.5)',
                textShadowOffset: { width: 2, height: 2 },
                textShadowRadius: 0,
              }}
            >
              {formatTime(elapsedSeconds)}
            </Text>
          </Animated.View>
        )}

        {/* Part Drop Animation */}
        {showPartDrop && lastPartDrop && (
          <Animated.View
            style={{
              position: 'absolute',
              top: 120,
              left: 0,
              right: 0,
              alignItems: 'center',
              opacity: dropOpacity,
              transform: [{ translateY: dropTranslate }],
            }}
          >
            <View
              style={{
                backgroundColor: RIDE_PART_RARITY_CONFIG[lastPartDrop.rarity].color,
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 16,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.3)',
              }}
            >
              <Text style={{ fontSize: 24, marginRight: 8 }}>🔧</Text>
              <View>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 16,
                    color: 'white',
                  }}
                >
                  +1 Ride Part!
                </Text>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 12,
                    color: 'rgba(255, 255, 255, 0.8)',
                    textTransform: 'uppercase',
                  }}
                >
                  {lastPartDrop.rarity}
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Progress Stats */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            paddingHorizontal: 20,
            paddingVertical: 16,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            marginHorizontal: 16,
            borderRadius: 12,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24 }}>🔧</Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 24,
                color: config.tertiary,
              }}
            >
              {earnedParts.length}
            </Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 11,
                color: 'rgba(255, 255, 255, 0.6)',
              }}
            >
              Parts Earned
            </Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24 }}>⚡</Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 24,
                color: '#4CAF50',
              }}
            >
              {bonusEnergy}
            </Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 11,
                color: 'rgba(255, 255, 255, 0.6)',
              }}
            >
              Bonus Energy
            </Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24 }}>🎯</Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 24,
                color: config.secondary,
              }}
            >
              {Math.floor(elapsedSeconds / PASSIVE_INTERVAL_SECONDS) + 1}
            </Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 11,
                color: 'rgba(255, 255, 255, 0.6)',
              }}
            >
              Next Drop In
            </Text>
          </View>
        </View>

        {/* Next part timer */}
        {state === 'waiting' && (
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <View
              style={{
                height: 6,
                width: '60%',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${((elapsedSeconds % PASSIVE_INTERVAL_SECONDS) / PASSIVE_INTERVAL_SECONDS) * 100}%`,
                  backgroundColor: config.tertiary,
                  borderRadius: 3,
                }}
              />
            </View>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 12,
                color: 'rgba(255, 255, 255, 0.5)',
                marginTop: 4,
              }}
            >
              {formatTime(PASSIVE_INTERVAL_SECONDS - (elapsedSeconds % PASSIVE_INTERVAL_SECONDS))} until next part
            </Text>
          </View>
        )}

        {/* Mini-game prompt */}
        {state === 'mini_game_available' && (
          <View
            style={{
              backgroundColor: config.tertiary,
              marginHorizontal: 16,
              marginTop: 16,
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 18,
                color: config.primary,
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              🎮 Mini-Game Available!
            </Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 14,
                color: config.primary,
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              Play a quick trivia for bonus parts!
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={handleMiniGameDismiss}
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 14,
                    color: config.primary,
                  }}
                >
                  Skip (+5 ⚡)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: config.primary,
                  paddingHorizontal: 20,
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
                  Play Now!
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Complete State */}
        {state === 'complete' && (
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 28,
                color: config.tertiary,
                marginBottom: 12,
              }}
            >
              🎉 Ride Complete!
            </Text>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 16,
                color: 'white',
                marginBottom: 20,
              }}
            >
              Total wait: {formatTime(elapsedSeconds)}
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
                  Collect Rewards!
                </Text>
              </ImageBackground>
            </Button>
          </View>
        )}

        {/* Action Buttons */}
        {state !== 'complete' && (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              paddingHorizontal: 16,
              paddingTop: 20,
              gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 16,
                  color: 'white',
                }}
              >
                Minimize
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRideComplete}
              style={{
                flex: 1,
                backgroundColor: '#4CAF50',
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 16,
                  color: 'white',
                }}
              >
                ✓ Ride Done!
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
