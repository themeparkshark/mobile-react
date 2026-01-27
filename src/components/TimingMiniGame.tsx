import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import Modal from 'react-native-modal';
import * as Haptics from '../helpers/haptics';
import Button from './Button';
import Ribbon from './Ribbon';
import config from '../config';

interface Props {
  visible: boolean;
  taskName: string;
  rounds: number;
  onClose: () => void;
  onComplete: (multiplier: number, perfectCount: number) => void;
}

type GameState = 'ready' | 'playing' | 'waiting' | 'result' | 'complete';
type HitResult = 'perfect' | 'good' | 'miss';

/**
 * Timing Mini-Game
 * Hit the button when the slider is in the target zone!
 * 
 * Multipliers based on total perfects:
 * - 0 perfect: 0.5x
 * - 1 perfect: 0.75x
 * - 2 perfect: 1.0x
 * - 3 perfect: 1.5x
 * - 4+ perfect: 2.0x
 */
export default function TimingMiniGame({
  visible,
  taskName,
  rounds,
  onClose,
  onComplete,
}: Props) {
  const [gameState, setGameState] = useState<GameState>('ready');
  const [currentRound, setCurrentRound] = useState(1);
  const [results, setResults] = useState<HitResult[]>([]);
  const [lastResult, setLastResult] = useState<HitResult | null>(null);
  const [finalMultiplier, setFinalMultiplier] = useState(1);
  
  const sliderPosition = useRef(new Animated.Value(0)).current;
  const targetZoneStart = useRef(0.4); // 40-60% is target zone (adjustable per round)
  const targetZoneEnd = useRef(0.6);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const currentPosition = useRef(0);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const resultScale = useRef(new Animated.Value(0)).current;

  // Track slider position
  useEffect(() => {
    const listener = sliderPosition.addListener(({ value }) => {
      currentPosition.current = value;
    });
    return () => sliderPosition.removeListener(listener);
  }, []);

  // Reset game when modal opens
  useEffect(() => {
    if (visible) {
      setGameState('ready');
      setCurrentRound(1);
      setResults([]);
      setLastResult(null);
      sliderPosition.setValue(0);
    }
  }, [visible]);

  // Pulse animation for button
  useEffect(() => {
    if (gameState === 'playing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [gameState]);

  // Get difficulty for current round (makes it harder each round)
  const getDifficulty = useCallback((round: number) => {
    const baseZoneSize = 0.25; // 25% target zone
    const minZoneSize = 0.1; // Minimum 10% target zone
    const zoneReduction = 0.03 * (round - 1); // Reduce by 3% per round
    const zoneSize = Math.max(minZoneSize, baseZoneSize - zoneReduction);
    
    const center = 0.5;
    targetZoneStart.current = center - zoneSize / 2;
    targetZoneEnd.current = center + zoneSize / 2;
    
    // Speed increases each round
    const baseSpeed = 1500; // 1.5 seconds to cross
    const speedIncrease = 150 * (round - 1); // 150ms faster per round
    return Math.max(800, baseSpeed - speedIncrease);
  }, []);

  // Start a round
  const startRound = useCallback(() => {
    setGameState('playing');
    sliderPosition.setValue(0);
    
    const speed = getDifficulty(currentRound);
    
    // Animate slider back and forth
    const animate = () => {
      animationRef.current = Animated.sequence([
        Animated.timing(sliderPosition, {
          toValue: 1,
          duration: speed,
          useNativeDriver: false,
        }),
        Animated.timing(sliderPosition, {
          toValue: 0,
          duration: speed,
          useNativeDriver: false,
        }),
      ]);
      
      animationRef.current.start(({ finished }) => {
        if (finished && gameState === 'playing') {
          animate();
        }
      });
    };
    
    animate();
  }, [currentRound, getDifficulty, gameState]);

  // Handle tap
  const handleTap = useCallback(() => {
    if (gameState !== 'playing') return;
    
    // Stop animation
    if (animationRef.current) {
      animationRef.current.stop();
    }
    
    const pos = currentPosition.current;
    let result: HitResult;
    
    // Calculate how close to center
    const center = (targetZoneStart.current + targetZoneEnd.current) / 2;
    const distanceFromCenter = Math.abs(pos - center);
    const perfectThreshold = 0.05; // Within 5% of center = perfect
    const goodThreshold = (targetZoneEnd.current - targetZoneStart.current) / 2;
    
    if (pos >= targetZoneStart.current && pos <= targetZoneEnd.current) {
      if (distanceFromCenter <= perfectThreshold) {
        result = 'perfect';
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        result = 'good';
        if (Platform.OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }
    } else {
      result = 'miss';
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
    
    setLastResult(result);
    setResults(prev => [...prev, result]);
    setGameState('result');
    
    // Animate result
    resultScale.setValue(0);
    Animated.spring(resultScale, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
    
    // Auto-advance after delay
    setTimeout(() => {
      if (currentRound >= rounds) {
        calculateFinalScore([...results, result]);
      } else {
        setCurrentRound(prev => prev + 1);
        setGameState('waiting');
        setTimeout(() => startRound(), 500);
      }
    }, 1200);
  }, [gameState, currentRound, rounds, results, startRound]);

  // Calculate final score
  const calculateFinalScore = useCallback((allResults: HitResult[]) => {
    const perfectCount = allResults.filter(r => r === 'perfect').length;
    const goodCount = allResults.filter(r => r === 'good').length;
    
    let mult: number;
    if (perfectCount >= 4) mult = 2.0;
    else if (perfectCount >= 3) mult = 1.5;
    else if (perfectCount >= 2) mult = 1.0;
    else if (perfectCount >= 1 || goodCount >= 2) mult = 0.75;
    else mult = 0.5;
    
    setFinalMultiplier(mult);
    setGameState('complete');
    
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(
        mult >= 1.5 ? Haptics.NotificationFeedbackType.Success :
        Haptics.NotificationFeedbackType.Warning
      );
    }
  }, []);

  // Handle done
  const handleDone = () => {
    const perfectCount = results.filter(r => r === 'perfect').length;
    onComplete(finalMultiplier, perfectCount);
    onClose();
  };

  // Get result color
  const getResultColor = (result: HitResult): string => {
    switch (result) {
      case 'perfect': return '#FFD700';
      case 'good': return '#4CAF50';
      case 'miss': return config.red;
    }
  };

  // Get multiplier color
  const getMultiplierColor = (mult: number): string => {
    if (mult >= 2.0) return '#FFD700';
    if (mult >= 1.5) return '#4CAF50';
    if (mult >= 1.0) return config.tertiary;
    return config.red;
  };

  const sliderTranslate = sliderPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Dimensions.get('window').width * 0.65],
  });

  return (
    <Modal
      animationIn="zoomIn"
      animationOut="zoomOut"
      isVisible={visible}
      onBackdropPress={gameState === 'ready' ? onClose : undefined}
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
            width: Dimensions.get('window').width - 32,
            position: 'relative',
            alignItems: 'center',
          }}
        >
          {/* Ribbon Header */}
          <Ribbon text="Perfect Timing!" />

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
                        Hit the target zone!
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
                        {rounds} rounds - tap when the slider is in the green!
                      </Text>

                      <Button onPress={() => { setGameState('waiting'); setTimeout(startRound, 500); }}>
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

                  {/* Playing / Waiting / Result State */}
                  {(gameState === 'playing' || gameState === 'waiting' || gameState === 'result') && (
                    <>
                      {/* Round indicator */}
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 20,
                          color: 'white',
                          marginBottom: 16,
                        }}
                      >
                        Round {currentRound} of {rounds}
                      </Text>

                      {/* Progress dots */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'center',
                          marginBottom: 20,
                          gap: 8,
                        }}
                      >
                        {Array.from({ length: rounds }).map((_, i) => (
                          <View
                            key={i}
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 8,
                              backgroundColor: results[i] 
                                ? getResultColor(results[i]) 
                                : i === currentRound - 1 
                                  ? 'white' 
                                  : 'rgba(255, 255, 255, 0.3)',
                              borderWidth: 2,
                              borderColor: 'rgba(255, 255, 255, 0.5)',
                            }}
                          />
                        ))}
                      </View>

                      {/* Slider track */}
                      <View
                        style={{
                          width: '100%',
                          height: 50,
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: 25,
                          marginBottom: 20,
                          overflow: 'hidden',
                          position: 'relative',
                          borderWidth: 3,
                          borderColor: 'rgba(255, 255, 255, 0.3)',
                        }}
                      >
                        {/* Target zone */}
                        <View
                          style={{
                            position: 'absolute',
                            left: `${targetZoneStart.current * 100}%`,
                            width: `${(targetZoneEnd.current - targetZoneStart.current) * 100}%`,
                            height: '100%',
                            backgroundColor: 'rgba(76, 175, 80, 0.6)',
                          }}
                        >
                          {/* Perfect center line */}
                          <View
                            style={{
                              position: 'absolute',
                              left: '50%',
                              width: 4,
                              height: '100%',
                              backgroundColor: '#FFD700',
                              marginLeft: -2,
                            }}
                          />
                        </View>

                        {/* Slider */}
                        <Animated.View
                          style={{
                            position: 'absolute',
                            left: 0,
                            width: 20,
                            height: '100%',
                            backgroundColor: config.tertiary,
                            borderRadius: 10,
                            transform: [{ translateX: sliderTranslate }],
                            shadowColor: '#000',
                            shadowOffset: { width: 2, height: 0 },
                            shadowRadius: 0,
                            shadowOpacity: 0.5,
                          }}
                        />
                      </View>

                      {/* Result display */}
                      {gameState === 'result' && lastResult && (
                        <Animated.View
                          style={{
                            marginBottom: 16,
                            transform: [{ scale: resultScale }],
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: 'Shark',
                              fontSize: 36,
                              color: getResultColor(lastResult),
                              textAlign: 'center',
                              textTransform: 'uppercase',
                              textShadowColor: 'rgba(0, 0, 0, 0.5)',
                              textShadowOffset: { width: 2, height: 2 },
                              textShadowRadius: 0,
                            }}
                          >
                            {lastResult === 'perfect' ? '⭐ PERFECT!' :
                             lastResult === 'good' ? '👍 GOOD!' : '❌ MISS!'}
                          </Text>
                        </Animated.View>
                      )}

                      {/* Tap button (only during playing) */}
                      {gameState === 'playing' && (
                        <TouchableOpacity
                          onPress={handleTap}
                          activeOpacity={0.9}
                        >
                          <Animated.View
                            style={{
                              width: 120,
                              height: 120,
                              borderRadius: 60,
                              backgroundColor: config.tertiary,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 5,
                              borderColor: 'white',
                              shadowColor: '#000',
                              shadowOffset: { width: 4, height: 4 },
                              shadowRadius: 0,
                              shadowOpacity: 0.4,
                              transform: [{ scale: pulseAnim }],
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
                              TAP!
                            </Text>
                          </Animated.View>
                        </TouchableOpacity>
                      )}

                      {/* Waiting indicator */}
                      {gameState === 'waiting' && (
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 18,
                            color: 'rgba(255, 255, 255, 0.7)',
                          }}
                        >
                          Get ready...
                        </Text>
                      )}
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
                        {finalMultiplier >= 1.5 ? '🎯 Precision!' : 
                         finalMultiplier >= 1.0 ? '👍 Nice!' : '😅 Keep Practicing!'}
                      </Text>

                      {/* Results summary */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'center',
                          marginBottom: 16,
                          gap: 12,
                        }}
                      >
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 24, color: '#FFD700' }}>
                            {results.filter(r => r === 'perfect').length}
                          </Text>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                            Perfect
                          </Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 24, color: '#4CAF50' }}>
                            {results.filter(r => r === 'good').length}
                          </Text>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                            Good
                          </Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 24, color: config.red }}>
                            {results.filter(r => r === 'miss').length}
                          </Text>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                            Miss
                          </Text>
                        </View>
                      </View>

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
      </View>
    </Modal>
  );
}
