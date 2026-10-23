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
  useMemo,
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
import { GAME_COLORS, COUNTDOWN, JUICE, LINE_MOVING_TOAST } from './theme';
import { ScoreDisplay } from './ScoreDisplay';
import { ParticleField, type ParticleHandle } from './Particles';
import { Haptic } from './Haptics';
import { playSfx } from './SFX';
import { LinePlayMovementContext, shouldPauseForMovement } from './LinePlayMovementContext';
import { RideChallengeContext } from './RideChallengeContext';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import GameIcon, { type GameIconName } from '../ui/GameIcon';
import { ResultsCard, type ResultStat, type ResultStarGoal } from './results/ResultsCard';
import { endFeel } from './results/feelings';
import { compareBest, starsFor, type StarThresholds } from './core/scoring';
import {
  wrapUpCopy,
  createHeadsUp,
  isEmptyResultsNode,
  makeSnapshot,
  reportAdvance,
  creditWrapResult,
  type HoldReason,
  type MovementPolicy,
  type WrapUpReason,
} from './core/session';
import { clearSnapshot, saveSnapshot } from './session/snapshotStore';
import { GameAudio } from './audio/GameAudio';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export type ShellPhase = 'countdown' | 'playing' | 'paused' | 'resuming' | 'results';

/** Result a game hands to the shell when the round ends. */
export type { ResultStarGoal };

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
  /** Bucket tallies filled before the score (HITS / COMBO / BONUS). */
  buckets?: ResultStat[];
  bucketValues?: number[];
  /** Star slam spacing (ms), e.g. the win stinger's beat. */
  starStepMs?: number;
  /**
   * Extra metadata forwarded verbatim as the 2nd arg of onComplete. This is
   * what carries {score, duration, seed, proof} to the server-authoritative
   * reward path. Never compute rewards on the client.
   */
  meta?: Record<string, unknown>;
  /** One line under the card (a coaching tip). A wrap-up note wins over it. */
  note?: string;
  /**
   * The next-star bar for a game whose stars are not points (Rhythm stars by
   * timing). progress is 0..1 toward the next star; the words for it live in
   * a11y (spoken only, never on the card).
   */
  starGoal?: ResultStarGoal;
}

/** What a game-owned results surface receives (`renderResults`). */
export interface ShellResultsArgs {
  result: GameResult;
  stars: number;
  won: boolean;
  /** Set when a queue event ended the run ('boarding' / 'left-queue'). */
  wrapReason: WrapUpReason | null;
  /** Continue / Close: runs the external onComplete contract (once). */
  claim: () => void;
  /** Present only when Play again / Challenge are allowed (never on paid rides or wrap-ups). */
  rematch?: () => void;
  challenge?: () => void;
  /**
   * PLAY AGAIN is the big button (the shared rule for every results card).
   * False only when a win's reward is still waiting to be collected and a
   * replay would skip it: then the claim button leads.
   */
  playAgainFirst: boolean;
  /** A queue event saved a run that had points but no star yet (RUN SAVED stamp). */
  saved: boolean;
  reducedMotion: boolean;
}

