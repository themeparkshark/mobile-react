import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Vibration } from 'react-native';
import MiniGameShell from './MiniGameShell';

interface Props {
  visible: boolean;
  taskId: number;
  taskName: string;
  coinImageUrl?: string;
  totalQuestions?: number;
  timeLimitSeconds?: number;
  onClose: () => void;
  onComplete: (multiplier: number, rewards: { coins: number; xp: number }) => void;
}

interface Question {
  q: string;
  options: string[];
  answer: number;
}

const QUESTION_POOL: Question[] = [
  { q: 'What year did Walt Disney World open?', options: ['1965', '1971', '1975', '1982'], answer: 1 },
  { q: 'Which park has Spaceship Earth?', options: ['Magic Kingdom', 'Hollywood Studios', 'EPCOT', 'Animal Kingdom'], answer: 2 },
  { q: 'Which Disney park opened first?', options: ['Magic Kingdom', 'Disneyland', 'EPCOT', 'Tokyo Disney'], answer: 1 },
  { q: 'What is the tallest attraction at WDW?', options: ['Tower of Terror', 'Expedition Everest', 'Space Mountain', 'Guardians'], answer: 1 },
  { q: 'Which land has Pirates of the Caribbean?', options: ['Fantasyland', 'Frontierland', 'Adventureland', 'Liberty Square'], answer: 2 },
  { q: 'What year did EPCOT open?', options: ['1971', '1982', '1989', '1998'], answer: 1 },
  { q: 'How many theme parks are at WDW?', options: ['2', '3', '4', '6'], answer: 2 },
  { q: 'Which park has the Haunted Mansion?', options: ['EPCOT', 'Magic Kingdom', 'Animal Kingdom', 'Hollywood Studios'], answer: 1 },
  { q: 'What is the Avatar ride in Animal Kingdom?', options: ['Avatar Run', 'Pandora Express', 'Flight of Passage', 'Banshee Ride'], answer: 2 },
  { q: 'What replaced Splash Mountain?', options: ['Moana Journey', "Tiana's Bayou", 'Princess & Frog', 'Splash Remake'], answer: 1 },
  { q: 'Which resort has a monorail stop?', options: ['All-Star Sports', 'Contemporary', 'Coronado', 'Riviera'], answer: 1 },
  { q: 'What is the oldest ride at Magic Kingdom?', options: ['Space Mountain', 'Jungle Cruise', "it's a small world", 'Carousel'], answer: 2 },
  { q: 'Which park has Rock n Roller Coaster?', options: ['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom'], answer: 2 },
  { q: 'What is the name of the Animal Kingdom tree?', options: ['Tree of Life', 'The Great Tree', 'Wisdom Tree', 'Pandora Tree'], answer: 0 },
  { q: 'Which land is Tron Lightcycle Run in?', options: ['Fantasyland', 'Tomorrowland', 'Adventureland', 'Main Street'], answer: 1 },
];

function pickQuestions(count: number): Question[] {
  return [...QUESTION_POOL].sort(() => Math.random() - 0.5).slice(0, count);
}

