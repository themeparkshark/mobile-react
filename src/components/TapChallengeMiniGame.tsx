import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  Text,
  TouchableOpacity,
  View,
  Vibration,
  Platform,
} from 'react-native';
import Modal from 'react-native-modal';
import * as Haptics from 'expo-haptics';
import Button from './Button';
import Ribbon from './Ribbon';
import config from '../config';

interface Props {
  visible: boolean;
  taskName: string;
  targetTaps: number;
  timeLimitSeconds: number;
  onClose: () => void;
  onComplete: (multiplier: number, tapsAchieved: number) => void;
}

type GameState = 'ready' | 'playing' | 'complete';

/**
 * Tap Challenge Mini-Game
 * Tap as fast as you can to hit the target!
 * 
 * Multipliers:
 * - < 50% target: 0.5x
 * - 50-75% target: 0.75x
 * - 75-100% target: 1.0x
 * - 100-125% target: 1.25x
 * - 125-150% target: 1.5x
 * - > 150% target: 2.0x
 */
export default function TapChallengeMiniGame({
  visible,
  taskName,
  targetTaps,
  timeLimitSeconds,
  onClose,
  onComplete,
}: Props) {
  const [gameState, setGameState] = useState<GameState>('ready');
  const [tapCount, setTapCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds);
  const [finalMultiplier, setFinalMultiplier] = useState(1);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const tapCountScale = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Reset game when modal opens
  useEffect(() => {
    if (visible) {
      setGameState('ready');
      setTapCount(0);
      setTimeLeft(timeLimitSeconds);
      progressAnim.setValue(1);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [visible, timeLimitSeconds]);

  // Start the game
  const startGame = () => {
    setGameState('playing');
    setTapCount(0);
    setTimeLeft(timeLimitSeconds);
    progressAnim.setValue(1);

    // Animate timer bar
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: timeLimitSeconds * 1000,
      useNativeDriver: false,
    }).start();

    // Countdown timer
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Calculate multiplier
  const calculateMultiplier = useCallback((taps: number): number => {
    const percentage = (taps / targetTaps) * 100;
    
    if (percentage < 50) return 0.5;
    if (percentage < 75) return 0.75;
    if (percentage < 100) return 1.0;
    if (percentage < 125) return 1.25;
    if (percentage < 150) return 1.5;
    return 2.0;
  }, [targetTaps]);

  // End the game
  const endGame = useCallback(() => {
    setGameState('complete');
    const mult = calculateMultiplier(tapCount);
    setFinalMultiplier(mult);
    
    // Heavy haptic for game end
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(
        mult >= 1.5 ? Haptics.NotificationFeedbackType.Success :
        mult >= 1.0 ? Haptics.NotificationFeedbackType.Warning :
        Haptics.NotificationFeedbackType.Error
      );
    }
  }, [tapCount, calculateMultiplier]);

  // Update multiplier when tap count changes (for endGame callback)
  useEffect(() => {
    if (gameState === 'playing') {
      // Just tracking for the callback
    }
  }, [tapCount, gameState]);

  // Handle tap
  const handleTap = useCallback(() => {
    if (gameState !== 'playing') return;

    // Increment tap
    setTapCount((prev) => {
      const newCount = prev + 1;
      
      // Calculate current multiplier for color
      const mult = calculateMultiplier(newCount);
      
      return newCount;
    });

    // Haptic feedback
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Vibration.vibrate(10);
    }

    // Button press animation
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.9,
        duration: 30,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 30,
        useNativeDriver: true,
      }),
    ]).start();

    // Tap count pop animation
    Animated.sequence([
      Animated.timing(tapCountScale, {
        toValue: 1.2,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(tapCountScale, {
        toValue: 1,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();

    // Screen shake on milestone taps
    if (tapCount > 0 && tapCount % 10 === 0) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 5, duration: 25, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -5, duration: 25, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 5, duration: 25, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 25, useNativeDriver: true }),
      ]).start();
    }
  }, [gameState, tapCount, buttonScale, tapCountScale, shakeAnim, calculateMultiplier]);

  // Handle done
  const handleDone = () => {
    onComplete(finalMultiplier, tapCount);
    onClose();
  };

  // Get multiplier color
  const getMultiplierColor = (mult: number): string => {
    if (mult >= 2.0) return '#FFD700'; // Gold
    if (mult >= 1.5) return '#4CAF50'; // Green
    if (mult >= 1.0) return config.tertiary; // Yellow
    if (mult >= 0.75) return '#FF9800'; // Orange
    return config.red; // Red
  };

  // Get progress color based on current tap percentage
  const getCurrentProgress = () => {
    const percentage = (tapCount / targetTaps) * 100;
    if (percentage >= 100) return '#4CAF50';
    if (percentage >= 75) return config.tertiary;
    if (percentage >= 50) return '#FF9800';
    return config.red;
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal
      animationIn="zoomIn"
      animationOut="zoomOut"
      isVisible={visible}
      onBackdropPress={gameState === 'ready' ? onClose : undefined}
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
          <Ribbon text="Tap Challenge!" />

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
                <View
                  style={{
                    paddingTop: 32,
                    paddingHorizontal: 16,
                    paddingBottom: 24,
                    alignItems: 'center',
                  }}
                >
                  {/* Task Name */}
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 16,
                      color: 'white',
                      textAlign: 'center',
                      marginBottom: 12,
                      opacity: 0.8,
                    }}
                  >
                    {taskName}
                  </Text>

                  {/* Ready State */}
                  {gameState === 'ready' && (
                    <>
                      <Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 24,
                          color: config.tertiary,
                          textAlign: 'center',
                          textTransform: 'uppercase',
                          textShadowColor: 'rgba(0, 0, 0, 0.5)',
                          textShadowOffset: { width: 2, height: 2 },
                          textShadowRadius: 0,
                          marginBottom: 8,
                        }}
                      >
                        Tap as fast as you can!
                      </Text>
                      
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 16,
                          color: 'rgba(255, 255, 255, 0.8)',
                          textAlign: 'center',
                          marginBottom: 24,
                        }}
                      >
                        Target: {targetTaps} taps in {timeLimitSeconds} seconds
                      </Text>

                      <Button onPress={startGame}>
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
                            Start!
                          </Text>
                        </ImageBackground>
                      </Button>

                      <TouchableOpacity
                        onPress={onClose}
                        style={{ marginTop: 12 }}
                      >
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 14,
                            color: 'rgba(255, 255, 255, 0.6)',
                          }}
                        >
                          Skip (0.5x)
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Playing State */}
                  {gameState === 'playing' && (
                    <>
                      {/* Timer */}
                      <Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 48,
                          color: timeLeft <= 3 ? config.red : config.tertiary,
                          textAlign: 'center',
                          textShadowColor: 'rgba(0, 0, 0, 0.5)',
                          textShadowOffset: { width: 2, height: 2 },
                          textShadowRadius: 0,
                        }}
                      >
                        {timeLeft}
                      </Text>

                      {/* Timer Bar */}
                      <View
                        style={{
                          width: '100%',
                          height: 12,
                          backgroundColor: 'rgba(255, 255, 255, 0.2)',
                          borderRadius: 6,
                          marginVertical: 12,
                          overflow: 'hidden',
                          borderWidth: 2,
                          borderColor: 'rgba(255, 255, 255, 0.3)',
                        }}
                      >
                        <Animated.View
                          style={{
                            height: '100%',
                            width: progressWidth,
                            backgroundColor: timeLeft <= 3 ? config.red : '#4CAF50',
                            borderRadius: 4,
                          }}
                        />
                      </View>

                      {/* Tap Count */}
                      <Animated.Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 72,
                          color: getCurrentProgress(),
                          textAlign: 'center',
                          textShadowColor: 'rgba(0, 0, 0, 0.5)',
                          textShadowOffset: { width: 3, height: 3 },
                          textShadowRadius: 0,
                          transform: [{ scale: tapCountScale }],
                        }}
                      >
                        {tapCount}
                      </Animated.Text>

                      {/* Target indicator */}
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 16,
                          color: 'rgba(255, 255, 255, 0.7)',
                          marginBottom: 16,
                        }}
                      >
                        Target: {targetTaps}
                      </Text>

                      {/* TAP BUTTON */}
                      <TouchableOpacity
                        onPress={handleTap}
                        activeOpacity={0.9}
                      >
                        <Animated.View
                          style={{
                            width: 150,
                            height: 150,
                            borderRadius: 75,
                            backgroundColor: config.tertiary,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 6,
                            borderColor: 'white',
                            shadowColor: '#000',
                            shadowOffset: { width: 4, height: 4 },
                            shadowRadius: 0,
                            shadowOpacity: 0.4,
                            transform: [{ scale: buttonScale }],
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: 'Shark',
                              fontSize: 36,
                              color: config.primary,
                              textTransform: 'uppercase',
                            }}
                          >
                            TAP!
                          </Text>
                        </Animated.View>
                      </TouchableOpacity>

                      {/* Current multiplier preview */}
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 18,
                          color: getMultiplierColor(calculateMultiplier(tapCount)),
                          marginTop: 16,
                        }}
                      >
                        Current: {calculateMultiplier(tapCount)}x
                      </Text>
                    </>
                  )}

                  {/* Complete State */}
                  {gameState === 'complete' && (
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
                        }}
                      >
                        {finalMultiplier >= 1.5 ? '🔥 Amazing!' : 
                         finalMultiplier >= 1.0 ? '👍 Nice!' : '😅 Almost!'}
                      </Text>

                      {/* Final tap count */}
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 20,
                          color: 'white',
                          marginBottom: 16,
                        }}
                      >
                        {tapCount} / {targetTaps} taps
                      </Text>

                      {/* Multiplier Display */}
                      <View
                        style={{
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          paddingHorizontal: 40,
                          paddingVertical: 16,
                          borderRadius: 16,
                          marginBottom: 20,
                          borderWidth: 3,
                          borderColor: getMultiplierColor(finalMultiplier),
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: 'Shark',
                            fontSize: 48,
                            color: getMultiplierColor(finalMultiplier),
                            textAlign: 'center',
                          }}
                        >
                          {finalMultiplier}x
                        </Text>
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 14,
                            color: 'rgba(255, 255, 255, 0.7)',
                            textAlign: 'center',
                          }}
                        >
                          Multiplier
                        </Text>
                      </View>

                      {/* Done Button */}
                      <Button onPress={handleDone}>
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
      </Animated.View>
    </Modal>
  );
}
