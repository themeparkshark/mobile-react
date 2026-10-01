/**
 * GameShellV2.tsx: the shared shell every TPS mini-game renders inside.
 *
 * Responsibilities (games stay thin and just render their play field):
 *   - Consistent header (title, subtitle, live score, pause/close art icons).
 *   - 3-2-1-GO countdown (tap to skip).
 *   - QUEUE REALITY ("The line will always be moving"):
 *       * movement NEVER pauses a game (movementPolicy is play-through only);
 *         a gentle heads-up chip + edge glow shows when the line advances a
 *         lot, with a -3 dB music trim, never a pause, sound or buzz;
 *       * interruptions are free and instant: backgrounding, pocketing, a
 *         locked screen or the pause button HOLD the game, snapshot its exact
 *         state (getSnapshot + sessionKey), and resume with a quick 3-2-1
 *         (about 1.1s, automatic when the app comes back);
 *       * only a real queue event ends a run: LinePlay's `queueEnded`
 *         (boarding / left the queue) or ref.wrapUp() shows "YOUR RIDE'S UP!",
 *         saves the result and hands it on.
 *   - Results: the studio ResultsCard (stars with drama, count-up, NEW BEST,
 *     next-star goal, stat chips) plus Continue / Play again / Challenge.
 *   - Preserves the EXACT external completion contract used by
 *     MiniGameSelector: onComplete(multiplier: number, meta?) where multiplier
 *     is derived from stars (1 star = 1x, 2 = 1.5x, 3 = 2x by default).
 */

import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Modal,
  AppState,
  BackHandler,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { GAME_COLORS, COUNTDOWN, JUICE } from './theme';
import { ScoreDisplay } from './ScoreDisplay';
import { ParticleField, type ParticleHandle } from './Particles';
import { Haptic } from './Haptics';
import { playSfx } from './SFX';
import { LinePlayMovementContext } from './LinePlayMovementContext';
import { RideChallengeContext } from './RideChallengeContext';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import GameIcon from '../ui/GameIcon';
import { ResultsCard, type ResultStat } from './results/ResultsCard';
import { starsFor, type StarThresholds } from './core/scoring';
import {
  WRAP_UP_COPY,
  createHeadsUp,
  makeSnapshot,
  reportAdvance,
  type HoldReason,
  type MovementPolicy,
  type WrapUpReason,
} from './core/session';
import { clearSnapshot, saveSnapshot } from './session/snapshotStore';
import { GameAudio } from './audio/GameAudio';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export type ShellPhase = 'countdown' | 'playing' | 'paused' | 'resuming' | 'results';

/** Result a game hands to the shell when the round ends. */
export interface GameResult {
  /** Final score. */
  score: number;
  /** 0-3 stars. 0 = failed. */
  stars: number;
  /** Optional headline, e.g. "INCREDIBLE!". Shell supplies a default. */
  message?: string;
  /** Best combo reached (surfaced on the results screen). */
  maxCombo?: number;
  /** Star thresholds: enables the NEXT STAR goal bar. */
  thresholds?: StarThresholds;
  /** Extra stat chips (accuracy, time, pearls...). */
  stats?: ResultStat[];
  /** Ghost / rival / crew mate to compare against (near-miss line on the card). */
  rival?: { name: string; score: number } | null;
  /**
   * Extra metadata forwarded verbatim as the 2nd arg of onComplete. This is
   * what carries {score, duration, seed, proof} to the server-authoritative
   * reward path. Never compute rewards on the client.
   */
  meta?: Record<string, unknown>;
}

export interface GameShellV2Handle {
  /** Hold the game (manual pause). Movement never calls this. */
  requestPause: (reason?: string) => void;
  /** Resume from a hold (quick 3-2-1 unless resumeStyle='instant'). */
  resume: () => void;
  /** A real queue event ended the run: save and show results. */
  wrapUp: (reason?: WrapUpReason) => void;
  /** Current phase (read on demand). */
  getPhase: () => ShellPhase;
}

