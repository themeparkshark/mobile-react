import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Vibration } from 'react-native';
import MiniGameShell from './MiniGameShell';

interface Props {
  visible: boolean;
  taskName: string;
  requiredTaps?: number;
  timeLimitSeconds?: number;
  onClose: () => void;
  onComplete: (multiplier: number, taps: number) => void;
}

const GRID_SIZE = 9; // 3x3

// Theme park themed symbols (no emoji)
const FACES = ['S', 'M', 'C', 'R', 'P', 'T', 'W', 'D', 'B'];

export default function TapChallengeMiniGame({
  visible,
  taskName,
  requiredTaps = 10,
  timeLimitSeconds = 12,
  onClose,
  onComplete,
}: Props) {
  console.log('🎮 TapChallengeMiniGame render:', { visible, taskName });
  const [phase, setPhase] = useState<'instructions' | 'countdown' | 'playing' | 'ended'>('instructions');
  const [tapsLeft, setTapsLeft] = useState(requiredTaps);
  const [result, setResult] = useState<{ won: boolean; message: string; stars: number } | null>(null);

  // Game state in refs to avoid render storms
  const tapsRef = useRef(0);
  const comboRef = useRef(0);
  const gridRef = useRef<(number | null)[]>(new Array(GRID_SIZE).fill(null));
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetIdRef = useRef(0);
  const gameEndedRef = useRef(false);
  
  // Animation values — created once
  const cellScales = useRef(
    Array.from({ length: GRID_SIZE }, () => new Animated.Value(0))
  ).current;
  const cellOpacities = useRef(
    Array.from({ length: GRID_SIZE }, () => new Animated.Value(0))
  ).current;

  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Reset
  useEffect(() => {
    if (visible) {
      setPhase('instructions');
      setTapsLeft(requiredTaps);
      setResult(null);
      tapsRef.current = 0;
      comboRef.current = 0;
      gridRef.current = new Array(GRID_SIZE).fill(null);
      targetIdRef.current = 0;
      gameEndedRef.current = false;
      cellScales.forEach(s => s.setValue(0));
      cellOpacities.forEach(o => o.setValue(0));
      progressAnim.setValue(0);
    }
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [visible, requiredTaps]);

  // Game loop
  useEffect(() => {
    if (phase !== 'playing') {
      if (tickerRef.current) clearInterval(tickerRef.current);
      return;
    }

    const spawnTarget = () => {
      if (gameEndedRef.current) return;
      
      // Find empty cells
      const empty: number[] = [];
      gridRef.current.forEach((v, i) => { if (v === null) empty.push(i); });
      if (empty.length === 0) return;

      const cell = empty[Math.floor(Math.random() * empty.length)];
      const id = ++targetIdRef.current;
      gridRef.current[cell] = id;

      // Pop in animation
      cellScales[cell].setValue(0);
      cellOpacities[cell].setValue(1);
      Animated.spring(cellScales[cell], {
        toValue: 1,
        friction: 4,
        tension: 60,
        useNativeDriver: false,
      }).start();

      // Auto-disappear after 1.2s (faster for urgency)
      setTimeout(() => {
        if (gridRef.current[cell] === id && !gameEndedRef.current) {
          gridRef.current[cell] = null;
          comboRef.current = 0;
          Animated.timing(cellOpacities[cell], {
            toValue: 0,
            duration: 150,
            useNativeDriver: false,
          }).start();
        }
      }, 1200);
    };

    // Spawn first target immediately
    spawnTarget();

    // Then every 600ms (faster spawn rate)
    tickerRef.current = setInterval(() => {
      spawnTarget();
    }, 600);

    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [phase]);

  const endGame = useCallback((won: boolean) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    if (tickerRef.current) clearInterval(tickerRef.current);
    
    const stars = won ? (tapsRef.current >= requiredTaps + 5 ? 3 : tapsRef.current >= requiredTaps + 2 ? 2 : 1) : 0;
    setResult({
      won,
      message: won ? (stars === 3 ? 'INCREDIBLE!' : stars === 2 ? 'GREAT!' : 'PASSED!') : 'FAILED!',
      stars,
    });
    setPhase('ended');
  }, [requiredTaps]);

  const handleTap = useCallback((cell: number) => {
    if (phase !== 'playing' || gameEndedRef.current) return;
    if (gridRef.current[cell] === null) return;

    // Hit!
    gridRef.current[cell] = null;
    comboRef.current++;
    tapsRef.current++;
    
    const newTapsLeft = requiredTaps - tapsRef.current;
    setTapsLeft(Math.max(0, newTapsLeft));
    
    // Update progress bar
    Animated.spring(progressAnim, {
      toValue: Math.min(1, tapsRef.current / requiredTaps),
      friction: 6,
      useNativeDriver: false,
    }).start();
    
    // Haptic feedback
    Vibration.vibrate(10);

    // Hit animation — quick scale burst then fade
    Animated.parallel([
      Animated.sequence([
        Animated.timing(cellScales[cell], { toValue: 1.4, duration: 80, useNativeDriver: false }),
        Animated.timing(cellScales[cell], { toValue: 0, duration: 150, useNativeDriver: false }),
      ]),
      Animated.timing(cellOpacities[cell], { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();

    // Check for WIN
    if (tapsRef.current >= requiredTaps) {
      endGame(true);
    }
  }, [phase, requiredTaps, endGame]);

  const handleTimeUp = useCallback(() => {
    // Time ran out — did they get enough taps?
    endGame(tapsRef.current >= requiredTaps);
  }, [requiredTaps, endGame]);

  const handleDone = useCallback(() => {
    if (result?.won) {
      const mult = result.stars === 3 ? 2.0 : result.stars === 2 ? 1.5 : 1.0;
      onComplete(mult, tapsRef.current);
    } else {
      onClose();
    }
  }, [result, onComplete, onClose]);

  return (
    <MiniGameShell
      visible={visible}
      title="Whack-a-Shark!"
      subtitle={taskName}
      timeLimit={timeLimitSeconds}
      score={requiredTaps - tapsLeft}
      objective={`Tap ${requiredTaps} sharks before time runs out!`}
      objectiveIcon="S"
      onTimeUp={handleTimeUp}
      onClose={onClose}
      phase={phase}
      setPhase={setPhase}
      result={result || undefined}
      onDone={handleDone}
    >
      {/* Progress indicator - taps needed */}
      <View style={gs.progressWrap}>
        <View style={gs.progressBar}>
          <Animated.View style={[gs.progressFill, {
            width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }]} />
        </View>
        <Text style={gs.progressText}>
          {tapsLeft > 0 ? `${tapsLeft} more!` : 'COMPLETE!'}
        </Text>
      </View>

      <View style={gs.grid}>
        {Array.from({ length: GRID_SIZE }).map((_, i) => (
          <TouchableOpacity
            key={i}
            style={gs.cell}
            activeOpacity={0.7}
            onPress={() => handleTap(i)}
          >
            <View style={gs.hole}>
              <Animated.View style={[gs.target, {
                transform: [{ scale: cellScales[i] }],
                opacity: cellOpacities[i],
              }]}>
                <Text style={gs.targetText}>{FACES[i]}</Text>
              </Animated.View>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={gs.hint}>Tap {requiredTaps} sharks before time runs out!</Text>
    </MiniGameShell>
  );
}

const gs = StyleSheet.create({
  progressWrap: { alignItems: 'center', marginBottom: 8 },
  progressBar: { 
    width: '80%', height: 12, backgroundColor: 'rgba(255,255,255,0.1)', 
    borderRadius: 6, overflow: 'hidden' 
  },
  progressFill: { height: '100%', backgroundColor: '#4ade80', borderRadius: 6 },
  progressText: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingVertical: 8 },
  cell: { width: '30%', aspectRatio: 1, padding: 4 },
  hole: {
    flex: 1, backgroundColor: '#0f172a', borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#334155',
  },
  target: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#3b82f6',
    justifyContent: 'center', alignItems: 'center',
  },
  targetText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  hint: { color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginTop: 4 },
});
