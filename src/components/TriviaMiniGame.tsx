import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { AuthContext } from '../context/AuthProvider';
import startTrivia from '../api/endpoints/tasks/trivia/start';
import answerTrivia from '../api/endpoints/tasks/trivia/answer';
import skipTrivia from '../api/endpoints/tasks/trivia/skip';
import Button from './Button';
import Ribbon from './Ribbon';
import config from '../config';

interface Props {
  visible: boolean;
  taskId: number;
  taskName: string;
  coinImageUrl?: string;
  onClose: () => void;
  onComplete: (
    multiplier: number,
    rewards: { coins: number; xp: number }
  ) => void;
}

type GameState =
  | 'loading'
  | 'playing'
  | 'answered'
  | 'complete'
  | 'error'
  | 'no_trivia';

/**
 * Trivia mini-game modal.
 * Styled to match app's AAA quality standards.
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
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(
    'medium'
  );
  const [timeLimit, setTimeLimit] = useState(12);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [finalMultiplier, setFinalMultiplier] = useState(1);
  const [finalRewards, setFinalRewards] = useState<{
    coins: number;
    xp: number;
  } | null>(null);
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
      setError(
        err?.response?.data?.error ||
          'Failed to start trivia. Do you have enough tickets?'
      );
      setGameState('error');
    }
  };

  const handleTimeout = async () => {
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
        player?.is_subscribed || false,
        player?.is_subscribed || false
      );

      setCorrectAnswer(response.correct_answer);
      setWasCorrect(response.correct);
      setFinalMultiplier(response.multiplier);
      setFinalRewards(response.rewards);
      setGameState('answered');

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
      onComplete(1, { coins: 0, xp: 0 });
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

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'easy':
        return '#4CAF50';
      case 'medium':
        return config.tertiary;
      case 'hard':
        return config.red;
      default:
        return '#888';
    }
  };

  const getMultiplierColor = (mult: number) => {
    if (mult >= 1.5) return '#4CAF50';
    if (mult >= 1.0) return config.tertiary;
    return config.red;
  };

  const getAnswerStyle = (answer: string) => {
    const baseStyle = {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      padding: 14,
      borderRadius: 12,
      borderWidth: 3,
      borderColor: 'transparent',
      marginBottom: 10,
    };

    if (!selectedAnswer) return baseStyle;
    if (answer === correctAnswer) {
      return { ...baseStyle, borderColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.3)' };
    }
    if (answer === selectedAnswer && selectedAnswer !== correctAnswer) {
      return { ...baseStyle, borderColor: config.red, backgroundColor: 'rgba(244, 67, 54, 0.3)' };
    }
    return { ...baseStyle, opacity: 0.5 };
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
            width: Dimensions.get('window').width - 32,
            position: 'relative',
            alignItems: 'center',
          }}
        >
          {/* Ribbon Header */}
          <Ribbon text="Trivia Time!" />

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
                  }}
                >
                  {/* Loading State */}
                  {gameState === 'loading' && (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 18,
                          color: 'rgba(255, 255, 255, 0.7)',
                        }}
                      >
                        Loading trivia...
                      </Text>
                    </View>
                  )}

                  {/* No Trivia State */}
                  {gameState === 'no_trivia' && (
                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 18,
                          color: 'white',
                          textAlign: 'center',
                          marginBottom: 8,
                        }}
                      >
                        No trivia available for this ride.
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 14,
                          color: 'rgba(255, 255, 255, 0.7)',
                          textAlign: 'center',
                          marginBottom: 20,
                        }}
                      >
                        Collecting with standard rewards.
                      </Text>
                      <Button onPress={handleSkip}>
                        <ImageBackground
                          source={require('../../assets/images/yellow_button.png')}
                          style={{
                            paddingHorizontal: 32,
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
                            Collect Coin
                          </Text>
                        </ImageBackground>
                      </Button>
                    </View>
                  )}

                  {/* Error State */}
                  {gameState === 'error' && (
                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 16,
                          color: config.red,
                          textAlign: 'center',
                          marginBottom: 16,
                        }}
                      >
                        {error}
                      </Text>
                      <Button onPress={initGame}>
                        <ImageBackground
                          source={require('../../assets/images/yellow_button.png')}
                          style={{
                            paddingHorizontal: 24,
                            paddingVertical: 10,
                            alignItems: 'center',
                          }}
                          resizeMode="stretch"
                        >
                          <Text
                            style={{
                              fontFamily: 'Shark',
                              fontSize: 18,
                              color: config.primary,
                            }}
                          >
                            Try Again
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
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Playing / Answered State */}
                  {(gameState === 'playing' || gameState === 'answered') &&
                    question && (
                      <>
                        {/* Header with Task Name and Coin */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginBottom: 12,
                          }}
                        >
                          {coinImageUrl && (
                            <Image
                              source={{ uri: coinImageUrl }}
                              style={{
                                width: 40,
                                height: 40,
                                marginRight: 10,
                              }}
                              contentFit="contain"
                            />
                          )}
                          <Text
                            style={{
                              fontFamily: 'Knockout',
                              fontSize: 16,
                              color: 'white',
                              flex: 1,
                              textShadowColor: 'rgba(0, 0, 0, 0.5)',
                              textShadowOffset: { width: 1, height: 1 },
                              textShadowRadius: 0,
                            }}
                            numberOfLines={1}
                          >
                            {taskName}
                          </Text>
                        </View>

                        {/* Difficulty & Timer */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 12,
                          }}
                        >
                          <View
                            style={{
                              backgroundColor: getDifficultyColor(difficulty),
                              paddingHorizontal: 12,
                              paddingVertical: 4,
                              borderRadius: 8,
                              borderWidth: 2,
                              borderColor: 'rgba(255, 255, 255, 0.3)',
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 12,
                                color: 'white',
                                textTransform: 'uppercase',
                              }}
                            >
                              {difficulty}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontFamily: 'Knockout',
                              fontSize: 24,
                              color:
                                timeLeft <= 3 ? config.red : config.tertiary,
                              textShadowColor: 'rgba(0, 0, 0, 0.5)',
                              textShadowOffset: { width: 1, height: 1 },
                              textShadowRadius: 0,
                            }}
                          >
                            {gameState === 'playing' ? `${timeLeft}s` : ''}
                          </Text>
                        </View>

                        {/* Timer Bar */}
                        {gameState === 'playing' && (
                          <View
                            style={{
                              height: 10,
                              backgroundColor: 'rgba(255, 255, 255, 0.2)',
                              borderRadius: 5,
                              marginBottom: 16,
                              overflow: 'hidden',
                              borderWidth: 2,
                              borderColor: 'rgba(255, 255, 255, 0.3)',
                            }}
                          >
                            <Animated.View
                              style={{
                                height: '100%',
                                width: progressWidth,
                                backgroundColor:
                                  timeLeft <= 3 ? config.red : '#4CAF50',
                                borderRadius: 3,
                              }}
                            />
                          </View>
                        )}

                        {/* Question */}
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 18,
                            color: 'white',
                            textAlign: 'center',
                            marginBottom: 20,
                            lineHeight: 26,
                            textShadowColor: 'rgba(0, 0, 0, 0.5)',
                            textShadowOffset: { width: 1, height: 1 },
                            textShadowRadius: 0,
                          }}
                        >
                          {question}
                        </Text>

                        {/* Answers */}
                        <View>
                          {answers.map((answer, index) => (
                            <TouchableOpacity
                              key={index}
                              style={getAnswerStyle(answer)}
                              onPress={() => handleSelectAnswer(answer)}
                              disabled={selectedAnswer !== null}
                            >
                              <View
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 14,
                                  backgroundColor: config.tertiary,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginRight: 12,
                                }}
                              >
                                <Text
                                  style={{
                                    fontFamily: 'Knockout',
                                    fontSize: 16,
                                    color: config.primary,
                                    fontWeight: 'bold',
                                  }}
                                >
                                  {String.fromCharCode(65 + index)}
                                </Text>
                              </View>
                              <Text
                                style={{
                                  fontFamily: 'Knockout',
                                  fontSize: 15,
                                  color: 'white',
                                  flex: 1,
                                }}
                              >
                                {answer}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {/* Feedback */}
                        {gameState === 'answered' && wasCorrect !== null && (
                          <View
                            style={{
                              backgroundColor: wasCorrect
                                ? 'rgba(76, 175, 80, 0.3)'
                                : 'rgba(244, 67, 54, 0.3)',
                              padding: 12,
                              borderRadius: 12,
                              marginTop: 16,
                              alignItems: 'center',
                              borderWidth: 2,
                              borderColor: wasCorrect ? '#4CAF50' : config.red,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: 'Shark',
                                fontSize: 20,
                                color: 'white',
                                textTransform: 'uppercase',
                              }}
                            >
                              {wasCorrect ? '✓ Correct!' : '✗ Wrong!'}
                            </Text>
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 16,
                                color: getMultiplierColor(finalMultiplier),
                                marginTop: 4,
                              }}
                            >
                              {finalMultiplier}x Multiplier
                            </Text>
                          </View>
                        )}

                        {/* Skip Button */}
                        {gameState === 'playing' && selectedAnswer === null && (
                          <TouchableOpacity
                            style={{ marginTop: 16, alignItems: 'center' }}
                            onPress={handleSkip}
                          >
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 14,
                                color: 'rgba(255, 255, 255, 0.6)',
                              }}
                            >
                              Skip (collect 1x)
                            </Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}

                  {/* Complete State */}
                  {gameState === 'complete' && (
                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                      <Text
                        style={{
                          fontFamily: 'Shark',
                          fontSize: 28,
                          color: config.tertiary,
                          textTransform: 'uppercase',
                          textShadowColor: 'rgba(0, 0, 0, 0.5)',
                          textShadowOffset: { width: 2, height: 2 },
                          textShadowRadius: 0,
                          marginBottom: 16,
                        }}
                      >
                        {wasCorrect ? '🎉 Great Job!' : '🎯 Nice Try!'}
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

                      {/* Rewards Earned */}
                      {finalRewards && (
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                          <Text
                            style={{
                              fontFamily: 'Knockout',
                              fontSize: 14,
                              color: 'rgba(255, 255, 255, 0.7)',
                              marginBottom: 8,
                            }}
                          >
                            Rewards Earned
                          </Text>
                          <View
                            style={{
                              flexDirection: 'row',
                              gap: 20,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 18,
                                color: '#4CAF50',
                              }}
                            >
                              🪙 {finalRewards.coins} coins
                            </Text>
                            <Text
                              style={{
                                fontFamily: 'Knockout',
                                fontSize: 18,
                                color: '#4CAF50',
                              }}
                            >
                              ⭐ {finalRewards.xp} XP
                            </Text>
                          </View>
                        </View>
                      )}

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
                    </View>
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
