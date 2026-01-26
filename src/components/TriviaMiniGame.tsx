import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
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
import { TriviaQuestionType } from '../models/trivia-question-type';

interface Props {
  visible: boolean;
  taskId: number;
  taskName: string;
  coinImageUrl?: string;
  onClose: () => void;
  onComplete: (multiplier: number, rewards: { coins: number; experience: number }) => void;
}

type GameState = 'loading' | 'playing' | 'correct' | 'wrong' | 'complete' | 'error';

/**
 * Trivia mini-game modal.
 * Player answers questions to build up a multiplier for their ride coin reward.
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<TriviaQuestionType | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [currentMultiplier, setCurrentMultiplier] = useState(1);
  const [correctCount, setCorrectCount] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [finalRewards, setFinalRewards] = useState<{ coins: number; experience: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { refreshPlayer } = useContext(AuthContext);
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

    setTimeLeft(question.time_limit_seconds);
    progressAnim.setValue(1);

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: question.time_limit_seconds * 1000,
      useNativeDriver: false,
    }).start();

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up - treat as wrong answer
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
  }, [gameState, question]);

  const initGame = async () => {
    setGameState('loading');
    setSelectedAnswer(null);
    setCorrectAnswer(null);
    setError(null);

    try {
      const response = await startTrivia(taskId);
      setSessionId(response.data.session_id);
      setQuestion(response.data.question);
      setQuestionNumber(response.data.question_number);
      setTotalQuestions(response.data.total_questions);
      setCurrentMultiplier(response.data.current_multiplier);
      setCorrectCount(response.data.correct_so_far);
      setGameState('playing');
    } catch (err: any) {
      console.error('Failed to start trivia:', err);
      setError(err?.response?.data?.message || 'Failed to start trivia. Do you have enough tickets?');
      setGameState('error');
    }
  };

  const handleTimeout = async () => {
    // Treat timeout as wrong answer (submit with invalid index)
    if (!sessionId) return;
    
    try {
      const response = await answerTrivia(sessionId, -1);
      setCorrectAnswer(response.data.correct_answer_index);
      setGameState('wrong');
      
      if (response.data.game_over) {
        setTimeout(() => {
          setFinalRewards(response.data.rewards_earned || { coins: 0, experience: 0 });
          setCurrentMultiplier(response.data.final_multiplier || 1);
          setGameState('complete');
        }, 1500);
      }
    } catch (err) {
      console.error('Timeout handling error:', err);
    }
  };

  const handleSelectAnswer = async (answerIndex: number) => {
    if (gameState !== 'playing' || selectedAnswer !== null || !sessionId) return;

    setSelectedAnswer(answerIndex);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    try {
      const response = await answerTrivia(sessionId, answerIndex);
      setCorrectAnswer(response.data.correct_answer_index);
      setCurrentMultiplier(response.data.current_multiplier);
      setCorrectCount(response.data.correct_so_far);

      if (response.data.correct) {
        setGameState('correct');
        
        if (!response.data.game_over && response.data.next_question) {
          // Continue to next question after delay
          setTimeout(() => {
            setQuestion(response.data.next_question!);
            setQuestionNumber(response.data.question_number!);
            setSelectedAnswer(null);
            setCorrectAnswer(null);
            setGameState('playing');
          }, 1500);
        } else if (response.data.game_over) {
          // All questions answered correctly!
          setTimeout(() => {
            setFinalRewards(response.data.rewards_earned || { coins: 0, experience: 0 });
            setCurrentMultiplier(response.data.final_multiplier || currentMultiplier);
            setGameState('complete');
          }, 1500);
        }
      } else {
        setGameState('wrong');
        // Game over - wrong answer
        setTimeout(() => {
          setFinalRewards(response.data.rewards_earned || { coins: 0, experience: 0 });
          setCurrentMultiplier(response.data.final_multiplier || 1);
          setGameState('complete');
        }, 1500);
      }
    } catch (err) {
      console.error('Answer submission error:', err);
      setError('Failed to submit answer');
      setGameState('error');
    }
  };

  const handleSkip = async () => {
    try {
      const response = await skipTrivia(taskId);
      await refreshPlayer();
      onComplete(response.data.multiplier, response.data.rewards_earned);
      onClose();
    } catch (err) {
      console.error('Skip error:', err);
    }
  };

  const handleDone = async () => {
    await refreshPlayer();
    if (finalRewards) {
      onComplete(currentMultiplier, finalRewards);
    }
    onClose();
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '#4CAF50';
      case 'medium': return '#FF9800';
      case 'hard': return '#F44336';
      default: return '#888';
    }
  };

  const getAnswerStyle = (index: number) => {
    if (selectedAnswer === null) {
      return styles.answerButton;
    }
    if (index === correctAnswer) {
      return [styles.answerButton, styles.correctAnswer];
    }
    if (index === selectedAnswer && selectedAnswer !== correctAnswer) {
      return [styles.answerButton, styles.wrongAnswer];
    }
    return [styles.answerButton, styles.disabledAnswer];
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

          {/* Playing State */}
          {(gameState === 'playing' || gameState === 'correct' || gameState === 'wrong') && question && (
            <>
              {/* Progress & Multiplier */}
              <View style={styles.statsRow}>
                <View style={styles.questionCounter}>
                  <Text style={styles.counterText}>
                    Q{questionNumber}/{totalQuestions}
                  </Text>
                </View>
                <View style={styles.multiplierBadge}>
                  <Text style={styles.multiplierText}>{currentMultiplier}x</Text>
                </View>
                <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(question.difficulty) }]}>
                  <Text style={styles.difficultyText}>{question.difficulty.toUpperCase()}</Text>
                </View>
              </View>

              {/* Timer Bar */}
              <View style={styles.timerContainer}>
                <Animated.View
                  style={[
                    styles.timerBar,
                    {
                      width: progressWidth,
                      backgroundColor: timeLeft <= 5 ? '#F44336' : '#4CAF50',
                    },
                  ]}
                />
                <Text style={styles.timerText}>{timeLeft}s</Text>
              </View>

              {/* Question */}
              <Text style={styles.questionText}>{question.question}</Text>

              {/* Answers */}
              <View style={styles.answersContainer}>
                {question.answers.map((answer, index) => (
                  <TouchableOpacity
                    key={index}
                    style={getAnswerStyle(index)}
                    onPress={() => handleSelectAnswer(index)}
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
              {gameState === 'correct' && (
                <View style={styles.feedbackCorrect}>
                  <Text style={styles.feedbackText}>✓ Correct!</Text>
                </View>
              )}
              {gameState === 'wrong' && (
                <View style={styles.feedbackWrong}>
                  <Text style={styles.feedbackText}>✗ Wrong!</Text>
                </View>
              )}

              {/* Skip Button (only during playing) */}
              {gameState === 'playing' && selectedAnswer === null && (
                <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                  <Text style={styles.skipText}>Skip (claim 1x)</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Complete State */}
          {gameState === 'complete' && (
            <View style={styles.centerContent}>
              <Text style={styles.completeTitle}>
                {correctCount === totalQuestions ? '🎉 Perfect!' : '🎯 Game Over'}
              </Text>
              
              <View style={styles.finalStats}>
                <View style={styles.finalStatBox}>
                  <Text style={styles.finalStatValue}>{correctCount}/{totalQuestions}</Text>
                  <Text style={styles.finalStatLabel}>Correct</Text>
                </View>
                <View style={styles.finalStatBox}>
                  <Text style={styles.finalStatValue}>{currentMultiplier}x</Text>
                  <Text style={styles.finalStatLabel}>Multiplier</Text>
                </View>
              </View>

              {finalRewards && (
                <View style={styles.rewardsEarned}>
                  <Text style={styles.rewardsTitle}>Rewards Earned</Text>
                  <View style={styles.rewardsRow}>
                    <Text style={styles.rewardItem}>🪙 {finalRewards.coins} coins</Text>
                    <Text style={styles.rewardItem}>⭐ {finalRewards.experience} XP</Text>
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
    marginBottom: 12,
    gap: 8,
  },
  questionCounter: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  counterText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  multiplierBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  multiplierText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: 'bold',
  },
  difficultyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  difficultyText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  timerContainer: {
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerBar: {
    height: '100%',
    borderRadius: 12,
  },
  timerText: {
    position: 'absolute',
    right: 10,
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
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
  centerContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    color: '#888',
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
  finalStats: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
  },
  finalStatBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
  },
  finalStatValue: {
    color: '#4CAF50',
    fontSize: 24,
    fontWeight: 'bold',
  },
  finalStatLabel: {
    color: '#888',
    fontSize: 12,
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
