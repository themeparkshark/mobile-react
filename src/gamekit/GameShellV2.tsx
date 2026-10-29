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
  withRepeat,
  useFrameCallback,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated';
import { GAME_COLORS, COUNTDOWN, JUICE, LINE_MOVING_TOAST } from './theme';
import { ScoreDisplay } from './ScoreDisplay';
import { ParticleField, type ParticleHandle } from './Particles';
import { Haptic } from './Haptics';
import { playSfx } from './SFX';
import { LinePlayMovementContext, shouldPauseForMovement } from './LinePlayMovementContext';
import { RideChallengeContext } from './RideChallengeContext';
import { noteRideTry } from './results/rideTry';
import { ShellFrameContext } from './ShellFrameContext';
import { GrownUpGateSlot } from '../components/GrownUpGate';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import GameIcon, { type GameIconName } from '../ui/GameIcon';
import { ResultsCard, SHORT_PHONE_PT, type ResultStat, type ResultStarGoal } from './results/ResultsCard';
import { ResultsPodium } from './results/ResultsPodium';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { endFeel } from './results/feelings';
import { compareBest, starsFor, type StarThresholds } from './core/scoring';
import { END_WATCH_GRACE_MS, END_WATCH_MS, endWatchResult, traceLit, traceRunOver } from './core/endWatch';
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
import { playGameHaptic, playGameMoment } from './audio/gameMomentSound';
import { CountdownStage } from './fx/CountdownStage';
import { FinalSeconds } from './fx/FinalSeconds';
import { COACH_EXIT_MS, COACH_LEAD_MS, COUNT_END_MS, COUNT_WATCHDOG_MS, advanceCountClock, GO_AT_MS, GO_SPARKLES, type CountStep, RARE_GO_SPARKLES, STAGE_READY_MAX_MS, countPose, countStartsOf, countSteps, finalSecondsBeat, isRareGo, noteCountStart } from './core/gameMoments';
import { AMBIENT, DURATION, flashPeak, momentParticles } from '../ui/motion';
import { isDimFlashingLightsEnabled } from '../../modules/flash-safety';

/** Dev capture only: hold the drawn count on this clock time (ms) for 6 s. Never set in release. */
const COUNT_HOLD_MS = __DEV__ ? Number(process.env.EXPO_PUBLIC_COUNT_HOLD_MS || -1) : -1;
/** Dev capture only: how long a capture hold lasts (EXPO_PUBLIC_DEV_HOLD_FOR_MS, default 6 s). */
const CAPTURE_HOLD_FOR = __DEV__ ? Number(process.env.EXPO_PUBLIC_DEV_HOLD_FOR_MS || 6000) : 6000;
/**
 * Capture only (EXPO_PUBLIC_COUNT_TRACE=1 with the Whack capture; store builds never set it): after each start a
 * small line shows how many UI frames drew 3, 2, 1 and GO, the longest frame gap, and the game's clock on GO's
 * frame and at the tail's end, so a screenshot proves the start even when a screen recorder drops frames.
 */
const COUNT_TRACE = process.env.EXPO_PUBLIC_COUNT_TRACE === '1';
import { EASE } from '../ui/motionEasing';
import { usePowerBudget } from '../power';

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
  /** A tip that is only spoken (VoiceOver), never drawn: a 7-year-old reads nothing. */
  spokenNote?: string;
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
  /** The exit word every results card uses: DONE, or CONTINUE when a reward is still to collect. */
  claimLabel: 'DONE' | 'CONTINUE';
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
  /**
   * The run is over: its results card must follow. If the game's result has not
   * arrived `ms` later (default END_WATCH_MS), `rescue` is asked for one from the
   * game's live state (it may also show the game's own card and return nothing);
   * if there is still nothing END_WATCH_GRACE_MS after that, the shared card shows
   * the score. A rescue that returns false stands the watch down (the run that armed
   * it is gone, or its card is already up). The one results watchdog for every game
   * (core/endWatch.ts).
   */
  endWatch: (ms?: number, rescue?: EndWatchRescue) => void;
}

