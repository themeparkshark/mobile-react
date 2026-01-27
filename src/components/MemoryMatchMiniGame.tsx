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
  difficulty: 'easy' | 'medium' | 'hard'; // 6, 12, 20 cards
  timeLimitSeconds: number;
  onClose: () => void;
  onComplete: (multiplier: number, timeBonus: number) => void;
}

type GameState = 'ready' | 'playing' | 'complete';
type CardState = 'hidden' | 'flipped' | 'matched';

interface Card {
  id: number;
  emoji: string;
  pairId: number;
  state: CardState;
}

// Theme park themed emojis for cards
const CARD_EMOJIS = [
  '🏰', '🎢', '🎡', '🎠', '🦈', '🎭',
  '🎪', '🎟️', '🍿', '🧁', '🎁', '⭐',
  '🌙', '☀️', '🌈', '🎆', '🎃', '🎄',
  '🎈', '🧸', '🎀', '🎵', '🔮', '👑',
];

/**
 * Memory Match Mini-Game
 * Match pairs of theme park cards!
 * 
 * Multipliers based on time remaining:
 * - < 25% time left: 0.75x
 * - 25-50% time left: 1.0x
 * - 50-75% time left: 1.25x
 * - > 75% time left: 1.5x
 * - Perfect (no mistakes): 2.0x
 */
