import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Pressable,
} from 'react-native';
import Modal from 'react-native-modal';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { checkinGym } from '../../api/endpoints/gym-battle';
import { battleHUDEvents } from './battleHUDEvents';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  visible: boolean;
  parkId: number;
  isUnderdog: boolean;
  onComplete: () => void;
  onClose: () => void;
}

type GameState = 'ready' | 'playing' | 'finished' | 'submitting';

const GAME_DURATION = 10; // seconds
const MAX_TAPS = 150;

export default function TapMiniGameModal({
  visible,
  parkId,
  isUnderdog,
  onComplete,
  onClose,
}: Props) {
  const [gameState, setGameState] = useState<GameState>('ready');
  const [taps, setTaps] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [result, setResult] = useState<{ points: number; message: string } | null>(null);

  const buttonScale = useSharedValue(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setGameState('ready');
      setTaps(0);
      setTimeLeft(GAME_DURATION);
      setResult(null);
    }
  }, [visible]);

  // Timer countdown
  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(t => t - 1);
      }, 1000);
    } else if (gameState === 'playing' && timeLeft === 0) {
      handleGameEnd();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameState, timeLeft]);

  const startGame = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setGameState('playing');
    setTaps(0);
    setTimeLeft(GAME_DURATION);
  };

  const handleTap = useCallback(() => {
    if (gameState !== 'playing' || taps >= MAX_TAPS) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTaps(t => t + 1);

    // Button animation
    buttonScale.value = withSequence(
      withTiming(0.9, { duration: 50 }),
      withSpring(1, { damping: 10, stiffness: 400 })
    );
  }, [gameState, taps, buttonScale]);

  const handleGameEnd = async () => {
    setGameState('submitting');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const response = await checkinGym(parkId, taps);
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

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={gameState !== 'playing' ? handleClose : undefined}
      backdropOpacity={0.9}
      style={styles.modal}
    >
      <View style={styles.container}>
        <View style={styles.gradient}>
          {/* Ready State */}
          {gameState === 'ready' && (
            <View style={styles.content}>
              <Text style={styles.title}>📍 CHECK IN 📍</Text>
              <Text style={styles.freeLabel}>FREE • Every 30 mins</Text>
              <Text style={styles.subtitle}>
                Tap as fast as you can for 10 seconds!{'\n'}
                More taps = more points for YOUR team!
              </Text>
              {isUnderdog && (
                <View style={styles.underdogBanner}>
                  <Text style={styles.underdogText}>
                    💪 UNDERDOG BONUS: 1.5x Points!
                  </Text>
                </View>
              )}
              <TouchableOpacity style={styles.startButton} onPress={startGame}>
                <Text style={styles.startButtonText}>LET'S GO!</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Playing State */}
          {gameState === 'playing' && (
            <View style={styles.content}>
              <Text style={styles.timer}>{timeLeft}</Text>
              <Text style={styles.timerLabel}>seconds</Text>

              <Animated.View style={buttonAnimatedStyle}>
                <Pressable
                  style={styles.tapButton}
                  onPress={handleTap}
                >
                  <Text style={styles.tapEmoji}>👆</Text>
                  <Text style={styles.tapText}>TAP!</Text>
                </Pressable>
              </Animated.View>

              <Text style={styles.tapCount}>{taps} taps</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(taps / MAX_TAPS) * 100}%` },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Submitting State */}
          {gameState === 'submitting' && (
            <View style={styles.content}>
              <Text style={styles.submittingText}>⏳ Submitting...</Text>
            </View>
          )}

          {/* Finished State */}
          {gameState === 'finished' && result && (
            <View style={styles.content}>
              <Text style={styles.resultEmoji}>
                {result.points > 0 ? '🎉' : '😢'}
              </Text>
              <Text style={styles.resultTitle}>
                {result.points > 0 ? 'NICE WORK!' : 'Oops!'}
              </Text>
              <Text style={styles.tapCount}>{taps} taps</Text>
              <Text style={styles.pointsEarned}>
                +{result.points} points for your team!
              </Text>
              {isUnderdog && result.points > 0 && (
                <Text style={styles.bonusText}>
                  (Includes 1.5x underdog bonus!)
                </Text>
              )}
              <Text style={styles.nextCheckin}>
                Check in again in 30 mins!
              </Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneButtonText}>AWESOME!</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: SCREEN_W - 40,
    borderRadius: 24,
    overflow: 'hidden',
  },
  gradient: {
    padding: 30,
    backgroundColor: '#0F172A',
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#22C55E',
    textAlign: 'center',
    marginBottom: 8,
  },
  freeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4ADE80',
    marginBottom: 12,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  underdogBanner: {
    backgroundColor: 'rgba(124, 58, 237, 0.3)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  underdogText: {
    color: '#A78BFA',
    fontWeight: '700',
    fontSize: 14,
  },
  startButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
  },
  startButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
  },
  timer: {
    fontSize: 72,
    fontWeight: '900',
    color: '#FBBF24',
  },
  timerLabel: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 30,
  },
  tapButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FBBF24',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FBBF24',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  tapEmoji: {
    fontSize: 48,
  },
  tapText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1E293B',
    marginTop: 4,
  },
  tapCount: {
    fontSize: 32,
    fontWeight: '800',
    color: 'white',
    marginTop: 24,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 4,
  },
  submittingText: {
    fontSize: 24,
    color: '#94A3B8',
  },
  resultEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#22C55E',
    marginBottom: 8,
  },
  pointsEarned: {
    fontSize: 20,
    color: '#FBBF24',
    fontWeight: '700',
    marginTop: 12,
  },
  bonusText: {
    fontSize: 14,
    color: '#A78BFA',
    marginTop: 8,
  },
  nextCheckin: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 16,
    fontStyle: 'italic',
  },
  doneButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    marginTop: 24,
  },
  doneButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
});
