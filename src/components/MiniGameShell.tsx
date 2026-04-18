import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// =============================================================================
// TYPES
// =============================================================================
interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  timeLimit: number;
  score: number;
  objective: string;
  objectiveIcon?: string;
  onTimeUp: () => void;
  onClose: () => void;
  children: React.ReactNode;
  phase: 'instructions' | 'countdown' | 'playing' | 'ended';
  setPhase: (p: 'instructions' | 'countdown' | 'playing' | 'ended') => void;
  result?: { won: boolean; message: string; stars: number };
  onDone?: () => void;
}

// =============================================================================
// STAR PARTICLE SYSTEM (Background ambiance)
// =============================================================================
interface StarParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: Animated.Value;
  twinkleSpeed: number;
}

function createStarfield(count: number): StarParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    y: Math.random() * SCREEN_HEIGHT * 0.7,
    size: 2 + Math.random() * 4,
    opacity: new Animated.Value(0.3 + Math.random() * 0.5),
    twinkleSpeed: 1000 + Math.random() * 2000,
  }));
}

// =============================================================================
// CONFETTI SYSTEM
// =============================================================================
interface Confetti {
  id: number;
  startX: number;
  x: Animated.Value;
  y: Animated.Value;
  rotation: Animated.Value;
  scale: Animated.Value;
  color: string;
}

const CONFETTI_COLORS = ['#fbbf24', '#4ade80', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee'];

function createConfetti(count: number): Confetti[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    startX: SCREEN_WIDTH * 0.2 + Math.random() * SCREEN_WIDTH * 0.6,
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    rotation: new Animated.Value(0),
    scale: new Animated.Value(0),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));
}

