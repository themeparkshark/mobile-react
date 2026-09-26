import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GameShellV2, Haptic, playSfx, type GameResult } from '../../gamekit';
import { fetchRideTrivia, type TriviaQuestion } from '../../services/lineplay/content';
import { rivalAnswer, showdownStars, SHOWDOWN_ROUNDS, SHOWDOWN_SECONDS } from './logic';

const SHARK = require('../../../assets/images/screens/pin-collections/shark.png');
type Phase = 'loading' | 'answering' | 'reveal';

interface Props {
  visible: boolean;
  seed: number;
  rideId?: number;
  parkId?: number;
  chapterId?: string;
  rideName?: string;
  onClose: () => void;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
}

/** A short, offline rival round. Queue rewards remain server-owned. */
export default function SharkShowdown({ visible, seed, rideId, parkId, chapterId, rideName,
  onClose, onComplete }: Props) {
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [picked, setPicked] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(SHOWDOWN_SECONDS);
  const [playerScore, setPlayerScore] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const playingRef = useRef(false);
  const lockedRef = useRef(false);
  const deadlineRef = useRef(0);
  const remainingRef = useRef(SHOWDOWN_SECONDS * 1000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundRef = useRef(0);
  const playerRef = useRef(0);
  const rivalRef = useRef(0);
  const question = questions[round];
  const rivalPick = useMemo(() => question ? rivalAnswer(question, seed, round) : null,
    [question, seed, round]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setQuestions([]);
    setRound(0);
    roundRef.current = 0;
    setPhase('loading');
    setPicked(null);
    setPlayerScore(0);
    setRivalScore(0);
    playerRef.current = 0;
    rivalRef.current = 0;
    setResult(null);
    playingRef.current = false;
    lockedRef.current = false;
    void (async () => {
      const unique: TriviaQuestion[] = [];
      for (let offset = 0; offset < 24 && unique.length < SHOWDOWN_ROUNDS; offset++) {
        const item = await fetchRideTrivia(rideId, parkId, seed + offset, chapterId);
        if (!unique.some(existing => existing.id === item.id)) unique.push(item);
      }
      if (alive) setQuestions(unique);
    })().catch(() => { if (alive) setQuestions([]); });
    return () => { alive = false; stopTimer(); };
  }, [visible, seed, rideId, parkId, chapterId, stopTimer]);

  const reveal = useCallback((choice: number | null) => {
    const index = roundRef.current;
    const card = questions[index];
    if (!playingRef.current || lockedRef.current || !card) return;
    lockedRef.current = true;
    stopTimer();
    setPicked(choice);
    setPhase('reveal');
    const you = choice === card.correctIndex ? playerRef.current + 1 : playerRef.current;
    const fin = rivalAnswer(card, seed, index) === card.correctIndex ? rivalRef.current + 1 : rivalRef.current;
    playerRef.current = you;
    rivalRef.current = fin;
    setPlayerScore(you);
    setRivalScore(fin);
    if (choice === card.correctIndex) { Haptic.success(); playSfx('coin', 0.45); }
    else { Haptic.warning(); playSfx('fail', 0.2); }
  }, [questions, seed, stopTimer]);

  const startTimer = useCallback((remainingMs: number) => {
    stopTimer();
    deadlineRef.current = Date.now() + remainingMs;
    timerRef.current = setInterval(() => {
      const left = Math.max(0, deadlineRef.current - Date.now());
      remainingRef.current = left;
      setSeconds(Math.ceil(left / 1000));
      if (left === 0) reveal(null);
    }, 100);
  }, [reveal, stopTimer]);

  const handleStart = useCallback(() => {
    playingRef.current = true;
    if (questions.length) {
      lockedRef.current = false;
      setPhase('answering');
      remainingRef.current = SHOWDOWN_SECONDS * 1000;
      setSeconds(SHOWDOWN_SECONDS);
      startTimer(remainingRef.current);
    }
  }, [questions.length, startTimer]);

  useEffect(() => {
    if (playingRef.current && phase === 'loading' && questions.length) {
      setPhase('answering');
      startTimer(SHOWDOWN_SECONDS * 1000);
    }
  }, [phase, questions.length, startTimer]);

  const handlePause = useCallback(() => {
    playingRef.current = false;
    remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
    stopTimer();
  }, [stopTimer]);
  const handleResume = useCallback(() => {
    playingRef.current = true;
    if (phase === 'answering') startTimer(remainingRef.current);
  }, [phase, startTimer]);

  const nextRound = useCallback(() => {
    if (!playingRef.current || phase !== 'reveal') return;
    if (round + 1 >= questions.length) {
      const stars = showdownStars(playerRef.current, rivalRef.current, questions.length);
      setResult({ score: playerRef.current * 100, stars,
        message: stars === 0 ? 'CAPTAIN FIN WINS' : stars === 1 ? 'A SHARK-SHARP TIE!' : 'YOU BEAT CAPTAIN FIN!',
        meta: { seed, playerAnswers: playerRef.current, rivalAnswers: rivalRef.current,
          rounds: questions.length, opponent: 'npc' } });
      return;
    }
    const next = round + 1;
    roundRef.current = next;
    setRound(next);
    setPicked(null);
    lockedRef.current = false;
    remainingRef.current = SHOWDOWN_SECONDS * 1000;
    setSeconds(SHOWDOWN_SECONDS);
    setPhase('answering');
    startTimer(remainingRef.current);
    playSfx('whoosh', 0.4);
  }, [phase, questions.length, round, seed, startTimer]);

  return <GameShellV2 visible={visible} title="Shark Showdown" subtitle={rideName}
    score={playerScore * 100} objective="Outsmart Captain Fin in three quick questions"
    result={result} onStart={handleStart} onPause={handlePause} onResume={handleResume}
    onClose={() => {
      // A finished loss is still a played queue activity. It grants no currency.
      if (result) onComplete(0, result.meta);
      else onClose();
    }} onComplete={onComplete}>
    <View style={styles.field}>
      <LinearGradient colors={['#08639f', '#168dc4', '#a0dcf2']} style={StyleSheet.absoluteFill} />
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>QUEUE ARCADE · SOLO RIVAL</Text>
          <Text style={styles.heroTitle}>Shark Showdown</Text>
          <Text style={styles.heroText}>Beat Captain Fin. Rematch whenever you want.</Text>
        </View>
        <Image source={SHARK} resizeMode="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
      </View>
      <View style={styles.scoreRail}>
        <Text style={styles.scoreText}>YOU  {playerScore}</Text>
        <Text style={styles.scoreVs}>VS</Text>
        <Text style={styles.scoreText}>CAPTAIN FIN  {rivalScore}</Text>
      </View>
      {question ? <View style={styles.questionCard}>
        <View style={styles.questionTop}>
          <Text style={styles.roundText}>ROUND {round + 1}/{questions.length}</Text>
          <Text style={[styles.timerText, seconds <= 3 && styles.timerUrgent]}>{seconds}s</Text>
        </View>
        <Text style={styles.question}>{question.question}</Text>
        {question.choices.map((choice, index) => {
          const revealed = phase === 'reveal';
          return <Pressable key={`${question.id}-${index}`} accessibilityRole="button"
            accessibilityLabel={choice} disabled={phase !== 'answering'} onPress={() => reveal(index)}
            style={({ pressed }) => [styles.answer,
              revealed && index === question.correctIndex && styles.answerCorrect,
              revealed && index === picked && index !== question.correctIndex && styles.answerWrong,
              pressed && styles.answerPressed]}>
            <Text style={styles.answerText}>{choice}</Text>
          </Pressable>;
        })}
        {phase === 'reveal' ? <View style={styles.reveal}>
          <Text style={styles.revealText}>Captain Fin picked {rivalPick == null ? '—' : question.choices[rivalPick]}.</Text>
          {question.fact ? <Text style={styles.fact}>{question.fact}</Text> : null}
          <Pressable accessibilityRole="button" onPress={nextRound} style={styles.nextButton}>
            <Text style={styles.nextText}>{round + 1 === questions.length ? 'SEE RESULT' : 'NEXT QUESTION'}  →</Text>
          </Pressable>
        </View> : null}
      </View> : <Text style={styles.loading}>Getting the questions ready…</Text>}
      <Text style={styles.footnote}>Solo rival · no other guest needed</Text>
    </View>
  </GameShellV2>;
}