/** The end watch's rescue: a result, null (the game is showing its own card), or false (stand down). */
export type EndWatchRescue = () => GameResult | null | false | void;

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
  /** Game-owned row under the results card (album, missions, unlock card). */
  resultExtras?: React.ReactNode;
  /** The extras panel waits for its own beat (after the stars, tally and total land). */
  resultExtrasBeat?: boolean;
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
  /**
   * The game's own results surface fires its own confetti (Sharky's corner
   * cannons): the shell skips its star bursts, so a win has one celebration
   * on screen, not two particle stages at once.
   */
  ownCelebration?: boolean;
  /** Game-specific settings in the hold sheet (Trivia Duel's Relaxed pace). */
  pauseExtras?: React.ReactNode;
  /** Hide the header score (the game draws its own, e.g. Trivia's rail). */
  hideHeaderScore?: boolean;
  /**
   * The game drew its own results card inside the play field while the shell
   * is still 'playing' (Line Trivia). Set it to that card's DONE: the header
   * steps back exactly as it does in the shell's own results (title and score
   * hidden, a dimmed close X), the X does what DONE does, and nothing can
   * open a pause sheet over a finished game (a tap, the app going to the
   * background, or the line moving).
   */
  ownResultsDone?: (() => void) | null;
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
/** No demo pill exit on this start (the anchored count clock's sentinel). */
const NO_PILL_EXIT = -1e9;
// One frame later (requestAnimationFrame where the platform has it; a 16 ms timer otherwise).
const nextFrame = (fn: () => void): unknown => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
const cancelFrame = (id: unknown): void => {
  if (typeof cancelAnimationFrame === 'function' && typeof id === 'number') cancelAnimationFrame(id);
  else clearTimeout(id as ReturnType<typeof setTimeout>);
};
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
      resultExtrasBeat,
      resultsExtra,
      resultCardFooter,
      resultAction,
      renderResults,
      ownCelebration = false,
      pauseExtras,
      hideHeaderScore = false,
      ownResultsDone = null,
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
    const shellFrame = useContext(ShellFrameContext);
    const reducedMotion = useReducedGameMotion();
    const reducedMotionRef = useRef(reducedMotion);
    reducedMotionRef.current = reducedMotion;
    const countdownStyle: CountdownStyle = countdownStyleProp ?? (introCountdown === false ? 'none' : 'full');
    const firstCount = countdownStyle === 'go' ? 'GO!' : '3';
    const [countText, setCountText] = useState(firstCount);
    const [pauseReason, setPauseReason] = useState<string | undefined>();
    const [holdReason, setHoldReason] = useState<HoldReason | null>(null);
    const [wrap, setWrap] = useState<{ reason: WrapUpReason; result: GameResult; gameMessage?: string } | null>(null);
    // The end watch's card for a finished run whose result never came (core/endWatch.ts).
    const [rescue, setRescue] = useState<GameResult | null>(null);
    const [headsUp, setHeadsUp] = useState(false);
    // Safety net: once the results have had RESULTS_FALLBACK_MS to appear, show them with no fade.
    const [resultsSafe, setResultsSafe] = useState(false);
    // The cheering shark's peek over a tall shared card (0 = none), measured by the podium zone.
    const [peekK, setPeekK] = useState(0);
    /**
     * The same "safe" flag without a re-render: set when the fade landed on a
     * mounted surface (so the tree is not rebuilt for nothing). A game surface
     * that empties on a later render still falls back to the shared card.
     */
    const resultsSafeRef = useRef(false);
    const ownCelebrationRef = useRef(ownCelebration);
    ownCelebrationRef.current = ownCelebration && !!renderResults;
    /** A results surface (the game's own or the shared card) is on screen. */
    const surfaceShownRef = useRef(false);
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
      // The game's own result always wins over the end watch's rescue (it may arrive late).
      if (!wrap) return result ?? rescue ?? null;
      if (!result) return wrap.result;
      // Title from this result's own saved flag, so title, stamp and note agree.
      return creditWrapResult(result, wrap.reason, !!rideChallenge, wrap.gameMessage);
    }, [result, wrap, rideChallenge, rescue]);

    // -- The end watch: a finished run always gets a lit card (core/endWatch.ts). --
    const endWatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** The trace row of the run being watched (0 = none). */
    const endWatchRun = useRef(0);
    /** A result is in: the game's, a wrap-up's, or the game's own card in the field. */
    const resultInRef = useRef(false);
    resultInRef.current = !!result || !!wrap || !!ownResultsDone;
    const effectiveResultRef = useRef(effectiveResult);
    effectiveResultRef.current = effectiveResult;
    const thresholdsRef = useRef(thresholds);
    thresholdsRef.current = thresholds;
    const gameIdRef = useRef(gameId ?? title);
    gameIdRef.current = gameId ?? title;
    const clearEndWatch = useCallback(() => {
      if (endWatchTimer.current) clearTimeout(endWatchTimer.current);
      endWatchTimer.current = null;
    }, []);
    const armEndWatch = useCallback((ms: number = END_WATCH_MS, rescueFn?: EndWatchRescue) => {
      clearEndWatch();
      // One row per run: a game that re-arms (a longer finale) keeps its row.
      if (!endWatchRun.current) endWatchRun.current = traceRunOver(gameIdRef.current, Date.now());
      endWatchTimer.current = setTimeout(() => {
        endWatchTimer.current = null;
        if (resultInRef.current) return;
        let fromGame: GameResult | null | false = null;
        try {
          fromGame = rescueFn?.() ?? null;
        } catch {
          // A rescue that throws is the same as no rescue: the shared card follows.
          fromGame = null;
        }
        if (fromGame === false) {
          endWatchRun.current = 0;
          return;
        }
        if (fromGame) {
          setRescue(endWatchResult(fromGame, scoreRef.current, thresholdsRef.current) as GameResult);
          return;
        }
        endWatchTimer.current = setTimeout(() => {
          endWatchTimer.current = null;
          if (resultInRef.current) return;
          setRescue(endWatchResult(null, scoreRef.current, thresholdsRef.current) as GameResult);
        }, END_WATCH_GRACE_MS);
      }, Math.max(0, ms));
    }, [clearEndWatch]);
    // A result arrived: the watch stands down. The game's own field card counts as lit at once,
    // and when the game takes that card down to play again, the next run gets a fresh watch.
    const hadOwnCard = useRef(false);
    useEffect(() => {
      if (!ownResultsDone && hadOwnCard.current) {
        hadOwnCard.current = false;
        endWatchRun.current = 0;
      }
      if (!result && !wrap && !ownResultsDone) return;
      clearEndWatch();
      if (ownResultsDone) {
        hadOwnCard.current = true;
        if (endWatchRun.current) traceLit(endWatchRun.current, Date.now(), 'game');
      }
    }, [result, wrap, ownResultsDone, clearEndWatch]);
    useEffect(() => clearEndWatch, [clearEndWatch]);

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

    // The how-to line under the count is for the first play of each opening only:
    // PLAY AGAIN's 3-2-1 is just the count (a kid who just played knows the rules).
    const playedOnceRef = useRef(false);
    // -- Reset when (re)opened. ---------------------------------------------
    useEffect(() => {
      if (!visible) return;
      playedOnceRef.current = false;
      startedRef.current = false;
      claimedRef.current = false;
      setPhase('countdown');
      setCountText(firstCount);
      setWrap(null);
      setRescue(null);
      clearEndWatch();
      endWatchRun.current = 0;
      setHoldReason(null);
      return () => {
        clearCountdown();
        clearCelebration();
        clearResume();
        clearHeadsUp();
        [resultsScale, resultsOpacity, countScale, glow].forEach(cancelAnimation);
      };
    }, [visible, clearCountdown, clearCelebration, clearResume, clearHeadsUp, clearEndWatch, resultsScale, resultsOpacity, countScale, glow]);

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
    // The latest onStart, read when GO lands: a game that re-renders during
    // the count (a new onStart each render) never restarts the 3-2-1.
    const onStartRef = useRef(onStart);
    onStartRef.current = onStart;
    const beginPlay = useCallback(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      playedOnceRef.current = true;
      setPhase('playing');
      onStartRef.current();
    }, []);

    const punchCount = useCallback(() => {
      if (reducedMotionRef.current) { countScale.value = 1; return; }
      countScale.value = withSequence(
        withTiming(1.25, { duration: 100 }),
        withSpring(1, JUICE.popSpring),
      );
    }, [countScale]);

    // The start (core/gameMoments): 3, 2, 1 slam in at 0, 700, 1400 ms, GO bursts at 2100 and play
    // opens on that frame; the GO tail (sparkles, scrim fade) clears by 2700 over live play.
    // w5r3: ONE anchored clock on the UI thread runs the whole start: the demo pill's exit, every number,
    // GO and the tail. Each frame moves it on by that frame's real time, capped at COUNT_MAX_STEP_MS, and
    // each step (its sound, buzz and text, and play itself on GO) fires from the very frame that draws it.
    // A stalled frame clock now slows the count instead of skipping 1 and GO (w5r2 release: 3, 2, then a
    // Burst already 2 s in), and the game's Burst clock starts on GO's own frame.
    const cdClock = useSharedValue(-1);
    const cdT = useSharedValue(-1);
    const cdAts = useSharedValue<number[]>([]);
    const cdNext = useSharedValue(0);
    const cdFrom = useSharedValue(0);
    const cdLive = useSharedValue(false);
    const cdHeld = useSharedValue(0);
    const cdPillExitAt = useSharedValue(NO_PILL_EXIT);
    const cdReduced = useSharedValue(reducedMotion);
    const cdTrace = useSharedValue({ f0: 0, f1: 0, f2: 0, f3: 0, maxDt: 0, goRem: -1 });
    const [countTrace, setCountTraceRaw] = useState<string | null>(null);
    const traceMountAt = useRef(Date.now());
    const traceStageMs = useRef(0);
    const setCountTrace = useCallback((s: string) => setCountTraceRaw(`open to count ${traceStageMs.current}ms, ${s}`), []);
    useEffect(() => { cdReduced.value = reducedMotion; }, [reducedMotion, cdReduced]);
    // w5r2, one callout at a time: a game's picture demo (countdownDemo) plays alone in its pill on the first
    // start, then shrinks away BEFORE the 3 lands (w5r3: no frame shows the pill and a number together); a
    // repeat start never shows it (the kid already knows the game).
    const pillOut = useSharedValue(0);
    const [goTail, setGoTail] = useState(false);
    const walkingRef = useRef(false);
    walkingRef.current = !!linePlayMovement?.moving;
    const fireCountStep = useCallback((step: ReturnType<typeof countSteps>[number]) => {
      setCountText(step.label);
      // Walking in a line drops the buzz one rung (the count still reads with the eyes and ears).
      const walking = walkingRef.current;
      const buzz = walking ? (step.haptic === 'incoming' ? 'tap' : 'tick') : step.haptic;
      playGameHaptic(buzz);
      playGameMoment(step.cue, step.variant, step.sfx);
    }, []);

    // The count reads the latest callbacks through refs, so a game re-rendering during the count
    // (a new onStart each render) never restarts it from 3.
    const beginPlayRef = useRef(beginPlay);
    beginPlayRef.current = beginPlay;
    const fireStepRef = useRef(fireCountStep);
    fireStepRef.current = fireCountStep;
    const countStepsRef = useRef<readonly CountStep[]>([]);
    const hasDemo = !!countdownDemo;
    const hasDemoRef = useRef(hasDemo);
    hasDemoRef.current = hasDemo;
    const [pillGone, setPillGone] = useState(() => hasDemo && countStartsOf(gameId ?? 'game') > 0);
    const [demoRun, setDemoRun] = useState(0);
    // Runs on JS from the frame that drew step i.
    const onCountStep = useCallback((i: number) => {
      const step = countStepsRef.current[i];
      if (!step) return;
      if (i === 0 && hasDemoRef.current) setPillGone(true);
      fireStepRef.current(step);
      if (step.at >= GO_AT_MS) beginPlayRef.current();
    }, []);
    const countFrameRef = useRef<{ setActive: (on: boolean) => void } | null>(null);
    const onCountDone = useCallback(() => {
      countFrameRef.current?.setActive(false);
      setGoTail(false);
    }, []);
    const countFrameFn = useCallback((frame: FrameInfo) => {
      'worklet';
      if (!cdLive.value) return;
      let t = cdT.value;
      // Dev capture only (EXPO_PUBLIC_COUNT_HOLD_MS): the whole start pauses on one pose for a few seconds,
      // so a screenshot shows an exact frame on a loaded machine.
      if (COUNT_HOLD_MS >= 0 && t >= COUNT_HOLD_MS && cdHeld.value < CAPTURE_HOLD_FOR) cdHeld.value = advanceCountClock(cdHeld.value, frame.timeSincePreviousFrame);
      else t = advanceCountClock(t, frame.timeSincePreviousFrame);
      cdT.value = t;
      const exitAt = cdPillExitAt.value;
      if (exitAt > NO_PILL_EXIT) {
        const p = Math.min(1, Math.max(0, (t - exitAt) / COACH_EXIT_MS));
        pillOut.value = cdReduced.value ? (p > 0 ? 1 : 0) : p * p;
      }
      cdClock.value = t >= cdFrom.value && t < COUNT_END_MS ? t : -1;
      if (COUNT_TRACE) {
        const tr = cdTrace.value;
        const ix = countPose(cdClock.value, false, false).index;
        if (ix === 0) tr.f0 += 1; else if (ix === 1) tr.f1 += 1; else if (ix === 2) tr.f2 += 1; else if (ix === 3) tr.f3 += 1;
        const raw = frame.timeSincePreviousFrame ?? 0;
        if (raw > tr.maxDt) tr.maxDt = raw;
        if (ix === 3 && tr.goRem < 0) tr.goRem = remainingMs ? remainingMs.value : -2;
      }
      const ats = cdAts.value;
      const i = cdNext.value;
      // At most one step per frame, so every number and GO is drawn on its own frame.
      if (i < ats.length && t >= ats[i]) {
        cdNext.value = i + 1;
        runOnJS(onCountStep)(i);
      }
      if (t >= COUNT_END_MS && cdNext.value >= ats.length) {
        cdLive.value = false;
        cdClock.value = -1;
        if (COUNT_TRACE) {
          const tr = cdTrace.value;
          runOnJS(setCountTrace)(`frames 3:${tr.f0} 2:${tr.f1} 1:${tr.f2} GO:${tr.f3} maxgap ${Math.round(tr.maxDt)}ms clock@GO ${Math.round(tr.goRem)} @end ${remainingMs ? Math.round(remainingMs.value) : -2}`);
        }
        runOnJS(onCountDone)();
      }
    }, [cdTrace, remainingMs, cdLive, cdT, cdHeld, cdPillExitAt, cdReduced, pillOut, cdClock, cdFrom, cdAts, cdNext, onCountStep, onCountDone]);
    const countFrame = useFrameCallback(countFrameFn, false);
    countFrameRef.current = countFrame;
    // Start the anchored clock `lead` ms before the first step (the demo pill's time, then its exit).
    const startCount = useCallback((steps: readonly CountStep[], lead: number) => {
      if (steps.length === 0) return;
      const from = steps[0].at;
      countStepsRef.current = steps;
      cdAts.value = steps.map((s) => s.at);
      cdNext.value = 0;
      cdFrom.value = from;
      cdHeld.value = 0;
      cdPillExitAt.value = lead > 0 ? from - COACH_EXIT_MS : NO_PILL_EXIT;
      cdT.value = from - lead;
      cdClock.value = -1;
      if (COUNT_TRACE) {
        cdTrace.value = { f0: 0, f1: 0, f2: 0, f3: 0, maxDt: 0, goRem: -1 };
        traceStageMs.current = Date.now() - traceMountAt.current;
      }
      cdLive.value = true;
      setGoTail(true);
      countFrame.setActive(true);
      // Safety only: if the UI thread never ticks (it always does in the foreground), JS opens play.
      const expected = lead + (steps[steps.length - 1].at - from);
      countdownTimers.current.push(setTimeout(() => {
        if (startedRef.current) return;
        cdLive.value = false;
        countFrame.setActive(false);
        cdClock.value = -1;
        setGoTail(false);
        const last = steps[steps.length - 1];
        fireStepRef.current(last);
        beginPlayRef.current();
      }, expected * 3 + COUNT_WATCHDOG_MS));
    }, [cdAts, cdNext, cdFrom, cdHeld, cdPillExitAt, cdT, cdClock, cdLive, countFrame]);
    // Stop the start where it is (a hold, a close): nothing keeps ticking.
    const stopCountStage = useCallback(() => {
      cdLive.value = false;
      countFrame.setActive(false);
      cdClock.value = -1;
      setGoTail(false);
    }, [cdLive, countFrame, cdClock]);

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
      // The demo pill plays alone for COACH_LEAD_MS, then shrinks away over COACH_EXIT_MS, then the 3 lands.
      const lead = hasDemoRef.current && !quick ? COACH_LEAD_MS + COACH_EXIT_MS : 0;
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
        raf2 = nextFrame(() => startCount(steps, lead));
      });
      return () => {
        cancelFrame(raf1);
        cancelFrame(raf2);
        clearCountdown();
        // Play opened on GO: the GO tail keeps running on its own clock over live play.
        if (!startedRef.current) stopCountStage();
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
      if (result || rescue) {
        hadResultRef.current = true;
        return;
      }
      if (!visible || !hadResultRef.current || phase !== 'results' || wrap) return;
      hadResultRef.current = false;
      endWatchRun.current = 0;
      startedRef.current = false;
      claimedRef.current = false;
      clearCelebration();
      setCountText(firstCount);
      setPhase('countdown');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, rescue, phase, wrap, visible]);

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
        // Any line ending (ride's up, left the line), even at 0 points.
        wrapped: wrap != null || effectiveResult.meta?.wrapUp != null,
      });
      // A game that already played its own finish cue (Rhythm's drum roll)
      // keeps it: the shell adds only the haptic, never a second sound.
      const ownSfx = effectiveResult.meta?.ownFinishSfx === true;
      if (feel === 'win' || feel === 'best') {
        Haptic.success();
        if (!ownSfx) playSfx('win');
      } else if (feel === 'try') {
        // A plain 0-star finish is a "go again", never a punishment: one soft
        // bump and a light swish as the card arrives (no fail buzz, no nope).
        Haptic.softBump();
        if (!ownSfx) playSfx('fx.whoosh', 0.6);
      } else {
        // Calm send-off: a soft tap and a small happy chime, never the lose sound.
        Haptic.hitSoft();
        if (!ownSfx) playSfx('ui.confirm', 0.7);
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
      if (effectiveResult.stars > 0 && !reducedMotionRef.current && !ownCelebrationRef.current) {
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
        resultsSafeRef.current = false;
        return undefined;
      }
      // Reduced motion has no fade to wait for: the results are safe at once.
      if (reducedMotionRef.current) {
        setResultsSafe(true);
        if (endWatchRun.current) {
          const by = effectiveResultRef.current?.meta?.endWatch;
          traceLit(endWatchRun.current, Date.now(), by === 'shared' ? 'shared' : by === 'game' ? 'rescue' : 'game');
        }
        return undefined;
      }
      // The results view that was on screen when the fade started.
      const surfaceAtFade = surfaceShownRef.current;
      const t = setTimeout(() => {
        // The fade finished on a view that was already mounted: the card is
        // solid, so skip the extra re-render of the whole results tree.
        resultsSafeRef.current = true;
        if (endWatchRun.current) {
          const by = effectiveResultRef.current?.meta?.endWatch;
          traceLit(endWatchRun.current, Date.now(), by === 'shared' ? 'shared' : by === 'game' ? 'rescue' : 'game');
        }
        if (surfaceAtFade && surfaceShownRef.current && resultsOpacity.value >= 0.999 && resultsScale.value > 0.98) return;
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

    // Ride challenge loss (core loop 5.3, one loss card): no game card. The run is handed to the
    // challenge's own loss card (rideTry.ts: "8 of 13 bonks", "1 of 3 right") and play moves on.
    const rideLoss = !!rideChallenge && phase === 'results' && !!effectiveResult && effectiveResult.stars <= 0 && !wrap;
    useEffect(() => {
      if (!rideLoss) return;
      noteRideTry(effectiveResult);
      handleClaimRef.current?.();
    }, [rideLoss, effectiveResult]);

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

    const ownResultsDoneRef = useRef(ownResultsDone);
    ownResultsDoneRef.current = ownResultsDone;
    const doHold = useCallback(
      (reason: HoldReason, label?: string) => {
        if (phase !== 'playing' && phase !== 'countdown' && phase !== 'resuming') return;
        // A finished game never pauses behind its card: its own card in the field, or a
        // run that is over and waiting for its results (the end watch is armed).
        if (ownResultsDoneRef.current || endWatchRun.current) return;
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
        endWatch: armEndWatch,
      }),
      [doHold, doResume, wrapUp, phase, armEndWatch],
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
      clearEndWatch();
      endWatchRun.current = 0;
      setRescue(null);
      onRematch();
    } : undefined), [onRematch, effectiveResult, linePlayMovement, clearEndWatch]);

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

    // A paid ride try's X asks Leave? straight away (one step): the pause card, with its "saved"
    // line, stays hidden while that question is up.
    const [quitAsked, setQuitAsked] = useState(false);
    const resumeAfterQuitCancel = useCallback(() => {
      setQuitAsked(false);
      setPhase(startedRef.current ? 'playing' : 'countdown');
      if (!startedRef.current) setCountText(firstCount);
      setPauseReason(undefined);
      setHoldReason(null);
      if (startedRef.current) onResume?.();
    }, [onResume]);

    const requestQuit = useCallback(() => {
      if (onQuit) { setQuitAsked(true); onQuit(resumeAfterQuitCancel); }
      else onClose();
    }, [onQuit, onClose, resumeAfterQuitCancel]);

    const handleExit = useCallback(() => {
      // The game's own results card is up: the X is that card's DONE.
      if (ownResultsDoneRef.current) { ownResultsDoneRef.current(); return; }
      if (phase === 'playing' || phase === 'resuming') {
        doHold('manual');
        // A paid ride try has no pause to come back to later: the X asks Leave? at once.
        if (rideChallenge && onQuit) requestQuit();
      } else if (phase === 'results') handleClaim();
      else {
        if (phase === 'countdown') doHold('manual');
        requestQuit();
      }
    }, [phase, doHold, handleClaim, requestQuit, rideChallenge, onQuit]);

    // Tap anywhere skips straight to GO (the burst still plays over live play).
    const skipCountdown = useCallback(() => {
      if (phase !== 'countdown') return;
      clearCountdown();
      const steps = countSteps(countdownStyle === 'none' ? 'go' : countdownStyle);
      const go = steps[steps.length - 1];
      // Straight to GO on the same anchored clock: the next frame draws GO, fires its cue and opens play.
      if (hasDemoRef.current) { cancelAnimation(pillOut); pillOut.value = 1; setPillGone(true); }
      startCount([go], 0);
    }, [phase, clearCountdown, countdownStyle, startCount, pillOut]);

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
    // animated one (first-session's fix): a 0 -> 1 jump that lands between the
    // card's first frame and the style's UI-thread hookup was never applied,
    // and the card stayed at opacity 0 over a cleared board.
    const resultsFadeStyle = useAnimatedStyle(() => ({ opacity: resultsOpacity.value }));
    const resultsScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: resultsScale.value }] }));
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

    // One button rule for every results card: PLAY AGAIN is the big button,
    // unless a win's reward is still waiting and a replay would skip it.
    // A pass-and-play group turn is one try per kid: DONE is the only button.
    const turnOnly = linePlayMovement?.turnOnly === true;
    const rematchOffered = !rideChallenge && !wrap && !turnOnly && !!rematchRun;
    const challengeOffered = !rideChallenge && !wrap && !turnOnly ? onChallenge : undefined;
    const playAgainFirst = rematchOffered && (!won || canBankRun);
    const saved = effectiveResult?.meta?.partial === true;
    // One exit word on every results card: DONE, and CONTINUE only when a
    // reward is still to collect (a won ride coin, or a win the line has not
    // banked yet).
    const claimLabel = won && (rideChallenge || !canBankRun) ? 'CONTINUE' : 'DONE';

    // A game-owned results surface, when the game has one and it rendered.
    // Nothing rendered by the time the fallback fires: the shared card shows.
    // Memoized: shell-only re-renders (the fade's safety net, heads-up flags)
    // never rebuild the game's results tree; a game re-render passes a new
    // renderResults and rebuilds it.
    const wrapReason = wrap?.reason ?? null;
    const ownSurface = useMemo(() => (phase === 'results' && renderResults && effectiveResult ? renderResults({
      result: effectiveResult,
      stars,
      won,
      wrapReason,
      claim: handleClaim,
      rematch: rematchOffered ? rematchRun : undefined,
      challenge: challengeOffered,
      playAgainFirst,
      claimLabel,
      saved,
      reducedMotion,
    }) : null), [phase, renderResults, effectiveResult, stars, won, wrapReason, handleClaim, rematchOffered, rematchRun, challengeOffered, playAgainFirst, claimLabel, saved, reducedMotion]);
    const gameResults = rideLoss || isEmptyResultsNode(ownSurface) ? null : ownSurface;
    // A wrap-up (ride's up) has no game surface to wait for: the shared card shows at once.
    const showSharedCard = !rideLoss && phase === 'results' && (!renderResults || !effectiveResult || (gameResults == null && (resultsSafe || resultsSafeRef.current || wrap != null)));
    sharedCardShownRef.current = showSharedCard;
    surfaceShownRef.current = gameResults != null || showSharedCard;

    if (!visible) return null;

    // The HUD steps back behind any results card: the shell's own, or one the game draws itself.
    const hudBack = phase === 'results' || !!ownResultsDone;
    // On a short phone (iPhone SE) the shared card's ribbon reaches the
    // header: the X would sit half under the ribbon's left tail. DONE is
    // inside the card there, so the X steps out entirely (no half-covered
    // button), and the card is the only way on.
    const xGone = showSharedCard && SCREEN_H < SHORT_PHONE_PT;

    const gameContent = (
        <View style={styles.root}>
          {/* Header */}
          {/* While results are up the card is the only thing to read: the
              game's title and score step back and the close X dims (it still
              works, a safe way out if a card ever stalls). */}
          <View style={styles.header}>
            <TouchableOpacity
              style={[styles.iconBtn, hudBack && styles.headerDim, xGone && styles.headerGone]}
              onPress={handleExit}
              disabled={xGone}
              importantForAccessibility={xGone ? 'no-hide-descendants' : 'auto'}
              accessibilityElementsHidden={xGone}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={phase === 'playing' && !hudBack ? 'Pause' : 'Close'}
            >
              <GameIcon name={phase === 'playing' && !hudBack ? 'pause' : 'close'} size={26} />
            </TouchableOpacity>
            <View style={[styles.headerCenter, hudBack && styles.headerHidden]} importantForAccessibility={hudBack ? 'no-hide-descendants' : 'auto'}>
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
              <View style={[styles.headerScore, hudBack && styles.headerHidden]} importantForAccessibility={hudBack ? 'no-hide-descendants' : 'auto'}>
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

          {COUNT_TRACE && countTrace ? <Text style={styles.countTrace}>{countTrace}</Text> : null}
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
                {countdownDemo ? <React.Fragment key={demoRun}>{countdownDemo}</React.Fragment> : (objective && !playedOnceRef.current ? <Text style={styles.cdPillText} numberOfLines={2}>{objective}</Text> : null)}
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
          ) : phase === 'paused' && !quitAsked ? (
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
              net (opacity only); the settle spring keeps its own scale. The scrim
              fades in with the card (w5r2: never a navy board with no card). */}
          {gameResults != null ? (
            <View style={[styles.overlay, styles.scrimNone]} pointerEvents="box-none">
              <Animated.View pointerEvents="none" style={[styles.scrimFill, resultsScrim === 'light' ? styles.scrimLight : resultsScrim === 'none' ? styles.scrimNone : null,
                resultsSafe || reducedMotion ? null : resultsScrimStyle]} />
              <Animated.View style={[styles.resultsFill, resultsSafe || reducedMotion ? styles.resultsShown : resultsFadeStyle]}>
                <Animated.View style={[styles.resultsFill, reducedMotion ? styles.resultsStill : resultsScaleStyle]}>
                  {gameResults}
                </Animated.View>
              </Animated.View>
            </View>
          ) : null}
          {showSharedCard ? (
            // One results language on every game: the scene (the shark on its
            // podium for a star or a new best) stands on the card, the card
            // sits at the bottom with its buttons inside, like Sharky, the
            // Duel and the Boss.
            <View style={[styles.overlay, styles.sharedStage]} pointerEvents="box-none">
              <ResultsPodium cheer={stars > 0 || (!saved && compareBest(effectiveResult?.score ?? score, personalBest).isNewBest)} reducedMotion={reducedMotion}
                onPeek={setPeekK} />
              <Animated.View style={[{ width: '90%' }, resultsSafe || reducedMotion ? styles.resultsShown : resultsFadeStyle]}>
                <Animated.View style={reducedMotion ? styles.resultsStill : resultsScaleStyle}>
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
                    spokenNote={wrap ? undefined : effectiveResult?.spokenNote}
                    footer={resultCardFooter}
                    onNewBestLanded={stars === 0 ? burstBest : undefined}
                    wrapUp={wrap != null}
                    wrapReason={wrap?.reason ?? null}
                    reducedMotion={reducedMotion}
                    peek={peekK}
                    extras={resultExtras ?? resultsExtra ?? undefined}
                    extrasBeat={resultExtrasBeat}
                  >
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
                            <GameIcon name="rush" size={20} />
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
                  </ResultsCard>
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
          {/* The grown-up gate for a results Share or link: inside this modal, so it shows on top. */}
          {visible && <GrownUpGateSlot />}
        </View>
    );
    return rideChallenge ? gameContent : (
      <Modal visible={visible} animationType={reducedMotion ? 'none' : 'fade'} transparent statusBarTranslucent onRequestClose={handleExit}>
        {shellFrame ? (
          // Capture only: the shell at a smaller phone's exact size.
          <View style={styles.frameBackdrop}>
            <View style={{ width: shellFrame.width, height: shellFrame.height }}>{gameContent}</View>
          </View>
        ) : gameContent}
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
  headerDim: { opacity: 0.45 },
  headerHidden: { opacity: 0 },
  frameBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#05346e' },
  resultsShown: { opacity: 1 },
  countTrace: { position: 'absolute', left: 4, right: 4, bottom: 4, fontSize: 11, color: '#05346e', backgroundColor: 'rgba(255,255,255,0.85)' },
  resultsStill: { opacity: 1, transform: [{ scale: 1 }] },
  headerGone: { opacity: 0 },
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
  scrimFill: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,56,128,0.45)' },
  scrimLight: { backgroundColor: 'rgba(255,255,255,0.3)' },
  // The shared card stands at the bottom with the scene above it.
  sharedStage: { justifyContent: 'flex-end', paddingTop: (initialWindowMetrics?.insets.top ?? 20) + 56,
    paddingBottom: Math.max(10, initialWindowMetrics?.insets.bottom ?? 0) + 6 },
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
