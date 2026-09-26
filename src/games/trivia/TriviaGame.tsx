/**
 * TriviaGame.tsx — Trivia+, the juice rebuild.
 *
 * One component, two data modes, one presentation. It consumes a TriviaSource
 * (task = server-validated, lineplay = bundled pool) and never branches on mode
 * in the play field — only the source knows truth.
 *
 * Feel:
 *   - Question card springs in on every new question.
 *   - Four AnswerTiles with press-down squash.
 *   - A CountdownRing per question: color shifts to urgent + ticking haptic in
 *     the last 3s.
 *   - Correct → tile flips gold, particle burst, comboHeavy haptic, the streak
 *     FIRE METER climbs the edge (fever at 5).
 *   - Wrong → correct tile pulses green, chosen tile shakes red, streak resets.
 *   - Optional 50/50 lifeline (fades two wrong tiles) — task mode only if the
 *     server supports it (LIFELINE_ENABLED); lineplay always (owns the key).
 *   - Score = Σ(base + streak bonus). Reports {score, maxCombo, seed} to the
 *     server-authoritative reward path via GameShellV2.
 *
 * The shell owns countdown/pause/results; this file owns the round loop.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import {
  GameShellV2,
  type GameResult,
  ParticleField,
  type ParticleHandle,
  Haptic,
  playSfx,
  GAME_COLORS,
  JUICE,
} from '../../gamekit';
import { AnswerTile, type TileState } from './AnswerTile';
import { CountdownRing } from './CountdownRing';
import { StreakMeter } from './StreakMeter';
import {
  BASE_POINTS,
  FEVER_STREAK,
  LIFELINE_ENABLED,
  REVEAL_MS,
  STAR_RATIOS,
  STREAK_BONUS,
  URGENCY_SECONDS,
} from './config';
import type { TriviaCard, TriviaMeta, TriviaSource } from './types';

const { width: SCREEN_W } = Dimensions.get('window');

interface TriviaGameProps {
  visible: boolean;
  /** The data seam. Build with createTaskTriviaSource / createLinePlayTriviaSource. */
  source: TriviaSource;
  title?: string;
  subtitle?: string;
  /** Deterministic seed carried into meta for replay/telemetry. */
  seed: number;
  personalBest?: number;
  /** Let queue guests read authored facts at their own pace between questions. */
  readableFacts?: boolean;
  /** Preserved external contract (matches MiniGameSelector). */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

type Phase = 'loading' | 'answering' | 'revealing' | 'done';

