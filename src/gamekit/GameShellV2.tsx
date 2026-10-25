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
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  Easing,
  cancelAnimation,
  runOnJS,
  ReduceMotion,
  withRepeat,
  type SharedValue,
} from 'react-native-reanimated';
import { GAME_COLORS, COUNTDOWN, JUICE, LINE_MOVING_TOAST } from './theme';
import { ScoreDisplay } from './ScoreDisplay';
import { ParticleField, type ParticleHandle } from './Particles';
import { Haptic } from './Haptics';
import { playSfx } from './SFX';
import { LinePlayMovementContext, shouldPauseForMovement } from './LinePlayMovementContext';
import { RideChallengeContext } from './RideChallengeContext';
import { GrownUpGateSlot } from '../components/GrownUpGate';
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
import { playGameHaptic, playGameMoment } from './audio/gameMomentSound';
import { CountdownStage } from './fx/CountdownStage';
import { FinalSeconds } from './fx/FinalSeconds';
import { COACH_EXIT_MS, COACH_LEAD_MS, COUNT_END_MS, GO_AT_MS, GO_SPARKLES, RARE_GO_SPARKLES, STAGE_READY_MAX_MS, countPose, countStartsOf, countSteps, finalSecondsBeat, isRareGo, noteCountStart } from './core/gameMoments';
import { AMBIENT, DURATION, flashPeak, momentParticles } from '../ui/motion';
import { isDimFlashingLightsEnabled } from '../../modules/flash-safety';