/** Start count: 'full' 3-2-1-GO (default), 'go' a single GO (no clock), 'none' the game counts itself in. */
export type CountdownStyle = 'full' | 'go' | 'none';
export type CountdownScrim = 'default' | 'light' | 'none';

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
  /** Game-owned row under the results card (album, missions, unlock card). */
  resultExtras?: React.ReactNode;
  /** A small chip inside the shared results card, under the brags (Whack's SHARE). */
  resultCardFooter?: React.ReactNode;
  /**
   * One extra caps button in the results button stack (Rhythm's EASY BEAT
   * replay), drawn like every other secondary. Hidden on group turns, in a
   * ride challenge and once the line ended the run, the same as PLAY AGAIN.
   */
  resultAction?: { label: string; icon?: GameIconName; onPress: () => void; a11yLabel?: string };
  /** @deprecated alias of resultExtras (Sharky). */
  resultsExtra?: React.ReactNode;
  /** Replace the whole results surface (card and actions). The shell still owns timing, confetti and the claim contract. */
  renderResults?: (args: ShellResultsArgs) => React.ReactNode;
  /** Game-specific settings in the hold sheet (Trivia Duel's Relaxed pace). */
  pauseExtras?: React.ReactNode;
  /** Hide the header score (the game draws its own, e.g. Trivia's rail). */
  hideHeaderScore?: boolean;
  /** Replace the header score with a game-owned node (Current Quest's run bar chip). */
  headerScore?: React.ReactNode;
  /** Start count style. Default 'full'. */
  countdownStyle?: CountdownStyle;
  /** @deprecated false = countdownStyle 'none' (Parade Beat counts in on the song's bar). */
  introCountdown?: boolean;
  /** Countdown backdrop: 'default' navy scrim, 'light' white wash, 'none' (Trivia: the stage stays readable). */
  countdownScrim?: CountdownScrim;
  /** Results backdrop behind a game-owned surface (renderResults): 'none' keeps the stage at full brightness (Trivia rev 7). */
  resultsScrim?: CountdownScrim;
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
/** A run never ends on a dark screen: past this, the results show with no fade, and an empty game surface falls back to the shared card. */
export const RESULTS_FALLBACK_MS = 600;
/** One number per finished run across every shell (win streaks count each run once). */
let resultsRunSeq = 0;

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
      resultExtras,
      resultsExtra,
      resultCardFooter,
      resultAction,
      renderResults,
      pauseExtras,
      hideHeaderScore = false,
      headerScore,
      countdownStyle: countdownStyleProp,
      introCountdown,
      resultsScrim = 'default',
      countdownScrim = 'default',
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
    const countdownStyle: CountdownStyle = countdownStyleProp ?? (introCountdown === false ? 'none' : 'full');
    const firstCount = countdownStyle === 'go' ? 'GO!' : '3';
    const [countText, setCountText] = useState(firstCount);
    const [pauseReason, setPauseReason] = useState<string | undefined>();
    const [holdReason, setHoldReason] = useState<HoldReason | null>(null);
    const [wrap, setWrap] = useState<{ reason: WrapUpReason; result: GameResult; gameMessage?: string } | null>(null);
    const [headsUp, setHeadsUp] = useState(false);
    // Safety net: once the results have had RESULTS_FALLBACK_MS to appear, show them with no fade.
    const [resultsSafe, setResultsSafe] = useState(false);
    /** Counts finished runs, so the win streak counts each run once. */
    const resultsRunRef = useRef(0);
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
    const personalBestRef = useRef(personalBest);
    personalBestRef.current = personalBest;
    // The shared results card is on screen (it fires its own NEW BEST burst).
    const sharedCardShownRef = useRef(false);
    const bestBurstRunRef = useRef(-1);
    const burstBest = useCallback(() => {
      if (bestBurstRunRef.current === resultsRunRef.current || reducedMotionRef.current) return;
      bestBurstRunRef.current = resultsRunRef.current;
      confettiRef.current?.burst({ x: SCREEN_W * 0.5, y: SCREEN_H * 0.4, preset: 'confetti', count: 28 });
    }, []);

    // A queue event wrapped the run up. A game that hands back its own result
    // after the wrap (Whack banks the burst it was in) still gets the wrap-up
    // credit, title and RUN SAVED flag, so its card never looks like a plain loss.
    const effectiveResult = useMemo((): GameResult | null => {
      if (!wrap) return result ?? null;
      if (!result) return wrap.result;
      // Title from this result's own saved flag, so title, stamp and note agree.
      return creditWrapResult(result, wrap.reason, !!rideChallenge, wrap.gameMessage);
    }, [result, wrap, rideChallenge]);

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
      setCountText(firstCount);
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
      if (countdownStyle === 'none') {
        beginPlay();
        return;
      }
      const steps = countdownStyle === 'go' ? ['GO!'] : ['3', '2', '1', 'GO!'];
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
    }, [phase, visible, beginPlay, clearCountdown, punchCount, countdownStyle]);

    // -- Play again: the game cleared its result, so run a fresh start count. --
    const hadResultRef = useRef(false);
    useEffect(() => {
      if (result) {
        hadResultRef.current = true;
        return;
      }
      if (!visible || !hadResultRef.current || phase !== 'results' || wrap) return;
      hadResultRef.current = false;
      startedRef.current = false;
      claimedRef.current = false;
      clearCelebration();
      resultsScale.value = 0.7;
      resultsOpacity.value = 0;
      setCountText(firstCount);
      setPhase('countdown');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, phase, wrap, visible]);

    // -- Transition to results when the game (or a wrap-up) reports one. ----
    useEffect(() => {
      if (!visible || !effectiveResult) return;
      if (phase === 'results') return;
      clearCountdown();
      clearResume();
      resultsRunRef.current = ++resultsRunSeq;
      setPhase('results');
      setHeadsUp(false);
      if (sessionKey) void clearSnapshot(sessionKey);
      // A personal best feels like a win even with 0 stars; a saved run is calm.
      const feel = endFeel({
        stars: effectiveResult.stars,
        isNewBest: compareBest(effectiveResult.score ?? 0, personalBestRef.current).isNewBest,
        saved: effectiveResult.meta?.partial === true,
      });
      if (feel === 'win' || feel === 'best') {
        Haptic.success();
        playSfx('win');
      } else if (feel === 'try') {
        Haptic.failBuzz();
        playSfx('lose');
      } else {
        Haptic.hitSoft();
      }
      clearCelebration();
      // The fade starts in the effect below, once the results view is on screen.
      if (feel === 'best' && !reducedMotionRef.current) {
        // One small burst for a 0-star personal best. The shared card fires it
        // when its NEW BEST badge lands; a game's own card gets it here.
        celebrationTimers.current.push(setTimeout(() => {
          if (!sharedCardShownRef.current) burstBest();
        }, 1200));
      }
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
    }, [visible, effectiveResult, phase, sessionKey, clearCountdown, clearResume, clearCelebration]);

    // Fade the results in only after they mount. An animated style hands a
    // newly mounted view the style it had when the shell first rendered
    // (hidden), and it only updates while the value is still changing. A fade
    // started before the view mounted could finish first, leaving the card
    // invisible on a dimmed screen (audit shots games/13, games/33, boss/12).
    useEffect(() => {
      if (!visible || phase !== 'results') return;
      cancelAnimation(resultsOpacity);
      cancelAnimation(resultsScale);
      if (reducedMotionRef.current) {
        resultsOpacity.value = 1;
        resultsScale.value = 1;
        return;
      }
      resultsOpacity.value = 0;
      resultsScale.value = 0.7;
      resultsOpacity.value = withTiming(1, { duration: 220 });
      resultsScale.value = withSpring(1, JUICE.settleSpring);
    }, [visible, phase, resultsOpacity, resultsScale]);

    // The results always show: after RESULTS_FALLBACK_MS the card drops its
    // fade-in (a stalled animation can never leave a dimmed, empty screen) and
    // a game surface that rendered nothing is replaced by the shared card.
    useEffect(() => {
      if (!visible || phase !== 'results') {
        setResultsSafe(false);
        return undefined;
      }
      // Reduced motion has no fade to wait for: the results are safe at once.
      if (reducedMotionRef.current) {
        setResultsSafe(true);
        return undefined;
      }
      const t = setTimeout(() => {
        // Land the fade on its end values too, so the card is solid either way.
        cancelAnimation(resultsOpacity);
        cancelAnimation(resultsScale);
        resultsOpacity.value = 1;
        resultsScale.value = 1;
        setResultsSafe(true);
      }, RESULTS_FALLBACK_MS);
      return () => clearTimeout(t);
    }, [visible, phase, resultsOpacity, resultsScale]);

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
        setCountText(firstCount);
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

    // lineMovePolicy 'passive' is the default: walking in a queue never pauses
    // a round. Only an explicit 'pause' opt-in (a QA preview) freezes here.
    const pauseForMovement = shouldPauseForMovement(linePlayMovement);
    useEffect(() => {
      if (visible && pauseForMovement && (phase === 'playing' || phase === 'countdown')) {
        doHold('manual', LINE_MOVING_TOAST);
      }
    }, [visible, pauseForMovement, phase, doHold]);

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
    const rideUpLikelyRef = useRef(false);
    const askBoardingRef = useRef(false);
    /** The guest tapped SAVE MY RUN: boarding is recorded once the saved run's card closes. */
    const boardingAnsweredRef = useRef(false);
    useEffect(() => {
      if (!visible) return;
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'background' || state === 'inactive') doHoldRef.current('background', 'Paused while away');
        else if (state === 'active' && holdRef.current === 'background') {
          // Back from the pocket while ride detection thinks the guest boarded:
          // stay held so the sheet can ask "Did your ride start?". Never guess.
          if (rideUpLikelyRef.current && startedRef.current && askBoardingRef.current) return;
          doResumeRef.current();
        }
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
        gameMessage: base.message,
        result: creditWrapResult({ ...base, score: base.score ?? finalScore }, reason, !!rideChallenge, base.message),
      });
    }, [phase, wrap, clearCountdown, clearResume, onPause, onWrapUp, thresholds, rideChallenge]);

    const queueEnded = linePlayMovement?.queueEnded ?? null;
    useEffect(() => {
      if (visible && queueEnded) wrapUp(queueEnded);
    }, [visible, queueEnded, wrapUp]);

    // Ride detection thinks the guest boarded. A single GPS fix can fake that
    // (indoor queues most of all), so the hint never ends a run by itself.
    // An active round keeps playing; a held round asks inside the game
    // ("Did your ride start?") instead of counting down to resume.
    const rideUpLikely = !!linePlayMovement?.rideUpLikely;
    const askBoarding = rideUpLikely && !!linePlayMovement?.onBoardingAnswer && !rideChallenge;
    rideUpLikelyRef.current = rideUpLikely;
    askBoardingRef.current = askBoarding;
    const answerSaveRun = useCallback(() => {
      boardingAnsweredRef.current = true;
      wrapUp('boarding');
    }, [wrapUp]);
    const answerKeepPlaying = useCallback(() => {
      linePlayMovement?.onBoardingAnswer?.(false);
      doResume();
    }, [linePlayMovement, doResume]);

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
        // A finished run still counts as played in the queue, even with no star.
        linePlayMovement?.onRunDone?.(0, effectiveResult?.meta?.partial === true);
        onClose();
      }
      // SAVE MY RUN: the run is counted above, now the wait records boarding.
      if (boardingAnsweredRef.current) {
        boardingAnsweredRef.current = false;
        linePlayMovement?.onBoardingAnswer?.(true);
      }
    }, [effectiveResult, starMultipliers, onComplete, onClose, linePlayMovement]);

    // PLAY AGAIN in a queue: the run just played is counted first, so a
    // replay never throws a finished run (or its star) away.
    const canBankRun = !!linePlayMovement?.onRunDone;
    const rematchRun = useMemo(() => (onRematch ? () => {
      if (!claimedRef.current && effectiveResult && linePlayMovement?.onRunDone) {
        claimedRef.current = true;
        linePlayMovement.onRunDone(effectiveResult.stars ?? 0, effectiveResult.meta?.partial === true);
      }
      onRematch();
    } : undefined), [onRematch, effectiveResult, linePlayMovement]);

    // The extra replay button banks the finished run first, like PLAY AGAIN.
    const resultActionPress = useCallback(() => {
      if (!claimedRef.current && effectiveResult && linePlayMovement?.onRunDone) {
        claimedRef.current = true;
        linePlayMovement.onRunDone(effectiveResult.stars ?? 0, effectiveResult.meta?.partial === true);
      }
      resultAction?.onPress();
    }, [effectiveResult, linePlayMovement, resultAction]);

    const handleClaimRef = useRef(handleClaim);
    handleClaimRef.current = handleClaim;

    const resumeAfterQuitCancel = useCallback(() => {
      setPhase(startedRef.current ? 'playing' : 'countdown');
      if (!startedRef.current) setCountText(firstCount);
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

    const resultsFadeStyle = useAnimatedStyle(() => ({ opacity: resultsOpacity.value }));
    const resultsScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: resultsScale.value }] }));
    const countStyle = useAnimatedStyle(() => ({
      transform: [{ scale: countScale.value }],
    }));
    const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.35 }));

    const stars = effectiveResult?.stars ?? 0;
    const won = stars > 0;

    if (!visible) return null;

    // One button rule for every results card: PLAY AGAIN is the big button,
    // unless a win's reward is still waiting and a replay would skip it.
    // A pass-and-play group turn is one try per kid: DONE is the only button.
    const turnOnly = linePlayMovement?.turnOnly === true;
    const rematchOffered = !rideChallenge && !wrap && !turnOnly && !!rematchRun;
    const challengeOffered = !rideChallenge && !wrap && !turnOnly ? onChallenge : undefined;
    const playAgainFirst = rematchOffered && (!won || canBankRun);
    const saved = effectiveResult?.meta?.partial === true;
    const claimLabel = won ? 'CONTINUE' : 'DONE';

    // A game-owned results surface, when the game has one and it rendered.
    // Nothing rendered by the time the fallback fires: the shared card shows.
    const ownSurface = phase === 'results' && renderResults && effectiveResult ? renderResults({
      result: effectiveResult,
      stars,
      won,
      wrapReason: wrap?.reason ?? null,
      claim: handleClaim,
      rematch: rematchOffered ? rematchRun : undefined,
      challenge: challengeOffered,
      playAgainFirst,
      saved,
      reducedMotion,
    }) : null;
    const gameResults = isEmptyResultsNode(ownSurface) ? null : ownSurface;
    // A wrap-up (ride's up) has no game surface to wait for: the shared card shows at once.
    const showSharedCard = phase === 'results' && (!renderResults || !effectiveResult || (gameResults == null && (resultsSafe || wrap != null)));
    sharedCardShownRef.current = showSharedCard;

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
            {hideHeaderScore ? null : (
              <View style={styles.headerScore}>
                {headerScore ?? (
                  <ScoreDisplay
                    score={score}
                    multiplier={multiplier}
                    fever={fever}
                    personalBest={personalBest}
                    compact
                    reducedMotion={reducedMotion}
                  />
                )}
              </View>
            )}
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
            <Pressable
              style={[styles.overlay, countdownScrim === 'light' ? styles.scrimLight : countdownScrim === 'none' ? styles.scrimNone : null]}
              onPress={skipCountdown}
            >
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

          {/* Hold sheet. Ride detection thinks the guest boarded: ask, never guess. */}
          {phase === 'paused' && askBoarding && startedRef.current ? (
            <View style={styles.overlay}>
              <View style={styles.sheet} accessibilityRole="alert">
                <View style={styles.sheetIcon}><GameIcon name="ride" size={64} /></View>
                <Text style={styles.sheetTitle}>Did your ride start?</Text>
                <Text style={styles.sheetBody}>Your run is saved either way.</Text>
                <TouchableOpacity style={[styles.sheetBtn, styles.primaryBtn, styles.bigBtn]} onPress={answerSaveRun}
                  accessibilityRole="button" accessibilityLabel="Yes, my ride started. Save my run">
                  <GameIcon name="ride" size={26} />
                  <Text style={[styles.primaryBtnTxt, styles.btnGap]}>SAVE MY RUN</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.sheetBtn, styles.secondaryBtn]} onPress={answerKeepPlaying}
                  accessibilityRole="button" accessibilityLabel="Still in line. Keep playing">
                  <GameIcon name="play" size={22} />
                  <Text style={[styles.secondaryBtnCaps, styles.btnGap]}>KEEP PLAYING</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : phase === 'paused' ? (
            <View style={styles.overlay}>
              <View style={styles.sheet}>
                <Text style={styles.sheetTitle}>{pauseReason ?? 'Paused'}</Text>
                <Text style={styles.sheetBody}>Your run is saved right where you left it.</Text>
                {pauseExtras ?? null}
                <TouchableOpacity style={[styles.sheetBtn, styles.primaryBtn]} onPress={doResume}>
                  <Text style={styles.primaryBtnTxt}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetBtn} onPress={requestQuit}>
                  <Text style={styles.secondaryBtnTxt}>Quit</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Results. The fade wrapper drops to a plain style after the safety
              net (opacity only); the settle spring keeps its own scale. */}
          {gameResults != null ? (
            <View style={[styles.overlay, resultsScrim === 'light' ? styles.scrimLight : resultsScrim === 'none' ? styles.scrimNone : null]} pointerEvents="box-none">
              <Animated.View style={[styles.resultsFill, resultsSafe ? styles.resultsShown : resultsFadeStyle]}>
                <Animated.View style={[styles.resultsFill, resultsScaleStyle]}>
                  {gameResults}
                </Animated.View>
              </Animated.View>
            </View>
          ) : null}
          {showSharedCard ? (
            <View style={styles.overlay} pointerEvents="box-none">
              <Animated.View style={[{ width: '86%' }, resultsSafe ? styles.resultsShown : resultsFadeStyle]}>
                <Animated.View style={resultsScaleStyle}>
                  <ResultsCard
                    score={effectiveResult?.score ?? score}
                    stars={stars}
                    message={effectiveResult?.message}
                    thresholds={effectiveResult?.thresholds ?? thresholds}
                    personalBest={personalBest}
                    maxCombo={effectiveResult?.maxCombo}
                    stats={effectiveResult?.stats}
                    rival={effectiveResult?.rival}
                    buckets={effectiveResult?.buckets}
                    bucketValues={effectiveResult?.bucketValues}
                    starStepMs={effectiveResult?.starStepMs}
                    starGoal={effectiveResult?.starGoal}
                    streakKey={gameId ?? title}
                    runToken={resultsRunRef.current}
                    saved={saved}
                    note={wrap ? wrapUpCopy(wrap.reason, saved || (effectiveResult?.score ?? 0) <= 0).body || undefined : effectiveResult?.note}
                    footer={resultCardFooter}
                    onNewBestLanded={stars === 0 ? burstBest : undefined}
                    wrapUp={wrap != null}
                    reducedMotion={reducedMotion}
                  />
                  {resultExtras ?? resultsExtra ?? null}
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.sheetBtn, styles.primaryBtn, styles.bigBtn]}
                      onPress={playAgainFirst ? rematchRun : handleClaim}
                      accessibilityRole="button"
                    >
                      {playAgainFirst ? <GameIcon name="retry" size={26} /> : null}
                      <Text style={[styles.primaryBtnTxt, playAgainFirst && styles.btnGap]}>{playAgainFirst ? 'PLAY AGAIN' : claimLabel}</Text>
                    </TouchableOpacity>
                    {playAgainFirst || (rematchOffered && rematchRun) || challengeOffered ? (
                      <View style={styles.row}>
                        {playAgainFirst ? (
                          <TouchableOpacity style={[styles.sheetBtn, styles.secondaryBtn, styles.rowBtn]} onPress={handleClaim} accessibilityRole="button">
                            <Text style={styles.secondaryBtnCaps}>{claimLabel}</Text>
                          </TouchableOpacity>
                        ) : rematchOffered && rematchRun ? (
                          <TouchableOpacity style={[styles.sheetBtn, styles.secondaryBtn, styles.rowBtn]} onPress={rematchRun} accessibilityRole="button">
                            <GameIcon name="retry" size={20} />
                            <Text style={[styles.secondaryBtnCaps, styles.btnGap]}>PLAY AGAIN</Text>
                          </TouchableOpacity>
                        ) : null}
                        {challengeOffered ? (
                          <TouchableOpacity style={[styles.sheetBtn, styles.secondaryBtn, styles.rowBtn]} onPress={challengeOffered} accessibilityRole="button">
                            <GameIcon name={/^race/i.test(challengeLabel) ? 'rush' : 'swords'} size={20} />
                            <Text style={[styles.secondaryBtnCaps, styles.btnGap]} numberOfLines={1} adjustsFontSizeToFit>{challengeLabel.toUpperCase()}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                    {resultAction && !rideChallenge && !wrap && !turnOnly && (!won || canBankRun) ? (
                      <TouchableOpacity style={[styles.sheetBtn, styles.secondaryBtn, styles.rowBtn, styles.extraBtn]} onPress={resultActionPress}
                        accessibilityRole="button" accessibilityLabel={resultAction.a11yLabel ?? resultAction.label}>
                        {resultAction.icon ? <GameIcon name={resultAction.icon} size={20} /> : null}
                        <Text style={[styles.secondaryBtnCaps, resultAction.icon && styles.btnGap]} numberOfLines={1} adjustsFontSizeToFit>
                          {resultAction.label.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </Animated.View>
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
  resultsShown: { opacity: 1 },
  resultsFill: { width: '100%', alignItems: 'center' },
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
  scrimLight: { backgroundColor: 'rgba(255,255,255,0.3)' },
  scrimNone: { backgroundColor: 'transparent' },
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
  primaryBtnTxt: { color: '#05346e', fontSize: 22, fontFamily: 'Shark' },
  secondaryBtnTxt: { color: '#e4f7ff', fontSize: 17, fontFamily: 'Knockout' },
  secondaryBtn: { backgroundColor: '#ffffff', borderBottomWidth: 4, borderBottomColor: '#9cc9ec', flexDirection: 'row',
    justifyContent: 'center' },
  secondaryBtnCaps: { color: '#05346e', fontSize: 18, fontFamily: 'Shark' },
  bigBtn: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 16, marginTop: 14,
    borderWidth: 3, borderColor: '#05346e', borderBottomWidth: 6 },
  btnGap: { marginLeft: 8 },
  sheetIcon: { marginTop: -6, marginBottom: 4 },
  actions: { width: '100%', marginTop: 6 },
  row: { flexDirection: 'row', gap: 10 },
  rowBtn: { flex: 1, borderWidth: 3, borderColor: '#05346e', borderBottomWidth: 5, paddingVertical: 12 },
  extraBtn: { flex: 0, alignSelf: 'stretch', marginTop: 10 },
  confetti: { ...StyleSheet.absoluteFillObject },
});