export default function MemoryMatchMiniGame({
  visible,
  taskName,
  difficulty,
  timeLimitSeconds,
  onClose,
  onComplete,
}: Props) {
  const [gameState, setGameState] = useState<GameState>('ready');
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [moves, setMoves] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds);
  const [finalMultiplier, setFinalMultiplier] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const cardAnims = useRef<{ [key: number]: Animated.Value }>({});

  // Get card count based on difficulty
  const getCardCount = () => {
    switch (difficulty) {
      case 'easy': return 6; // 3 pairs
      case 'medium': return 12; // 6 pairs
      case 'hard': return 20; // 10 pairs
      default: return 12;
    }
  };

  // Get grid columns based on difficulty
  const getColumns = () => {
    switch (difficulty) {
      case 'easy': return 3;
      case 'medium': return 4;
      case 'hard': return 5;
      default: return 4;
    }
  };

  // Initialize cards
  const initializeCards = useCallback(() => {
    const cardCount = getCardCount();
    const pairCount = cardCount / 2;
    const shuffledEmojis = [...CARD_EMOJIS].sort(() => Math.random() - 0.5).slice(0, pairCount);
    
    let newCards: Card[] = [];
    shuffledEmojis.forEach((emoji, index) => {
      newCards.push({ id: index * 2, emoji, pairId: index, state: 'hidden' });
      newCards.push({ id: index * 2 + 1, emoji, pairId: index, state: 'hidden' });
    });
    
    // Shuffle cards
    newCards = newCards.sort(() => Math.random() - 0.5);
    
    // Initialize animations
    newCards.forEach(card => {
      cardAnims.current[card.id] = new Animated.Value(0);
    });
    
    setCards(newCards);
  }, [difficulty]);

  // Reset game when modal opens
  useEffect(() => {
    if (visible) {
      setGameState('ready');
      setFlippedCards([]);
      setMatchedPairs(0);
      setMoves(0);
      setMistakes(0);
      setTimeLeft(timeLimitSeconds);
      progressAnim.setValue(1);
      initializeCards();
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [visible, timeLimitSeconds, initializeCards]);

  // Start game
  const startGame = () => {
    setGameState('playing');
    setTimeLeft(timeLimitSeconds);
    progressAnim.setValue(1);

    // Briefly show all cards
    cards.forEach(card => {
      Animated.timing(cardAnims.current[card.id], {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });

    // Hide cards after preview
    setTimeout(() => {
      cards.forEach(card => {
        Animated.timing(cardAnims.current[card.id], {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 1500);

    // Start timer after preview
    setTimeout(() => {
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: timeLimitSeconds * 1000,
        useNativeDriver: false,
      }).start();

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            endGame(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, 2000);
  };

  // Handle card tap
  const handleCardTap = (cardId: number) => {
    if (gameState !== 'playing' || isProcessing) return;
    
    const card = cards.find(c => c.id === cardId);
    if (!card || card.state !== 'hidden' || flippedCards.includes(cardId)) return;

    // Flip card
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Animated.spring(cardAnims.current[cardId], {
      toValue: 1,
      friction: 6,
      useNativeDriver: true,
    }).start();

    const newFlipped = [...flippedCards, cardId];
    setFlippedCards(newFlipped);

    if (newFlipped.length === 2) {
      setIsProcessing(true);
      setMoves(prev => prev + 1);

      const [firstId, secondId] = newFlipped;
      const firstCard = cards.find(c => c.id === firstId)!;
      const secondCard = cards.find(c => c.id === secondId)!;

      if (firstCard.pairId === secondCard.pairId) {
        // Match!
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        setTimeout(() => {
          setCards(prev => prev.map(c => 
            c.id === firstId || c.id === secondId 
              ? { ...c, state: 'matched' } 
              : c
          ));
          setMatchedPairs(prev => {
            const newMatched = prev + 1;
            if (newMatched === getCardCount() / 2) {
              endGame(true);
            }
            return newMatched;
          });
          setFlippedCards([]);
          setIsProcessing(false);
        }, 300);
      } else {
        // No match
        setMistakes(prev => prev + 1);
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }

        setTimeout(() => {
          Animated.parallel([
            Animated.timing(cardAnims.current[firstId], {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(cardAnims.current[secondId], {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setFlippedCards([]);
            setIsProcessing(false);
          });
        }, 800);
      }
    }
  };

  // End game
  const endGame = (won: boolean) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    let mult: number;
    if (!won) {
      mult = 0.5;
    } else if (mistakes === 0) {
      mult = 2.0; // Perfect game!
    } else {
      const timePercent = (timeLeft / timeLimitSeconds) * 100;
      if (timePercent >= 75) mult = 1.5;
      else if (timePercent >= 50) mult = 1.25;
      else if (timePercent >= 25) mult = 1.0;
      else mult = 0.75;
    }

    setFinalMultiplier(mult);
    setGameState('complete');

    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(
        mult >= 1.5 ? Haptics.NotificationFeedbackType.Success :
        Haptics.NotificationFeedbackType.Warning
      );
    }
  };

  // Handle done
  const handleDone = () => {
    onComplete(finalMultiplier, timeLeft);
    onClose();
  };

  // Get multiplier color
  const getMultiplierColor = (mult: number): string => {
    if (mult >= 2.0) return '#FFD700';
    if (mult >= 1.5) return '#4CAF50';
    if (mult >= 1.0) return config.tertiary;
    return config.red;
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const columns = getColumns();
  const cardSize = (Dimensions.get('window').width - 80) / columns - 8;

  // Render card
  const renderCard = (card: Card) => {
    const flipAnim = cardAnims.current[card.id] || new Animated.Value(0);
    const isFlipped = flippedCards.includes(card.id) || card.state === 'matched';

    const frontRotate = flipAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '180deg'],
    });

    const backRotate = flipAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['180deg', '360deg'],
    });

    return (
      <TouchableOpacity
        key={card.id}
        onPress={() => handleCardTap(card.id)}
        activeOpacity={0.9}
        disabled={card.state === 'matched' || isProcessing}
        style={{
          width: cardSize,
          height: cardSize,
          margin: 4,
        }}
      >
        {/* Card back (hidden) */}
        <Animated.View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backgroundColor: config.tertiary,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backfaceVisibility: 'hidden',
            transform: [{ rotateY: frontRotate }],
            borderWidth: 3,
            borderColor: 'white',
            shadowColor: '#000',
            shadowOffset: { width: 2, height: 2 },
            shadowRadius: 0,
            shadowOpacity: 0.3,
          }}
        >
          <Text style={{ fontSize: cardSize * 0.4 }}>🦈</Text>
        </Animated.View>

        {/* Card front (revealed) */}
        <Animated.View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backgroundColor: card.state === 'matched' ? '#4CAF50' : 'white',
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backfaceVisibility: 'hidden',
            transform: [{ rotateY: backRotate }],
            borderWidth: 3,
            borderColor: card.state === 'matched' ? '#4CAF50' : config.secondary,
            shadowColor: '#000',
            shadowOffset: { width: 2, height: 2 },
            shadowRadius: 0,
            shadowOpacity: 0.3,
          }}
        >
          <Text style={{ fontSize: cardSize * 0.5 }}>{card.emoji}</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

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
            width: Dimensions.get('window').width - 24,
            position: 'relative',
            alignItems: 'center',
          }}
        >
          {/* Ribbon Header */}
          <Ribbon text="Memory Match!" />

          {/* Main Content Box */}
          <View
            style={{
              backgroundColor: config.primary,
              marginTop: '-10%',
              width: '95%',
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
                    paddingHorizontal: 12,
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
                      marginBottom: 8,
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
                          fontSize: 22,
                          color: config.tertiary,
                          textAlign: 'center',
                          textTransform: 'uppercase',
                          textShadowColor: 'rgba(0, 0, 0, 0.5)',
                          textShadowOffset: { width: 2, height: 2 },
                          textShadowRadius: 0,
                          marginBottom: 8,
                        }}
                      >
                        Match the pairs!
                      </Text>

                      <Text
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 14,
                          color: 'rgba(255, 255, 255, 0.8)',
                          textAlign: 'center',
                          marginBottom: 16,
                        }}
                      >
                        {getCardCount() / 2} pairs • {timeLimitSeconds} seconds
                      </Text>

                      {/* Difficulty badge */}
                      <View
                        style={{
                          backgroundColor: 
                            difficulty === 'easy' ? '#4CAF50' :
                            difficulty === 'medium' ? config.tertiary :
                            config.red,
                          paddingHorizontal: 16,
                          paddingVertical: 6,
                          borderRadius: 12,
                          marginBottom: 20,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 14,
                            color: 'white',
                            textTransform: 'uppercase',
                          }}
                        >
                          {difficulty}
                        </Text>
                      </View>

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
                      {/* Stats row */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          width: '100%',
                          marginBottom: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 16,
                            color: 'white',
                          }}
                        >
                          🃏 {matchedPairs}/{getCardCount() / 2}
                        </Text>
                        <Text
                          style={{
                            fontFamily: 'Shark',
                            fontSize: 24,
                            color: timeLeft <= 10 ? config.red : config.tertiary,
                          }}
                        >
                          {timeLeft}s
                        </Text>
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 16,
                            color: 'white',
                          }}
                        >
                          Moves: {moves}
                        </Text>
                      </View>

                      {/* Timer bar */}
                      <View
                        style={{
                          width: '100%',
                          height: 10,
                          backgroundColor: 'rgba(255, 255, 255, 0.2)',
                          borderRadius: 5,
                          marginBottom: 12,
                          overflow: 'hidden',
                        }}
                      >
                        <Animated.View
                          style={{
                            height: '100%',
                            width: progressWidth,
                            backgroundColor: timeLeft <= 10 ? config.red : '#4CAF50',
                            borderRadius: 4,
                          }}
                        />
                      </View>

                      {/* Card grid */}
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          justifyContent: 'center',
                        }}
                      >
                        {cards.map(renderCard)}
                      </View>
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
                        {finalMultiplier >= 2.0 ? '🎯 Perfect!' : 
                         finalMultiplier >= 1.5 ? '🔥 Amazing!' :
                         finalMultiplier >= 1.0 ? '👍 Nice!' : 
                         timeLeft > 0 ? '😅 Close!' : '⏰ Time\'s Up!'}
                      </Text>

                      {/* Stats */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'center',
                          marginBottom: 16,
                          gap: 20,
                        }}
                      >
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 24, color: '#4CAF50' }}>
                            {matchedPairs}
                          </Text>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                            Pairs
                          </Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 24, color: 'white' }}>
                            {moves}
                          </Text>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                            Moves
                          </Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 24, color: mistakes === 0 ? '#FFD700' : config.red }}>
                            {mistakes}
                          </Text>
                          <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                            Mistakes
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