/** Snapshot payload a game hands the shell when it is held. */
export interface ShellSnapshotData {
  score: number;
  simMs?: number;
  steps?: number;
  state: unknown;
}

interface GameShellV2Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Live score shown in the header. */
  score: number;
  multiplier?: number;
  fever?: boolean;
  /** Personal best for the header delta flash and the results card. */
  personalBest?: number;
  /** Short objective line shown under the countdown. */
  objective?: string;
  /** Ride-challenge goal ("10 SHARKS"). */
  goal?: { current: number; target: number; label: string };
  /** Set when the round is over: shell transitions to results. */
  result?: GameResult | null;
  /** Stars to multiplier map. Defaults to {1:1, 2:1.5, 3:2}. */
  starMultipliers?: Record<number, number>;
  /** Star thresholds (used for wrap-up stars and the next-star bar). */
  thresholds?: StarThresholds;
  /** Fired when the countdown finishes and play should begin. */
  onStart: () => void;
  /** Fired when the shell holds / resumes (games freeze their loop). */
  onPause?: (reason?: string) => void;
  onResume?: () => void;
  /** Preserved external contract: matches MiniGameSelector's expectation. */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  /** Player closed / quit without a win. */
  onClose: () => void;
  /** Optional deliberate-exit flow. Failed results still use onClose. */
  onQuit?: (resume: () => void) => void;
  /** Queue games: offer PLAY AGAIN on the results card. */
  onRematch?: () => void;
  /** Offer CHALLENGE (ghost / score challenge to a friend or crew). */
  onChallenge?: () => void;
  /** Label for the CHALLENGE button (default 'Challenge'). */
  challengeLabel?: string;
  /** Optional game content under the results card (missions, unlock card). */
  resultsExtra?: React.ReactNode;
  /**
   * Movement never pauses (QUEUE REALITY). 'pause' is accepted for older
   * call sites and treated as play-through.
   */
  movementPolicy?: MovementPolicy;
  /** @deprecated movement never pauses; kept so older call sites compile. */
  pauseOnLineMove?: boolean;
  /** 'countdown' = quick 3-2-1 after a hold (default); 'instant' = none. */
  resumeStyle?: 'countdown' | 'instant';
  /** Game id for snapshots and proof meta, e.g. 'whack'. */
  gameId?: string;
  /** Session key (game + ride + attempt) for interruption snapshots. */
  sessionKey?: string;
  /** Called on every hold: return the exact state to persist. */
  getSnapshot?: () => ShellSnapshotData | null;
  /** Called when a queue event ends the run: return the final result. */
  onWrapUp?: (reason: WrapUpReason) => GameResult | null;
  children: React.ReactNode;
}

const DEFAULT_STAR_MULT: Record<number, number> = { 0: 0, 1: 1, 2: 1.5, 3: 2 };
const RESUME_STEP_MS = 300;
const RESUME_GO_MS = 220;
const HEADS_UP_MS = 2600;

