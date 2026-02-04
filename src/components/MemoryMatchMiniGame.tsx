import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Easing, Vibration } from 'react-native';
import MiniGameShell from './MiniGameShell';

interface Props {
  visible: boolean;
  taskName: string;
  pairs?: number;
  timeLimitSeconds?: number;
  onClose: () => void;
  onComplete: (multiplier: number, timeBonus: number) => void;
}

// Unicode escapes for emoji (raw emoji breaks Metro Babel)
const CARD_FACES = [
  '\u{1F3A2}', '\u{1F3E0}', '\u{1F680}', '\u{2B50}',
  '\u{1F30A}', '\u{1F3AA}', '\u{1F3A1}', '\u{1F382}',
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const screenWidth = Dimensions.get('window').width;

export default function MemoryMatchMiniGame({
  visible,
  taskName,
  pairs = 4,
  timeLimitSeconds = 20,
  onClose,
  onComplete,
}: Props) {
  const totalCards = pairs * 2;
  const cols = 4;
  const cardSize = Math.floor((screenWidth * 0.85 - 48) / cols) - 8;

  const [phase, setPhase] = useState<'instructions' | 'countdown' | 'playing' | 'ended'>('instructions');
  const [pairsLeft, setPairsLeft] = useState(pairs);
  const [result, setResult] = useState<{ won: boolean; message: string; stars: number } | null>(null);
  const [, forceRender] = useState(0);

  // Game state refs
  const cardsRef = useRef<number[]>([]);
  const flippedRef = useRef<number[]>([]);
  const matchedRef = useRef<Set<number>>(new Set());
  const lockedRef = useRef(false);
  const movesRef = useRef(0);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const gameEndedRef = useRef(false);

  // Per-card animations
  const flipAnims = useRef(Array.from({ length: 16 }, () => new Animated.Value(0))).current;
  const scaleAnims = useRef(Array.from({ length: 16 }, () => new Animated.Value(1))).current;
  const shakeAnims = useRef(Array.from({ length: 16 }, () => new Animated.Value(0))).current;

  // Screen flash for matches
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Progress
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Reset
  useEffect(() => {
    if (visible) {
      cardsRef.current = shuffle([
        ...Array.from({ length: pairs }, (_, i) => i),
        ...Array.from({ length: pairs }, (_, i) => i),
      ]);
      flippedRef.current = [];
      matchedRef.current = new Set();
      lockedRef.current = false;
      movesRef.current = 0;
      startTimeRef.current = Date.now();
      gameEndedRef.current = false;
      setPairsLeft(pairs);
      setResult(null);
      setPhase('instructions');
      flipAnims.forEach(a => a.setValue(0));
      scaleAnims.forEach(a => a.setValue(1));
      shakeAnims.forEach(a => a.setValue(0));
      flashAnim.setValue(0);
      progressAnim.setValue(0);
    }
    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, [visible, pairs]);

  const endGame = useCallback((won: boolean, timeBonus: number = 0) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    
    const stars = won ? (timeBonus > timeLimitSeconds * 0.5 ? 3 : timeBonus > timeLimitSeconds * 0.25 ? 2 : 1) : 0;
    setResult({
      won,
      message: won ? (stars === 3 ? 'LIGHTNING!' : stars === 2 ? 'QUICK!' : 'PASSED!') : 'FAILED!',
      stars,
    });
    setPhase('ended');
  }, [timeLimitSeconds]);

  // Tap press-in effect (instant feedback)
  const pressIn = (index: number) => {
    Animated.timing(scaleAnims[index], {
      toValue: 0.9, duration: 60, useNativeDriver: false,
    }).start();
  };

  const pressOut = (index: number) => {
    Animated.spring(scaleAnims[index], {
      toValue: 1, friction: 3, tension: 100, useNativeDriver: false,
    }).start();
  };

  const flipCard = (index: number, toFront: boolean) => {
    Animated.timing(flipAnims[index], {
      toValue: toFront ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  };

  const shakeCards = (a: number, b: number) => {
    Vibration.vibrate([0, 30, 20, 30]);
    [a, b].forEach(idx => {
      Animated.sequence([
        Animated.timing(shakeAnims[idx], { toValue: 8, duration: 50, useNativeDriver: false }),
        Animated.timing(shakeAnims[idx], { toValue: -8, duration: 50, useNativeDriver: false }),
        Animated.timing(shakeAnims[idx], { toValue: 6, duration: 50, useNativeDriver: false }),
        Animated.timing(shakeAnims[idx], { toValue: -6, duration: 50, useNativeDriver: false }),
        Animated.timing(shakeAnims[idx], { toValue: 0, duration: 50, useNativeDriver: false }),
      ]).start();
    });
  };

  const celebrateMatch = (a: number, b: number) => {
    Vibration.vibrate(10);

    // Bounce matched cards with stagger
    [a, b].forEach((idx, i) => {
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(scaleAnims[idx], { toValue: 1.2, duration: 120, useNativeDriver: false }),
          Animated.spring(scaleAnims[idx], { toValue: 1, friction: 3, useNativeDriver: false }),
        ]).start();
      }, i * 80);
    });

    // Screen flash
    flashAnim.setValue(0.25);
    Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start();
  };

  const handleTap = useCallback((index: number) => {
    if (phase !== 'playing' || gameEndedRef.current) return;
    if (lockedRef.current) return;
    if (flippedRef.current.includes(index)) return;
    if (matchedRef.current.has(index)) return;

    flippedRef.current.push(index);
    flipCard(index, true);

    // Satisfying tap bounce
    Animated.sequence([
      Animated.timing(scaleAnims[index], { toValue: 1.1, duration: 80, useNativeDriver: false }),
      Animated.spring(scaleAnims[index], { toValue: 1, friction: 4, useNativeDriver: false }),
    ]).start();

    forceRender(n => n + 1);

    if (flippedRef.current.length === 2) {
      lockedRef.current = true;
      movesRef.current++;
      const [a, b] = flippedRef.current;

      if (cardsRef.current[a] === cardsRef.current[b]) {
        // MATCH!
        matchedRef.current.add(a);
        matchedRef.current.add(b);
        
        const newPairsLeft = pairs - matchedRef.current.size / 2;
        setPairsLeft(Math.max(0, newPairsLeft));
        
        // Update progress
        Animated.spring(progressAnim, {
          toValue: matchedRef.current.size / totalCards,
          friction: 6,
          useNativeDriver: false,
        }).start();
        
        flippedRef.current = [];
        lockedRef.current = false;
        celebrateMatch(a, b);

        // Check for WIN
        if (matchedRef.current.size === totalCards) {
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          const timeBonus = Math.max(0, timeLimitSeconds - elapsed);
          endGame(true, timeBonus);
        }
        forceRender(n => n + 1);
      } else {
        // NO MATCH — shake then flip back (faster)
        checkTimeoutRef.current = setTimeout(() => {
          shakeCards(a, b);
          setTimeout(() => {
            flipCard(a, false);
            setTimeout(() => flipCard(b, false), 60);
            flippedRef.current = [];
            lockedRef.current = false;
            forceRender(n => n + 1);
          }, 200);
        }, 400);
      }
    }
  }, [phase, totalCards, timeLimitSeconds, pairs, endGame]);

  const handleTimeUp = useCallback(() => {
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    endGame(false);
  }, [endGame]);

  const handleDone = useCallback(() => {
    if (result?.won) {
      const mult = result.stars === 3 ? 2.0 : result.stars === 2 ? 1.5 : 1.0;
      onComplete(mult, 0);
    } else {
      onClose();
    }
  }, [result, onComplete, onClose]);

  return (
    <MiniGameShell
      visible={visible}
      title="Memory Match!"
      subtitle={taskName}
      timeLimit={timeLimitSeconds}
      score={pairs - pairsLeft}
      objective={`Match all ${pairs} pairs before time runs out!`}
      objectiveIcon="?"
      onTimeUp={handleTimeUp}
      onClose={onClose}
      phase={phase}
      setPhase={setPhase}
      result={result || undefined}
      onDone={handleDone}
    >
      {/* Screen flash overlay */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#4ade80', opacity: flashAnim, zIndex: 50, borderRadius: 16,
        }}
      />

      {/* Progress indicator */}
      <View style={ms.progressWrap}>
        <View style={ms.progressBar}>
          <Animated.View style={[ms.progressFill, {
            width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }]} />
        </View>
        <Text style={ms.progressText}>
          {pairsLeft > 0 ? `${pairsLeft} pairs left!` : 'COMPLETE!'}
        </Text>
      </View>

      <View style={ms.grid}>
        {Array.from({ length: totalCards }).map((_, i) => {
          const cardFace = cardsRef.current[i];
          const isMatched = matchedRef.current.has(i);

          const frontOpacity = flipAnims[i].interpolate({
            inputRange: [0, 0.5, 0.5, 1],
            outputRange: [0, 0, 1, 1],
          });
          const backOpacity = flipAnims[i].interpolate({
            inputRange: [0, 0.5, 0.5, 1],
            outputRange: [1, 1, 0, 0],
          });

          return (
            <TouchableOpacity
              key={i}
              activeOpacity={1}
              onPressIn={() => pressIn(i)}
              onPressOut={() => pressOut(i)}
              onPress={() => handleTap(i)}
              style={{ margin: 4 }}
            >
              <Animated.View style={[
                ms.cardOuter,
                {
                  width: cardSize, height: cardSize * 1.15,
                  transform: [
                    { scale: scaleAnims[i] },
                    { translateX: shakeAnims[i] },
                  ],
                },
              ]}>
                {/* Back */}
                <Animated.View style={[ms.cardInner, ms.cardBack, { opacity: backOpacity }]}>
                  <Text style={ms.cardBackText}>?</Text>
                  <View style={ms.cardBackDecor} />
                </Animated.View>
                {/* Front */}
                <Animated.View style={[
                  ms.cardInner, ms.cardFront,
                  {
                    opacity: frontOpacity,
                    backgroundColor: isMatched ? '#16a34a' : '#1e293b',
                    borderColor: isMatched ? '#4ade80' : '#475569',
                  },
                ]}>
                  <Text style={ms.cardEmoji}>{CARD_FACES[cardFace] || '?'}</Text>
                  {isMatched && <View style={ms.matchGlow} />}
                </Animated.View>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={ms.hint}>Match all {pairs} pairs before time runs out!</Text>
    </MiniGameShell>
  );
}

const ms = StyleSheet.create({
  progressWrap: { alignItems: 'center', marginBottom: 8 },
  progressBar: { 
    width: '80%', height: 12, backgroundColor: 'rgba(255,255,255,0.1)', 
    borderRadius: 6, overflow: 'hidden' 
  },
  progressFill: { height: '100%', backgroundColor: '#4ade80', borderRadius: 6 },
  progressText: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 4 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    paddingVertical: 8,
  },
  cardOuter: {
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 5,
    elevation: 5,
  },
  cardInner: {
    position: 'absolute', width: '100%', height: '100%',
    borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3,
  },
  cardBack: {
    backgroundColor: '#6366f1', borderColor: '#818cf8',
  },
  cardBackText: {
    color: '#e0e7ff', fontSize: 32, fontWeight: '900',
  },
  cardBackDecor: {
    position: 'absolute', width: '75%', height: '75%',
    borderRadius: 100, borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)',
  },
  cardFront: { borderWidth: 3 },
  cardEmoji: { fontSize: 38 },
  matchGlow: {
    position: 'absolute', width: '130%', height: '130%',
    borderRadius: 20, backgroundColor: 'rgba(74, 222, 128, 0.15)',
  },
  hint: {
    color: 'rgba(255,255,255,0.4)', fontSize: 12,
    textAlign: 'center', marginTop: 4,
  },
});
