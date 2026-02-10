import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Vibration } from 'react-native';

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  timeLimit: number;
  score: number;
  objective: string; // NEW: Clear goal statement
  objectiveIcon?: string; // NEW: Optional icon/emoji for the game
  onTimeUp: () => void;
  onClose: () => void;
  children: React.ReactNode;
  phase: 'instructions' | 'countdown' | 'playing' | 'ended';
  setPhase: (p: 'instructions' | 'countdown' | 'playing' | 'ended') => void;
  result?: { won: boolean; message: string; stars: number };
  onDone?: () => void;
}

export default function MiniGameShell({
  visible, title, subtitle, timeLimit, score, objective, objectiveIcon,
  onTimeUp, onClose, children, phase, setPhase, result, onDone,
}: Props) {
  const [countNum, setCountNum] = useState(3);
  const [secondsLeft, setSecondsLeft] = useState(timeLimit);
  const timerWidth = useRef(new Animated.Value(1)).current;
  const countScale = useRef(new Animated.Value(0)).current;
  const scoreScale = useRef(new Animated.Value(1)).current;
  const timerPulse = useRef(new Animated.Value(1)).current;
  const timerGlow = useRef(new Animated.Value(0)).current;
  const instructionScale = useRef(new Animated.Value(0.8)).current;
  const instructionOpacity = useRef(new Animated.Value(0)).current;
  const timerAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevScore = useRef(0);
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Instructions animation
  useEffect(() => {
    if (phase === 'instructions') {
      instructionScale.setValue(0.8);
      instructionOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(instructionScale, { toValue: 1, friction: 6, useNativeDriver: false }),
        Animated.timing(instructionOpacity, { toValue: 1, duration: 300, useNativeDriver: false }),
      ]).start();
    }
  }, [phase]);

  // Countdown sequence
  useEffect(() => {
    if (!visible || phase !== 'countdown') return;
    setCountNum(3);
    let count = 3;

    const tick = () => {
      setCountNum(count);
      Vibration.vibrate(count > 0 ? 30 : 100);
      Animated.sequence([
        Animated.timing(countScale, { toValue: 1.2, duration: 150, useNativeDriver: false }),
        Animated.timing(countScale, { toValue: 1, duration: 150, useNativeDriver: false }),
      ]).start();

      if (count <= 0) {
        setPhase('playing');
        return;
      }
      count--;
      countdownRef.current = setTimeout(tick, 700);
    };
    tick();

    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, [visible, phase]);

  // Timer bar + seconds display
  useEffect(() => {
    if (phase !== 'playing') {
      if (tickerRef.current) clearInterval(tickerRef.current);
      if (pulseAnimRef.current) pulseAnimRef.current.stop();
      return;
    }
    
    setSecondsLeft(timeLimit);
    timerWidth.setValue(1);
    timerPulse.setValue(1);
    timerGlow.setValue(0);
    
    const startTime = Date.now();
    
    // Update seconds left every 100ms for accuracy
    tickerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, timeLimit - elapsed);
      setSecondsLeft(Math.ceil(remaining));
      
      // Haptic pulse in final 5 seconds
      if (remaining <= 5 && remaining > 0 && Math.floor(remaining) !== Math.floor(remaining + 0.1)) {
        Vibration.vibrate(20);
      }
      
      if (remaining <= 0) {
        if (tickerRef.current) clearInterval(tickerRef.current);
      }
    }, 100);
    
    // Main timer bar animation
    timerAnimRef.current = Animated.timing(timerWidth, {
      toValue: 0,
      duration: timeLimit * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    timerAnimRef.current.start(({ finished }) => {
      if (finished) onTimeUp();
    });

    // Urgency pulse animation (starts when ~25% time left)
    const urgencyDelay = timeLimit * 750; // Start at 25% remaining
    setTimeout(() => {
      if (phase !== 'playing') return;
      
      // Start pulsing the timer bar
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(timerPulse, { toValue: 1.08, duration: 200, useNativeDriver: false }),
          Animated.timing(timerPulse, { toValue: 1, duration: 200, useNativeDriver: false }),
        ])
      );
      pulseAnimRef.current.start();
      
      // Glow effect
      Animated.timing(timerGlow, { toValue: 1, duration: 500, useNativeDriver: false }).start();
    }, urgencyDelay);

    return () => {
      timerAnimRef.current?.stop();
      pulseAnimRef.current?.stop();
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [phase, timeLimit]);

  // Score bounce
  useEffect(() => {
    if (score !== prevScore.current) {
      prevScore.current = score;
      Animated.sequence([
        Animated.timing(scoreScale, { toValue: 1.3, duration: 100, useNativeDriver: false }),
        Animated.spring(scoreScale, { toValue: 1, friction: 4, useNativeDriver: false }),
      ]).start();
    }
  }, [score]);

  // Reset on open
  useEffect(() => {
    if (visible) {
      timerWidth.setValue(1);
      prevScore.current = 0;
      setSecondsLeft(timeLimit);
    }
  }, [visible, timeLimit]);

  if (!visible) return null;

  // More aggressive color transitions
  const timerColor = timerWidth.interpolate({
    inputRange: [0, 0.15, 0.3, 0.5, 1],
    outputRange: ['#dc2626', '#ef4444', '#f97316', '#facc15', '#4ade80'],
  });

  const urgencyGlow = timerGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', 'rgba(239, 68, 68, 0.3)'],
  });

  console.log('🎮 MiniGameShell render:', { visible, phase, title });

  if (!visible) return null;
  
  return (
    <View style={s.fullScreen}>
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header - always shown */}
          <View style={s.header}>
            <Text style={s.title}>{title}</Text>
            {subtitle && phase !== 'instructions' ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          </View>

          {/* INSTRUCTIONS PHASE - NEW */}
          {phase === 'instructions' && (
            <Animated.View style={[s.instructionsWrap, {
              transform: [{ scale: instructionScale }],
              opacity: instructionOpacity,
            }]}>
              {objectiveIcon && <Text style={s.objectiveIcon}>{objectiveIcon}</Text>}
              
              <View style={s.objectiveBox}>
                <Text style={s.objectiveLabel}>YOUR MISSION</Text>
                <Text style={s.objectiveText}>{objective}</Text>
              </View>
              
              <View style={s.timeBox}>
                <Text style={s.timeLabel}>TIME LIMIT</Text>
                <Text style={s.timeValue}>{timeLimit} seconds</Text>
              </View>
              
              <TouchableOpacity 
                style={s.startBtn}
                onPress={() => setPhase('countdown')}
                activeOpacity={0.8}
              >
                <Text style={s.startBtnText}>I'M READY!</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Timer bar - more prominent */}
          {phase === 'playing' && (
            <Animated.View style={[s.timerWrap, { 
              transform: [{ scale: timerPulse }],
              backgroundColor: urgencyGlow,
            }]}>
              <View style={s.timerBar}>
                <Animated.View style={[s.timerFill, {
                  width: timerWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  backgroundColor: timerColor,
                }]} />
              </View>
              <Animated.Text style={[s.timerText, {
                color: timerWidth.interpolate({
                  inputRange: [0, 0.25, 1],
                  outputRange: ['#ef4444', '#f97316', '#fff'],
                }),
              }]}>
                {secondsLeft}s
              </Animated.Text>
            </Animated.View>
          )}

          {/* Score - smaller, less focus */}
          {phase === 'playing' && (
            <Animated.Text style={[s.score, { transform: [{ scale: scoreScale }] }]}>
              {score}
            </Animated.Text>
          )}

          {/* Countdown */}
          {phase === 'countdown' && (
            <View style={s.countdownWrap}>
              <Animated.Text style={[s.countdownText, { transform: [{ scale: countScale }] }]}>
                {countNum > 0 ? countNum.toString() : 'GO!'}
              </Animated.Text>
            </View>
          )}

          {/* Game area */}
          {phase === 'playing' && (
            <View style={s.gameArea}>
              {children}
            </View>
          )}

          {/* Results */}
          {phase === 'ended' && result && (
            <View style={s.results}>
              <Text style={[s.resultMsg, { color: result.won ? '#4ade80' : '#f87171' }]}>
                {result.message}
              </Text>
              <View style={s.stars}>
                {[1, 2, 3].map(i => (
                  <Text key={i} style={[s.star, { opacity: i <= result.stars ? 1 : 0.2 }]}>
                    *
                  </Text>
                ))}
              </View>
              <TouchableOpacity
                style={[s.doneBtn, { backgroundColor: result.won ? '#4ade80' : '#666' }]}
                onPress={onDone || onClose}
              >
                <Text style={s.doneBtnText}>{result.won ? 'Collect Reward!' : 'Next'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* No close button during gameplay - tickets are already spent! */}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fullScreen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.95)' },
  container: { 
    width: '90%', maxHeight: '85%', backgroundColor: '#1a1a2e', borderRadius: 20, 
    padding: 16, alignItems: 'center',
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 20,
  },
  header: { alignItems: 'center', marginBottom: 8 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 },
  
  // Instructions phase styles
  instructionsWrap: { alignItems: 'center', paddingVertical: 16, width: '100%' },
  objectiveIcon: { fontSize: 64, marginBottom: 16 },
  objectiveBox: { 
    backgroundColor: 'rgba(255,255,255,0.08)', 
    borderRadius: 16, padding: 20, width: '100%', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
  },
  objectiveLabel: { 
    color: '#fbbf24', fontSize: 12, fontWeight: '800', 
    letterSpacing: 2, marginBottom: 8,
  },
  objectiveText: { 
    color: '#fff', fontSize: 20, fontWeight: '700', 
    textAlign: 'center', lineHeight: 28,
  },
  timeBox: { 
    flexDirection: 'row', alignItems: 'center', 
    marginTop: 16, gap: 8,
  },
  timeLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' },
  timeValue: { color: '#f97316', fontSize: 18, fontWeight: '900' },
  startBtn: { 
    backgroundColor: '#4ade80', paddingHorizontal: 48, paddingVertical: 16, 
    borderRadius: 14, marginTop: 24,
  },
  startBtnText: { color: '#000', fontSize: 20, fontWeight: '900' },
  // Cancel button removed - tickets are spent, player is committed!
  
  // Timer styles  
  timerWrap: { 
    width: '100%', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 12, marginBottom: 4,
  },
  timerBar: { 
    width: '100%', height: 10, backgroundColor: 'rgba(255,255,255,0.1)', 
    borderRadius: 5, overflow: 'hidden', 
  },
  timerFill: { height: '100%', borderRadius: 5 },
  timerText: { fontSize: 20, fontWeight: '900', marginTop: 4 },
  score: { color: '#fbbf24', fontSize: 24, fontWeight: '900', marginBottom: 4 },
  countdownWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
  countdownText: { color: '#fff', fontSize: 72, fontWeight: '900' },
  gameArea: { width: '100%', minHeight: 280 },
  results: { alignItems: 'center', paddingVertical: 24 },
  resultMsg: { fontSize: 32, fontWeight: '900' },
  stars: { flexDirection: 'row', marginTop: 8 },
  star: { fontSize: 40, color: '#fbbf24', marginHorizontal: 4 },
  doneBtn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  doneBtnText: { color: '#000', fontSize: 18, fontWeight: '800' },
  closeBtn: { position: 'absolute', top: 12, right: 16 },
  closeBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: 20, fontWeight: '700' },
});
