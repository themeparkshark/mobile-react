import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Vibration } from 'react-native';
import MiniGameShell from './MiniGameShell';

interface Props {
  visible: boolean;
  taskName: string;
  totalTargets?: number;
  requiredHits?: number;
  timeLimitSeconds?: number;
  onClose: () => void;
  onComplete: (multiplier: number, perfects: number) => void;
}

const TRACK_HEIGHT = 260;
const HIT_ZONE_Y = TRACK_HEIGHT - 60;
const HIT_ZONE_SIZE = 50;
const PERFECT_RANGE = 18;
const GOOD_RANGE = 40;

export default function TimingMiniGame({
  visible,
  taskName,
  totalTargets = 6,
  requiredHits = 5,
  timeLimitSeconds = 15,
  onClose,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'instructions' | 'countdown' | 'playing' | 'ended'>('instructions');
  const [hitsLeft, setHitsLeft] = useState(requiredHits);
  const [result, setResult] = useState<{ won: boolean; message: string; stars: number } | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  // Game state refs
  const hitsRef = useRef(0);
  const perfectsRef = useRef(0);
  const spawnedRef = useRef(0);
  const activeTargets = useRef<{ id: number; anim: Animated.Value; position: number }[]>([]);
  const spawnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetCounter = useRef(0);
  const gameEndedRef = useRef(false);

  // Target animation pool (max 5 simultaneous)
  const targetAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(-30))
  ).current;
  const targetOpacities = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0))
  ).current;

  // Hit zone pulse
  const hitZonePulse = useRef(new Animated.Value(1)).current;
  const feedbackScale = useRef(new Animated.Value(0)).current;

  // Progress
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPhase('instructions');
      setHitsLeft(requiredHits);
      setResult(null);
      setFeedback('');
      hitsRef.current = 0;
      perfectsRef.current = 0;
      spawnedRef.current = 0;
      activeTargets.current = [];
      targetCounter.current = 0;
      gameEndedRef.current = false;
      targetAnims.forEach(a => a.setValue(-30));
      targetOpacities.forEach(o => o.setValue(0));
      progressAnim.setValue(0);
    }
    return () => {
      if (spawnTimer.current) clearTimeout(spawnTimer.current);
    };
  }, [visible, requiredHits]);

  const endGame = useCallback((won: boolean) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    if (spawnTimer.current) clearTimeout(spawnTimer.current);
    
    const stars = won ? (perfectsRef.current >= totalTargets - 1 ? 3 : perfectsRef.current >= totalTargets / 2 ? 2 : 1) : 0;
    setResult({
      won,
      message: won ? (stars === 3 ? 'PERFECT!' : stars === 2 ? 'GREAT!' : 'PASSED!') : 'FAILED!',
      stars,
    });
    setPhase('ended');
  }, [totalTargets]);

  const spawnTarget = useCallback(() => {
    if (gameEndedRef.current) return;
    if (spawnedRef.current >= totalTargets) return;

    // Find free slot
    let slot = -1;
    for (let i = 0; i < 5; i++) {
      if (!activeTargets.current.find(t => t.id % 5 === i)) { slot = i; break; }
    }
    if (slot === -1) return;

    spawnedRef.current++;
    const id = ++targetCounter.current;
    const anim = targetAnims[slot];
    const opacity = targetOpacities[slot];

    anim.setValue(-30);
    opacity.setValue(1);

    const target = { id, anim, position: -30 };
    activeTargets.current.push(target);

    // Track position via listener
    const listenerId = anim.addListener(({ value }) => {
      const t = activeTargets.current.find(t => t.id === id);
      if (t) t.position = value;
    });

    // Animate down the track - can't use native driver with addListener
    Animated.timing(anim, {
      toValue: TRACK_HEIGHT + 30,
      duration: 1800,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      anim.removeListener(listenerId);
      opacity.setValue(0);
      activeTargets.current = activeTargets.current.filter(t => t.id !== id);

      // Missed - if game still active
      if (finished && !gameEndedRef.current) {
        showFeedback('MISS!');
        Vibration.vibrate([0, 50, 30, 50]);
      }
    });

    // Schedule next
    if (spawnedRef.current < totalTargets) {
      const delay = 1000 + Math.random() * 500;
      spawnTimer.current = setTimeout(spawnTarget, delay);
    }
  }, [totalTargets]);

  // Start spawning when playing
  useEffect(() => {
    if (phase === 'playing') {
      gameEndedRef.current = false;
      spawnTarget();
    }
    return () => {
      if (spawnTimer.current) clearTimeout(spawnTimer.current);
    };
  }, [phase, spawnTarget]);

  const showFeedback = (text: string) => {
    setFeedback(text);
    feedbackScale.setValue(0);
    Animated.sequence([
      Animated.spring(feedbackScale, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.timing(feedbackScale, { toValue: 0, duration: 300, delay: 400, useNativeDriver: true }),
    ]).start();
  };

  const handleTap = useCallback(() => {
    if (phase !== 'playing' || gameEndedRef.current) return;
    if (activeTargets.current.length === 0) return;

    // Find closest target to hit zone
    let closest: typeof activeTargets.current[0] | null = null;
    let closestDist = Infinity;
    for (const t of activeTargets.current) {
      const dist = Math.abs(t.position - HIT_ZONE_Y);
      if (dist < closestDist) {
        closestDist = dist;
        closest = t;
      }
    }

    if (!closest) return;

    // Check if it's a valid hit (within good range)
    if (closestDist <= GOOD_RANGE) {
      // Remove target
      const slot = closest.id % 5;
      targetOpacities[slot].setValue(0);
      activeTargets.current = activeTargets.current.filter(t => t.id !== closest!.id);

      hitsRef.current++;
      const newHitsLeft = requiredHits - hitsRef.current;
      setHitsLeft(Math.max(0, newHitsLeft));

      // Update progress
      Animated.spring(progressAnim, {
        toValue: Math.min(1, hitsRef.current / requiredHits),
        friction: 6,
        useNativeDriver: false,
      }).start();

      if (closestDist <= PERFECT_RANGE) {
        perfectsRef.current++;
        showFeedback('PERFECT!');
        Vibration.vibrate(10);
        // Pulse hit zone
        Animated.sequence([
          Animated.timing(hitZonePulse, { toValue: 1.3, duration: 80, useNativeDriver: true }),
          Animated.spring(hitZonePulse, { toValue: 1, friction: 4, useNativeDriver: true }),
        ]).start();
      } else {
        showFeedback('GOOD!');
        Vibration.vibrate(5);
      }

      // Check for WIN
      if (hitsRef.current >= requiredHits) {
        endGame(true);
      }
    } else {
      // Tap was too early/late
      showFeedback('MISS!');
      Vibration.vibrate([0, 30, 20, 30]);
    }
  }, [phase, requiredHits, endGame]);

  const handleTimeUp = useCallback(() => {
    endGame(hitsRef.current >= requiredHits);
  }, [requiredHits, endGame]);

  const handleDone = useCallback(() => {
    if (result?.won) {
      const mult = result.stars === 3 ? 2.0 : result.stars === 2 ? 1.5 : 1.0;
      onComplete(mult, perfectsRef.current);
    } else {
      onClose();
    }
  }, [result, onComplete, onClose]);

  return (
    <MiniGameShell
      visible={visible}
      title="Rhythm Tap!"
      subtitle={taskName}
      timeLimit={timeLimitSeconds}
      score={hitsRef.current}
      objective={`Hit ${requiredHits} of ${totalTargets} targets in the green zone!`}
      objectiveIcon="O"
      onTimeUp={handleTimeUp}
      onClose={onClose}
      phase={phase}
      setPhase={setPhase}
      result={result || undefined}
      onDone={handleDone}
    >
      {/* Progress indicator */}
      <View style={ts.progressWrap}>
        <View style={ts.progressBar}>
          <Animated.View style={[ts.progressFill, {
            width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }]} />
        </View>
        <Text style={ts.progressText}>
          {hitsLeft > 0 ? `${hitsLeft} more hits!` : 'COMPLETE!'}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={1}
        onPress={handleTap}
        style={ts.trackWrap}
      >
        {/* Track */}
        <View style={ts.track}>
          {/* Hit zone */}
          <Animated.View style={[ts.hitZone, {
            top: HIT_ZONE_Y - HIT_ZONE_SIZE / 2,
            transform: [{ scale: hitZonePulse }],
          }]} />

          {/* Targets */}
          {targetAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[ts.target, {
                transform: [{ translateY: anim }],
                opacity: targetOpacities[i],
              }]}
            />
          ))}

          {/* Guide lines */}
          <View style={[ts.guideLine, { top: HIT_ZONE_Y - GOOD_RANGE }]} />
          <View style={[ts.guideLine, { top: HIT_ZONE_Y + GOOD_RANGE }]} />
        </View>

        {/* Feedback text */}
        <Animated.View style={[ts.feedbackWrap, { transform: [{ scale: feedbackScale }] }]}>
          <Text style={[ts.feedbackText, {
            color: feedback === 'PERFECT!' ? '#fbbf24' : feedback === 'GOOD!' ? '#4ade80' : '#ef4444',
          }]}>{feedback}</Text>
        </Animated.View>

        <Text style={ts.hint}>Hit {requiredHits} of {totalTargets} targets!</Text>
      </TouchableOpacity>
    </MiniGameShell>
  );
}

const ts = StyleSheet.create({
  progressWrap: { alignItems: 'center', marginBottom: 8 },
  progressBar: { 
    width: '80%', height: 12, backgroundColor: 'rgba(255,255,255,0.1)', 
    borderRadius: 6, overflow: 'hidden' 
  },
  progressFill: { height: '100%', backgroundColor: '#4ade80', borderRadius: 6 },
  progressText: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 4 },
  trackWrap: { alignItems: 'center', paddingVertical: 8 },
  track: { width: 60, height: TRACK_HEIGHT, backgroundColor: '#0f172a', borderRadius: 30, overflow: 'hidden', borderWidth: 2, borderColor: '#334155' },
  hitZone: {
    position: 'absolute', left: -4, right: -4, height: HIT_ZONE_SIZE,
    backgroundColor: 'rgba(74, 222, 128, 0.2)', borderWidth: 2, borderColor: '#4ade80',
    borderRadius: 8,
  },
  target: {
    position: 'absolute', left: 14, width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#3b82f6', top: 0,
  },
  guideLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  feedbackWrap: { position: 'absolute', right: 20, top: '40%' },
  feedbackText: { fontSize: 22, fontWeight: '900' },
  hint: { color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 8 },
});
