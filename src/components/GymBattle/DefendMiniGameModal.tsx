import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Pressable,
  ImageBackground,
} from 'react-native';
import { Image } from 'expo-image';
import Modal from 'react-native-modal';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { battleHUDEvents } from './battleHUDEvents';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  withRepeat,
  runOnJS,
  Easing,
  interpolate,
  FadeIn,
  FadeOut,
  SlideInDown,
  ZoomIn,
} from 'react-native-reanimated';
import { defendGym } from '../../api/endpoints/gym-battle';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface Props {
  visible: boolean;
  parkId: number;
  onComplete: () => void;
  onClose: () => void;
}

type GameState = 'ready' | 'countdown' | 'playing' | 'finished' | 'submitting';

const GAME_DURATION = 25; // 25 seconds for epic defense!

// Floating +N component (shows +1, +2, or +3)
interface FloatingPlusOneProps {
  id: number;
  x: number;
  y: number;
  value: number;
  onComplete: (id: number) => void;
}

const FloatingPlusOne = ({ id, x, y, value, onComplete }: FloatingPlusOneProps) => {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(0.3);
  const rotation = useSharedValue((Math.random() - 0.5) * 20);

  useEffect(() => {
    // Bigger animation for multiplied values
    const targetScale = value > 1 ? 1.5 : 1.2;
    scale.value = withSpring(targetScale, { damping: 6, stiffness: 300 });
    translateY.value = withTiming(-100, { duration: 700, easing: Easing.out(Easing.quad) });
    opacity.value = withDelay(400, withTiming(0, { duration: 300 }, () => {
      runOnJS(onComplete)(id);
    }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  // Different colors for multiplied values
  const textColor = value === 3 ? '#FF4444' : value === 2 ? '#FF8800' : '#FFD700';

  return (
    <Animated.Text
      style={[
        styles.floatingPlus,
        { left: x - 25, top: y - 20, color: textColor },
        animStyle,
      ]}
    >
      +{value}
    </Animated.Text>
  );
};

export default function DefendMiniGameModal({
  visible,
  parkId,
  onComplete,
  onClose,
}: Props) {
  const [gameState, setGameState] = useState<GameState>('ready');
  const [taps, setTaps] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [countdown, setCountdown] = useState(3);
  const [result, setResult] = useState<{ points: number; message: string } | null>(null);
  const [floatingPlusOnes, setFloatingPlusOnes] = useState<Array<{ id: number; x: number; y: number; value: number }>>([]);
  const plusOneIdRef = useRef(0);
  const [multiplier, setMultiplier] = useState<1 | 2 | 3>(1);
  const [totalPoints, setTotalPoints] = useState(0);

  // Sound refs
  const tapSoundRef = useRef<Audio.Sound | null>(null);
  const startSoundRef = useRef<Audio.Sound | null>(null);
  const endSoundRef = useRef<Audio.Sound | null>(null);

  // Animations
  const shieldScale = useSharedValue(1);
  const shieldRotation = useSharedValue(0);
  const screenShake = useSharedValue(0);
  const glowIntensity = useSharedValue(0.3);
  const multiplierScale = useSharedValue(1);
  const countdownScale = useSharedValue(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load sounds
  useEffect(() => {
    const loadSounds = async () => {
      try {
        // We'll use haptics as primary feedback, sounds as bonus
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      } catch (e) {
        // Sounds optional
      }
    };
    loadSounds();
    
    return () => {
      tapSoundRef.current?.unloadAsync();
      startSoundRef.current?.unloadAsync();
      endSoundRef.current?.unloadAsync();
    };
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setGameState('ready');
      setTaps(0);
      setTimeLeft(GAME_DURATION);
      setCountdown(3);
      setResult(null);
      setFloatingPlusOnes([]);
      setMultiplier(1);
      setTotalPoints(0);
      shieldScale.value = 1;
      glowIntensity.value = 0.3;
    }
  }, [visible]);

  // Activate random multiplier (x2 or x3) at 7 seconds remaining
  useEffect(() => {
    if (gameState === 'playing' && timeLeft === 7) {
      const randomMultiplier = Math.random() < 0.5 ? 2 : 3;
      setMultiplier(randomMultiplier as 2 | 3);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Big visual feedback
      screenShake.value = withSequence(
        withTiming(15, { duration: 50 }),
        withTiming(-15, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-10, { duration: 50 }),
        withTiming(0, { duration: 50 })
      );
    }
  }, [timeLeft, gameState]);

  // Countdown before game starts
  useEffect(() => {
    if (gameState === 'countdown' && countdown > 0) {
      countdownScale.value = withSequence(
        withTiming(1.5, { duration: 200 }),
        withTiming(1, { duration: 300 })
      );
      
      const timer = setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setCountdown(c => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (gameState === 'countdown' && countdown === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGameState('playing');
    }
  }, [gameState, countdown]);

  // Timer countdown during game
  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(t => t - 1);
        // Urgency haptics in last 5 seconds
        if (timeLeft <= 6) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }, 1000);
    } else if (gameState === 'playing' && timeLeft === 0) {
      handleGameEnd();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameState, timeLeft]);

  // Continuous shield glow pulse during play
  useEffect(() => {
    if (gameState === 'playing') {
      glowIntensity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 500 }),
          withTiming(0.3, { duration: 500 })
        ),
        -1,
        true
      );
    }
  }, [gameState]);

  const startGame = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setGameState('countdown');
    setCountdown(3);
  };

  const handleTap = useCallback((event: any) => {
    if (gameState !== 'playing') return;

    // Haptic feedback - stronger during multiplier
    const intensity = multiplier > 1 ? Haptics.ImpactFeedbackStyle.Heavy :
                      taps > 100 ? Haptics.ImpactFeedbackStyle.Medium : 
                      Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(intensity);
    
    setTaps(t => t + 1);
    setTotalPoints(p => p + multiplier);

    // Add floating +N at tap location - closer to center (shield area)
    const { locationX, locationY } = event.nativeEvent;
    // Keep X centered around shield, Y in middle area
    const centerX = SCREEN_W / 2;
    const centerY = SCREEN_H * 0.45; // Shield is roughly at 45% from top
    const offsetX = (Math.random() - 0.5) * 100;
    const offsetY = (Math.random() - 0.5) * 80;
    const newId = plusOneIdRef.current++;
    setFloatingPlusOnes(prev => [...prev, { 
      id: newId, 
      x: centerX + offsetX, 
      y: centerY + offsetY,
      value: multiplier,
    }]);

    // Shield pulse - bigger pulse for milestones
    const isMilestone = (taps + 1) % 50 === 0;
    shieldScale.value = withSequence(
      withTiming(isMilestone ? 1.2 : 1.08, { duration: isMilestone ? 50 : 30 }),
      withSpring(1, { damping: isMilestone ? 6 : 10, stiffness: 400 })
    );

    // Shield wiggle
    shieldRotation.value = withSequence(
      withTiming((Math.random() - 0.5) * 4, { duration: 30 }),
      withSpring(0, { damping: 8 })
    );

    // Screen shake on milestone
    if (isMilestone) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      screenShake.value = withSequence(
        withTiming(10, { duration: 50 }),
        withTiming(-10, { duration: 50 }),
        withTiming(5, { duration: 50 }),
        withTiming(0, { duration: 50 })
      );
      // Multiplier pop
      multiplierScale.value = withSequence(
        withTiming(1.4, { duration: 100 }),
        withSpring(1, { damping: 6 })
      );
    }
  }, [gameState, taps, shieldScale, shieldRotation, screenShake, multiplierScale]);

  const removePlusOne = useCallback((id: number) => {
    setFloatingPlusOnes(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleGameEnd = async () => {
    setGameState('submitting');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      // Send totalPoints (which includes multiplied taps)
      const response = await defendGym(parkId, totalPoints);
      setResult({
        points: response.points_earned,
        message: response.message,
      });
      setGameState('finished');
      battleHUDEvents.emit(); // Refresh BattleHUD scores immediately
    } catch (error: any) {
      setResult({
        points: 0,
        message: error.response?.data?.error || 'Something went wrong!',
      });
      setGameState('finished');
    }
  };

  const handleClose = () => {
    if (gameState === 'finished') {
      onComplete();
    } else {
      onClose();
    }
  };

  // Animated styles
  const shieldAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: shieldScale.value },
      { rotate: `${shieldRotation.value}deg` },
    ],
  }));

  const screenShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: screenShake.value }],
  }));

  const multiplierAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: multiplierScale.value }],
  }));

  const countdownAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countdownScale.value }],
  }));

  const glowAnimStyle = useAnimatedStyle(() => ({
    opacity: glowIntensity.value,
  }));

  // Simple tier based on taps (just for fun labels)
  const getTierName = (tapCount: number) => {
    if (tapCount >= 300) return 'LEGENDARY! 👑';
    if (tapCount >= 250) return 'EPIC! ⚡';
    if (tapCount >= 200) return 'AMAZING! 🔥';
    if (tapCount >= 150) return 'GREAT! 💪';
    if (tapCount >= 100) return 'GOOD! ✨';
    if (tapCount >= 50) return 'NICE!';
    return 'KEEP GOING!';
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={gameState === 'ready' ? handleClose : undefined}
      backdropOpacity={0}
      style={styles.modal}
      animationIn="fadeIn"
      animationOut="fadeOut"
    >
      <Animated.View style={[styles.fullScreen, screenShakeStyle]}>
        <ImageBackground
          source={require('../../../assets/images/defend-bg.jpg')}
          style={styles.container}
          resizeMode="cover"
        >
          {/* Ready State */}
          {gameState === 'ready' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.readyContent}>
              <Image
                source={require('../../../assets/images/shield.png')}
                style={styles.readyShield}
                contentFit="contain"
              />
              <Text style={styles.readyTitle}>DEFEND YOUR TEAM!</Text>
              <Text style={styles.readySubtitle}>
                Tap the shield as fast as you can{'\n'}
                25 seconds • The more taps, the more points!
              </Text>
              <TouchableOpacity style={styles.startButton} onPress={startGame}>
                <Text style={styles.startButtonText}>⚔️ READY FOR BATTLE ⚔️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelButtonText}>Not now</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Countdown State */}
          {gameState === 'countdown' && (
            <View style={styles.countdownContent}>
              <Animated.Text style={[styles.countdownNumber, countdownAnimStyle]}>
                {countdown}
              </Animated.Text>
              <Text style={styles.countdownLabel}>GET READY!</Text>
            </View>
          )}

          {/* Playing State */}
          {gameState === 'playing' && (
            <View style={styles.playingContainer}>
              {/* TAP TO DEFEND header */}
              <View style={styles.headerContainer}>
                <Text style={styles.tapToDefend}>TAP TO DEFEND!</Text>
                {/* Timer */}
                <Text style={[
                  styles.timer,
                  timeLeft <= 5 && styles.timerUrgent
                ]}>
                  {timeLeft}s
                </Text>
              </View>

              {/* Floating +N popups */}
              {floatingPlusOnes.map(p => (
                <FloatingPlusOne
                  key={p.id}
                  id={p.id}
                  x={p.x}
                  y={p.y}
                  value={p.value}
                  onComplete={removePlusOne}
                />
              ))}

              {/* Multiplier banner when active */}
              {multiplier > 1 && (
                <View style={styles.multiplierBanner}>
                  <Text style={styles.multiplierBannerText}>🔥 x{multiplier} BONUS! 🔥</Text>
                </View>
              )}

              {/* Shield tap area */}
              <Pressable
                style={styles.tapArea}
                onPress={handleTap}
              >
                {/* Glow behind shield */}
                <Animated.View style={[styles.shieldGlow, glowAnimStyle]} />
                
                {/* The Shield */}
                <Animated.View style={[styles.shieldContainer, shieldAnimatedStyle]}>
                  <Image
                    source={require('../../../assets/images/shield.png')}
                    style={styles.shield}
                    contentFit="contain"
                  />
                </Animated.View>
              </Pressable>

              {/* Points and tier at bottom */}
              <Animated.View style={[styles.defenseContainer, multiplierAnimStyle]}>
                <Text style={styles.tapCountBig}>{totalPoints}</Text>
                <Text style={styles.defenseLabel}>POINTS</Text>
                <Text style={styles.tierLabel}>{getTierName(totalPoints)}</Text>
              </Animated.View>
            </View>
          )}

          {/* Submitting State */}
          {gameState === 'submitting' && (
            <View style={styles.centerContent}>
              <Image
                source={require('../../../assets/images/shield.png')}
                style={styles.submittingShield}
                contentFit="contain"
              />
              <Text style={styles.submittingText}>Fortifying defenses...</Text>
            </View>
          )}

          {/* Finished State */}
          {gameState === 'finished' && result && (
            <Animated.View entering={ZoomIn.duration(400)} style={styles.finishedContent}>
              <Text style={styles.resultTitle}>🏆 DEFENDED! 🏆</Text>
              <Image
                source={require('../../../assets/images/shield.png')}
                style={styles.resultShield}
                contentFit="contain"
              />
              <Text style={styles.resultTier}>{getTierName(totalPoints)}</Text>
              <Text style={styles.resultTaps}>{taps} taps</Text>
              {multiplier > 1 && (
                <Text style={styles.resultBonus}>🔥 x{multiplier} bonus in final 7s!</Text>
              )}
              <Text style={styles.resultPoints}>
                +{result.points} points for your team!
              </Text>
              
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneButtonText}>NICE! 🔥</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ImageBackground>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 0,
  },
  fullScreen: {
    flex: 1,
  },
  container: {
    flex: 1,
    width: SCREEN_W,
    height: SCREEN_H,
  },
  // Ready state
  readyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  readyShield: {
    width: 180,
    height: 180,
    marginBottom: 24,
  },
  readyTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFD700',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 8,
    marginBottom: 12,
    letterSpacing: 2,
  },
  readySubtitle: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    marginBottom: 32,
    lineHeight: 24,
  },
  startButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 16,
  },
  startButtonText: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  cancelButton: {
    padding: 12,
  },
  cancelButtonText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  // Countdown state
  countdownContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  countdownNumber: {
    fontSize: 150,
    fontWeight: '900',
    color: '#FFD700',
    textShadowColor: '#FF6B00',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  countdownLabel: {
    fontSize: 28,
    fontWeight: '800',
    color: 'white',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    marginTop: 16,
    letterSpacing: 4,
  },
  // Playing state
  playingContainer: {
    flex: 1,
  },
  headerContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  tapToDefend: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFD700',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
    letterSpacing: 3,
  },
  timer: {
    fontSize: 48,
    fontWeight: '900',
    color: 'white',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
    marginTop: 8,
  },
  timerUrgent: {
    color: '#FF4444',
    textShadowColor: '#FF0000',
    textShadowRadius: 20,
  },
  tapArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shieldGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#FFD700',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 60,
  },
  shieldContainer: {
    width: 220,
    height: 220,
  },
  shield: {
    width: '100%',
    height: '100%',
  },
  floatingPlus: {
    position: 'absolute',
    fontSize: 36,
    fontWeight: '900',
    color: '#FFD700',
    textShadowColor: '#FF6B00',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
    zIndex: 100,
  },
  defenseContainer: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tapCountBig: {
    fontSize: 80,
    fontWeight: '900',
    color: '#FFD700',
    textShadowColor: '#FF6B00',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  defenseLabel: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFD700',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
    marginTop: -8,
    letterSpacing: 4,
  },
  tierLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FF6B00',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    marginTop: 4,
    letterSpacing: 2,
  },
  multiplierBanner: {
    position: 'absolute',
    top: 220,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 68, 68, 0.9)',
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    zIndex: 50,
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  multiplierBannerText: {
    fontSize: 28,
    fontWeight: '900',
    color: 'white',
    letterSpacing: 2,
  },
  tapCountContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tapCountLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  // Submitting state
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  submittingShield: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  submittingText: {
    fontSize: 20,
    color: 'white',
    fontWeight: '700',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  // Finished state
  finishedContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  resultTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFD700',
    textShadowColor: '#FF6B00',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    marginBottom: 16,
    letterSpacing: 2,
  },
  resultShield: {
    width: 140,
    height: 140,
    marginBottom: 16,
  },
  resultTaps: {
    fontSize: 24,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    marginBottom: 4,
  },
  resultBonus: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF8800',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    marginBottom: 8,
  },
  resultMultiplier: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFD700',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
  },
  resultTier: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FF6B00',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    marginTop: 8,
  },
  resultPoints: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4ADE80',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    marginTop: 16,
    marginBottom: 32,
  },
  doneButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 50,
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  doneButtonText: {
    color: '#1a1a2e',
    fontSize: 24,
    fontWeight: '900',
  },
});