const styles = StyleSheet.create({
  field: { flex: 1, paddingHorizontal: 16, paddingTop: 18, alignItems: 'center', overflow: 'hidden' },
  hero: { width: '100%', height: 104, borderRadius: 18, borderWidth: 3, borderColor: '#fff',
    backgroundColor: '#2369aa', flexDirection: 'row', alignItems: 'center', paddingLeft: 14, overflow: 'hidden' },
  heroCopy: { flex: 1, zIndex: 1 },
  eyebrow: { color: '#d7f3ff', fontFamily: 'Knockout', fontSize: 11 },
  heroTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 23, marginTop: 3,
    textShadowColor: '#073f70', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  heroText: { color: '#e3f7ff', fontSize: 11, marginTop: 3 },
  shark: { width: 100, height: 100, marginRight: -6 },
  scoreRail: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 14, backgroundColor: '#064977', borderWidth: 2, borderColor: '#fff',
    paddingHorizontal: 14, paddingVertical: 9, marginTop: 15 },
  scoreText: { color: '#fff', fontFamily: 'Knockout', fontSize: 15 },
  scoreVs: { color: '#ffda61', fontFamily: 'Shark', fontSize: 17 },
  questionCard: { width: '100%', borderRadius: 18, backgroundColor: '#e9f8ff', borderWidth: 3,
    borderColor: '#fff', padding: 14, marginTop: 16, shadowColor: '#073456', shadowOpacity: 0.2,
    shadowRadius: 7, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  questionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roundText: { color: '#18618b', fontFamily: 'Knockout', fontSize: 16 },
  timerText: { color: '#0867a2', fontFamily: 'Knockout', fontSize: 20 },
  timerUrgent: { color: '#d54431' },
  question: { color: '#073d66', fontFamily: 'Shark', fontSize: 20, lineHeight: 27, marginVertical: 13 },
  answer: { minHeight: 47, borderRadius: 11, backgroundColor: '#fff', borderWidth: 2,
    borderColor: '#b0d9e9', marginBottom: 8, justifyContent: 'center', paddingHorizontal: 12 },
  answerCorrect: { backgroundColor: '#c8f3ce', borderColor: '#4bb461' },
  answerWrong: { backgroundColor: '#ffe1dc', borderColor: '#e46e61' },
  answerPressed: { transform: [{ scale: 0.98 }] },
  answerText: { color: '#073d66', fontSize: 14, fontWeight: '700' },
  reveal: { paddingTop: 5 },
  revealText: { color: '#07507b', fontWeight: '800', fontSize: 12 },
  fact: { color: '#35657d', fontSize: 12, lineHeight: 17, marginTop: 5 },
  nextButton: { minHeight: 44, borderRadius: 11, backgroundColor: '#ffcf43', borderWidth: 2,
    borderColor: '#fff', justifyContent: 'center', alignItems: 'center', marginTop: 11 },
  nextText: { color: '#073d66', fontFamily: 'Knockout', fontSize: 17 },
  loading: { color: '#fff', fontWeight: '700', marginTop: 35 },
  footnote: { color: '#e8f9ff', fontSize: 11, marginTop: 13 },
});