export const GameShellV2 = forwardRef<GameShellV2Handle, GameShellV2Props>(
  function GameShellV2(
    {
      visible,
      title,
      subtitle,
      score,
      multiplier = 1,
      fever = false,
      personalBest,
      objective,
      goal,
      result,
      starMultipliers = DEFAULT_STAR_MULT,
      thresholds,
      onStart,
      onPause,
      onResume,
      onComplete,
      onClose,
      onQuit,
      onRematch,
      onChallenge,
      challengeLabel = 'Challenge',
      resultsExtra,
      resumeStyle = 'countdown',
      gameId,
      sessionKey,
      getSnapshot,
      onWrapUp,
      children,
    },
    ref,
  ) {
    const [phase, setPhase] = useState<ShellPhase>('countdown');
    const linePlayMovement = useContext(LinePlayMovementContext);
    const rideChallenge = useContext(RideChallengeContext);
    const reducedMotion = useReducedGameMotion();
    const reducedMotionRef = useRef(reducedMotion);
    reducedMotionRef.current = reducedMotion;
    const [countText, setCountText] = useState('3');
    const [pauseReason, setPauseReason] = useState<string | undefined>();
    const [holdReason, setHoldReason] = useState<HoldReason | null>(null);
    const [wrap, setWrap] = useState<{ reason: WrapUpReason; result: GameResult } | null>(null);
    const [headsUp, setHeadsUp] = useState(false);
    const confettiRef = useRef<ParticleHandle>(null);
    const startedRef = useRef(false);
    const claimedRef = useRef(false);
    const countdownTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const celebrationTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const resumeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const headsUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const headsUpState = useRef(createHeadsUp());
    const scoreRef = useRef(score);
    scoreRef.current = score;

    const effectiveResult = result ?? wrap?.result ?? null;

    // Results animation values.
    const resultsScale = useSharedValue(0.7);
    const resultsOpacity = useSharedValue(0);
    const countScale = useSharedValue(1);
    const glow = useSharedValue(0);

    const clearCountdown = useCallback(() => {
      countdownTimers.current.forEach(clearTimeout);
      countdownTimers.current = [];
    }, []);
    const clearCelebration = useCallback(() => {
      celebrationTimers.current.forEach(clearTimeout);
      celebrationTimers.current = [];
    }, []);
    const clearResume = useCallback(() => {
      resumeTimers.current.forEach(clearTimeout);
      resumeTimers.current = [];
    }, []);
    const clearHeadsUp = useCallback(() => {
      if (headsUpTimer.current) clearTimeout(headsUpTimer.current);
      headsUpTimer.current = null;
    }, []);

    // -- Reset when (re)opened. ---------------------------------------------
    useEffect(() => {
      if (!visible) return;
      startedRef.current = false;
      claimedRef.current = false;
      setPhase('countdown');
      setCountText('3');
      setWrap(null);
      setHoldReason(null);
      resultsScale.value = 0.7;
      resultsOpacity.value = 0;
      return () => {
        clearCountdown();
        clearCelebration();
        clearResume();
        clearHeadsUp();
        [resultsScale, resultsOpacity, countScale, glow].forEach(cancelAnimation);
      };
    }, [visible, clearCountdown, clearCelebration, clearResume, clearHeadsUp, resultsScale, resultsOpacity, countScale, glow]);

    useEffect(() => {
      if (!reducedMotion) return;
      [resultsScale, resultsOpacity, countScale].forEach(cancelAnimation);
      countScale.value = 1;
      if (phase === 'results') {
        resultsScale.value = 1;
        resultsOpacity.value = 1;
      }
      clearCelebration();
    }, [reducedMotion, phase, clearCelebration, resultsScale, resultsOpacity, countScale]);

    // -- Run the 3-2-1-GO countdown. ----------------------------------------
    const beginPlay = useCallback(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      setPhase('playing');
      onStart();
    }, [onStart]);

    const punchCount = useCallback(() => {
      if (reducedMotionRef.current) { countScale.value = 1; return; }
      countScale.value = withSequence(
        withTiming(1.25, { duration: 100 }),
        withSpring(1, JUICE.popSpring),
      );
    }, [countScale]);

    useEffect(() => {
      if (phase !== 'countdown' || !visible) return;
      clearCountdown();
      const steps = ['3', '2', '1', 'GO!'];
      steps.forEach((label, i) => {
        const t = setTimeout(() => {
          setCountText(label);
          punchCount();
          Haptic.tickSelection();
          playSfx(label === 'GO!' ? 'go' : 'countdown');
        }, i * COUNTDOWN.stepMs);
        countdownTimers.current.push(t);
      });
      const done = setTimeout(() => {
        beginPlay();
      }, steps.length * COUNTDOWN.stepMs - (COUNTDOWN.stepMs - COUNTDOWN.goMs));
      countdownTimers.current.push(done);
      return clearCountdown;
    }, [phase, visible, beginPlay, clearCountdown, punchCount]);

    // -- Transition to results when the game (or a wrap-up) reports one. ----
    useEffect(() => {
      if (!visible || !effectiveResult) return;
      if (phase === 'results') return;
      clearCountdown();
      clearResume();
      setPhase('results');
      setHeadsUp(false);
      if (sessionKey) void clearSnapshot(sessionKey);
      Haptic[effectiveResult.stars > 0 ? 'success' : 'failBuzz']();
      playSfx(effectiveResult.stars > 0 ? 'win' : 'lose');
      clearCelebration();
      resultsOpacity.value = reducedMotionRef.current ? 1 : withTiming(1, { duration: 220 });
      resultsScale.value = reducedMotionRef.current ? 1 : withSpring(1, JUICE.settleSpring);
      if (effectiveResult.stars > 0 && !reducedMotionRef.current) {
        // Confetti bursts timed to the star stamps.
        celebrationTimers.current.push(setTimeout(() => {
          confettiRef.current?.burst({ x: SCREEN_W * 0.5, y: SCREEN_H * 0.32, preset: 'confetti', count: 40 });
        }, 420));
        celebrationTimers.current.push(setTimeout(() => {
          confettiRef.current?.burst({ x: SCREEN_W * 0.3, y: SCREEN_H * 0.28, preset: 'confetti', count: 24 });
          confettiRef.current?.burst({ x: SCREEN_W * 0.7, y: SCREEN_H * 0.28, preset: 'confetti', count: 24 });
        }, 900));
      }
    }, [visible, effectiveResult, phase, sessionKey, clearCountdown, clearResume, clearCelebration, resultsOpacity, resultsScale]);

    // Ride challenge win: a short stamp, then straight into the coin reveal.
    useEffect(() => {
      if (!rideChallenge || phase !== 'results' || !effectiveResult || effectiveResult.stars <= 0) return;
      const t = setTimeout(() => handleClaimRef.current?.(), 1600);
      return () => clearTimeout(t);
    }, [rideChallenge, phase, effectiveResult]);

    // -- Hold / resume (interruptions only; never movement). ------------------
    const persist = useCallback((reason: HoldReason) => {
      if (!sessionKey || !getSnapshot) return;
      try {
        const data = getSnapshot();
        if (!data) return;
        void saveSnapshot(makeSnapshot(gameId ?? title, sessionKey, reason, Date.now(), {
          score: data.score, simMs: data.simMs ?? 0, steps: data.steps ?? 0, state: data.state,
        }));
      } catch {
        // A snapshot failure must never break the hold itself.
      }
    }, [sessionKey, getSnapshot, gameId, title]);

    const doHold = useCallback(
      (reason: HoldReason, label?: string) => {
        if (phase !== 'playing' && phase !== 'countdown' && phase !== 'resuming') return;
        if (phase === 'countdown') clearCountdown();
        if (phase === 'resuming') clearResume();
        setPhase('paused');
        setPauseReason(label);
        setHoldReason(reason);
        if (phase === 'playing') {
          onPause?.(label ?? reason);
          persist(reason);
          void GameAudio.music.pause(300);
        }
        Haptic.tickSelection();
      },
      [onPause, phase, clearCountdown, clearResume, persist],
    );

    const finishResume = useCallback(() => {
      clearResume();
      setPhase('playing');
      setPauseReason(undefined);
      setHoldReason(null);
      linePlayMovement?.onResume();
      onResume?.();
      void GameAudio.music.resume(200);
    }, [clearResume, linePlayMovement, onResume]);

    const doResume = useCallback(() => {
      if (phase !== 'paused') return;
      if (!startedRef.current) {
        setPhase('countdown');
        setCountText('3');
        setPauseReason(undefined);
        setHoldReason(null);
        Haptic.tickSelection();
        return;
      }
      if (resumeStyle === 'instant') {
        finishResume();
        return;
      }
      // Quick 3-2-1: about 1.1s, one tick per beat, GO on the downbeat.
      clearResume();
      setPhase('resuming');
      const labels = ['3', '2', '1', 'GO!'];
      labels.forEach((label, i) => {
        resumeTimers.current.push(setTimeout(() => {
          setCountText(label);
          punchCount();
          Haptic.tickSelection();
          playSfx(label === 'GO!' ? 'go' : 'countdown');
        }, i * RESUME_STEP_MS));
      });
      resumeTimers.current.push(setTimeout(finishResume, RESUME_STEP_MS * 3 + RESUME_GO_MS));
    }, [phase, resumeStyle, clearResume, finishResume, punchCount]);

    // Movement: never pause. Acknowledge the episode so LinePlay's own session
    // keeps running, and show a gentle heads-up when the line advances a lot.
    const movingRef = useRef(false);
    const advanceRef = useRef(0);
    const lastAdvanceAt = linePlayMovement?.lastAdvance?.at ?? 0;
    const lastAdvanceMetres = linePlayMovement?.lastAdvance?.metres ?? 2;
    const moving = !!linePlayMovement?.moving;
    useEffect(() => {
      if (!visible) return;
      const started = moving && !movingRef.current;
      const advanced = lastAdvanceAt !== advanceRef.current && lastAdvanceAt > 0;
      movingRef.current = moving;
      advanceRef.current = lastAdvanceAt;
      if (!started && !advanced) return;
      if (started && (phase === 'playing' || phase === 'countdown' || phase === 'resuming')) linePlayMovement?.onResume();
      if (phase !== 'playing') return;
      if (reportAdvance(headsUpState.current, Date.now(), advanced ? lastAdvanceMetres : 2)) {
        setHeadsUp(true);
        clearHeadsUp();
        headsUpTimer.current = setTimeout(() => setHeadsUp(false), HEADS_UP_MS);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, moving, lastAdvanceAt]);

    useEffect(() => {
      if (!visible || phase !== 'playing') return;
      GameAudio.music.setTrimDb(moving ? -3 : 0, 300);
    }, [visible, phase, moving]);

    useEffect(() => {
      if (reducedMotionRef.current) {
        glow.value = headsUp ? 1 : 0;
        return;
      }
      glow.value = withTiming(headsUp ? 1 : 0, { duration: headsUp ? 200 : 400, easing: Easing.out(Easing.quad) });
    }, [headsUp, glow]);

    // Backgrounded / locked / pocketed: hold + snapshot. Back: quick 3-2-1.
    const holdRef = useRef<HoldReason | null>(null);
    holdRef.current = holdReason;
    const doHoldRef = useRef(doHold);
    doHoldRef.current = doHold;
    const doResumeRef = useRef(doResume);
    doResumeRef.current = doResume;
    useEffect(() => {
      if (!visible) return;
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'background' || state === 'inactive') doHoldRef.current('background', 'Paused while away');
        else if (state === 'active' && holdRef.current === 'background') doResumeRef.current();
      });
      return () => subscription.remove();
    }, [visible]);

    // A real queue event (boarding / left the queue) ends the run.
    const wrapUp = useCallback((reason: WrapUpReason = 'boarding') => {
      if (phase === 'results' || wrap) return;
      clearCountdown();
      clearResume();
      if (phase === 'playing') onPause?.('wrapUp');
      const fromGame = onWrapUp?.(reason) ?? null;
      const finalScore = fromGame?.score ?? scoreRef.current;
      const base: GameResult = fromGame ?? {
        score: finalScore,
        stars: thresholds ? starsFor(finalScore, thresholds) : 0,
        thresholds,
      };
      setWrap({
        reason,
        result: { ...base, message: base.message ?? WRAP_UP_COPY[reason].title, meta: { ...(base.meta ?? {}), wrapUp: reason } },
      });
    }, [phase, wrap, clearCountdown, clearResume, onPause, onWrapUp, thresholds]);

    const queueEnded = linePlayMovement?.queueEnded ?? null;
    useEffect(() => {
      if (visible && queueEnded) wrapUp(queueEnded);
    }, [visible, queueEnded, wrapUp]);

    useImperativeHandle(
      ref,
      (): GameShellV2Handle => ({
        requestPause: (reason) => doHold('manual', reason),
        resume: doResume,
        wrapUp,
        getPhase: () => phase,
      }),
      [doHold, doResume, wrapUp, phase],
    );

    // -- Completion: stars -> multiplier -> external contract. ----------------
    const handleClaim = useCallback(() => {
      if (claimedRef.current || !effectiveResult) return;
      claimedRef.current = true;
      const stars = effectiveResult?.stars ?? 0;
      const mult = starMultipliers[stars] ?? DEFAULT_STAR_MULT[stars] ?? 0;
      if (stars > 0) {
        onComplete(mult, effectiveResult?.meta);
      } else {
        onClose();
      }
    }, [effectiveResult, starMultipliers, onComplete, onClose]);

    const handleClaimRef = useRef(handleClaim);
    handleClaimRef.current = handleClaim;

    const resumeAfterQuitCancel = useCallback(() => {
      setPhase(startedRef.current ? 'playing' : 'countdown');
      if (!startedRef.current) setCountText('3');
      setPauseReason(undefined);
      setHoldReason(null);
      if (startedRef.current) onResume?.();
    }, [onResume]);

    const requestQuit = useCallback(() => {
      if (onQuit) onQuit(resumeAfterQuitCancel);
      else onClose();
    }, [onQuit, onClose, resumeAfterQuitCancel]);

    const handleExit = useCallback(() => {
      if (phase === 'playing' || phase === 'resuming') doHold('manual');
      else if (phase === 'results') handleClaim();
      else {
        if (phase === 'countdown') doHold('manual');
        requestQuit();
      }
    }, [phase, doHold, handleClaim, requestQuit]);

    const skipCountdown = useCallback(() => {
      if (phase === 'countdown') {
        clearCountdown();
        beginPlay();
      }
    }, [phase, clearCountdown, beginPlay]);

    // Paid games share the ride flow's native presentation. Opening another
    // native Modal inside it races both dismissals against the coin reward.
    useEffect(() => {
      if (!visible || !rideChallenge) return;
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        handleExit();
        return true;
      });
      return () => back.remove();
    }, [visible, rideChallenge, handleExit]);

    const resultsStyle = useAnimatedStyle(() => ({
      opacity: resultsOpacity.value,
      transform: [{ scale: resultsScale.value }],
    }));
    const countStyle = useAnimatedStyle(() => ({
      transform: [{ scale: countScale.value }],
    }));
    const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.35 }));

    const stars = effectiveResult?.stars ?? 0;
    const won = stars > 0;

    if (!visible) return null;

    const gameContent = (
        <View style={styles.root}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={handleExit}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={phase === 'playing' ? 'Pause' : 'Close'}
            >
              <GameIcon name={phase === 'playing' ? 'pause' : 'close'} size={26} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <View style={styles.headerScore}>
              <ScoreDisplay
                score={score}
                multiplier={multiplier}
                fever={fever}
                personalBest={personalBest}
                compact
                reducedMotion={reducedMotion}
              />
            </View>
          </View>

          {goal ? <GoalMeter {...goal} reducedMotion={reducedMotion} /> : null}

          {/* Play field */}
          <View style={styles.field}>{children}</View>

          {/* Heads-up: the line advanced a lot. Never pauses, never buzzes. */}
          <Animated.View pointerEvents="none" style={[styles.edgeGlow, glowStyle]} />
          {headsUp && phase === 'playing' ? (
            <View pointerEvents="none" style={styles.headsUp} accessibilityLiveRegion="polite">
              <GameIcon name="queue" size={20} />
              <Text style={styles.headsUpText}>Heads up, the line moved</Text>
            </View>
          ) : null}

          {/* Countdown overlay */}
          {phase === 'countdown' ? (
            <Pressable style={styles.overlay} onPress={skipCountdown}>
              {goal ? <Text style={styles.goalHeadline}>{`${goal.target} ${goal.label}`}</Text> : null}
              <Animated.Text style={[styles.count, countStyle]}>{countText}</Animated.Text>
              {objective ? <Text style={styles.objective}>{objective}</Text> : null}
              <Text style={styles.skipHint}>tap to skip</Text>
            </Pressable>
          ) : null}

          {/* Quick resume 3-2-1 (tap to hold again) */}
          {phase === 'resuming' ? (
            <View style={styles.overlayLight}>
              <Animated.Text style={[styles.count, countStyle]}>{countText}</Animated.Text>
              <Text style={styles.objective}>Back in!</Text>
            </View>
          ) : null}

          {/* Hold sheet */}
          {phase === 'paused' ? (
            <View style={styles.overlay}>
              <View style={styles.sheet}>
                <Text style={styles.sheetTitle}>{pauseReason ?? 'Paused'}</Text>
                <Text style={styles.sheetBody}>Your run is saved right where you left it.</Text>
                <TouchableOpacity style={[styles.sheetBtn, styles.primaryBtn]} onPress={doResume}>
                  <Text style={styles.primaryBtnTxt}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetBtn} onPress={requestQuit}>
                  <Text style={styles.secondaryBtnTxt}>Quit</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Results */}
          {phase === 'results' ? (
            <View style={styles.overlay} pointerEvents="box-none">
              <Animated.View style={[{ width: '86%' }, resultsStyle]}>
                <ResultsCard
                  score={effectiveResult?.score ?? score}
                  stars={stars}
                  message={effectiveResult?.message}
                  thresholds={effectiveResult?.thresholds ?? thresholds}
                  personalBest={personalBest}
                  maxCombo={effectiveResult?.maxCombo}
                  stats={effectiveResult?.stats}
                  rival={effectiveResult?.rival}
                  note={wrap ? WRAP_UP_COPY[wrap.reason].body : undefined}
                  reducedMotion={reducedMotion}
                />
                {resultsExtra}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.sheetBtn, styles.primaryBtn, styles.claimBtn]}
                    onPress={handleClaim}
                  >
                    <Text style={styles.primaryBtnTxt}>{won ? 'Continue' : 'Close'}</Text>
                  </TouchableOpacity>
                  {!rideChallenge && !wrap && (onRematch || onChallenge) ? (
                    <View style={styles.row}>
                      {onRematch ? (
                        <TouchableOpacity style={[styles.sheetBtn, styles.secondaryBtn, styles.half]} onPress={onRematch}>
                          <GameIcon name="retry" size={20} />
                          <Text style={styles.secondaryBtnTxtBold}>Play again</Text>
                        </TouchableOpacity>
                      ) : null}
                      {onChallenge ? (
                        <TouchableOpacity style={[styles.sheetBtn, styles.secondaryBtn, styles.half]} onPress={onChallenge}>
                          <GameIcon name="swords" size={20} />
                          <Text style={styles.secondaryBtnTxtBold}>{challengeLabel}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </Animated.View>
            </View>
          ) : null}

          {/* Confetti sits above everything, ignores touches. */}
          {!reducedMotion && <ParticleField
            ref={confettiRef}
            width={SCREEN_W}
            height={SCREEN_H}
            style={styles.confetti}
            pointerEvents="none"
          />}
        </View>
    );
    return rideChallenge ? gameContent : (
      <Modal visible={visible} animationType={reducedMotion ? 'none' : 'fade'} transparent statusBarTranslucent onRequestClose={handleExit}>
        {gameContent}
      </Modal>
    );
  },
);

