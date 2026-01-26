import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import startTrivia from '../api/endpoints/tasks/trivia/start';
import answerTrivia from '../api/endpoints/tasks/trivia/answer';
import skipTrivia from '../api/endpoints/tasks/trivia/skip';

interface Props {
  visible: boolean;
  taskId: number;
  taskName: string;
  coinImageUrl?: string;
  onClose: () => void;
  onComplete: (multiplier: number, rewards: { coins: number; xp: number }) => void;
}

type GameState = 'loading' | 'playing' | 'answered' | 'complete' | 'error' | 'no_trivia';

/**
 * Trivia mini-game modal.
 * Player answers a question to get a reward multiplier for their ride coin.
 * 
 * Multipliers:
 * - Wrong answer: 0.5x
 * - Correct + slow: 1.0x
 * - Correct + medium: 1.25x
 * - Correct + fast: 1.5x
 * - Correct + hard + fast: up to 2.0x
 */
export default function TriviaMiniGame({
  visible,
  taskId,
  taskName,
  coinImageUrl,
  onClose,
  onComplete,
}: Props) {
  const [gameState, setGameState] = useState<GameState>('loading');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [timeLimit, setTimeLimit] = useState(12);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [finalMultiplier, setFinalMultiplier] = useState(1);
  const [finalRewards, setFinalRewards] = useState<{ coins: number; xp: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { refreshPlayer, player } = useContext(AuthContext);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;

  // Start the game when modal opens
  useEffect(() => {
    if (visible && taskId) {
      initGame();
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [visible, taskId]);

  // Countdown timer
  useEffect(() => {
    if (gameState !== 'playing' || !question) return;

    setTimeLeft(timeLimit);
    progressAnim.setValue(1);

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: timeLimit * 1000,
      useNativeDriver: false,
    }).start();

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [gameState, question, timeLimit]);

  const initGame = async () => {
    setGameState('loading');
    setSelectedAnswer(null);
    setCorrectAnswer(null);
    setWasCorrect(null);
    setError(null);

    try {
      const response = await startTrivia(taskId);
      
      if (response.skip_trivia || !response.trivia) {
        // No trivia available - show skip message
        setGameState('no_trivia');
        return;
      }

      setSessionToken(response.trivia.session_token);
      setQuestion(response.trivia.question);
      setAnswers(response.trivia.answers);
      setDifficulty(response.trivia.difficulty);
      setTimeLimit(response.trivia.time_limit_seconds);
      setGameState('playing');
    } catch (err: any) {
      console.error('Failed to start trivia:', err);
      setError(err?.response?.data?.error || 'Failed to start trivia. Do you have enough tickets?');
      setGameState('error');
    }
  };

  const handleTimeout = async () => {
    // Time ran out - submit empty answer (will be wrong)
    if (!sessionToken) return;
    await submitAnswer('__TIMEOUT__');
  };

  const submitAnswer = async (answer: string) => {
    if (!sessionToken) return;
    
    setSelectedAnswer(answer);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    try {
      const response = await answerTrivia(
        sessionToken,
        answer,
        player?.is_subscribed || false, // double XP
        player?.is_subscribed || false  // double coins
      );

      setCorrectAnswer(response.correct_answer);
      setWasCorrect(response.correct);
      setFinalMultiplier(response.multiplier);
      setFinalRewards(response.rewards);
      setGameState('answered');

      // Show result briefly then complete
      setTimeout(() => {
        setGameState('complete');
      }, 1500);
    } catch (err: any) {
      console.error('Answer submission error:', err);
      setError(err?.response?.data?.error || 'Failed to submit answer');
      setGameState('error');
    }
  };

  const handleSelectAnswer = (answer: string) => {
    if (gameState !== 'playing' || selectedAnswer !== null) return;
    submitAnswer(answer);
  };

  const handleSkip = async () => {
    try {
      await skipTrivia(taskId);
      await refreshPlayer();
      onComplete(1, { coins: 0, xp: 0 }); // Base rewards handled by skip endpoint
      onClose();
    } catch (err) {
      console.error('Skip error:', err);
    }
  };

  const handleDone = async () => {
    await refreshPlayer();
    if (finalRewards) {
      onComplete(finalMultiplier, finalRewards);
    }
    onClose();
  };

  const handleNoTriviaCollect = async () => {
    await handleSkip();
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'easy': return '#4CAF50';
      case 'medium': return '#FF9800';
      case 'hard': return '#F44336';
      default: return '#888';
    }
  };

  const getAnswerStyle = (answer: string) => {
    if (!selectedAnswer) {
      return styles.answerButton;
    }
    if (answer === correctAnswer) {
      return [styles.answerButton, styles.correctAnswer];
    }
    if (answer === selectedAnswer && selectedAnswer !== correctAnswer) {
      return [styles.answerButton, styles.wrongAnswer];
    }
    return [styles.answerButton, styles.disabledAnswer];
  };

  const getMultiplierColor = (mult: number) => {
    if (mult >= 1.5) return '#4CAF50';
    if (mult >= 1.0) return '#FFD700';
    return '#F44336';
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            {coinImageUrl && (
              <Image
                source={{ uri: coinImageUrl }}
                style={styles.coinImage}
                contentFit="contain"
              />
            )}
            <Text style={styles.taskName}>{taskName}</Text>
          </View>

          {/* Loading State */}
          {gameState === 'loading' && (
            <View style={styles.centerContent}>
              <Text style={styles.loadingText}>Loading trivia...</Text>
            </View>
          )}

          {/* No Trivia Available */}
          {gameState === 'no_trivia' && (
            <View style={styles.centerContent}>
              <Text style={styles.noTriviaText}>No trivia available for this ride.</Text>
              <Text style={styles.noTriviaSubtext}>Collecting with standard rewards.</Text>
              <TouchableOpacity style={styles.collectButton} onPress={handleNoTriviaCollect}>
                <Text style={styles.collectText}>Collect Coin</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Error State */}
          {gameState === 'error' && (
            <View style={styles.centerContent}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={initGame}>
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipButton} onPress={onClose}>
                <Text style={styles.skipText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Playing / Answered State */}
          {(gameState === 'playing' || gameState === 'answered') && question && (
            <>
              {/* Difficulty & Timer */}
              <View style={styles.statsRow}>
                <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(difficulty) }]}>
                  <Text style={styles.difficultyText}>{difficulty.toUpperCase()}</Text>
                </View>
                <Text style={styles.timerLabel}>
                  {gameState === 'playing' ? `${timeLeft}s` : ''}
                </Text>
              </View>

              {/* Timer Bar */}
              {gameState === 'playing' && (
                <View style={styles.timerContainer}>
                  <Animated.View
                    style={[
                      styles.timerBar,
                      {
                        width: progressWidth,
                        backgroundColor: timeLeft <= 3 ? '#F44336' : '#4CAF50',
                      },
                    ]}
                  />
                </View>
              )}

              {/* Question */}
              <Text style={styles.questionText}>{question}</Text>

              {/* Answers */}
              <View style={styles.answersContainer}>
                {answers.map((answer, index) => (
                  <TouchableOpacity
                    key={index}
                    style={getAnswerStyle(answer)}
                    onPress={() => handleSelectAnswer(answer)}
                    disabled={selectedAnswer !== null}
                  >
                    <Text style={styles.answerLetter}>
                      {String.fromCharCode(65 + index)}
                    </Text>
                    <Text style={styles.answerText}>{answer}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Feedback */}
              {gameState === 'answered' && wasCorrect !== null && (
                <View style={wasCorrect ? styles.feedbackCorrect : styles.feedbackWrong}>
                  <Text style={styles.feedbackText}>
                    {wasCorrect ? '✓ Correct!' : '✗ Wrong!'}
                  </Text>
                  <Text style={[styles.multiplierResult, { color: getMultiplierColor(finalMultiplier) }]}>
                    {finalMultiplier}x Multiplier
                  </Text>
                </View>
              )}

              {/* Skip Button (only during playing) */}
              {gameState === 'playing' && selectedAnswer === null && (
                <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                  <Text style={styles.skipText}>Skip (collect 1x)</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Complete State */}
          {gameState === 'complete' && (
            <View style={styles.centerContent}>
              <Text style={styles.completeTitle}>
                {wasCorrect ? '🎉 Great Job!' : '🎯 Nice Try!'}
              </Text>
              
              <View style={styles.finalMultiplierBox}>
                <Text style={[styles.finalMultiplierValue, { color: getMultiplierColor(finalMultiplier) }]}>
                  {finalMultiplier}x
                </Text>
                <Text style={styles.finalMultiplierLabel}>Multiplier</Text>
              </View>

              {finalRewards && (
                <View style={styles.rewardsEarned}>
                  <Text style={styles.rewardsTitle}>Rewards Earned</Text>
                  <View style={styles.rewardsRow}>
                    <Text style={styles.rewardItem}>🪙 {finalRewards.coins} coins</Text>
                    <Text style={styles.rewardItem}>⭐ {finalRewards.xp} XP</Text>
                  </View>
                </View>
              )}

              <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
                <Text style={styles.doneText}>Awesome!</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxHeight: '85%',
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  coinImage: {
    width: 50,
    height: 50,
    marginRight: 12,
  },
  taskName: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  difficultyText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  timerLabel: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  timerContainer: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    marginBottom: 16,
    overflow: 'hidden',
  },
  timerBar: {
    height: '100%',
    borderRadius: 4,
  },
  questionText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 26,
  },
  answersContainer: {
    gap: 10,
  },
  answerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  correctAnswer: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    borderColor: '#4CAF50',
  },
  wrongAnswer: {
    backgroundColor: 'rgba(244, 67, 54, 0.3)',
    borderColor: '#F44336',
  },
  disabledAnswer: {
    opacity: 0.5,
  },
  answerLetter: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 12,
    width: 24,
  },
  answerText: {
    color: 'white',
    fontSize: 15,
    flex: 1,
  },
  feedbackCorrect: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  feedbackWrong: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  feedbackText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  multiplierResult: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  centerContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
  },
  noTriviaText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  noTriviaSubtext: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  collectButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 20,
  },
  collectText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    marginBottom: 12,
  },
  retryText: {
    color: 'white',
    fontWeight: 'bold',
  },
  skipButton: {
    paddingVertical: 12,
    marginTop: 16,
  },
  skipText: {
    color: '#888',
    fontSize: 14,
  },
  completeTitle: {
    color: '#FFD700',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  finalMultiplierBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 16,
    marginBottom: 20,
  },
  finalMultiplierValue: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  finalMultiplierLabel: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  rewardsEarned: {
    alignItems: 'center',
    marginBottom: 20,
  },
  rewardsTitle: {
    color: 'white',
    fontSize: 14,
    marginBottom: 8,
  },
  rewardsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  rewardItem: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 25,
  },
  doneText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