/** Dev capture only: hold the drawn count on this clock time (ms) for 6 s. Never set in release. */
const COUNT_HOLD_MS = __DEV__ ? Number(process.env.EXPO_PUBLIC_COUNT_HOLD_MS || -1) : -1;
/** Dev capture only: how long a capture hold lasts (EXPO_PUBLIC_DEV_HOLD_FOR_MS, default 6 s). */
const CAPTURE_HOLD_FOR = __DEV__ ? Number(process.env.EXPO_PUBLIC_DEV_HOLD_FOR_MS || 6000) : 6000;
import { EASE } from '../ui/motionEasing';
import { usePowerBudget } from '../power';

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
  /**
   * A picture demo of how to play, shown in the countdown pill instead of the objective text (a
   * 7-year-old reads it with zero words). The objective stays as the VoiceOver label.
   */
  countdownDemo?: React.ReactNode;
  /** Seat the countdown pill this far below the top of the play field (pt), under the game's own HUD row. */
  countdownPillFieldY?: number;
  /**
   * Whole seconds left on a timed round. From 5 down the clock turns gold, a
   * soft gold edge breathes and each second stamps in; 0 slams TIME! (the
   * game still owns its own end). Pass only while the round runs.
   */
  secondsLeft?: number | null;
  /** Where the last-5 stamps land (pt from the top of the screen). Default: the count's spot. */
  finalStampY?: number;
  /** Where the last-5 stamps land, in pt from the top of the play field (wins over finalStampY). */
  finalStampFieldY?: number;
  /** UI-thread ms left on the round: the last-5 stamps follow it frame-exact (secondsLeft still drives sound). */
  remainingMs?: SharedValue<number> | null;
  /** Show TIME! at 0 (false when the game ends on its own banner, like Whack's FINISH!). Default true. */
  finalTimeStamp?: boolean;
  /**
   * The stage is drawn (board, art, cards). The 3-2-1 waits for it so the count never slams
   * over a blank stage; the field fades in when it turns true. Default true. A stage that
   * never reports ready still counts after STAGE_READY_MAX_MS.
   */
  stageReady?: boolean;
  /** Where the 3-2-1-GO lands, as a fraction of the screen height (default 0.5): put it in the stage's clear space. */
  countdownY?: number;
  /** The shell plays the last-5 tick, haptic and TIME! whistle (default). False when the game owns its own ticks. */
  finalSecondsFeedback?: boolean;
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
  /** Game-owned row under the results card (share, album, missions, unlock card). */
  resultExtras?: React.ReactNode;
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
// The count clock always runs: Reduce Motion is handled by the drawing (fades, no travel), and
// Reanimated's own reduce-motion jump would end the clock at once and hide the numbers.
const CLOCK_ALWAYS = ReduceMotion ? ReduceMotion.Never : undefined;
// One frame later (requestAnimationFrame where the platform has it; a 16 ms timer otherwise).
const nextFrame = (fn: () => void): unknown => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
const cancelFrame = (id: unknown): void => {
  if (typeof cancelAnimationFrame === 'function' && typeof id === 'number') cancelAnimationFrame(id);
  else clearTimeout(id as ReturnType<typeof setTimeout>);
};
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
      countdownDemo,
      countdownPillFieldY,
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
      secondsLeft,
      finalStampY,
      finalStampFieldY,
      remainingMs,
      finalTimeStamp = true,
      stageReady = true,
      finalSecondsFeedback = true,
      countdownY = 0.5,
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
      setCountText(firstCount);
      setWrap(null);
      setHoldReason(null);
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

    // The start (core/gameMoments): 3, 2, 1 slam in at 0, 700, 1400 ms, GO bursts at 2100 and play
    // opens on that frame; the GO tail (sparkles, scrim fade) clears by 2600 over live play.
    const cdClock = useSharedValue(-1);
    const [goTail, setGoTail] = useState(false);
    const walkingRef = useRef(false);
    walkingRef.current = !!linePlayMovement?.moving;
    const endCountStage = useCallback(() => {
      cdClock.value = -1;
      setGoTail(false);
    }, [cdClock]);
    const stopCountStage = useCallback(() => {
      cancelAnimation(cdClock);
      endCountStage();
    }, [cdClock, endCountStage]);
    // The tail ends on the UI clock itself (no JS timer outlives a skip or a close).
    const runCountStage = useCallback((fromMs: number) => {
      cancelAnimation(cdClock);
      cdClock.value = fromMs;
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) runOnJS(endCountStage)();
      };
      // Dev capture only (EXPO_PUBLIC_COUNT_HOLD_MS): the drawn count pauses on one pose for 6 s so a
      // screenshot shows an exact frame on a loaded machine (play still opens on time).
      if (COUNT_HOLD_MS > fromMs && COUNT_HOLD_MS < COUNT_END_MS) {
        cdClock.value = withSequence(
          withTiming(COUNT_HOLD_MS, { duration: COUNT_HOLD_MS - fromMs, easing: Easing.linear, reduceMotion: CLOCK_ALWAYS }),
          withTiming(COUNT_HOLD_MS + 0.01, { duration: CAPTURE_HOLD_FOR, easing: Easing.linear, reduceMotion: CLOCK_ALWAYS }),
          withTiming(COUNT_END_MS, { duration: COUNT_END_MS - COUNT_HOLD_MS, easing: Easing.linear, reduceMotion: CLOCK_ALWAYS }, done),
        );
      } else {
        cdClock.value = withTiming(COUNT_END_MS, { duration: COUNT_END_MS - fromMs, easing: Easing.linear, reduceMotion: CLOCK_ALWAYS }, done);
      }
      setGoTail(true);
    }, [cdClock, endCountStage]);
    const fireCountStep = useCallback((step: ReturnType<typeof countSteps>[number]) => {
      // Re-sync the drawn count to the step that just fired, so the number on screen and the frame
      // play opens never drift apart on a busy phone (the JS timer is the truth for input).
      runCountStage(step.at);
      setCountText(step.label);
      // Walking in a line drops the buzz one rung (the count still reads with the eyes and ears).
      const walking = walkingRef.current;
      const buzz = walking ? (step.haptic === 'incoming' ? 'tap' : 'tick') : step.haptic;
      playGameHaptic(buzz);
      playGameMoment(step.cue, step.variant, step.sfx);
    }, [runCountStage]);

    // The count reads the latest callbacks through refs, so a game re-rendering during the count
    // (a new onStart each render) never restarts it from 3.
    const beginPlayRef = useRef(beginPlay);
    beginPlayRef.current = beginPlay;
    const fireStepRef = useRef(fireCountStep);
    fireStepRef.current = fireCountStep;
    // The stage reports ready (art drawn); a stage that never does still counts after a cap.
    const [readyCap, setReadyCap] = useState(false);
    useEffect(() => {
      if (stageReady || !visible) { setReadyCap(false); return undefined; }
      const t = setTimeout(() => setReadyCap(true), STAGE_READY_MAX_MS);
      return () => clearTimeout(t);
    }, [stageReady, visible]);
    const stageOn = stageReady || readyCap;
    const fieldIn = useSharedValue(stageReady ? 1 : 0);
    useEffect(() => {
      if (stageOn) fieldIn.value = withTiming(1, { duration: DURATION.enter, easing: EASE.out });
      else fieldIn.value = 0;
    }, [stageOn, fieldIn]);
    // A repeat start of the same game (play again, a second burst of play) counts 2-1-GO; now and
    // then GO throws gold confetti (never on a first play).
    const [rareGo, setRareGo] = useState(false);
    // w5r2, one callout at a time: a game's picture demo (countdownDemo) plays alone in its pill on the first
    // start, then shrinks away as the 3 lands; a repeat start never shows it (the kid already knows the game).
    const hasDemo = !!countdownDemo;
    const hasDemoRef = useRef(hasDemo);
    hasDemoRef.current = hasDemo;
    const pillOut = useSharedValue(0);
    const [pillGone, setPillGone] = useState(() => hasDemo && countStartsOf(gameId ?? 'game') > 0);
    const [demoRun, setDemoRun] = useState(0);
    useEffect(() => {
      if (phase !== 'countdown' || !visible || !stageOn) return;
      clearCountdown();
      if (countdownStyle === 'none') {
        beginPlayRef.current();
        return;
      }
      const n = noteCountStart(gameId ?? 'game');
      const quick = n > 1;
      setRareGo(isRareGo(n, Math.random()) || (__DEV__ && process.env.EXPO_PUBLIC_RARE_GO === '1'));
      const steps = countSteps(countdownStyle, quick);
      const from = steps[0].at;
      const lead = hasDemoRef.current && !quick ? COACH_LEAD_MS : 0;
      if (hasDemoRef.current) {
        cancelAnimation(pillOut);
        pillOut.value = lead > 0 ? 0 : 1;
        setPillGone(lead <= 0);
        // The demo restarts as the pill shows, so its first beat (the bonk) plays in full.
        if (lead > 0) setDemoRun((r) => r + 1);
      }
      // Start once the game has drawn its first frames (never count over a blank stage).
      let raf2: unknown = 0;
      const raf1 = nextFrame(() => {
        raf2 = nextFrame(() => {
          if (lead > 0) {
            countdownTimers.current.push(setTimeout(() => {
              pillOut.value = reducedMotionRef.current ? 1 : withTiming(1, { duration: COACH_EXIT_MS, easing: EASE.in });
            }, lead));
            countdownTimers.current.push(setTimeout(() => setPillGone(true), lead + COACH_EXIT_MS + 40));
          }
          steps.forEach((step) => {
            countdownTimers.current.push(setTimeout(() => {
              fireStepRef.current(step);
              if (step.at >= GO_AT_MS) beginPlayRef.current();
            }, step.at - from + lead));
          });
        });
      });
      return () => {
        cancelFrame(raf1);
        cancelFrame(raf2);
        clearCountdown();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, visible, clearCountdown, countdownStyle, stageOn]);

    // The last 5 seconds: one tick, one soft buzz and one stamp per second, TIME! at 0 (core/gameMoments).
    const lastFinal = useRef<number | null>(null);
    useEffect(() => {
      if (phase !== 'playing' || !visible) { lastFinal.current = null; return; }
      const beat = finalSecondsBeat(secondsLeft);
      if (beat.second == null) { lastFinal.current = null; return; }
      if (beat.second === lastFinal.current) return;
      lastFinal.current = beat.second;
      if (!finalSecondsFeedback) return;
      if (beat.haptic) playGameHaptic(walkingRef.current && beat.haptic === 'finisher' ? 'tap' : beat.haptic);
      playGameMoment(beat.cue, beat.variant, beat.sfx, { volume: 0.7 });
    }, [secondsLeft, phase, visible, finalSecondsFeedback]);

    const budget = usePowerBudget();

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
      setPhase('results');
      setHeadsUp(false);
      if (sessionKey) void clearSnapshot(sessionKey);
      Haptic[effectiveResult.stars > 0 ? 'success' : 'failBuzz']();
      playSfx(effectiveResult.stars > 0 ? 'win' : 'lose');
      clearCelebration();
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

    // The results card fades in from here only, AFTER the card has mounted. Passive effects
    // run after the new card view is attached, so every animation frame reaches it. Starting
    // the fade in the same effect that sets phase 'results' raced the card's mount: when the
    // JS thread was busy (a kid still tapping at the buzzer), the 220 ms fade finished before
    // the card view attached, and the card stayed at opacity 0 over a dimmed board.
    useEffect(() => {
      if (phase !== 'results') {
        resultsOpacity.value = 0;
        resultsScale.value = 0.7;
        return;
      }
      resultsOpacity.value = reducedMotionRef.current ? 1 : withTiming(1, { duration: 220 });
      resultsScale.value = reducedMotionRef.current ? 1 : withSpring(1, JUICE.settleSpring);
    }, [phase, resultsOpacity, resultsScale]);

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
        if (phase === 'countdown') { clearCountdown(); stopCountStage(); }
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
      [onPause, phase, clearCountdown, clearResume, persist, stopCountStage],
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

    // Tap anywhere skips straight to GO (the burst still plays over live play).
    const skipCountdown = useCallback(() => {
      if (phase !== 'countdown') return;
      clearCountdown();
      const steps = countSteps(countdownStyle === 'none' ? 'go' : countdownStyle);
      const go = steps[steps.length - 1];
      runCountStage(GO_AT_MS);
      fireCountStep(go);
      beginPlay();
    }, [phase, clearCountdown, beginPlay, countdownStyle, runCountStage, fireCountStep]);

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

    // Reduce Motion shows the results card with a plain still style, never the
    // animated one. The animated style takes its first frame when the card
    // mounts; in Reduce Motion the value jumps 0 -> 1 with no animation, and when
    // that jump lands between the first frame and the style's UI-thread hookup it
    // was never applied: the card stayed at opacity 0 over a cleared board (the
    // first-win freeze, most warm-ups in release JS with Reduce Motion on).
    const resultsStyle = useAnimatedStyle(() => ({
      opacity: resultsOpacity.value,
      transform: [{ scale: resultsScale.value }],
    }));
    const countStyle = useAnimatedStyle(() => ({
      transform: [{ scale: countScale.value }],
    }));
    const resultsScrimStyle = useAnimatedStyle(() => ({ opacity: resultsOpacity.value }));
    const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.35 }));
    const calmMotion = reducedMotion || !!linePlayMovement?.moving;
    // GO's screen kick (KICK.maxPt, none while walking or reduced) and the scrim fading out over live play.
    const kickStyle = useAnimatedStyle(() => ({ transform: [{ translateY: countPose(cdClock.value, reducedMotion, calmMotion).kick }] }));
    const cdScrimStyle = useAnimatedStyle(() => ({ opacity: countPose(cdClock.value, reducedMotion, calmMotion).scrim }));
    const fieldInStyle = useAnimatedStyle(() => ({ opacity: fieldIn.value }));
    // The pill breathes while the stage loads, so the start never holds still (no dead frame).
    const pillT = useSharedValue(0);
    const pillShown = phase === 'countdown' && !(hasDemo && pillGone);
    useEffect(() => {
      if (!pillShown || !visible || reducedMotion) { cancelAnimation(pillT); pillT.value = 0; return undefined; }
      pillT.value = 0;
      pillT.value = withRepeat(withTiming(1, { duration: AMBIENT.breathMs / 2, easing: EASE.inOut }), -1, true);
      return () => cancelAnimation(pillT);
    }, [pillShown, visible, reducedMotion, pillT]);
    // r5: the pill arrives with the stage (it fades in on the field's own fade), so a coach card never floats
    // over an empty blue frame while the art loads.
    // w5r2: on its way out the demo pill shrinks and drops toward the count, then the 3 owns the frame.
    const pillBreath = useAnimatedStyle(() => ({
      opacity: fieldIn.value * (1 - pillOut.value),
      transform: [{ translateY: 36 * pillOut.value }, { scale: (1 + 0.03 * pillT.value) * (1 - 0.45 * pillOut.value) }],
    }));
    // The walking chip pulses 1.0 to 1.08 every 1200 ms (still with Reduce Motion: it holds at 1).
    const walkT = useSharedValue(0);
    const walking = !!linePlayMovement?.moving && phase === 'playing';
    useEffect(() => {
      if (!walking || reducedMotion) { cancelAnimation(walkT); walkT.value = 0; return undefined; }
      walkT.value = withRepeat(withTiming(1, { duration: 600, easing: EASE.inOut }), -1, true);
      return () => cancelAnimation(walkT);
    }, [walking, reducedMotion, walkT]);
    const walkChipStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.08 * walkT.value }] }));
    // Where the play field sits in the shell, so a game can place its last-5 stamp in its own open space.
    const [fieldY, setFieldY] = useState(0);
    const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
      const y = e.nativeEvent.layout.y;
      setFieldY((v) => (Math.abs(v - y) < 1 ? v : y));
    }, []);

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
          <Animated.View style={[styles.field, kickStyle, fieldInStyle]} onLayout={onFieldLayout}>{children}</Animated.View>

          {/* The last 5 seconds: gold edge, stamped seconds, TIME!. */}
          <FinalSeconds secondsLeft={secondsLeft} remainingMs={remainingMs} timeStamp={finalTimeStamp} width={SCREEN_W} height={SCREEN_H}
            stampY={finalStampFieldY != null ? fieldY + finalStampFieldY : finalStampY ?? SCREEN_H * countdownY}
            reduced={reducedMotion} active={phase === 'playing'} edge={budget.level !== 'calm' || !!budget.ambient} />

          {/* Heads-up: the line advanced a lot. Never pauses, never buzzes. */}
          <Animated.View pointerEvents="none" style={[styles.edgeGlow, glowStyle]} />
          {/* Line moving: play never pauses; a small chip with walking feet breathes in the corner. */}
          {linePlayMovement?.moving && phase === 'playing' ? (
            <Animated.View pointerEvents="none" style={[styles.walkChip, walkChipStyle]} accessibilityLabel="The line is moving. Keep playing.">
              <GameIcon name="queue" size={18} />
            </Animated.View>
          ) : null}
          {headsUp && phase === 'playing' ? (
            <View pointerEvents="none" style={styles.headsUp} accessibilityLiveRegion="polite">
              <GameIcon name="queue" size={20} />
              <Text style={styles.headsUpText}>Heads up, the line moved</Text>
            </View>
          ) : null}

          {/* Countdown: scrim (fades at GO), the bubble numbers, the instruction pill, tap anywhere to skip. */}
          {/* Mounted for the whole count (drawing nothing until the clock starts), so the 3 lands on the
              first frame of the count instead of waiting for a canvas to mount. */}
          {goTail || (phase === 'countdown' && countdownStyle !== 'none') ? (
            <Animated.View pointerEvents="none" style={[styles.cdScrim,
              countdownScrim === 'light' ? styles.scrimLight : countdownScrim === 'none' ? styles.scrimNone : null, cdScrimStyle]} />
          ) : null}
          {goTail || (phase === 'countdown' && countdownStyle !== 'none') ? (
            <CountdownStage clock={cdClock} width={SCREEN_W} height={SCREEN_H} centerY={SCREEN_H * countdownY}
              reduced={reducedMotion} calm={calmMotion} rare={rareGo}
              sparkles={momentParticles(rareGo ? RARE_GO_SPARKLES : GO_SPARKLES, budget, reducedMotion)}
              confetti={rareGo ? momentParticles(24, budget, reducedMotion) : 0}
              flash={flashPeak(isDimFlashingLightsEnabled(), reducedMotion)} />
          ) : null}
          {phase === 'countdown' ? (
            <Pressable
              style={styles.cdTouch}
              onPress={skipCountdown}
              accessibilityRole="button"
              accessibilityLabel={`${objective ? `${objective} ` : ""}Starting in ${countText}. Tap to skip.`}
            >
              {pillShown ? (
              <Animated.View style={[styles.cdPill, countdownPillFieldY != null && fieldY > 0 ? { top: Math.max(188, fieldY + countdownPillFieldY) } : null, pillBreath]} pointerEvents="none">
                {goal ? <Text style={styles.goalHeadline}>{`${goal.target} ${goal.label}`}</Text> : null}
                {countdownDemo ? <React.Fragment key={demoRun}>{countdownDemo}</React.Fragment> : (objective ? <Text style={styles.cdPillText} numberOfLines={2}>{objective}</Text> : null)}
                {countdownDemo ? null : <Text style={styles.skipHint}>tap to skip</Text>}
              </Animated.View>
              ) : null}
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

          {/* Results */}
          {phase === 'results' && renderResults && effectiveResult ? (
            <View style={[styles.overlay, styles.scrimNone]} pointerEvents="box-none">
              {/* w5r2: the scrim fades in with the card (it used to land a frame early: a navy board with no card). */}
              <Animated.View pointerEvents="none" style={[styles.scrimFill, resultsScrim === 'light' ? styles.scrimLight : resultsScrim === 'none' ? styles.scrimNone : null,
                reducedMotion ? null : resultsScrimStyle]} />
              <Animated.View style={[{ width: '100%', alignItems: 'center' }, reducedMotion ? styles.resultsStill : resultsStyle]}>
                {renderResults({
                  result: effectiveResult,
                  stars,
                  won,
                  wrapReason: wrap?.reason ?? null,
                  claim: handleClaim,
                  rematch: !rideChallenge && !wrap ? onRematch : undefined,
                  challenge: !rideChallenge && !wrap ? onChallenge : undefined,
                  reducedMotion,
                })}
              </Animated.View>
            </View>
          ) : null}
          {phase === 'results' && !(renderResults && effectiveResult) ? (
            <View style={styles.overlay} pointerEvents="box-none">
              <Animated.View style={[{ width: '86%' }, reducedMotion ? styles.resultsStill : resultsStyle]}>
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
                  note={wrap ? WRAP_UP_COPY[wrap.reason].body : effectiveResult?.note}
                  reducedMotion={reducedMotion}
                />
                {resultExtras ?? resultsExtra ?? null}
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
          {/* The grown-up gate for a results Share or link: inside this modal, so it shows on top. */}
          {visible && <GrownUpGateSlot />}
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
  resultsStill: { opacity: 1, transform: [{ scale: 1 }] },
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
  scrimFill: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,56,128,0.45)' },
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
  // Inside the pill, never over the board (a Whack ring sat under the old bottom hint).
  skipHint: { color: '#0768b9', fontSize: 12, letterSpacing: 1, fontFamily: 'Knockout', marginTop: 2, opacity: 0.8 },
  // A pale sky tint (round 3: the 38% navy wash dimmed the board); the light behind each number does the focus.
  cdScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(36,140,224,0.2)' },
  cdTouch: { ...StyleSheet.absoluteFillObject },
  walkChip: { position: 'absolute', left: 12, bottom: 34, width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff8e4',
    borderWidth: 2.5, borderColor: '#05346e', alignItems: 'center', justifyContent: 'center' },
  // The instruction sits in a pill near the top so the number lands in clear space (audit defect 7).
  cdPill: { position: 'absolute', top: 188, alignSelf: 'center', maxWidth: '88%', backgroundColor: '#fff8e4', borderRadius: 22,
    borderWidth: 3, borderColor: '#05346e', paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center',
    shadowColor: '#05346e', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 0, elevation: 3 },
  cdPillText: { color: '#05346e', fontSize: 18, lineHeight: 22, fontFamily: 'Knockout', textAlign: 'center' },
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