function animateConfettiBurst(confetti: Confetti[]) {
  confetti.forEach((c, i) => {
    const delay = i * 20;
    const spreadX = (Math.random() - 0.5) * SCREEN_WIDTH * 0.8;
    const fallDistance = SCREEN_HEIGHT * 0.6 + Math.random() * 200;

    setTimeout(() => {
      c.x.setValue(0);
      c.y.setValue(0);
      c.scale.setValue(0);
      c.rotation.setValue(0);

      Animated.parallel([
        Animated.timing(c.x, {
          toValue: spreadX,
          duration: 1800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(c.y, {
          toValue: fallDistance,
          duration: 1800,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.spring(c.scale, {
            toValue: 1,
            friction: 5,
            tension: 100,
            useNativeDriver: true,
          }),
          Animated.timing(c.scale, {
            toValue: 0.3,
            duration: 800,
            delay: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(c.rotation, {
          toValue: (Math.random() - 0.5) * 10,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);
  });
}

// =============================================================================
// RESULT STAR COMPONENT
// =============================================================================
function ResultStar({ 
  filled, 
  index, 
  show,
  total,
}: { 
  filled: boolean; 
  index: number; 
  show: boolean;
  total: number;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (show) {
      const delay = 400 + index * 250;
      scale.setValue(0);
      rotation.setValue(0);
      glow.setValue(0);

      setTimeout(() => {
        Animated.parallel([
          Animated.spring(scale, {
            toValue: 1,
            friction: 4,
            tension: 80,
            useNativeDriver: true,
          }),
          Animated.timing(rotation, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.back(2)),
            useNativeDriver: true,
          }),
        ]).start();

        if (filled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          // Glow pulse for filled stars
          Animated.loop(
            Animated.sequence([
              Animated.timing(glow, { toValue: 1, duration: 800, useNativeDriver: true }),
              Animated.timing(glow, { toValue: 0.4, duration: 800, useNativeDriver: true }),
            ])
          ).start();
        }
      }, delay);
    }
  }, [show, filled, index]);

  const starSize = 56 - (total > 3 ? (total - 3) * 8 : 0);

  return (
    <Animated.View
      style={[
        styles.starWrapper,
        {
          transform: [
            { scale },
            { rotate: rotation.interpolate({
              inputRange: [0, 1],
              outputRange: ['-360deg', '0deg'],
            })},
          ],
        },
      ]}
    >
      {filled && (
        <Animated.View
          style={[
            styles.starGlow,
            {
              opacity: glow,
              width: starSize + 30,
              height: starSize + 30,
            },
          ]}
        />
      )}
      <Text style={[
        styles.starIcon,
        { 
          fontSize: starSize,
          opacity: filled ? 1 : 0.2,
          textShadowColor: filled ? '#fbbf24' : 'transparent',
          textShadowRadius: filled ? 10 : 0,
        },
      ]}>
        ⭐
      </Text>
    </Animated.View>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function MiniGameShell({
  visible,
  title,
  subtitle,
  timeLimit,
  score,
  objective,
  objectiveIcon,
  onTimeUp,
  onClose,
  children,
  phase,
  setPhase,
  result,
  onDone,
}: Props) {
  // State
  const [countNum, setCountNum] = useState(3);
  const [secondsLeft, setSecondsLeft] = useState(timeLimit);
  const [starfield] = useState(() => createStarfield(40));
  const [confetti] = useState(() => createConfetti(40));

  // Animation refs - using transform instead of width/height for native driver
  const timerProgress = useRef(new Animated.Value(1)).current;
  const countScale = useRef(new Animated.Value(0)).current;
  const countOpacity = useRef(new Animated.Value(1)).current;
  const scoreScale = useRef(new Animated.Value(1)).current;
  const timerPulseScale = useRef(new Animated.Value(1)).current;
  const instructionScale = useRef(new Animated.Value(0.8)).current;
  const instructionOpacity = useRef(new Animated.Value(0)).current;
  const containerScale = useRef(new Animated.Value(0.9)).current;
  const containerOpacity = useRef(new Animated.Value(0)).current;
  const resultScale = useRef(new Animated.Value(0)).current;
  const resultShake = useRef(new Animated.Value(0)).current;
  const screenShake = useRef(new Animated.Value(0)).current;

  // Timer refs
  const timerAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const prevScore = useRef(0);

  // =============================================================================
  // STARFIELD TWINKLE ANIMATION
  // =============================================================================
  useEffect(() => {
    if (!visible) return;

    starfield.forEach((star) => {
      const twinkle = () => {
        Animated.sequence([
          Animated.timing(star.opacity, {
            toValue: 0.1 + Math.random() * 0.3,
            duration: star.twinkleSpeed,
            useNativeDriver: true,
          }),
          Animated.timing(star.opacity, {
            toValue: 0.5 + Math.random() * 0.5,
            duration: star.twinkleSpeed,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (visible) twinkle();
        });
      };
      setTimeout(twinkle, Math.random() * 2000);
    });
  }, [visible]);

  // =============================================================================
  // CONTAINER ENTRANCE
  // =============================================================================
  useEffect(() => {
    if (visible) {
      containerScale.setValue(0.85);
      containerOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(containerScale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(containerOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  // =============================================================================
  // INSTRUCTIONS PHASE
  // =============================================================================
  useEffect(() => {
    if (phase === 'instructions') {
      instructionScale.setValue(0.8);
      instructionOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(instructionScale, { toValue: 1, friction: 6, useNativeDriver: true }),
        Animated.timing(instructionOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [phase]);

  // =============================================================================
  // COUNTDOWN PHASE
  // =============================================================================
  useEffect(() => {
    if (!visible || phase !== 'countdown') return;
    
    setCountNum(3);
    let count = 3;

    const tick = () => {
      setCountNum(count);
      Haptics.impactAsync(count > 0 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
      
      countScale.setValue(0);
      countOpacity.setValue(1);
      
      Animated.parallel([
        Animated.sequence([
          Animated.spring(countScale, {
            toValue: 1.3,
            friction: 4,
            tension: 120,
            useNativeDriver: true,
          }),
          Animated.timing(countScale, {
            toValue: 0.7,
            duration: 250,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(countOpacity, {
          toValue: 0,
          duration: 600,
          delay: 200,
          useNativeDriver: true,
        }),
      ]).start();

      if (count <= 0) {
        setPhase('playing');
        return;
      }
      count--;
      countdownRef.current = setTimeout(tick, 800);
    };
    tick();

    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, [visible, phase]);

  // =============================================================================
  // PLAYING PHASE - TIMER (using scaleX for native driver compatibility)
  // =============================================================================
  useEffect(() => {
    if (phase !== 'playing') {
      if (tickerRef.current) clearInterval(tickerRef.current);
      if (pulseAnimRef.current) pulseAnimRef.current.stop();
      return;
    }
    
    setSecondsLeft(timeLimit);
    timerProgress.setValue(1);
    timerPulseScale.setValue(1);
    
    const startTime = Date.now();
    
    tickerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, timeLimit - elapsed);
      setSecondsLeft(Math.ceil(remaining));
      
      if (remaining <= 5 && remaining > 0) {
        if (Math.floor(remaining) !== Math.floor(remaining + 0.1)) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
      
      if (remaining <= 0) {
        if (tickerRef.current) clearInterval(tickerRef.current);
      }
    }, 100);
    
    // Timer bar animation using transform scaleX
    timerAnimRef.current = Animated.timing(timerProgress, {
      toValue: 0,
      duration: timeLimit * 1000,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    timerAnimRef.current.start(({ finished }) => {
      if (finished) onTimeUp();
    });

    // Urgency pulse at 25% time remaining
    const urgencyDelay = timeLimit * 750;
    setTimeout(() => {
      if (phase !== 'playing') return;
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(timerPulseScale, { toValue: 1.03, duration: 120, useNativeDriver: true }),
          Animated.timing(timerPulseScale, { toValue: 1, duration: 120, useNativeDriver: true }),
        ])
      );
      pulseAnimRef.current.start();
    }, urgencyDelay);

    return () => {
      timerAnimRef.current?.stop();
      pulseAnimRef.current?.stop();
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [phase, timeLimit]);

  // =============================================================================
  // SCORE CHANGES
  // =============================================================================
  useEffect(() => {
    if (score !== prevScore.current && score > prevScore.current) {
      prevScore.current = score;
      
      Animated.sequence([
        Animated.timing(scoreScale, { toValue: 1.5, duration: 80, useNativeDriver: true }),
        Animated.spring(scoreScale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [score]);

  // =============================================================================
  // RESULT PHASE
  // =============================================================================
  useEffect(() => {
    if (phase === 'ended' && result) {
      resultScale.setValue(0);
      resultShake.setValue(0);
      screenShake.setValue(0);

      if (result.won) {
        // Victory animation
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Animated.spring(resultScale, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }).start();
        setTimeout(() => animateConfettiBurst(confetti), 300);
      } else {
        // Failure animation - screen shake
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Animated.parallel([
          Animated.spring(resultScale, {
            toValue: 1,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(screenShake, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(screenShake, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(screenShake, { toValue: 8, duration: 50, useNativeDriver: true }),
            Animated.timing(screenShake, { toValue: -8, duration: 50, useNativeDriver: true }),
            Animated.timing(screenShake, { toValue: 0, duration: 50, useNativeDriver: true }),
          ]),
        ]).start();
      }
    }
  }, [phase, result]);

  // =============================================================================
  // RESET
  // =============================================================================
  useEffect(() => {
    if (visible) {
      timerProgress.setValue(1);
      prevScore.current = 0;
      setSecondsLeft(timeLimit);
    }
  }, [visible, timeLimit]);

  // =============================================================================
  // HANDLERS
  // =============================================================================
  const handleStart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase('countdown');
  }, [setPhase]);

  const handleDone = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    (onDone || onClose)();
  }, [onDone, onClose]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  // =============================================================================
  // DERIVED - Timer color based on time remaining
  // =============================================================================
  const getTimerColor = () => {
    const pct = secondsLeft / timeLimit;
    if (pct > 0.5) return '#22c55e';
    if (pct > 0.25) return '#fbbf24';
    return '#ef4444';
  };

  const getResultMessage = () => {
    if (!result) return '';
    if (result.won) {
      if (result.stars === 3) return '🌟 PERFECT! 🌟';
      if (result.stars === 2) return '✨ GREAT! ✨';
      return '👏 NICE! 👏';
    }
    return '💪 SO CLOSE!';
  };

  if (!visible) return null;

  // =============================================================================
  // RENDER
  // =============================================================================
  return (
    <Animated.View 
      style={[
        styles.fullScreen,
        { transform: [{ translateX: screenShake }] },
      ]}
    >
      {/* Deep space gradient */}
      <LinearGradient
        colors={['#0f0c29', '#302b63', '#24243e', '#0f0c29']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Twinkling starfield */}
      {starfield.map((star) => (
        <Animated.View
          key={star.id}
          style={[
            styles.starParticle,
            {
              left: star.x,
              top: star.y,
              width: star.size,
              height: star.size,
              borderRadius: star.size / 2,
              opacity: star.opacity,
            },
          ]}
        />
      ))}

      {/* Victory confetti */}
      {phase === 'ended' && result?.won && confetti.map((c) => (
        <Animated.View
          key={c.id}
          style={[
            styles.confettiPiece,
            {
              left: c.startX,
              top: SCREEN_HEIGHT * 0.15,
              backgroundColor: c.color,
              transform: [
                { translateX: c.x },
                { translateY: c.y },
                { scale: c.scale },
                { rotate: c.rotation.interpolate({
                  inputRange: [-5, 5],
                  outputRange: ['-540deg', '540deg'],
                })},
              ],
            },
          ]}
        />
      ))}

      {/* Main container */}
      <Animated.View
        style={[
          styles.container,
          {
            opacity: containerOpacity,
            transform: [{ scale: containerScale }],
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && phase !== 'instructions' && (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>

        {/* INSTRUCTIONS PHASE */}
        {phase === 'instructions' && (
          <Animated.View
            style={[
              styles.instructionsWrap,
              {
                opacity: instructionOpacity,
                transform: [{ scale: instructionScale }],
              },
            ]}
          >
            {objectiveIcon && (
              <View style={styles.iconContainer}>
                <Text style={styles.objectiveIcon}>{objectiveIcon}</Text>
                <View style={styles.iconRing} />
              </View>
            )}

            <LinearGradient
              colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
              style={styles.objectiveBox}
            >
              <Text style={styles.objectiveLabel}>🎯 OBJECTIVE</Text>
              <Text style={styles.objectiveText}>{objective}</Text>
            </LinearGradient>

            <View style={styles.timeDisplay}>
              <Text style={styles.timeIcon}>⏱️</Text>
              <Text style={styles.timeValue}>{timeLimit}</Text>
              <Text style={styles.timeUnit}>SEC</Text>
            </View>

            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleStart}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#4ade80', '#16a34a']}
                style={styles.startBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              >
                <Text style={styles.startBtnText}>🎮 START!</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* COUNTDOWN PHASE */}
        {phase === 'countdown' && (
          <View style={styles.countdownWrap}>
            <Animated.View
              style={[
                styles.countdownCircle,
                {
                  opacity: countOpacity,
                  transform: [{ scale: countScale }],
                },
              ]}
            >
              <Text style={styles.countdownText}>
                {countNum > 0 ? countNum : '🚀'}
              </Text>
            </Animated.View>
            <Text style={styles.countdownLabel}>
              {countNum > 0 ? 'GET READY...' : 'GO!'}
            </Text>
          </View>
        )}

        {/* PLAYING PHASE */}
        {phase === 'playing' && (
          <>
            {/* Timer bar */}
            <Animated.View
              style={[
                styles.timerContainer,
                { transform: [{ scale: timerPulseScale }] },
              ]}
            >
              <View style={styles.timerTrack}>
                <Animated.View
                  style={[
                    styles.timerFill,
                    {
                      backgroundColor: getTimerColor(),
                      transform: [{ scaleX: timerProgress }],
                    },
                  ]}
                />
              </View>
              <View style={styles.timerTextContainer}>
                <Text style={[
                  styles.timerText,
                  secondsLeft <= 5 && styles.timerTextDanger,
                ]}>
                  {secondsLeft}
                </Text>
                <Text style={styles.timerSec}>s</Text>
              </View>
            </Animated.View>

            {/* Score */}
            <Animated.View
              style={[
                styles.scoreContainer,
                { transform: [{ scale: scoreScale }] },
              ]}
            >
              <Text style={styles.scoreValue}>{score}</Text>
            </Animated.View>

            {/* Game area */}
            <View style={styles.gameArea}>{children}</View>
          </>
        )}

        {/* ENDED PHASE */}
        {phase === 'ended' && result && (
          <Animated.View
            style={[
              styles.resultContainer,
              { transform: [{ scale: resultScale }] },
            ]}
          >
            {/* Result message */}
            <Text
              style={[
                styles.resultMessage,
                { color: result.won ? '#4ade80' : '#fb923c' },
              ]}
            >
              {getResultMessage()}
            </Text>

            {/* Score display */}
            <View style={styles.finalScoreBox}>
              <Text style={styles.finalScoreLabel}>FINAL SCORE</Text>
              <Text style={styles.finalScoreValue}>{score}</Text>
            </View>

            {/* Stars */}
            <View style={styles.starsContainer}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.starWrapper}>
                  <Text style={[
                    styles.starIcon,
                    { opacity: i < result.stars ? 1 : 0.25 }
                  ]}>
                    ⭐
                  </Text>
                </View>
              ))}
            </View>

            {/* Action buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={handleBack}
                activeOpacity={0.8}
              >
                <Text style={styles.backBtnText}>← Menu</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.doneBtn,
                  { backgroundColor: result.won ? '#4ade80' : '#60a5fa' },
                ]}
                onPress={handleDone}
                activeOpacity={0.85}
              >
                <Text style={styles.doneBtnText}>
                  {result.won ? '🎉 Collect!' : '🔄 Retry'}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

// =============================================================================
// STYLES
// =============================================================================
const styles = StyleSheet.create({
  fullScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  starParticle: {
    position: 'absolute',
    backgroundColor: '#fff',
  },
  confettiPiece: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 70,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
    letterSpacing: 1,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    marginTop: 4,
    fontWeight: '600',
  },
  // Instructions
  instructionsWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  iconRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  objectiveIcon: {
    fontSize: 52,
  },
  objectiveBox: {
    borderRadius: 20,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  objectiveLabel: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 14,
  },
  objectiveText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 32,
  },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 20,
  },
  timeIcon: {
    fontSize: 28,
    marginRight: 10,
  },
  timeValue: {
    color: '#f97316',
    fontSize: 42,
    fontWeight: '900',
  },
  timeUnit: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 6,
  },
  startBtn: {
    marginTop: 36,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  startBtnGradient: {
    paddingHorizontal: 56,
    paddingVertical: 20,
  },
  startBtnText: {
    color: '#000',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
  },
  // Countdown
  countdownWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  countdownText: {
    color: '#fff',
    fontSize: 100,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  countdownLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 24,
    letterSpacing: 4,
  },
  // Timer
  timerContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  timerTrack: {
    width: '100%',
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  timerFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
    borderRadius: 8,
    transformOrigin: 'left',
  },
  timerTextContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
  },
  timerText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
  },
  timerTextDanger: {
    color: '#ef4444',
  },
  timerSec: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 2,
  },
  // Score
  scoreContainer: {
    marginBottom: 16,
  },
  scoreValue: {
    color: '#fbbf24',
    fontSize: 56,
    fontWeight: '900',
    textShadowColor: 'rgba(251, 191, 36, 0.4)',
    textShadowRadius: 20,
  },
  // Game area
  gameArea: {
    flex: 1,
    width: '100%',
  },
  // Results
  resultContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  resultMessage: {
    fontSize: 38,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: 20,
  },
  finalScoreBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  finalScoreLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  finalScoreValue: {
    color: '#fbbf24',
    fontSize: 48,
    fontWeight: '900',
  },
  starsContainer: {
    flexDirection: 'row',
    marginBottom: 36,
  },
  starWrapper: {
    marginHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starGlow: {
    position: 'absolute',
    backgroundColor: '#fbbf24',
    borderRadius: 50,
  },
  starIcon: {
    textShadowOffset: { width: 0, height: 0 },
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backBtn: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  backBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  doneBtn: {
    paddingHorizontal: 36,
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  doneBtnText: {
    color: '#000',
    fontSize: 20,
    fontWeight: '900',
  },
});