export function TriviaGame({
  visible,
  source,
  title = 'Trivia+',
  subtitle,
  seed,
  personalBest,
  readableFacts = false,
  onComplete,
  onClose,
  onQuit,
}: TriviaGameProps) {
  const [card, setCard] = useState<TriviaCard | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [tileStates, setTileStates] = useState<TileState[]>([]);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [fever, setFever] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [lifelineUsed, setLifelineUsed] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);

  // Refs for values read inside timers/callbacks without re-subscribing.
  const maxStreakRef = useRef(0);
  const correctCountRef = useRef(0);
  const answeredRef = useRef(0);
  const serverMultRef = useRef<number | undefined>(undefined);
  const gradingRef = useRef(false);
  const advancingRef = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);
  const secondsLeftRef = useRef(0);
  const timeoutRef = useRef<() => void>(() => {});
  const finishRoundRef = useRef<() => void>(() => {});

  // Countdown: shared fraction (UI thread) + mirrored seconds (JS, for label).
  const fraction = useSharedValue(1);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Question card entrance spring.
  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);

  const particlesRef = useRef<ParticleHandle>(null);

  const clearTimers = useCallback(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    if (tickTimer.current) {
      clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
  }, []);

  // -- Round lifecycle: reset when (re)opened. ------------------------------
  useEffect(() => {
    if (!visible) return;
    setScore(0);
    setStreak(0);
    setFever(false);
    setResult(null);
    setLifelineUsed(false);
    setQuestionIndex(0);
    setRemoved(new Set());
    maxStreakRef.current = 0;
    correctCountRef.current = 0;
    answeredRef.current = 0;
    serverMultRef.current = undefined;
    pausedRef.current = false;
    gradingRef.current = false;
    advancingRef.current = false;
    setPhase('loading');
    return () => {
      clearTimers();
      source.dispose();
    };
    // Intentionally only on (re)open; source identity is stable per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // -- Load the next question after the shell's countdown fires onStart. -----
  const loadNext = useCallback(async () => {
    setPhase('loading');
    let next: TriviaCard | null = null;
    try {
      next = await source.next();
    } catch {
      next = null;
    }
    if (!next) {
      finishRoundRef.current();
      return;
    }
    setCard(next);
    setTileStates(new Array(next.choices.length).fill('idle'));
    setRemoved(new Set());
    setLifelineUsed(false);
    setSecondsLeft(next.timeLimitSeconds);
    secondsLeftRef.current = next.timeLimitSeconds;
    fraction.value = 1;
    // Card entrance spring.
    cardScale.value = 0.9;
    cardOpacity.value = 0;
    cardScale.value = withSpring(1, JUICE.popSpring);
    cardOpacity.value = withTiming(1, { duration: 200 });
    setPhase('answering');
    startCountdown(next.timeLimitSeconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // -- Per-question countdown: drains the ring, ticks in the last 3s. --------
  const startCountdown = useCallback(
    (totalSeconds: number) => {
      if (tickTimer.current) clearInterval(tickTimer.current);
      const total = totalSeconds;
      const startedAt = Date.now();
      let lastWhole = Math.ceil(total);
      // Drain the ring smoothly to 0 over the full duration on the UI thread.
      fraction.value = withTiming(0, {
        duration: total * 1000,
        easing: Easing.linear,
      });
      tickTimer.current = setInterval(() => {
        if (pausedRef.current) {
          // Freeze: push the start forward so elapsed doesn't accrue.
          return;
        }
        const elapsed = (Date.now() - startedAt) / 1000;
        const left = Math.max(0, total - elapsed);
        secondsLeftRef.current = left;
        setSecondsLeft(left);
        const whole = Math.ceil(left);
        if (whole !== lastWhole) {
          lastWhole = whole;
          if (whole <= URGENCY_SECONDS && whole > 0) {
            Haptic.warning();
            playSfx('tick');
          }
        }
        if (left <= 0) {
          if (tickTimer.current) clearInterval(tickTimer.current);
          tickTimer.current = null;
          timeoutRef.current();
        }
      }, 100);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // -- Answering. ------------------------------------------------------------
  const onAnswer = useCallback(
    async (index: number) => {
      if (phase !== 'answering' || gradingRef.current) return;
      if (removed.has(index)) return;
      gradingRef.current = true;
      if (tickTimer.current) {
        clearInterval(tickTimer.current);
        tickTimer.current = null;
      }
      cancelAnimation(fraction);
      Haptic.tapLight();
      playSfx('tap');
      setPhase('revealing');
      answeredRef.current += 1;

      let grade: { correct: boolean; correctIndex: number };
      try {
        grade = await source.grade(index);
      } catch {
        // Network failure in task mode → treat as a no-score reveal, don't crash.
        grade = { correct: false, correctIndex: -1 };
      }
      // Pull the server multiplier if this source surfaced one.
      const maybeMult = (source as TriviaSource & { serverMultiplier?: number })
        .serverMultiplier;
      if (typeof maybeMult === 'number') serverMultRef.current = maybeMult;

      applyReveal(index, grade.correct, grade.correctIndex);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, removed, source],
  );

  const advanceFromReveal = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    setQuestionIndex((q) => q + 1);
    gradingRef.current = false;
    loadNext();
  }, [loadNext]);

  const applyReveal = useCallback(
    (chosen: number, correct: boolean, correctIndex: number) => {
      advancingRef.current = false;
      const n = card?.choices.length ?? 0;
      const states: TileState[] = new Array(n).fill('dimmed');
      if (correct) {
        states[chosen] = 'reveal-correct';
        // Score: base + streak bonus (bonus scales with the streak reached).
        const newStreak = streak + 1;
        const bonus = newStreak * STREAK_BONUS;
        setStreak(newStreak);
        maxStreakRef.current = Math.max(maxStreakRef.current, newStreak);
        correctCountRef.current += 1;
        setScore((s) => s + BASE_POINTS + bonus);
        const nowFever = newStreak >= FEVER_STREAK;
        if (nowFever && !fever) {
          setFever(true);
          Haptic.comboHeavy();
          playSfx('combo');
        }
        Haptic.comboHeavy();
        playSfx('hit');
        // Burst from the flipped tile's approximate center.
        particlesRef.current?.burst({
          x: SCREEN_W * 0.5,
          y: 300 + chosen * 72,
          preset: 'burst',
          count: nowFever ? 28 : 18,
          colors: nowFever
            ? [GAME_COLORS.coral, GAME_COLORS.gold, '#ffffff']
            : [GAME_COLORS.gold, GAME_COLORS.blue, '#ffffff'],
        });
      } else {
        if (correctIndex >= 0 && correctIndex < n) states[correctIndex] = 'reveal-green';
        if (chosen >= 0 && chosen < n) states[chosen] = 'chosen-wrong';
        setStreak(0);
        setFever(false);
        Haptic.failBuzz();
        playSfx('fail');
      }
      // Keep removed tiles visually gone.
      removed.forEach((i) => {
        if (states[i] !== 'reveal-green') states[i] = 'removed';
      });
      setTileStates(states);

      // Let queue guests read and share authored clues; the short automatic
      // reveal remains for task trivia and questions without a fact.
      if (!readableFacts || !card?.fact)
        advanceTimer.current = setTimeout(advanceFromReveal, REVEAL_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card, streak, fever, removed, advanceFromReveal, readableFacts],
  );

  const handleTimeout = useCallback(() => {
    if (phase !== 'answering' || gradingRef.current) return;
    gradingRef.current = true;
    setPhase('revealing');
    answeredRef.current += 1;
    // A timeout is a miss. Reveal the correct answer (via grade with -1 = none
    // chosen). In task mode we still post so the server records the miss.
    (async () => {
      let grade: { correct: boolean; correctIndex: number };
      try {
        grade = await source.grade(-1);
      } catch {
        grade = { correct: false, correctIndex: -1 };
      }
      applyReveal(-1, false, grade.correctIndex);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, source, applyReveal]);
  timeoutRef.current = handleTimeout;

  // -- 50/50 lifeline. -------------------------------------------------------
  const lifelineAvailable = useMemo(() => {
    if (source.mode === 'lineplay') return true; // owns the key
    return LIFELINE_ENABLED; // task mode: only if a server lifeline exists
  }, [source.mode]);

  const onLifeline = useCallback(async () => {
    if (!lifelineAvailable || lifelineUsed || phase !== 'answering') return;
    setLifelineUsed(true);
    Haptic.hitMedium();
    playSfx('whoosh');
    try {
      const res = await source.fiftyFifty();
      if (res.removed.length === 0) return;
      const set = new Set(res.removed);
      setRemoved(set);
      setTileStates((prev) =>
        prev.map((s, i) => (set.has(i) ? 'removed' : s)),
      );
    } catch {
      // Non-fatal — lifeline just doesn't apply.
    }
  }, [lifelineAvailable, lifelineUsed, phase, source]);

  // -- Round completion. -----------------------------------------------------
  const finishRound = useCallback(() => {
    clearTimers();
    setPhase('done');
    const answered = answeredRef.current;
    const correct = correctCountRef.current;
    const ratio = answered > 0 ? correct / answered : 0;
    const stars =
      correct === 0 ? 0 : ratio >= STAR_RATIOS.three ? 3 : ratio >= STAR_RATIOS.two ? 2 : 1;
    const meta: TriviaMeta = {
      mode: source.mode,
      score,
      correctCount: correct,
      totalAnswered: answered,
      maxCombo: maxStreakRef.current,
      seed,
      serverMultiplier: serverMultRef.current,
    };
    setResult({
      score,
      stars,
      maxCombo: maxStreakRef.current,
      message:
        stars === 3 ? 'GENIUS!' : stars === 2 ? 'SHARP!' : stars === 1 ? 'NICE!' : 'TRY AGAIN',
      meta,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, seed, source, clearTimers]);
  finishRoundRef.current = finishRound;

  // -- Shell hooks. ----------------------------------------------------------
  const onStart = useCallback(() => {
    loadNext();
  }, [loadNext]);

  const onPause = useCallback(() => {
    pausedRef.current = true;
    cancelAnimation(fraction);
  }, [fraction]);

  const onResume = useCallback(() => {
    pausedRef.current = false;
    // Re-drain from where we froze so the ring stays in sync.
    if (phase === 'answering') {
      const left = secondsLeftRef.current;
      const totalSecs = card?.timeLimitSeconds ?? left;
      fraction.value = totalSecs > 0 ? left / totalSecs : 0;
      startCountdown(left);
    }
  }, [phase, card, fraction, startCountdown]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: (1 - cardScale.value) * 18 }],
  }));

  const currentStreakMult = 1 + Math.min(streak, FEVER_STREAK);

  return (
    <GameShellV2
      visible={visible}
      title={title}
      subtitle={subtitle}
      score={score}
      multiplier={currentStreakMult}
      fever={fever}
      personalBest={personalBest}
      objective="Answer fast. Build a streak. Ride the fever."
      result={result}
      onStart={onStart}
      onPause={onPause}
      onResume={onResume}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    >
      <View style={styles.field}>
        <Image
          source={require('../../../assets/images/screens/lineplay/whack-underwater-playfield-v1.png')}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          pointerEvents="none"
        />
        <View pointerEvents="none" style={styles.oceanTint} />
        {/* Top row: progress + countdown ring. */}
        <View style={styles.topRow}>
          <Text style={styles.progress}>
            {source.totalQuestions > 0
              ? `Q${Math.min(questionIndex + 1, source.totalQuestions)} / ${source.totalQuestions}`
              : `Q${questionIndex + 1}`}
          </Text>
          {card && phase === 'answering' ? (
            <CountdownRing
              fraction={fraction}
              secondsLeft={secondsLeft}
              totalSeconds={card.timeLimitSeconds}
            />
          ) : (
            <View style={{ width: 74, height: 74 }} />
          )}
        </View>

        {/* Question card. */}
        {card ? (
          <Animated.View style={[styles.card, cardStyle]}>
            {readableFacts && phase === 'revealing' && card.fact ? (
              <>
                <Text style={styles.difficulty}>SHARK FACT</Text>
                <Text style={styles.question}>{card.fact}</Text>
                {card.source ? <Text style={styles.factSource}>Source: {card.source}</Text> : null}
              </>
            ) : (
              <>
                <Text style={styles.difficulty}>{card.difficulty.toUpperCase()}</Text>
                <Text style={styles.question}>{card.question}</Text>
              </>
            )}
          </Animated.View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.question}>Loading…</Text>
          </View>
        )}

        {/* Answer tiles. */}
        <View style={styles.tiles}>
          {card?.choices.map((choice, i) => (
            <AnswerTile
              key={`${card.id}-${i}`}
              label={choice}
              index={i}
              state={tileStates[i] ?? 'idle'}
              disabled={phase !== 'answering'}
              onPress={onAnswer}
            />
          ))}
        </View>

        {readableFacts && phase === 'revealing' && card?.fact ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={questionIndex + 1 >= source.totalQuestions ? 'See trivia results' : 'Next trivia question'}
            style={styles.continueButton}
            onPress={advanceFromReveal}
          >
            <Text style={styles.continueText}>
              {questionIndex + 1 >= source.totalQuestions ? 'SEE RESULTS' : 'NEXT QUESTION'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* 50/50 lifeline. Rendered when the mode allows it; disabled once used. */}
        {lifelineAvailable && phase === 'answering' ? (
          <TouchableOpacity
            style={[styles.lifeline, (lifelineUsed || phase !== 'answering') && styles.lifelineOff]}
            onPress={onLifeline}
            disabled={lifelineUsed || phase !== 'answering'}
          >
            <Text style={styles.lifelineTxt}>50 / 50</Text>
          </TouchableOpacity>
        ) : null}

        {/* Two-question ride sprints cannot reach fever, so keep answers clear. */}
        {source.totalQuestions >= FEVER_STREAK ? <StreakMeter streak={streak} fever={fever} /> : null}

        {/* Success particles above the field, non-interactive. */}
        <ParticleField
          ref={particlesRef}
          width={SCREEN_W}
          height={600}
          style={styles.particles}
          pointerEvents="none"
        />
      </View>
    </GameShellV2>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, paddingHorizontal: 18, paddingTop: 10, overflow: 'hidden' },
  oceanTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 84, 157, 0.56)' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progress: { color: '#fff', fontFamily: 'Shark', fontSize: 18,
    textShadowColor: '#003b70', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 2 },
  card: {
    backgroundColor: '#fff9e8',
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: '#ffcc3d',
    shadowColor: '#003b70', shadowOpacity: 0.22, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  difficulty: {
    color: '#0879ca',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  question: { color: '#063f73', fontSize: 20, fontWeight: '800', lineHeight: 26 },
  factSource: { color: '#2b698d', fontSize: 11, fontWeight: '700', marginTop: 9 },
  tiles: { marginTop: 2 },
  continueButton: {
    alignSelf: 'center', marginTop: 13, paddingHorizontal: 24, paddingVertical: 11,
    backgroundColor: '#ffcc3d', borderColor: '#9d6605', borderWidth: 2,
    borderRadius: 16,
  },
  continueText: { color: '#173e67', fontSize: 15, fontWeight: '900', letterSpacing: 0.7 },
  lifeline: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#fff9e8',
    borderWidth: 2,
    borderColor: '#ffcc3d',
  },
  lifelineOff: { opacity: 0.35, borderColor: 'rgba(255,255,255,0.12)' },
  lifelineTxt: { color: '#07548d', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  particles: { ...StyleSheet.absoluteFillObject },
});
