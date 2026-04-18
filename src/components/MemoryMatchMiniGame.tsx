import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import MiniGameShell from './MiniGameShell';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  visible: boolean;
  taskName: string;
  pairs?: number;
  timeLimitSeconds?: number;
  onClose: () => void;
  onComplete: (multiplier: number, timeBonus: number) => void;
}

// =============================================================================
// THEME PARK CARD DESIGNS - AAA Quality Icons
// =============================================================================
interface CardDesign {
  emoji: string;
  label: string;
  gradient: [string, string];
  glowColor: string;
}

const CARD_DESIGNS: CardDesign[] = [
  { emoji: '🏰', label: 'Castle', gradient: ['#667eea', '#764ba2'], glowColor: '#a78bfa' },
  { emoji: '🎢', label: 'Coaster', gradient: ['#f093fb', '#f5576c'], glowColor: '#fb7185' },
  { emoji: '🦈', label: 'Shark', gradient: ['#4facfe', '#00f2fe'], glowColor: '#22d3ee' },
  { emoji: '🎡', label: 'Wheel', gradient: ['#43e97b', '#38f9d7'], glowColor: '#34d399' },
  { emoji: '🚀', label: 'Rocket', gradient: ['#fa709a', '#fee140'], glowColor: '#fbbf24' },
  { emoji: '🍦', label: 'Treats', gradient: ['#a8edea', '#fed6e3'], glowColor: '#fda4af' },
  { emoji: '🎭', label: 'Show', gradient: ['#ff9a9e', '#fecfef'], glowColor: '#f9a8d4' },
  { emoji: '⚡', label: 'Flash', gradient: ['#ffecd2', '#fcb69f'], glowColor: '#fdba74' },
  { emoji: '🌙', label: 'Night', gradient: ['#2c3e50', '#4ca1af'], glowColor: '#67e8f9' },
  { emoji: '🎪', label: 'Circus', gradient: ['#eb3349', '#f45c43'], glowColor: '#f87171' },
  { emoji: '🗺️', label: 'Map', gradient: ['#11998e', '#38ef7d'], glowColor: '#4ade80' },
  { emoji: '🎬', label: 'Action', gradient: ['#fc4a1a', '#f7b733'], glowColor: '#fb923c' },
];

// =============================================================================
// PARTICLE SYSTEM - For match celebrations
// =============================================================================
interface Particle {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
  rotation: Animated.Value;
  color: string;
}

function createParticles(count: number, color: string): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    scale: new Animated.Value(0),
    opacity: new Animated.Value(1),
    rotation: new Animated.Value(0),
    color,
  }));
}