// -- Ride goal meter. ---------------------------------------------------------

function GoalMeter({ current, target, label, reducedMotion }: { current: number; target: number; label: string; reducedMotion: boolean }) {
  const fill = useSharedValue(0);
  const bump = useSharedValue(1);
  const shown = Math.min(current, target);
  useEffect(() => {
    cancelAnimation(fill);
    cancelAnimation(bump);
    if (reducedMotion) {
      fill.value = target > 0 ? shown / target : 0;
      bump.value = 1;
      return () => { cancelAnimation(fill); cancelAnimation(bump); };
    }
    fill.value = withSpring(target > 0 ? shown / target : 0, { damping: 14, stiffness: 160 });
    if (shown > 0) bump.value = withSequence(withTiming(1.18, { duration: 80 }), withSpring(1, JUICE.popSpring));
    return () => { cancelAnimation(fill); cancelAnimation(bump); };
  }, [shown, target, fill, bump, reducedMotion]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  return (
    <View style={styles.goalWrap} accessible accessibilityLabel={`${shown} of ${target} ${label}`}>
      <View style={styles.goalTrack}>
        <Animated.View style={[styles.goalFill, fillStyle]} />
        <Animated.Text style={[styles.goalText, bumpStyle]}>{`${shown} / ${target} ${label}`}</Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0879ca',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 54,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0768b9',
    borderBottomWidth: 3,
    borderBottomColor: '#05346e',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#05346e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, paddingHorizontal: 10 },
  title: { color: '#fff', fontSize: 22, fontFamily: 'Shark' },
  subtitle: { color: '#cdeaff', fontSize: 13, fontFamily: 'Knockout' },
  headerScore: { minWidth: 70, alignItems: 'flex-end' },
  field: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,56,128,0.45)',
  },
  overlayLight: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  count: {
    color: GAME_COLORS.gold,
    fontSize: 120,
    fontFamily: 'Shark',
    textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 5 },
    textShadowRadius: 0,
  },
  goalWrap: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#0768b9' },
  goalTrack: { height: 38, borderRadius: 19, backgroundColor: '#bfe5ff', borderWidth: 3,
    borderColor: '#fff', overflow: 'hidden', justifyContent: 'center' },
  goalFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#ffcf3b' },
  goalText: { alignSelf: 'center', fontFamily: 'Shark', fontSize: 20, color: '#fff',
    backgroundColor: '#073d73', borderRadius: 12, paddingHorizontal: 10, lineHeight: 26 },
  goalHeadline: { fontFamily: 'Shark', fontSize: 38, color: '#ffcf3b', textAlign: 'center', marginBottom: 6,
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  objective: {
    color: GAME_COLORS.text,
    fontSize: 18,
    fontFamily: 'Knockout',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
    textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  skipHint: { color: '#e4f7ff', fontSize: 13, marginTop: 18, letterSpacing: 1, fontFamily: 'Knockout' },
  edgeGlow: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 6,
    borderColor: '#ffcf3b',
    borderRadius: 4,
  },
  headsUp: {
    position: 'absolute',
    top: 118,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff8e4',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#05346e',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  headsUpText: { fontFamily: 'Knockout', fontSize: 16, color: '#05346e', marginLeft: 6 },
  sheet: {
    width: '80%',
    backgroundColor: '#0768b9',
    borderWidth: 4,
    borderColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  sheetTitle: { color: '#fff', fontSize: 26, fontFamily: 'Shark', marginBottom: 6, textAlign: 'center' },
  sheetBody: { color: '#e4f7ff', fontSize: 16, fontFamily: 'Knockout', marginBottom: 12, textAlign: 'center' },
  sheetBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryBtn: { backgroundColor: '#ffcf3b', borderBottomWidth: 4, borderBottomColor: '#d99a00' },
  primaryBtnTxt: { color: '#075083', fontSize: 20, fontFamily: 'Shark' },
  secondaryBtnTxt: { color: '#e4f7ff', fontSize: 17, fontFamily: 'Knockout' },
  secondaryBtn: { backgroundColor: '#ffffff', borderBottomWidth: 4, borderBottomColor: '#9cc9ec', flexDirection: 'row',
    justifyContent: 'center' },
  secondaryBtnTxtBold: { color: '#05346e', fontSize: 17, fontFamily: 'Shark', marginLeft: 6 },
  actions: { width: '100%', marginTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48.5%' },
  claimBtn: { marginTop: 12 },
  confetti: { ...StyleSheet.absoluteFillObject },
});