export default function TriviaMiniGame({
  visible,
  taskId,
  taskName,
  totalQuestions = 3,
  timeLimitSeconds = 15,
  onClose,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'instructions' | 'countdown' | 'playing' | 'ended'>('instructions');
  const [questionsLeft, setQuestionsLeft] = useState(totalQuestions);
  const [result, setResult] = useState<{ won: boolean; message: string; stars: number } | null>(null);

  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  const questionsRef = useRef<Question[]>([]);
  const correctRef = useRef(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameEndedRef = useRef(false);
  const startTimeRef = useRef(0);

  // Option animations
  const optionScales = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(1))
  ).current;
  const questionFade = useRef(new Animated.Value(1)).current;

  // Progress
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      questionsRef.current = pickQuestions(totalQuestions);
      correctRef.current = 0;
      gameEndedRef.current = false;
      startTimeRef.current = Date.now();
      setQuestionsLeft(totalQuestions);
      setCurrentQ(0);
      setSelected(null);
      setShowAnswer(false);
      setResult(null);
      setPhase('instructions');
      questionFade.setValue(1);
      optionScales.forEach(s => s.setValue(1));
      progressAnim.setValue(0);
    }
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [visible, totalQuestions]);

  const endGame = useCallback((won: boolean) => {
    if (gameEndedRef.current) return;
    gameEndedRef.current = true;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const timeBonus = Math.max(0, timeLimitSeconds - elapsed);
    const stars = won ? (timeBonus > timeLimitSeconds * 0.5 ? 3 : timeBonus > timeLimitSeconds * 0.25 ? 2 : 1) : 0;
    
    setResult({
      won,
      message: won ? (stars === 3 ? 'GENIUS!' : stars === 2 ? 'SMART!' : 'PASSED!') : 'WRONG!',
      stars,
    });
    setPhase('ended');
  }, [timeLimitSeconds]);

  const handleAnswer = useCallback((idx: number) => {
    if (showAnswer || gameEndedRef.current) return;
    if (phase !== 'playing') return;

    const q = questionsRef.current[currentQ];
    if (!q) return;

    setSelected(idx);
    setShowAnswer(true);

    const correct = q.answer === idx;
    
    if (correct) {
      // CORRECT!
      correctRef.current++;
      const newLeft = totalQuestions - correctRef.current;
      setQuestionsLeft(Math.max(0, newLeft));
      
      // Update progress
      Animated.spring(progressAnim, {
        toValue: correctRef.current / totalQuestions,
        friction: 6,
        useNativeDriver: false,
      }).start();
      
      Vibration.vibrate(10);
      
      // Bounce the correct option
      Animated.sequence([
        Animated.timing(optionScales[idx], { toValue: 1.08, duration: 100, useNativeDriver: false }),
        Animated.spring(optionScales[idx], { toValue: 1, friction: 4, useNativeDriver: false }),
      ]).start();

      // Check if all correct
      if (correctRef.current >= totalQuestions) {
        advanceTimer.current = setTimeout(() => endGame(true), 600);
        return;
      }

      // Next question
      advanceTimer.current = setTimeout(() => {
        Animated.timing(questionFade, { toValue: 0, duration: 120, useNativeDriver: false }).start(() => {
          setCurrentQ(c => c + 1);
          setSelected(null);
          setShowAnswer(false);
          optionScales.forEach(s => s.setValue(1));
          Animated.timing(questionFade, { toValue: 1, duration: 120, useNativeDriver: false }).start();
        });
      }, 600);
    } else {
      // WRONG - instant fail!
      Vibration.vibrate([0, 100, 50, 100]);
      advanceTimer.current = setTimeout(() => endGame(false), 800);
    }
  }, [phase, currentQ, showAnswer, totalQuestions, endGame]);

  const handleTimeUp = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    // Time's up = fail (unless already completed)
    if (correctRef.current >= totalQuestions) {
      endGame(true);
    } else {
      endGame(false);
    }
  }, [totalQuestions, endGame]);

  const handleDone = useCallback(() => {
    if (result?.won) {
      const mult = result.stars === 3 ? 2.0 : result.stars === 2 ? 1.5 : 1.0;
      onComplete(mult, { coins: 10, xp: 25 });
    } else {
      onClose();
    }
  }, [result, onComplete, onClose]);

  const q = questionsRef.current[currentQ];

  return (
    <MiniGameShell
      visible={visible}
      title="Quick Trivia!"
      subtitle={taskName}
      timeLimit={timeLimitSeconds}
      score={correctRef.current}
      objective={`Answer all ${totalQuestions} questions correctly!\nOne wrong answer = FAIL`}
      objectiveIcon="?"
      onTimeUp={handleTimeUp}
      onClose={onClose}
      phase={phase}
      setPhase={setPhase}
      result={result || undefined}
      onDone={handleDone}
    >
      {/* Progress indicator */}
      <View style={qs.progressWrap}>
        <View style={qs.progressBar}>
          <Animated.View style={[qs.progressFill, {
            width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }]} />
        </View>
        <Text style={qs.progressText}>
          {questionsLeft > 0 ? `${questionsLeft} to go!` : 'COMPLETE!'}
        </Text>
      </View>

      {q && (
        <Animated.View style={[qs.wrap, { opacity: questionFade }]}>  
          <Text style={qs.qNum}>Question {currentQ + 1} / {totalQuestions}</Text>
          <Text style={qs.question}>{q.q}</Text>
          <View style={qs.options}>
            {q.options.map((opt, i) => {
              let bg = '#334155';
              if (showAnswer) {
                if (i === q.answer) bg = '#22c55e';
                else if (i === selected) bg = '#ef4444';
              }
              return (
                <Animated.View key={i} style={{ transform: [{ scale: optionScales[i] }] }}>
                  <TouchableOpacity
                    style={[qs.option, { backgroundColor: bg }]}
                    onPress={() => handleAnswer(i)}
                    activeOpacity={0.7}
                  >
                    <Text style={qs.optionText}>{opt}</Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
          <Text style={qs.hint}>Get ALL {totalQuestions} correct to pass!</Text>
        </Animated.View>
      )}
    </MiniGameShell>
  );
}

const qs = StyleSheet.create({
  progressWrap: { alignItems: 'center', marginBottom: 8 },
  progressBar: { 
    width: '80%', height: 12, backgroundColor: 'rgba(255,255,255,0.1)', 
    borderRadius: 6, overflow: 'hidden' 
  },
  progressFill: { height: '100%', backgroundColor: '#4ade80', borderRadius: 6 },
  progressText: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 4 },
  wrap: { paddingVertical: 8 },
  qNum: { color: '#fbbf24', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  question: { color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  options: { marginTop: 16 },
  option: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, marginTop: 8 },
  optionText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  hint: { color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginTop: 12 },
});