function animateParticleBurst(particles: Particle[], duration: number = 600) {
  particles.forEach((p, i) => {
    const angle = (i / particles.length) * Math.PI * 2;
    const distance = 60 + Math.random() * 40;
    const targetX = Math.cos(angle) * distance;
    const targetY = Math.sin(angle) * distance;

    p.x.setValue(0);
    p.y.setValue(0);
    p.scale.setValue(0);
    p.opacity.setValue(1);
    p.rotation.setValue(0);

    Animated.parallel([
      Animated.timing(p.x, {
        toValue: targetX,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(p.y, {
        toValue: targetY,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(p.scale, {
          toValue: 1,
          duration: duration * 0.3,
          easing: Easing.out(Easing.back(2)),
          useNativeDriver: true,
        }),
        Animated.timing(p.scale, {
          toValue: 0,
          duration: duration * 0.7,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(p.opacity, {
        toValue: 0,
        duration,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(p.rotation, {
        toValue: Math.random() * 4 - 2,
        duration,
        useNativeDriver: true,
      }),
    ]).start();
  });
}

// =============================================================================
// SHUFFLE UTILITY
// =============================================================================
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const { width: screenWidth } = Dimensions.get('window');

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function MemoryMatchMiniGame({
  visible,
  taskName,
  pairs = 6,
  timeLimitSeconds = 30,
  onClose,
  onComplete,
}: Props) {
  const totalCards = pairs * 2;
  const cols = pairs <= 4 ? 4 : pairs <= 6 ? 4 : 4;
  const cardSize = Math.floor((screenWidth * 0.88 - 32) / cols) - 10;

  // Game state
  const [phase, setPhase] = useState<'instructions' | 'countdown' | 'playing' | 'ended'>('instructions');
  const [pairsLeft, setPairsLeft] = useState(pairs);
  const [combo, setCombo] = useState(0);
  const [result, setResult] = useState<{ won: boolean; message: string; stars: number } | null>(null);
  const [, forceRender] = useState(0);

  // Refs for game logic
  const cardsRef = useRef<number[]>([]);
  const flippedRef = useRef<number[]>([]);
  const matchedRef = useRef<Set<number>>(new Set());
  const lockedRef = useRef(false);
  const comboRef = useRef(0);
  const startTimeRef = useRef(0);
  const gameEndedRef = useRef(false);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-card animations - TRUE 3D FLIP
  const flipAnims = useRef(Array.from({ length: 24 }, () => new Animated.Value(0))).current;
  const scaleAnims = useRef(Array.from({ length: 24 }, () => new Animated.Value(1))).current;
  const shakeXAnims = useRef(Array.from({ length: 24 }, () => new Animated.Value(0))).current;
  const glowAnims = useRef(Array.from({ length: 24 }, () => new Animated.Value(0))).current;
  const entranceAnims = useRef(Array.from({ length: 24 }, () => new Animated.Value(0))).current;

  // Global effects
  const screenShakeX = useRef(new Animated.Value(0)).current;
  const screenShakeY = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const comboScaleAnim = useRef(new Animated.Value(0)).current;
  const comboOpacityAnim = useRef(new Animated.Value(0)).current;

  // Particles for match celebration
  const [particles, setParticles] = useState<Particle[]>([]);
  const [particlePosition, setParticlePosition] = useState({ x: 0, y: 0 });

  // Timer warning state
  const [timeWarning, setTimeWarning] = useState(false);

  // =============================================================================
  // RESET ON VISIBLE
  // =============================================================================
  useEffect(() => {
    if (visible) {
      // Pick random card designs for this game
      const shuffledDesigns = shuffle([...Array(CARD_DESIGNS.length).keys()]).slice(0, pairs);
      cardsRef.current = shuffle([...shuffledDesigns, ...shuffledDesigns]);

      flippedRef.current = [];
      matchedRef.current = new Set();
      lockedRef.current = false;
      comboRef.current = 0;
      startTimeRef.current = Date.now();
      gameEndedRef.current = false;

      setPairsLeft(pairs);
      setCombo(0);
      setResult(null);
      setPhase('instructions');
      setTimeWarning(false);
      setParticles([]);

      // Reset all animations
      flipAnims.forEach(a => a.setValue(0));
      scaleAnims.forEach(a => a.setValue(1));
      shakeXAnims.forEach(a => a.setValue(0));
      glowAnims.forEach(a => a.setValue(0));
      entranceAnims.forEach(a => a.setValue(0));
      flashAnim.setValue(0);
      progressAnim.setValue(0);
      comboScaleAnim.setValue(0);
      comboOpacityAnim.setValue(0);
      screenShakeX.setValue(0);
      screenShakeY.setValue(0);
    }
    return () => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, [visible, pairs]);

  // =============================================================================
  // CARD ENTRANCE CASCADE - When game starts
  // =============================================================================
  useEffect(() => {
    if (phase === 'playing') {
      // Staggered entrance animation
      entranceAnims.forEach((anim, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const delay = (row * 60) + (col * 30);

        setTimeout(() => {
          anim.setValue(0);
          Animated.spring(anim, {
            toValue: 1,
            friction: 6,
            tension: 100,
            useNativeDriver: true,
          }).start();
        }, delay);
      });

      // Light haptic for game start
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [phase]);

  // =============================================================================
  // END GAME
  // =============================================================================
  const endGame = useCallback((won: boolean, timeBonus: number = 0) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;

    const maxTime = timeLimitSeconds;
    const stars = won
      ? timeBonus > maxTime * 0.6 ? 3 : timeBonus > maxTime * 0.3 ? 2 : 1
      : 0;

    const messages = won
      ? stars === 3 ? 'PERFECT!' : stars === 2 ? 'GREAT!' : 'NICE!'
      : 'TIME UP!';

    setResult({ won, message: messages, stars });
    setPhase('ended');

    if (won) {
      // Victory haptic pattern
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Victory screen flash
      flashAnim.setValue(0.4);
      Animated.timing(flashAnim, { toValue: 0, duration: 400, useNativeDriver: false }).start();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [timeLimitSeconds]);

  // =============================================================================
  // 3D CARD FLIP ANIMATION
  // =============================================================================
  const flipCard = (index: number, toFront: boolean, duration: number = 250) => {
    Animated.timing(flipAnims[index], {
      toValue: toFront ? 1 : 0,
      duration,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  // =============================================================================
  // SCREEN SHAKE
  // =============================================================================
  const triggerScreenShake = (intensity: number = 4) => {
    Animated.sequence([
      Animated.timing(screenShakeX, { toValue: intensity, duration: 30, useNativeDriver: true }),
      Animated.timing(screenShakeX, { toValue: -intensity, duration: 30, useNativeDriver: true }),
      Animated.timing(screenShakeX, { toValue: intensity * 0.5, duration: 30, useNativeDriver: true }),
      Animated.timing(screenShakeX, { toValue: 0, duration: 30, useNativeDriver: true }),
    ]).start();
  };

  // =============================================================================
  // CARD SHAKE (Mismatch)
  // =============================================================================
  const shakeCards = (indices: number[]) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    indices.forEach((idx) => {
      Animated.sequence([
        Animated.timing(shakeXAnims[idx], { toValue: 10, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeXAnims[idx], { toValue: -10, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeXAnims[idx], { toValue: 8, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeXAnims[idx], { toValue: -8, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeXAnims[idx], { toValue: 0, duration: 40, useNativeDriver: true }),
      ]).start();
    });

    triggerScreenShake(3);
  };

  // =============================================================================
  // MATCH CELEBRATION
  // =============================================================================
  const celebrateMatch = (a: number, b: number, cardDesign: CardDesign) => {
    // Heavy haptic for match
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Glow animation on matched cards
    [a, b].forEach((idx) => {
      Animated.sequence([
        Animated.timing(glowAnims[idx], { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(glowAnims[idx], { toValue: 0.6, duration: 300, useNativeDriver: false }),
      ]).start();
    });

    // Bounce animation with overshoot
    [a, b].forEach((idx, i) => {
      setTimeout(() => {
        Animated.sequence([
          Animated.timing(scaleAnims[idx], {
            toValue: 1.25,
            duration: 150,
            easing: Easing.out(Easing.back(2)),
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnims[idx], {
            toValue: 1,
            friction: 4,
            tension: 200,
            useNativeDriver: true,
          }),
        ]).start();
      }, i * 50);
    });

    // Screen flash
    flashAnim.setValue(0.2);
    Animated.timing(flashAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();

    // Particle burst
    const newParticles = createParticles(12, cardDesign.glowColor);
    setParticles(newParticles);
    setTimeout(() => animateParticleBurst(newParticles), 10);

    // Clear particles after animation
    setTimeout(() => setParticles([]), 700);
  };

  // =============================================================================
  // COMBO POPUP
  // =============================================================================
  const showComboPopup = (comboCount: number) => {
    comboScaleAnim.setValue(0);
    comboOpacityAnim.setValue(1);

    Animated.sequence([
      Animated.spring(comboScaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 150,
        useNativeDriver: true,
      }),
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(comboScaleAnim, {
          toValue: 0.5,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(comboOpacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  // =============================================================================
  // HANDLE TAP
  // =============================================================================
  const handleTap = useCallback((index: number) => {
    if (phase !== 'playing' || gameEndedRef.current) return;
    if (lockedRef.current) return;
    if (flippedRef.current.includes(index)) return;
    if (matchedRef.current.has(index)) return;

    // Instant tap feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Anticipation: quick scale down then up
    Animated.sequence([
      Animated.timing(scaleAnims[index], { toValue: 0.92, duration: 50, useNativeDriver: true }),
      Animated.spring(scaleAnims[index], { toValue: 1.05, friction: 5, tension: 200, useNativeDriver: true }),
      Animated.spring(scaleAnims[index], { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();

    flippedRef.current.push(index);
    flipCard(index, true);
    forceRender(n => n + 1);

    if (flippedRef.current.length === 2) {
      lockedRef.current = true;
      const [a, b] = flippedRef.current;

      if (cardsRef.current[a] === cardsRef.current[b]) {
        // ========== MATCH! ==========
        matchedRef.current.add(a);
        matchedRef.current.add(b);

        const newPairsLeft = pairs - matchedRef.current.size / 2;
        setPairsLeft(Math.max(0, newPairsLeft));

        // Combo system
        comboRef.current++;
        setCombo(comboRef.current);
        if (comboRef.current >= 2) {
          showComboPopup(comboRef.current);
        }

        // Progress bar animation
        Animated.spring(progressAnim, {
          toValue: matchedRef.current.size / totalCards,
          friction: 6,
          useNativeDriver: false,
        }).start();

        const cardDesign = CARD_DESIGNS[cardsRef.current[a]];
        celebrateMatch(a, b, cardDesign);

        flippedRef.current = [];
        lockedRef.current = false;

        // Check win
        if (matchedRef.current.size === totalCards) {
          setTimeout(() => {
            const elapsed = (Date.now() - startTimeRef.current) / 1000;
            const timeBonus = Math.max(0, timeLimitSeconds - elapsed);
            endGame(true, timeBonus);
          }, 300);
        }

        forceRender(n => n + 1);
      } else {
        // ========== NO MATCH ==========
        comboRef.current = 0;
        setCombo(0);

        checkTimeoutRef.current = setTimeout(() => {
          shakeCards([a, b]);

          setTimeout(() => {
            flipCard(a, false, 200);
            setTimeout(() => flipCard(b, false, 200), 80);
            flippedRef.current = [];
            lockedRef.current = false;
            forceRender(n => n + 1);
          }, 250);
        }, 500);
      }
    }
  }, [phase, pairs, totalCards, timeLimitSeconds, endGame]);

  // =============================================================================
  // TIME UP HANDLER
  // =============================================================================
  const handleTimeUp = useCallback(() => {
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    endGame(false);
  }, [endGame]);

  // =============================================================================
  // DONE HANDLER
  // =============================================================================
  const handleDone = useCallback(() => {
    if (result?.won) {
      // Base multiplier from stars, boosted by combo
      let mult = result.stars === 3 ? 2.0 : result.stars === 2 ? 1.5 : 1.0;
      onComplete(mult, 0);
    } else {
      onClose();
    }
  }, [result, onComplete, onClose]);

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <MiniGameShell
      visible={visible}
      title="Memory Match"
      subtitle={taskName}
      timeLimit={timeLimitSeconds}
      score={pairs - pairsLeft}
      objective={`Match all ${pairs} pairs!`}
      objectiveIcon="🧠"
      onTimeUp={handleTimeUp}
      onClose={onClose}
      phase={phase}
      setPhase={setPhase}
      result={result || undefined}
      onDone={handleDone}
    >
      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateX: screenShakeX }, { translateY: screenShakeY }],
        }}
      >
        {/* Screen flash overlay */}
        <Animated.View
          pointerEvents="none"
          style={[styles.flashOverlay, { opacity: flashAnim }]}
        />

        {/* Combo popup */}
        {combo >= 2 && (
          <Animated.View
            style={[
              styles.comboPopup,
              {
                opacity: comboOpacityAnim,
                transform: [{ scale: comboScaleAnim }],
              },
            ]}
          >
            <Text style={styles.comboText}>{combo}x COMBO!</Text>
          </Animated.View>
        )}

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {pairsLeft > 0 ? `${pairsLeft} pairs left` : '✨ Complete!'}
          </Text>
        </View>

        {/* Particle container */}
        <View style={styles.particleContainer} pointerEvents="none">
          {particles.map((p) => (
            <Animated.View
              key={p.id}
              style={[
                styles.particle,
                {
                  backgroundColor: p.color,
                  opacity: p.opacity,
                  transform: [
                    { translateX: p.x },
                    { translateY: p.y },
                    { scale: p.scale },
                    { rotate: p.rotation.interpolate({
                      inputRange: [-2, 2],
                      outputRange: ['-180deg', '180deg'],
                    })},
                  ],
                },
              ]}
            />
          ))}
        </View>

        {/* Card grid */}
        <View style={styles.grid}>
          {Array.from({ length: totalCards }).map((_, i) => {
            if (i >= cardsRef.current.length) return null;

            const cardIndex = cardsRef.current[i];
            const design = CARD_DESIGNS[cardIndex];
            const isMatched = matchedRef.current.has(i);

            // 3D flip interpolations
            const rotateY = flipAnims[i].interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '180deg'],
            });

            const backRotateY = flipAnims[i].interpolate({
              inputRange: [0, 1],
              outputRange: ['180deg', '360deg'],
            });

            // Visibility based on rotation
            const frontOpacity = flipAnims[i].interpolate({
              inputRange: [0, 0.5, 0.5, 1],
              outputRange: [0, 0, 1, 1],
            });

            const backOpacity = flipAnims[i].interpolate({
              inputRange: [0, 0.5, 0.5, 1],
              outputRange: [1, 1, 0, 0],
            });

            // Entrance animation
            const entranceTranslateY = entranceAnims[i].interpolate({
              inputRange: [0, 1],
              outputRange: [-100, 0],
            });

            // Glow intensity for matched cards
            const glowOpacity = glowAnims[i];

            return (
              <TouchableOpacity
                key={i}
                activeOpacity={1}
                onPress={() => handleTap(i)}
                style={styles.cardTouchable}
              >
                <Animated.View
                  style={[
                    styles.cardContainer,
                    {
                      width: cardSize,
                      height: cardSize * 1.2,
                      opacity: entranceAnims[i],
                      transform: [
                        { translateY: entranceTranslateY },
                        { translateX: shakeXAnims[i] },
                        { scale: scaleAnims[i] },
                      ],
                    },
                  ]}
                >
                  {/* Match glow effect */}
                  {isMatched && (
                    <Animated.View
                      style={[
                        styles.matchGlow,
                        {
                          backgroundColor: design.glowColor,
                          opacity: glowOpacity.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 0.6],
                          }),
                        },
                      ]}
                    />
                  )}

                  {/* Card back (face down) */}
                  <Animated.View
                    style={[
                      styles.card,
                      styles.cardBack,
                      {
                        opacity: backOpacity,
                        transform: [{ perspective: 1000 }, { rotateY }],
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={['#4f46e5', '#7c3aed']}
                      style={styles.cardBackGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.cardBackPattern}>
                        <Text style={styles.cardBackLogo}>🦈</Text>
                      </View>
                      <View style={styles.cardBackShine} />
                    </LinearGradient>
                  </Animated.View>

                  {/* Card front (face up) */}
                  <Animated.View
                    style={[
                      styles.card,
                      styles.cardFront,
                      {
                        opacity: frontOpacity,
                        transform: [{ perspective: 1000 }, { rotateY: backRotateY }],
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={design.gradient}
                      style={styles.cardFrontGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.cardEmoji}>{design.emoji}</Text>
                      <Text style={styles.cardLabel}>{design.label}</Text>
                      {isMatched && <View style={styles.matchedBadge}><Text style={styles.matchedCheck}>✓</Text></View>}
                    </LinearGradient>
                  </Animated.View>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.hintText}>Tap cards to flip • Match all pairs to win!</Text>
      </Animated.View>
    </MiniGameShell>
  );
}

// =============================================================================
// STYLES
// =============================================================================
const styles = StyleSheet.create({
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#4ade80',
    zIndex: 100,
    borderRadius: 16,
  },
  comboPopup: {
    position: 'absolute',
    top: '35%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 90,
  },
  comboText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fbbf24',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  progressContainer: {
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  progressTrack: {
    width: '100%',
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ade80',
    borderRadius: 5,
  },
  progressLabel: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  particleContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
    zIndex: 80,
  },
  particle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  cardTouchable: {
    margin: 5,
  },
  cardContainer: {
    position: 'relative',
  },
  matchGlow: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 20,
    zIndex: -1,
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  cardBack: {
    zIndex: 2,
  },
  cardBackGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#818cf8',
  },
  cardBackPattern: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBackLogo: {
    fontSize: 28,
  },
  cardBackShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  cardFront: {
    zIndex: 1,
  },
  cardFrontGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cardEmoji: {
    fontSize: 36,
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  matchedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchedCheck: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  hintText: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 8,
  },
});
