/**
 * Trivia Duel (Trivia+ merged with Shark Showdown), design
 * studio/design/trivia.md revision 7.
 *
 * A bright boardwalk game show you play one-thumbed while the line moves.
 * Race Captain Fin (or a recorded crew ghost) to the right answer. Answers
 * stay face-down until unlock, a ring of 24 marquee bulbs burns out as your
 * points drain, the bell lets you bet you know it before you see the
 * choices, and the Final is a wager.
 *
 * The whole rulebook:
 *  1. Faster lock, more points. Watch the bulbs.
 *  2. Right answers in a row multiply your points. Three in a row gives you a Shield.
 *  3. Chomp clears 2 wrong answers, but caps your speed bonus.
 *  4. Buzz to see the answers first. Miss and you lose 100, and they get to steal.
 *  5. In the Final, whoever is behind picks the topic, then everyone bets.
 *
 * Clocks: the question clock lives on the UI thread (useGameClock onFrame):
 * read-lock, unlock, the window, Fin's calibrated lock and buzz, the fuse
 * and the last-3-seconds heartbeat all fire from sim time, so a HOLD stops
 * them exactly. Taps are judged in the gesture worklet against the same
 * elapsed value the drum shows: locking on any frame scores what that frame
 * showed. FX run on the fx clock (hit-stop), sprite motion on the 12fps
 * twos grid.
 *
 * QUEUE REALITY: movement never pauses anything. Only a HOLD (pause button,
 * app background, call) stops the clock; the board flips face-down, and on
 * resume a quick 3-2-1 continues the same question with its remaining time.
 * A HOLD after unlock forfeits that question's speed bonus; graded modes
 * credit at most 6s per question. Every flow timer parks during a HOLD.
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing, runOnJS, runOnUI, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GameShellV2, type GameResult, type GameShellV2Handle } from '../../gamekit/GameShellV2';
import { COUNTDOWN } from '../../gamekit/theme';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import { useGameClock } from '../../gamekit/useGameClock';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { useCamera } from '../../gamekit/fx/useCamera';
import { CAMERA_PRESETS } from '../../gamekit/core/camera';
import { useGameMusic } from '../../gamekit/audio/useGameMusic';
import { useMusicBeat } from '../../gamekit/audio/useMusicBeat';
import { Haptic, configureHaptics, playHaptic } from '../../gamekit/Haptics';
import { mixSeed } from '../../gamekit/core/rng';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { AuthContext } from '../../context/AuthProvider';
import {
  BUZZ, CATEGORY_PICK, CEREMONY, FIN_RANKS, FIN_RANK_ORDER, FIN_RESOLVE_AFTER_MS, HOLD, POINTS, READ_LOCK, RIDE_QUESTIONS, UNLOCK_GUARD_MS, WAGER,
  type DuelMode, type FinRank, type SpeedTier,
} from './engine/config';
import { factKeysOf, type PoolQuestion } from './engine/content';
import { applyMatchToRank, pickBark, BARKS } from './engine/finAI';
import {
  createTally, finalPicker, finBellAnswerMs, finCategoryPick, finInput, ghostInput, makeGhost, NO_INPUT, planFromIds, planMatch, resolveRound,
  suddenDeathRound,
  type GhostRecord, type MatchPlan, type MatchTally, type PlannedRound, type RoundResult, type SideInput,
} from './engine/match';
import { nearMiss, rideNearMiss } from './engine/nearMiss';
import {
  bellValue, duelStars, flameTier, rideStars, rideWon, speedPoints, streakMult, suggestWager, wagerStakes,
} from './engine/scoring';
import { ART, C, FIN_POSE_ORDER, type FinPose, type SharkLook } from './art';
import {
  BEDS, CUE, babbleSchedule, babbleSyllable, bed, beatMs, duckForReveal, msToGrid, muffle, registerDuelAudio, resetFreeBeat, setDuelKey, sfx, sfxKey,
  type BabbleVoice,
} from './audio';
import { loadPool } from './pool';
import {
  activeCarry, addFactCards, currentRank, listGhosts, loadMemory, memorySync, recordCategory, rememberSeen, saveGhost, updateMemory, type FactCard,
} from './store';
import { Stage, type StageActors } from './ui/Stage';
import { Rail, type PipState } from './ui/Rail';
import { BOARD_H, QuestionCard, ROPE_H } from './ui/Card';
import { TILE_COMPACT_CHARS, Tile, type TileState } from './ui/Tile';
import { Bark, BuzzBell, CategoryPick, ClosestSlider, LifelineButton, OutlinedText, Stamp, VsIntro, WagerChips, type StampSpec } from './ui/Overlays';
import { DuelResults, type ResultsModel } from './ui/DuelResults';
import { DeskFront } from './ui/DeskFront';
import { RideCoinCrate } from './ui/RideCoinCrate';

// -- Question clock (UI thread) ------------------------------------------------------

const GUARD_MS: number = UNLOCK_GUARD_MS;
const PH_IDLE = 0;
const PH_READ = 1;
const PH_LIVE = 2;
const PH_LOCKED = 3;
const PH_SUB = 5;
const PH_WAIT = 8;

const K_QUICK = 0;
const K_RIDE = 1;
const K_BELL = 2;

const EV_UNLOCK = 1;
const EV_FIN = 2;
const EV_BEAT = 3;
const EV_TIMEOUT = 4;
const EV_EARLY = 5;
const EV_LOCK = 6;
const EV_FIN_BUZZ = 7;
const EV_BUZZ = 8;
const EV_SUB_LOCK = 9;
const EV_SUB_TIMEOUT = 10;
const EV_URGENT = 11;

/** Worklet copies (worklets capture module values, not imported bindings). */
const W_BELL_G = 400;
const W_BELL_H = 5000;
const W_RIDE_SPEED = 150;

interface QClock {
  phase: number;
  t: number;
  unlockAt: number;
  windowMs: number;
  finMs: number;
  finFired: number;
  finBuzzMs: number;
  finBuzzFired: number;
  sub: number;
  subLimit: number;
  g: number;
  h: number;
  kind: number;
  /** Streak multiplier the next right answer would carry (drum value). */
  mult: number;
  chomp: number;
  forfeit: number;
  removed: number;
  lastSim: number;
  urgent: number;
  lastBeat: number;
}

function freshClock(): QClock {
  return { phase: PH_IDLE, t: 0, unlockAt: 0, windowMs: 1, finMs: -1, finFired: 0, finBuzzMs: -1, finBuzzFired: 0, sub: 0, subLimit: 1, g: 400, h: 6000, kind: 0, mult: 1, chomp: 0, forfeit: 0, removed: 0, lastSim: -1, urgent: 0, lastBeat: -1 };
}

type SubMode = 'buzzAnswer' | 'steal' | 'open' | null;
type Phase = 'loading' | 'intro' | 'question' | 'finalIntro' | 'category' | 'wager' | 'reveal' | 'between' | 'crate' | 'results';
type Framing = 'wide' | 'two' | 'singleMe' | 'singleOpp';

export interface TriviaDuelProps {
  visible: boolean;
  mode: DuelMode;
  seed: number;
  title?: string;
  subtitle?: string;
  rideId?: number;
  parkId?: number;
  chapterId?: string;
  /** Kept for call-site compatibility; ride names never render in Trivia Duel UI (rev 7, S0-2). */
  rideName?: string;
  /** The app's coin art for this ride (the same image as the coin counter); fallback Alex's coin. */
  coinImage?: ImageSourcePropType | string | null;
  /** Pre-loaded authored pool (tests / previews); loaded from LinePlay content otherwise. */
  pool?: PoolQuestion[];
  ghost?: GhostRecord | null;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

const { width: SW } = Dimensions.get('window');
const AUTOPLAY = __DEV__ && process.env.EXPO_PUBLIC_TRIVIA_AUTOPLAY === '1';
const TIER_TEXT: Record<SpeedTier, string> = { lightning: 'LIGHTNING!', great: 'GREAT', nice: 'NICE', none: '' };
const TIER_COLOR: Record<SpeedTier, string> = { lightning: '#fff3b0', great: C.gold, nice: C.blue, none: C.cream };
/** 11.6 stamp widths (share of screen width): tier stamps 38-45%, event stamps 55-70%. */
const TIER_WIDTH: Record<SpeedTier, number> = { lightning: 0.45, great: 0.42, nice: 0.38, none: 0.3 };
const TIER_SPARKS: Record<SpeedTier, number> = { lightning: 14, great: 10, nice: 6, none: 4 };
const ROUND_NAMES = { quick: 'QUICK DRAW', buzz: 'BUZZ BELL', final: "FIN'S FINAL" } as const;
const VOICE: Record<FinRank, BabbleVoice> = { deckhand: 'deckhand', firstmate: 'first_mate', captain: 'captain', admiral: 'admiral' };
const MAX_FLASHES = 2;

/** Stamp font size that makes `text` span `share` of the screen width (Shark font ~0.62em per glyph). */
function stampSize(text: string, share: number, w: number): number {
  return Math.max(22, Math.min(64, Math.round((share * w) / (0.62 * Math.max(3, text.length)))));
}

export function TriviaDuel(props: TriviaDuelProps) {
  const { visible, mode, seed: baseSeed, title, subtitle, rideId, parkId, chapterId, onComplete, onClose, onQuit } = props;
  const reducedMotion = useReducedGameMotion();
  const movement = useContext(LinePlayMovementContext);
  const auth = useContext(AuthContext) as { player?: { username?: string } } | null;
  const myName = (auth?.player?.username ?? 'You').slice(0, 12);
  const isRide = mode === 'ride';
  const shell = useRef<GameShellV2Handle>(null);
  const fx = useRef<FxStageHandle>(null);
  const backFx = useRef<FxStageHandle>(null);
  const coinSrc: ImageSourcePropType | null = typeof props.coinImage === 'string' ? { uri: props.coinImage } : (props.coinImage ?? null);

  registerDuelAudio();
  useEffect(() => { configureHaptics('trivia'); }, []);

  // -- Layout (3: 390 x 844 reference; answers in the bottom 45%) ------------------------
  const [field, setField] = useState({ w: SW, h: 700 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - field.w) > 1 || Math.abs(height - field.h) > 1) setField({ w: width, h: height });
  }, [field]);
  const W = field.w;
  const H = field.h;
  const RAIL_H = 84;
  const ZONE_H = 232;
  const ZONE_TOP = H - ZONE_H - 12;
  const DESK_TOP = ZONE_TOP - 30;
  const BOARD_W = Math.min(W - 20, 380);
  const BOARD_TOP = DESK_TOP - (BOARD_H + ROPE_H) + 4;
  const STAGE_TOP = RAIL_H - 6;
  const STAGE_BAND = Math.max(130, BOARD_TOP + ROPE_H * 0.5 - STAGE_TOP);
  const STAGE_FULL = H - STAGE_TOP;
  const RESULTS_H = Math.round(H * 0.5);
  // Takeover: the scene drops just enough that the podiums sit above the half-height results card.
  const DROP_PX = Math.max(0, Math.min(STAGE_FULL - STAGE_BAND, (H - RESULTS_H - 28) - (STAGE_TOP + STAGE_BAND * 0.7)));
  const railScore = { x: 92, y: 46 };

  // -- Match state ------------------------------------------------------------------
  const [phase, setPhase] = useState<Phase>('loading');
  const [plan, setPlan] = useState<MatchPlan | null>(null);
  const [roundIdx, setRoundIdx] = useState(0);
  const [round, setRound] = useState<PlannedRound | null>(null);
  const [tiles, setTiles] = useState<TileState[]>([]);
  const [tense, setTense] = useState(false);
  const [heads, setHeads] = useState<SharkLook[][]>([]);
  const [shares, setShares] = useState<number[] | null>(null);
  const [chomped, setChomped] = useState<number[]>([]);
  const [wiggle, setWiggle] = useState<number[]>([0, 0, 0, 0]);
  const [pips, setPips] = useState<PipState[]>([]);
  const [scores, setScores] = useState({ me: 0, opp: 0 });
  const [streakView, setStreakView] = useState({ streak: 0, shield: false });
  const [chompHeld, setChompHeld] = useState(false);
  const [usedThisQ, setUsedThisQ] = useState(false);
  const [locks, setLocks] = useState<{ me: string | null; opp: string | null }>({ me: null, opp: null });
  const [stakes, setStakes] = useState<{ me: string | null; opp: string | null }>({ me: null, opp: null });
  const [stamps, setStamps] = useState<StampSpec[]>([]);
  const [bark, setBark] = useState<{ text: string | null; key: number }>({ text: null, key: 0 });
  const [subMode, setSubMode] = useState<SubMode>(null);
  const [bellOn, setBellOn] = useState(false);
  const [bellKey, setBellKey] = useState(0);
  const [chip, setChip] = useState<string | null>(null);
  const [wager, setWager] = useState<{ stakes: number[]; picked: number; suggested: number; reason: string; ifRight: number[]; left: number } | null>(null);
  const [relaxed, setRelaxed] = useState(false);
  useEffect(() => { void loadMemory().then((m) => setRelaxed(!!m.relaxed)); }, []);
  const toggleRelaxed = useCallback(() => {
    setRelaxed((v) => {
      void updateMemory((m) => { m.relaxed = !v; });
      return !v;
    });
    Haptic.tapLight();
  }, []);
  const [catPick, setCatPick] = useState<{ cats: [string, string]; picker: 'me' | 'opp'; left: number; picked: number } | null>(null);
  const catDone = useRef<((i: number) => void) | null>(null);
  const [sliderVal, setSliderVal] = useState(0);
  const [narrow, setNarrow] = useState<[number, number] | null>(null);
  const [held, setHeld] = useState(false);
  const [results, setResults] = useState<ResultsModel | null>(null);
  const [shellResult, setShellResult] = useState<GameResult | null>(null);
  const [crate, setCrate] = useState<{ stars: number; key: number } | null>(null);
  const [vs, setVs] = useState<{ ms: number } | null>(null);
  const [dropKey, setDropKey] = useState(0);
  const [musicBed, setMusicBed] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [ghost, setGhost] = useState<GhostRecord | null>(props.ghost ?? null);
  const [features, setFeatures] = useState({ chomp: true, bell: true, shield: true, final: true });

  // Flow functions are called from timers and UI-thread events: always go through the latest render.
  const F = useRef<Record<string, (...args: any[]) => any>>({});
  const tally = useRef<MatchTally>(createTally());
  const resultsLog = useRef<RoundResult[]>([]);
  const oppIn = useRef<SideInput>({ ...NO_INPUT });
  const meIn = useRef<SideInput>({ ...NO_INPUT });
  const resolved = useRef({ me: false, opp: false, revealing: false });
  /**
   * Flow timers are HOLD-aware: a HOLD (pause button, app backgrounded) parks
   * every pending beat with its remaining time, so nothing resolves, reveals
   * or advances while the phone is in a pocket.
   */
  const timers = useRef<{ fn: () => void; left: number; at: number; h: ReturnType<typeof setTimeout> | null }[]>([]);
  const timersHeld = useRef(false);
  const poolRef = useRef<PoolQuestion[]>([]);
  const playsRef = useRef(0);
  const startedAt = useRef(0);
  const holdStart = useRef(0);
  const stampKey = useRef(0);
  const barkN = useRef(0);
  const nextTap = useRef<(() => void) | null>(null);
  const factsRef = useRef<FactCard[]>([]);
  const finalWager = useRef(0);
  const seedRef = useRef(baseSeed >>> 0);
  const rankRef = useRef<FinRank>('deckhand');
  const flashes = useRef(0);
  const wagerOpen = useRef(false);
  const lastCut = useRef(0);
  const decisiveDone = useRef(false);

  const opponentLook: SharkLook | 'fin' = ghost ? ((ghost.look as SharkLook) || 'blue') : 'fin';
  const oppName = ghost ? ghost.name : 'Fin';
  // Only the ride challenge is graded today (local queue duels have no server window yet): a pocketed phone never burns a queue question.
  const graded = mode === 'ride';

  const armTimer = useCallback((t: { fn: () => void; left: number; at: number; h: ReturnType<typeof setTimeout> | null }) => {
    t.at = Date.now();
    t.h = setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== t);
      t.fn();
    }, Math.max(0, t.left));
  }, []);
  const later = useCallback((ms: number, fn: () => void) => {
    const t = { fn, left: ms, at: Date.now(), h: null as ReturnType<typeof setTimeout> | null };
    timers.current.push(t);
    if (!timersHeld.current) armTimer(t);
  }, [armTimer]);
  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => { if (t.h) clearTimeout(t.h); });
    timers.current = [];
  }, []);
  const holdTimers = useCallback((on: boolean) => {
    if (on === timersHeld.current) return;
    timersHeld.current = on;
    const now = Date.now();
    timers.current.forEach((t) => {
      if (on) {
        if (t.h) clearTimeout(t.h);
        t.h = null;
        t.left = Math.max(0, t.left - (now - t.at));
      } else armTimer(t);
    });
  }, [armTimer]);
  useEffect(() => clearTimers, [clearTimers]);

  // -- Stage actors -------------------------------------------------------------------
  const finPose = useSharedValue(0);
  const finSX = useSharedValue(1);
  const finSY = useSharedValue(1);
  const finY = useSharedValue(0);
  const finRot = useSharedValue(0);
  const hatRot = useSharedValue(0);
  const hatY = useSharedValue(0);
  const meSX = useSharedValue(1);
  const meSY = useSharedValue(1);
  const meY = useSharedValue(0);
  const meRot = useSharedValue(0);
  const shades = useSharedValue(0);
  const cheer = useSharedValue(0);
  const crowdLean = useSharedValue(0);
  const sunburst = useSharedValue(0.35);
  const bulbFast = useSharedValue(0);
  const heat = useSharedValue(0);
  const urgency = useSharedValue(0);
  const spot = useSharedValue(0);
  const push = useSharedValue(1);
  const pushX = useSharedValue(0);
  const stageT = useSharedValue(0);
  const podMe = useSharedValue(0);
  const podOpp = useSharedValue(0);
  const takeover = useSharedValue(0);
  const retract = useSharedValue(0);
  const crown = useSharedValue(0);
  useEffect(() => {
    const target = streakView.streak >= 5 ? 2 : streakView.streak >= 3 ? 1 : 0;
    heat.value = reducedMotion ? target : withTiming(target, { duration: 300 });
  }, [streakView.streak, heat, reducedMotion]);
  const music = useMusicBeat(visible);
  const actors: StageActors = useMemo(() => ({
    finPose, finSX, finSY, finY, finRot, hatRot, hatY, meSX, meSY, meY, meRot, shades, cheer, crowdLean, sunburst,
    beat: music.beat, bulbFast, spot, push, pushX, t: stageT, podMe, podOpp, heat, urgency, takeover, crown,
  }), [heat, urgency, finPose, finSX, finSY, finY, finRot, hatRot, hatY, meSX, meSY, meY, meRot, shades, cheer, crowdLean, sunburst, music.beat, bulbFast, spot, push, pushX, stageT, podMe, podOpp, takeover, crown]);
  const baseFinPose = useRef<FinPose>('idle');
  const talking = useRef(false);

  /**
   * Fin pose change on the twos grid (7.3): anticipation squash 0.94 x 1.06
   * for one frame, hard cut, overshoot 1.05 x 0.96 for one frame, settle on
   * a spring. No crossfades.
   */
  const setFin = useCallback((pose: FinPose, squash = true) => {
    baseFinPose.current = pose;
    const idx = FIN_POSE_ORDER.indexOf(pose);
    if (!squash || reducedMotion) { finPose.value = idx; return; }
    const fr = 83;
    finSX.value = withSequence(withTiming(0.94, { duration: 1 }), withDelay(fr, withTiming(1.05, { duration: 1 })), withDelay(fr, withSpring(1, { damping: 9, stiffness: 320 })));
    finSY.value = withSequence(withTiming(1.06, { duration: 1 }), withDelay(fr, withTiming(0.96, { duration: 1 })), withDelay(fr, withSpring(1, { damping: 9, stiffness: 320 })));
    hatRot.value = withSequence(withTiming(-7, { duration: 90 }), withSpring(0, { damping: 8, stiffness: 180 }));
    later(fr, () => { finPose.value = idx; });
  }, [finPose, finSX, finSY, hatRot, later, reducedMotion]);

  const finHop = useCallback((n = 1, amp = 1) => {
    if (reducedMotion) return;
    const hop = withSequence(withTiming(-14 * amp, { duration: 140, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 120, easing: Easing.in(Easing.quad) }));
    finY.value = n === 1 ? hop : withRepeat(hop, n);
    hatY.value = withSequence(withDelay(40, withTiming(-6 * amp, { duration: 120 })), withSpring(0, { damping: 6, stiffness: 180 }));
    hatRot.value = withSequence(withTiming(6, { duration: 140 }), withSpring(0, { damping: 6, stiffness: 180 }));
  }, [finY, hatY, hatRot, reducedMotion]);

  // Blink every 2.5-5s (1 frame) and idle fidgets on a seeded path that never reads his pick or lock time (no tells, 7.3).
  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    let n = 0;
    const blink = () => {
      if (!alive) return;
      const base = baseFinPose.current;
      if ((base === 'idle' || base === 'think') && !talking.current) {
        finPose.value = FIN_POSE_ORDER.indexOf(`${base}_blink` as FinPose);
        setTimeout(() => { if (alive && !talking.current) finPose.value = FIN_POSE_ORDER.indexOf(baseFinPose.current); }, 83);
      }
      n += 1;
      // Hat tip every few blinks, timed only by its own seeded counter.
      if (n % 3 === 0 && !reducedMotion && urgency.value === 0) hatRot.value = withSequence(withTiming(-9, { duration: 120 }), withSpring(0, { damping: 6, stiffness: 180 }));
      setTimeout(blink, 2500 + ((mixSeed(seedRef.current, n) % 2500)));
    };
    const t = setTimeout(blink, 2000);
    return () => { alive = false; clearTimeout(t); };
  }, [visible, finPose, hatRot, urgency, reducedMotion]);

  // Talk cells at 12fps (on twos) while he speaks.
  const talkTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTalk = useCallback((on: boolean) => {
    talking.current = on;
    if (talkTimer.current) clearInterval(talkTimer.current);
    talkTimer.current = null;
    const base = baseFinPose.current;
    if (!on || (base !== 'idle' && base !== 'think')) {
      finPose.value = FIN_POSE_ORDER.indexOf(baseFinPose.current);
      return;
    }
    let open = false;
    talkTimer.current = setInterval(() => {
      open = !open;
      finPose.value = FIN_POSE_ORDER.indexOf((open ? `${baseFinPose.current}_talk` : baseFinPose.current) as FinPose);
    }, 83);
  }, [finPose]);

  const lastBarkAt = useRef(0);
  const say = useCallback((kind: keyof typeof BARKS) => {
    if (ghost) return;
    // 7.2: event-keyed barks at most one per 6s; match-defining beats always speak.
    const now = Date.now();
    const urgent = kind === 'steal' || kind === 'finWins' || kind === 'finLoses' || kind === 'categoryPick' || kind === 'categoryFin';
    if (!urgent && now - lastBarkAt.current < 6000) return;
    lastBarkAt.current = now;
    barkN.current += 1;
    setBark({ text: pickBark(kind, (seedRef.current + barkN.current) % 97, myName), key: barkN.current });
  }, [ghost, myName]);

  /** Avatar acting (11.5), on the twos grid. */
  const meAct = useCallback((kind: 'lean' | 'hop' | 'wrong' | 'buzzWin' | 'pratfall') => {
    if (reducedMotion) return;
    const fr = 83;
    if (kind === 'lean') {
      meRot.value = withSequence(withTiming(0.07, { duration: 120 }), withDelay(300, withSpring(0)));
      meY.value = withSequence(withTiming(-4, { duration: 120 }), withDelay(300, withSpring(0)));
    } else if (kind === 'hop' || kind === 'buzzWin') {
      // 3-frame hop on twos: crouch 1.08 x 0.92, air 0.94 x 1.08 at -14pt, land 1.08 x 0.92.
      meSX.value = withSequence(withTiming(1.08, { duration: 1 }), withDelay(fr, withTiming(0.94, { duration: 1 })), withDelay(fr * 2, withTiming(1.08, { duration: 1 })), withDelay(fr, withSpring(1, { damping: 9, stiffness: 320 })));
      meSY.value = withSequence(withTiming(0.92, { duration: 1 }), withDelay(fr, withTiming(1.08, { duration: 1 })), withDelay(fr * 2, withTiming(0.92, { duration: 1 })), withDelay(fr, withSpring(1, { damping: 9, stiffness: 320 })));
      meY.value = withSequence(withDelay(fr, withTiming(-14, { duration: 1 })), withDelay(fr * 2, withTiming(0, { duration: 1 })));
      if (kind === 'buzzWin') meRot.value = withSequence(withTiming(-0.14, { duration: 80 }), withTiming(0.1, { duration: 90 }), withTiming(0, { duration: 90 }));
    } else if (kind === 'wrong') {
      // Recoil 0.96 x 1.04 back 4pt, then a head-shake read and a small slump.
      meSX.value = withSequence(withTiming(0.96, { duration: 80 }), withDelay(300, withSpring(1)));
      meSY.value = withSequence(withTiming(1.04, { duration: 80 }), withDelay(300, withTiming(0.96, { duration: 120 })), withDelay(400, withSpring(1)));
      meRot.value = withSequence(
        withTiming(-0.1, { duration: 50 }), withTiming(0.1, { duration: 50 }), withTiming(-0.1, { duration: 50 }),
        withTiming(0.1, { duration: 50 }), withTiming(-0.06, { duration: 50 }), withTiming(0, { duration: 50 }),
      );
      meY.value = withSequence(withTiming(4, { duration: 80 }), withDelay(700, withSpring(0)));
    } else if (kind === 'pratfall') {
      // Fall Guys good-sport loss: tip over, bonk, pop back up into a thumbs-up hop.
      meRot.value = withSequence(withTiming(0.21, { duration: 160, easing: Easing.in(Easing.quad) }), withDelay(380, withSpring(0, { damping: 7, stiffness: 220 })));
      meY.value = withSequence(withTiming(6, { duration: 160 }), withDelay(380, withTiming(-12, { duration: 140 })), withTiming(0, { duration: 140 }));
      later(170, () => sfx(CUE.bonk, { volume: 0.8 }));
    }
  }, [meRot, meY, meSX, meSY, reducedMotion, later]);

  // -- Clocks, camera, FX ------------------------------------------------------------------
  const qc = useSharedValue<QClock>(freshClock());
  const drum = useSharedValue(200);
  const ringSpeed = useSharedValue(-1);
  const bellStake = useSharedValue(250);
  const fuse = useSharedValue(-1);
  const urgentSv = useSharedValue(0);
  const readProg = useSharedValue(0);
  const lockFlashAt = useSharedValue(-1000);
  const hotSv = useSharedValue(0);
  useEffect(() => { hotSv.value = streakView.streak >= 5 ? 2 : streakView.streak >= 3 ? 1 : 0; }, [streakView.streak, hotSv]);

  const dispatchRef = useRef<(ev: number, a: number, b: number) => void>(() => undefined);
  const dispatch = useCallback((ev: number, a: number, b: number) => dispatchRef.current(ev, a, b), []);
  const beatSv = music.beat;

  const clock = useGameClock({
    config: { freezeBudget: 0.09 },
    onFrame: (_alpha, _fxDt, c) => {
      'worklet';
      stageT.value = c.fxMs;
      const q = qc.value;
      const prev = q.lastSim;
      q.lastSim = c.simMs;
      if (prev < 0 || q.phase === PH_IDLE) return;
      let dt = c.simMs - prev;
      if (dt <= 0) return;
      if (dt > 100) dt = 100;
      q.t += dt;
      if (q.phase === PH_READ) {
        readProg.value = q.unlockAt > 0 ? q.t / q.unlockAt : 1;
        if (q.t >= q.unlockAt) {
          q.phase = PH_LIVE;
          readProg.value = 1;
          runOnJS(dispatch)(EV_UNLOCK, 0, 0);
        }
        return;
      }
      const since = q.t - q.unlockAt;
      if (q.phase === PH_LIVE || q.phase === PH_LOCKED || q.phase === PH_WAIT) {
        if (q.kind !== K_BELL && q.finMs >= 0 && q.finFired === 0 && since >= q.finMs) {
          q.finFired = 1;
          runOnJS(dispatch)(EV_FIN, q.finMs, 0);
        }
      }
      if (q.phase === PH_LIVE) {
        const my = since;
        let speed = 0;
        if (q.kind === K_BELL) {
          speed = q.forfeit ? 0 : speedPoints(my, W_BELL_G, W_BELL_H);
          if (q.chomp && speed > 50) speed = 50;
          const v = Math.round((150 + speed) * q.mult);
          drum.value = v;
          bellStake.value = v;
          if (q.finBuzzMs >= 0 && q.finBuzzFired === 0 && since >= q.finBuzzMs) {
            q.finBuzzFired = 1;
            q.phase = PH_WAIT;
            runOnJS(dispatch)(EV_FIN_BUZZ, q.finBuzzMs, 0);
            return;
          }
        } else if (q.kind === K_RIDE) {
          const rs = q.forfeit ? 0 : speedPoints(my, q.g, q.h, W_RIDE_SPEED);
          const capped = q.chomp && rs > 50 ? 50 : rs;
          speed = Math.round((capped / W_RIDE_SPEED) * 100);
          drum.value = 100 + capped;
        } else {
          speed = q.forfeit ? 0 : speedPoints(my, q.g, q.h);
          if (q.chomp && speed > 50) speed = 50;
          drum.value = Math.round((100 + speed) * q.mult);
        }
        ringSpeed.value = q.forfeit ? 0 : speed;
        const hh = q.kind === K_BELL ? W_BELL_H : q.h;
        fuse.value = my >= hh && q.windowMs > hh ? Math.max(0, (q.windowMs - my) / (q.windowMs - hh)) : -1;
        const left = q.windowMs - my;
        if (left <= 3000 && q.urgent === 0) {
          q.urgent = 1;
          urgentSv.value = 1;
          urgency.value = 0.6;
          runOnJS(dispatch)(EV_URGENT, 1, 0);
        }
        if (left <= 1000) urgency.value = 1;
        if (q.urgent === 1) {
          const b = Math.floor(beatSv.value);
          if (b !== q.lastBeat) {
            q.lastBeat = b;
            runOnJS(dispatch)(EV_BEAT, b, 0);
          }
        }
        if (left <= 0) {
          q.phase = PH_WAIT;
          fuse.value = -1;
          runOnJS(dispatch)(EV_TIMEOUT, my, 0);
        }
        return;
      }
      if (q.phase === PH_SUB) {
        q.sub += dt;
        const left = q.subLimit - q.sub;
        fuse.value = Math.max(0, left / q.subLimit);
        if (left <= 3000 && q.urgent === 0) {
          q.urgent = 1;
          urgentSv.value = 1;
          runOnJS(dispatch)(EV_URGENT, 1, 0);
        }
        if (q.urgent === 1) {
          const b = Math.floor(beatSv.value);
          if (b !== q.lastBeat) {
            q.lastBeat = b;
            runOnJS(dispatch)(EV_BEAT, b, 0);
          }
        }
        if (left <= 0) {
          q.phase = PH_WAIT;
          fuse.value = -1;
          runOnJS(dispatch)(EV_SUB_TIMEOUT, 0, 0);
        }
      }
    },
  });
  const camera = useCamera({ width: W, height: H, config: CAMERA_PRESETS.trivia, timeScale: clock.fxScale, reducedMotion, walking: !!movement?.moving });

  /** UI-thread lock gate (tiles): release, or the Final hold ring closing. */
  const onTapUI = useCallback((i: number) => {
    'worklet';
    const q = qc.value;
    if (q.phase === PH_READ) {
      runOnJS(dispatch)(EV_EARLY, i, 0);
      return;
    }
    if ((q.removed >> i) & 1) return;
    if (q.phase === PH_LIVE && q.kind !== K_BELL) {
      const my = q.t - q.unlockAt;
      if (my < GUARD_MS) {
        runOnJS(dispatch)(EV_EARLY, i, 0);
        return;
      }
      q.phase = PH_LOCKED;
      runOnJS(dispatch)(EV_LOCK, i, my);
      return;
    }
    if (q.phase === PH_SUB) {
      q.phase = PH_WAIT;
      runOnJS(dispatch)(EV_SUB_LOCK, i, q.sub);
    }
  }, [qc, dispatch]);

  const onBuzzUI = useCallback(() => {
    runOnUI(() => {
      'worklet';
      const q = qc.value;
      if (q.phase !== PH_LIVE || q.kind !== K_BELL) return;
      const my = q.t - q.unlockAt;
      if (my < GUARD_MS) return;
      q.phase = PH_WAIT;
      runOnJS(dispatch)(EV_BUZZ, my, 0);
    })();
  }, [qc, dispatch]);

  const lockSlider = useCallback(() => {
    runOnUI(() => {
      'worklet';
      const q = qc.value;
      if (q.phase !== PH_LIVE) return;
      const my = q.t - q.unlockAt;
      if (my < GUARD_MS) return;
      q.phase = PH_LOCKED;
      runOnJS(dispatch)(EV_LOCK, -1, my);
    })();
  }, [qc, dispatch]);

  const setClock = useCallback((patch: Partial<QClock>) => {
    runOnUI((p: Partial<QClock>) => {
      'worklet';
      const q = qc.value;
      const keys = Object.keys(p) as (keyof QClock)[];
      for (let i = 0; i < keys.length; i++) (q as unknown as Record<string, number>)[keys[i]] = p[keys[i]] as number;
    })(patch);
  }, [qc]);

  // -- Music ------------------------------------------------------------------------------
  useGameMusic(visible && musicBed ? bed(musicBed) : null, { at: 'bar' });

  // -- Camera framings (11.2): hard cuts on the half-beat, never a pan, 600ms apart. ----------
  const frame = useCallback((f: Framing) => {
    if (reducedMotion) { push.value = 1; pushX.value = 0; return; }
    const now = Date.now();
    if (f !== 'wide' && now - lastCut.current < 600) return;
    lastCut.current = now;
    const target = f === 'wide' ? { s: 1, x: 0 } : f === 'two' ? { s: 1.2, x: 0 } : f === 'singleMe' ? { s: 1.3, x: W * 0.22 } : { s: 1.3, x: -W * 0.22 };
    push.value = target.s;
    pushX.value = target.x;
  }, [push, pushX, reducedMotion, W]);

  /** Full-frame flash: only the FIN'S FINAL stamp and the win crown, 35% peak, max 2 per match. */
  const flash = useCallback(() => {
    if (reducedMotion || flashes.current >= MAX_FLASHES) return;
    flashes.current += 1;
    fx.current?.flash({ color: '#ffffff', peak: 0.35, ms: 160 });
  }, [reducedMotion]);

  // -- Setup / rematch -----------------------------------------------------------------------
  const tileGeom = useMemo(() => {
    const n = round?.question.choices.length ?? 4;
    const gap = 12;
    const zoneW = Math.min(W - 24, 380);
    if (round?.question.format === 'opened' || n === 3) {
      return { cols: 1, w: zoneW, h: 62, gap: 10, zoneW };
    }
    if (n === 2) return { cols: 2, w: (zoneW - gap) / 2, h: 140, gap, zoneW };
    return { cols: 2, w: (zoneW - gap) / 2, h: 96, gap, zoneW };
  }, [round, W]);

  const tileCenter = useCallback((i: number) => {
    const g = tileGeom;
    const left = (W - g.zoneW) / 2;
    const col = g.cols === 1 ? 0 : i % 2;
    const row = g.cols === 1 ? i : Math.floor(i / 2);
    const rows = g.cols === 1 ? (round?.question.choices.length ?? 3) : Math.ceil((round?.question.choices.length ?? 4) / 2);
    const top = ZONE_TOP + ZONE_H - rows * (g.h + 6 + g.gap);
    return { x: left + col * (g.w + g.gap) + g.w / 2, y: top + row * (g.h + 6 + g.gap) + g.h / 2 };
  }, [tileGeom, W, ZONE_TOP, round]);

  const stamp = useCallback((text: string, color: string, share: number, x: number, y: number, sub?: string, size?: number) => {
    stampKey.current += 1;
    const spec = { key: stampKey.current, text, color, size: size ?? stampSize(text, share, W), x, y, sub };
    setStamps((s) => [...s.slice(-2), spec]);
    later(900, () => setStamps((s) => s.filter((k) => k.key !== spec.key)));
  }, [later, W]);

  const beginMatch = useCallback(async (rematch: boolean) => {
    clearTimers();
    setPhase('loading');
    setResults(null);
    setShellResult(null);
    setCrate(null);
    retract.value = withTiming(0, { duration: 200 });
    takeover.value = withTiming(0, { duration: 200 });
    const mem = await loadMemory();
    if (!poolRef.current.length) poolRef.current = props.pool ?? await loadPool({ rideId, parkId, chapterId });
    // Queue and practice vary per play even from a fixed base seed; ride and daily keep the issued seed.
    const fresh = mode === 'queue' || mode === 'practice' ? mixSeed(baseSeed >>> 0, 0x51ed + mem.plays) : (baseSeed >>> 0);
    const seed = rematch ? mixSeed(seedRef.current, 0x9e37 + playsRef.current) : fresh;
    seedRef.current = seed;
    const rank = mode === 'queue' || mode === 'practice' ? currentRank(mem) : 'firstmate';
    rankRef.current = rank;
    // 2.3 unlocks: lifetime queue matches (practice counts) set the template and systems.
    const matchNo = mode === 'queue' || mode === 'practice' ? (mem.duels ?? 0) + 1 : 3;
    let p: MatchPlan | null = null;
    if (ghost) p = planFromIds(ghost.mode === 'ride' ? 'queue' : ghost.mode, ghost.seed, ghost.qids, poolRef.current, rank, !!mem.relaxed, ghost.keys);
    if (!p) p = planMatch(mode === 'ghost' ? 'queue' : mode, seed, poolRef.current, { parkId, seen: mem.seen, rank, relaxed: !!mem.relaxed, matchNo, async: !!ghost });
    if (__DEV__) console.log('[trivia-duel] plan', { seed, matchNo, keys: p.keys, ids: p.rounds.map((r) => r.question.id), alt: p.finalAlt?.question.id ?? null });
    const carry = (mode === 'queue' || mode === 'practice') && p.features.shield ? activeCarry(mem, Date.now()) : { streak: 0, shield: false };
    tally.current = createTally(carry.streak, carry.shield, p.features.shield);
    resultsLog.current = [];
    factsRef.current = [];
    flashes.current = 0;
    decisiveDone.current = false;
    wagerOpen.current = false;
    setFeatures({ ...p.features });
    setStreakView({ streak: carry.streak, shield: carry.shield && p.features.shield });
    setScores({ me: 0, opp: 0 });
    setChompHeld(p.features.chomp);
    setPips(p.rounds.map((_, i) => (i === 0 ? 'current' : 'pending')));
    setLocks({ me: null, opp: null });
    setStakes({ me: null, opp: null });
    shades.value = withTiming(carry.streak >= 3 ? 1 : 0);
    podMe.value = withTiming(0);
    podOpp.value = withTiming(0);
    crown.value = 0;
    spot.value = 0;
    frame('wide');
    setDuelKey('e');
    setPlan(p);
    playsRef.current += 1;
    startedAt.current = Date.now();
    resetFreeBeat();
    setMusicBed(BEDS.duel);
    setFin('idle', false);
    if (mode === 'queue' || mode === 'practice') void updateMemory((m) => { m.duels = (m.duels ?? 0) + 1; });
    // VS intro: 1400ms takeover on the first match of a session, 600ms after, skipped on REMATCH; ride 800ms on the first 3 plays.
    const vsMs = rematch ? 0 : isRide ? (mem.vsSeen >= CEREMONY.vsCompressAfterPlays ? 0 : 800) : playsRef.current === 1 ? CEREMONY.vsFirstMs : CEREMONY.vsShortMs;
    void updateMemory((m) => { m.vsSeen += 1; m.plays += 1; });
    if (vsMs > 0) {
      setPhase('intro');
      setVs({ ms: vsMs });
      if (vsMs >= CEREMONY.vsFirstMs && !reducedMotion) {
        retract.value = withTiming(1, { duration: beatMs(), easing: Easing.out(Easing.cubic) });
        takeover.value = withTiming(1, { duration: beatMs(), easing: Easing.out(Easing.cubic) });
      }
      later(Math.round(vsMs * 0.29), () => {
        sfx(CUE.vsSlam);
        Haptic.comboHeavy();
        camera.shake(0.45);
        clock.hitStop(120, { force: true });
        fx.current?.burst('shards', W / 2, H * 0.42, { count: 24 });
        fx.current?.ring(W / 2, H * 0.42, { color: C.gold, from: 40, to: 160, ms: 260 });
      });
      later(Math.round(vsMs * 0.8), () => say('intro'));
    } else {
      F.current.startRound(p, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSeed, mode, rideId, parkId, chapterId, ghost, isRide, props.pool, W, H]);

  const onVsDone = useCallback(() => {
    setVs(null);
    retract.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.back(1.2)) });
    takeover.value = withTiming(0, { duration: 260 });
    if (plan && phase === 'intro') F.current.startRound(plan, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, phase]);

  // -- Round flow -------------------------------------------------------------------------------
  const startRound = useCallback((p: MatchPlan, i: number) => {
    const r = p.rounds[i];
    if (!r) return;
    setRoundIdx(i);
    setRound(r);
    ringSpeed.value = -1;
    fuse.value = -1;
    setPips((ps) => ps.map((s, k) => (k === i ? 'current' : s)));
    resolved.current = { me: false, opp: false, revealing: false };
    meIn.current = { ...NO_INPUT };
    setUsedThisQ(false);
    setChomped([]);
    setNarrow(null);
    setShares(null);
    setSubMode(null);
    setBellOn(false);
    setChip(null);
    setLocks({ me: null, opp: null });
    setHeads((r.question.choices.length ? r.question.choices : [0]).map(() => []));
    setTiles(r.question.choices.map(() => 'down'));
    if (r.question.slider) {
      // Start the thumb well away from the answer (never on it).
      const sl = r.question.slider;
      const span = sl.max - sl.min;
      let v = sl.min + Math.round(span * (0.15 + ((mixSeed(p.seed, 0x51d + i) % 70) / 100)));
      if (Math.abs(v - sl.truth) < sl.tol * 1.5) v = v <= sl.truth ? Math.max(sl.min, sl.truth - Math.round(sl.tol * 1.8)) : Math.min(sl.max, sl.truth + Math.round(sl.tol * 1.8));
      setSliderVal(v);
    }
    // Opponent's input for this round (Fin's is fixed by the seed; his pick stays hidden until the reveal).
    if (ghost) oppIn.current = ghostInput(ghost, i, tally.current.opp.score);
    else oppIn.current = finInput(p, r, tally.current).input;
    if (r.spec.type === 'final' && !isRide) {
      F.current.runFinalIntro(p, r);
      return;
    }
    F.current.presentQuestion(p, r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost, isRide]);

  const presentQuestion = useCallback((p: MatchPlan, r: PlannedRound) => {
    setPhase('question');
    setDropKey((k) => k + 1);
    sfx(CUE.whoosh, { volume: 0.6 });
    setFin('idle');
    frame('wide');
    if (!reducedMotion) push.value = withTiming(1.02, { duration: r.readLockMs + r.windowMs, easing: Easing.linear });
    readProg.value = 0;
    fuse.value = -1;
    urgentSv.value = 0;
    urgency.value = 0;
    ringSpeed.value = -1;
    const isBell = r.spec.type === 'buzz';
    const m = isRide ? 1 : streakMult(tally.current.me.streak.streak + 1);
    drum.value = isRide ? 250 : isBell ? Math.round(250 * m) : Math.round(200 * m);
    bellStake.value = Math.round(250 * m);
    const o = oppIn.current;
    setClock({
      phase: PH_READ, t: 0, unlockAt: r.readLockMs + r.jitterMs, windowMs: r.windowMs,
      finMs: isBell ? -1 : o.lockMs, finFired: 0,
      finBuzzMs: isBell ? (o.buzzMs ?? -1) : -1, finBuzzFired: 0,
      sub: 0, subLimit: 1, g: r.graceMs, h: r.horizonMs,
      kind: isRide ? K_RIDE : isBell ? K_BELL : K_QUICK, mult: m, chomp: 0, forfeit: 0, removed: 0, lastSim: -1, urgent: 0, lastBeat: -1,
    });
    // Fin "says" the question as audio over the read-lock (Animal Crossing babble, one voice).
    if (!ghost) {
      onTalk(true);
      const hits = babbleSchedule(r.question.prompt, r.readLockMs);
      hits.forEach((hb) => later(hb.atMs, () => babbleSyllable(hb.syllable, VOICE[p.rank])));
      later(r.readLockMs, () => onTalk(false));
    }
    if (isBell && (p.matchNo ?? 3) <= 2 && r.index <= 2) say('buzz');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRide, setClock, ghost, frame, reducedMotion]);

  // FIN'S FINAL (5.5): stamp on a half-beat (flash 1 of 2), music lifts to duel_loop_final on the bar,
  // category pick (2.5s, trailing player, vs Fin only), then the wager (4.0s, 3 chips, suggestion glows).
  const runFinalIntro = useCallback(async (p: MatchPlan, r: PlannedRound) => {
    setPhase('finalIntro');
    setMusicBed(BEDS.final);
    setDuelKey('f');
    if (!reducedMotion) spot.value = withTiming(1, { duration: 400 });
    const d = await msToGrid(2);
    const t0 = tally.current;
    const alt = !ghost ? p.finalAlt : undefined;
    later(d, () => {
      stamp("FIN'S FINAL", C.gold, 0.66, W / 2, RAIL_H + STAGE_BAND * 0.5);
      sfx(CUE.stamp);
      Haptic.comboHeavy();
      flash();
      setFin(t0.opp.score > t0.me.score ? 'point' : 'nervous');
    });
    const toWager = (fr: PlannedRound) => {
      const t = tally.current;
      if (t.me.score <= 0) {
        // Nothing to bet: every chip is 0, so the wager beat is skipped (no dead 4s in a moving line).
        meIn.current.stake = 0;
        setStakes({ me: '0', opp: '?' });
        later(300, () => F.current.presentQuestion(p, fr));
        return;
      }
      say(t.opp.score > t.me.score ? 'finalLead' : 'finalTrail');
      frame('two');
      const st = wagerStakes(t.me.score);
      const m = streakMult(t.me.streak.streak + 1);
      const sug = suggestWager(t.me.score, t.opp.score, m);
      finalWager.current = sug.index;
      const ifRight = st.map((s) => t.me.score + Math.round(POINTS.base * m) + s);
      setWager({ stakes: st, picked: -1, suggested: sug.index, reason: sug.reason, ifRight, left: Math.round(WAGER.pickMs / 1000) });
      setPhase('wager');
      sfx(CUE.chip, { volume: 0.7 });
      wagerOpen.current = true;
      let left = Math.round(WAGER.pickMs / 1000);
      const tick = () => {
        if (!wagerOpen.current) return;
        left -= 1;
        if (left <= 0) {
          F.current.lockWager(p, fr);
          return;
        }
        setWager((w) => (w ? { ...w, left } : w));
        later(1000, tick);
      };
      later(1000, tick);
    };
    if (!alt) {
      later(d + 600, () => toWager(r));
      return;
    }
    const picker = finalPicker(tally.current);
    const cats: [string, string] = [r.question.category, alt.question.category];
    let done = false;
    const choose = (i: number) => {
      if (done) return;
      done = true;
      catDone.current = null;
      const fr = i === 1 ? alt : r;
      p.rounds[r.index] = fr;
      p.finalAlt = undefined;
      setRound(fr);
      oppIn.current = finInput(p, fr, tally.current).input;
      setCatPick((c) => (c ? { ...c, picked: i } : c));
      sfx(CUE.chip);
      Haptic.hitMedium();
      later(420, () => { setCatPick(null); toWager(fr); });
    };
    later(d + 600, () => {
      setPhase('category');
      setCatPick({ cats, picker, left: Math.round(CATEGORY_PICK.pickMs / 1000), picked: -1 });
      sfx(CUE.whoosh, { volume: 0.6 });
      say(picker === 'me' ? 'categoryPick' : 'categoryFin');
      frame(picker === 'opp' ? 'singleOpp' : 'two');
      if (picker === 'me') {
        catDone.current = choose;
        later(1000, () => { if (!done) setCatPick((c) => (c ? { ...c, left: 1 } : c)); });
        later(CATEGORY_PICK.pickMs, () => choose(0));
      } else {
        // A trailing Fin picks your weakest calibrated category at 0.8s.
        later(800, () => choose(finCategoryPick(cats, memorySync().catStats)));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, reducedMotion, ghost, STAGE_BAND]);

  const lockWager = useCallback((p: MatchPlan, r: PlannedRound) => {
    // One lock per Final: the countdown and a tap can both get here; only the first counts.
    if (!wagerOpen.current) return;
    wagerOpen.current = false;
    const st = wagerStakes(tally.current.me.score);
    meIn.current.stake = st[finalWager.current] ?? 0;
    setWager(null);
    setStakes({ me: '?', opp: '?' });
    sfx(CUE.chip);
    Haptic.hitMedium();
    frame('wide');
    later(250, () => F.current.presentQuestion(p, r));
  }, [later, frame]);

  const pickCategory = useCallback((i: number) => { catDone.current?.(i); }, []);

  const pickWager = useCallback((i: number) => {
    finalWager.current = i;
    setWager((w) => (w ? { ...w, picked: i } : w));
    sfx(CUE.chip);
    Haptic.tapLight();
    if (i === WAGER.percents.length - 1) say('allIn');
    if (plan && round) later(220, () => F.current.lockWager(plan, round));
  }, [plan, round, later, say]);

  // -- Events from the UI thread ------------------------------------------------------------------
  const lockLabel = useCallback((ms: number) => `${(ms / 1000).toFixed(1)}s`, []);

  const resolveOppShown = useCallback((ms?: number) => {
    if (resolved.current.opp) return;
    resolved.current.opp = true;
    const o = oppIn.current;
    if (o.lockMs < 0 && o.guess == null && o.choice < 0) {
      setLocks((l) => ({ ...l, opp: 'NO ANSWER' }));
      return;
    }
    setLocks((l) => ({ ...l, opp: lockLabel(ms ?? o.lockMs) }));
    sfx(CUE.oppLock, { pan: 0.6 });
    Haptic.tapLight();
    if (!ghost) setFin('point');
  }, [lockLabel, ghost, setFin]);

  const maybeReveal = useCallback(() => {
    if (!resolved.current.me || !resolved.current.opp || resolved.current.revealing) return;
    resolved.current.revealing = true;
    void F.current.reveal();
  }, []);

  const doLockVisuals = useCallback((i: number, t: number, final: boolean) => {
    setTiles((ts) => ts.map((s, k) => (k === i ? (final ? 'amber' : 'locked') : s === 'removed' ? s : 'dim')));
    sfx(CUE.lockIn);
    sfxKey('tile', i, { volume: 0.55 });
    later(12, () => Haptic.hitMedium());
    lockFlashAt.value = clock.fxMs.value;
    setLocks((l) => ({ ...l, me: lockLabel(t) }));
    meAct('lean');
    muffle(false);
    // The drum value peels off and flies to your rail drum.
    const c = { x: W / 2, y: BOARD_TOP + ROPE_H };
    fx.current?.flyUp(`+${Math.round(drum.value)}`, c.x, c.y, { size: 'lg', color: C.gold, to: railScore });
    if (t < 1500 && !ghost && !isRide) say('youFast');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [later, meAct, ghost, isRide, say, W, BOARD_TOP]);

  /** Bell: the side that did not buzz sees its tiles 1.0s later, as the steal pick. */
  const openStealFor = useCallback((who: 'me' | 'opp', buzzAt: number) => {
    const o = oppIn.current;
    if (who === 'me') {
      later(BUZZ.stealFlipMs, () => {
        setChip(null);
        setTiles((ts) => ts.map((s) => (s === 'removed' ? s : 'up')));
        setSubMode('steal');
        sfx(CUE.unlock, { volume: 0.6 });
        Haptic.tickSelection();
        setClock({ phase: PH_SUB, sub: 0, subLimit: BUZZ.answerMs, urgent: 0, lastBeat: -1 });
      });
      // The buzzer's answer badge lands on their clock (the pick stays hidden until the reveal).
      const ans = ghost ? Math.max(600, Math.min(BUZZ.answerMs - 200, (o.stealMs ?? 1600))) : (plan && round ? finBellAnswerMs(plan, round) : 1600);
      later(ans, () => resolveOppShown(buzzAt));
    } else {
      // Fin/ghost steal pick: tiles flip 1.0s after your buzz, he picks at stealMs from that flip.
      const sm = o.stealMs ?? -1;
      if (o.stealChoice != null && o.stealChoice >= 0 && sm >= 0) later(BUZZ.stealFlipMs + sm, () => resolveOppShown(sm));
      else later(BUZZ.stealFlipMs + BUZZ.answerMs, () => { resolved.current.opp = true; maybeReveal(); });
      later(BUZZ.stealFlipMs + Math.max(0, sm) + 5, () => maybeReveal());
    }
    void buzzAt;
  }, [later, setClock, ghost, plan, round, resolveOppShown, maybeReveal]);

  dispatchRef.current = (ev: number, a: number, b: number) => {
    const r = round;
    if (!r || !plan) return;
    if (AUTOPLAY) autoplayOn(ev, r);
    if (__DEV__ && (ev === EV_LOCK || ev === EV_SUB_LOCK || ev === EV_BUZZ || ev === EV_FIN_BUZZ)) console.log('[trivia-duel] ev', { ev, a, b, round: r.index, type: r.spec.type, sub: subMode });
    switch (ev) {
      case EV_UNLOCK: {
        if (r.spec.type === 'buzz') {
          // Rev 7 bell: the tiles stay face-down for everyone; the bell goes live.
          setBellOn(true);
          sfx(CUE.glock, { volume: 0.7 });
        } else {
          setTiles((ts) => ts.map((s) => (s === 'down' ? 'up' : s)));
          sfx(CUE.unlock);
        }
        Haptic.tickSelection();
        if (!ghost) setFin('think');
        return;
      }
      case EV_EARLY: {
        setWiggle((w) => w.map((v, k) => (k === a ? v + 1 : v)));
        return;
      }
      case EV_URGENT: {
        // Last 3 seconds: the loop goes low-pass and a soft heartbeat plays on the beats.
        muffle(true);
        return;
      }
      case EV_BEAT: {
        sfx(CUE.heartbeat, { volume: 0.5 });
        Haptic.tickSelection();
        return;
      }
      case EV_FIN: {
        if (r.spec.type === 'buzz') return;
        if (resolved.current.me) {
          later(FIN_RESOLVE_AFTER_MS, () => { resolveOppShown(); maybeReveal(); });
          return;
        }
        resolveOppShown();
        maybeReveal();
        return;
      }
      case EV_LOCK: {
        const t = b;
        const final = r.spec.type === 'final';
        meIn.current = r.question.format === 'closest'
          ? { ...meIn.current, choice: -1, lockMs: t, guess: sliderValRef.current }
          : { ...meIn.current, choice: a, lockMs: t };
        resolved.current.me = true;
        if (a >= 0) doLockVisuals(a, t, final);
        else {
          sfx(CUE.lockIn);
          Haptic.hitMedium();
          muffle(false);
          setLocks((l) => ({ ...l, me: lockLabel(t) }));
        }
        if (!resolved.current.opp) {
          // If you lock first, his badge resolves at +350ms (his time is already fixed by the seed).
          later(FIN_RESOLVE_AFTER_MS, () => { resolveOppShown(); maybeReveal(); });
        } else maybeReveal();
        return;
      }
      case EV_TIMEOUT: {
        muffle(false);
        if (r.spec.type === 'buzz') {
          // Nobody buzzed by 6s: tiles open to everyone for 4s, flat 50.
          setBellOn(false);
          setChip('OPEN TILES  +50');
          setTiles((ts) => ts.map((s) => (s === 'removed' ? s : 'up')));
          sfx(CUE.unlock);
          Haptic.tickSelection();
          const o = oppIn.current;
          const pick = o.choice >= 0 ? o.choice : o.stealChoice ?? -1;
          const at = o.lockMs >= 0 && o.lockMs < BUZZ.openPhaseMs ? o.lockMs : 1500;
          oppIn.current = { choice: pick, lockMs: pick >= 0 ? at : -1, buzzMs: -1 };
          setSubMode('open');
          setClock({ phase: PH_SUB, sub: 0, subLimit: BUZZ.openPhaseMs, urgent: 0, lastBeat: -1 });
          if (pick >= 0) later(at, () => resolveOppShown(at));
          else resolved.current.opp = true;
          return;
        }
        meIn.current = { ...meIn.current, choice: -1, lockMs: -1 };
        resolved.current.me = true;
        setTiles((ts) => ts.map((s) => (s === 'removed' ? s : 'dim')));
        setLocks((l) => ({ ...l, me: 'TIME' }));
        if (!resolved.current.opp) later(FIN_RESOLVE_AFTER_MS, () => { resolveOppShown(); maybeReveal(); });
        else maybeReveal();
        return;
      }
      case EV_FIN_BUZZ: {
        // The opponent rang first: their tiles flip for them; yours flip 1.0s later as the steal pick.
        setBellOn(false);
        setBellKey((k) => k + 1);
        setChip(`${oppName.toUpperCase()} BUZZED!  Pick in case they miss`);
        sfx(CUE.bell, { volume: 0.7, pan: 0.6 });
        Haptic.tapLight();
        meIn.current = { ...meIn.current, buzzMs: -1 };
        if (!ghost) { setFin('point'); finHop(1, 0.5); }
        if (!reducedMotion) crowdLean.value = withSequence(withTiming(1, { duration: 200 }), withDelay(500, withSpring(0)));
        openStealFor('me', a);
        return;
      }
      case EV_BUZZ: {
        // You win the bell: only your tiles flip; 3.5s exclusive to answer.
        const my = a;
        meIn.current = { ...meIn.current, buzzMs: my };
        oppIn.current = { ...oppIn.current, buzzMs: -1 };
        setBellKey((k) => k + 1);
        setBellOn(false);
        sfx(CUE.bell);
        Haptic.comboHeavy();
        camera.shake(0.3);
        clock.hitStop(BUZZ.hitStopMs, { force: true });
        fx.current?.ring(W / 2, ZONE_TOP + ZONE_H / 2, { color: C.gold, from: 60, to: 180, ms: 260 });
        frame('singleMe');
        meAct('buzzWin');
        setLocks((l) => ({ ...l, me: `BELL ${lockLabel(my)}` }));
        setTiles((ts) => ts.map((s) => (s === 'removed' ? s : 'up')));
        setSubMode('buzzAnswer');
        setClock({ phase: PH_SUB, sub: 0, subLimit: BUZZ.answerMs, urgent: 0, lastBeat: -1 });
        openStealFor('opp', my);
        return;
      }
      case EV_SUB_LOCK:
      case EV_SUB_TIMEOUT: {
        const pick = ev === EV_SUB_LOCK ? a : -1;
        const subT = ev === EV_SUB_LOCK ? b : -1;
        muffle(false);
        if (pick >= 0) {
          setTiles((ts) => ts.map((s, k) => (k === pick ? 'locked' : s === 'removed' ? s : 'dim')));
          sfx(CUE.lockIn);
          sfxKey('tile', pick, { volume: 0.55 });
          Haptic.hitMedium();
          lockFlashAt.value = clock.fxMs.value;
        }
        if (subMode === 'buzzAnswer') {
          meIn.current = { ...meIn.current, choice: pick, lockMs: meIn.current.buzzMs ?? -1 };
        } else if (subMode === 'steal') {
          meIn.current = { ...meIn.current, stealChoice: pick, stealMs: subT };
          setLocks((l) => ({ ...l, me: pick >= 0 ? lockLabel(subT) : 'TIME' }));
        } else if (subMode === 'open') {
          meIn.current = { ...meIn.current, choice: pick, lockMs: pick >= 0 ? subT : -1 };
          setLocks((l) => ({ ...l, me: pick >= 0 ? lockLabel(subT) : 'TIME' }));
        }
        resolved.current.me = true;
        setSubMode(null);
        maybeReveal();
        return;
      }
      default:
    }
  };

  const tilesRef = useRef<TileState[]>([]);
  tilesRef.current = tiles;
  const sliderValRef = useRef(0);
  sliderValRef.current = sliderVal;

  const crumble = useCallback((i: number) => {
    if (i < 0) return;
    const c = tileCenter(i);
    fx.current?.burst('shards', c.x, c.y, { count: 12 });
  }, [tileCenter]);

  // -- Reveal (11.4): one thing at a time ---------------------------------------------------------
  const reveal = useCallback(async () => {
    const r = round;
    const p = plan;
    if (!r || !p) return;
    setPhase('reveal');
    setBellOn(false);
    setChip(null);
    const res = resolveRound(isRide ? 'ride' : 'queue', r, meIn.current, oppIn.current, tally.current);
    resultsLog.current.push(res);
    const q = r.question;
    const final = r.spec.type === 'final';
    const decisive = res.decisive && !decisiveDone.current && !isRide;
    if (decisive) decisiveDone.current = true;
    // Tension path: bell, steals, the Final, the decisive question, or the two sides locked different answers.
    const splitPicks = r.spec.type === 'quick' && meIn.current.lockMs >= 0 && oppIn.current.lockMs >= 0
      && q.format !== 'closest' && meIn.current.choice !== oppIn.current.choice;
    const tension = (!isRide && (r.spec.type !== 'quick' || decisive || !!res.buzz?.steal || splitPicks)) || (isRide && r.index === p.rounds.length - 1);
    const beats = decisive ? 4 : final ? 2 : 1;

    if (tension && !reducedMotion) {
      const d = await msToGrid(0.5);
      await sleep(d);
      frame('two');
      const len = beatMs(final) * beats;
      duckForReveal(len);
      sfx(beats >= 4 ? CUE.drum4 : beats === 2 ? CUE.drum2 : CUE.drum1);
      sfx(beats >= 4 ? 'crowd_ooh_1764' : beats === 2 ? 'crowd_ooh_833' : 'crowd_ooh_441', { volume: 0.6 });
      bulbFast.value = 1;
      setTense(true);
      for (let k = 0; k < 4; k++) later(len - beatMs(final) + k * (beatMs(final) / 4), () => Haptic.tickSelection());
      await sleep(len);
      bulbFast.value = 0;
      setTense(false);
      clock.hitStop(decisive ? 130 : final ? 110 : res.buzz?.steal ? 90 : CEREMONY.tensionHitStopMs, { force: decisive || final });
    } else {
      await sleep(await msToGrid(0.5));
    }

    // 0-180ms: tile truth. Correct tile white silhouette, gold flip, bloom behind it; your chord note.
    const correctIdx = q.correctIndex;
    const stoleSide = res.buzz?.steal ? (res.buzz.first === 'opp' ? 'me' : 'opp') : null;
    const myPick = r.spec.type === 'buzz' && res.buzz && res.buzz.first !== 'me' && !res.buzz.open ? meIn.current.stealChoice ?? -1 : meIn.current.choice;
    const oppPick = r.spec.type === 'buzz' && res.buzz && res.buzz.first === 'me' ? oppIn.current.stealChoice ?? -1 : oppIn.current.choice;
    const proofTile = q.format !== 'closest' ? tileCenter(Math.max(0, correctIdx)) : { x: W / 2, y: ZONE_TOP + 40 };
    if (q.format !== 'closest') {
      // Right: the correct tile flips gold. Wrong: your tile goes coral first, then 180-540 ms the correct tile pulses green twice.
      const pickedWrong = !res.me.correct && myPick >= 0 && myPick !== correctIdx;
      setTiles((ts) => ts.map((s, k) => (s === 'removed' ? s : k === correctIdx ? (pickedWrong ? 'reveal-dim' : 'correct') : k === myPick ? 'wrong' : 'reveal-dim')));
      if (pickedWrong) later(180, () => setTiles((ts) => ts.map((s, k) => (k === correctIdx && s !== 'removed' ? 'truth' : s))));
      backFx.current?.bloom(proofTile.x, proofTile.y, { color: C.gold, radius: Math.hypot(tileGeom.w, tileGeom.h) * 0.9, peak: 0.85, ms: 220 });
      if (res.buzz && !res.buzz.firstCorrect && !res.buzz.open) {
        const wrongBuzz = res.buzz.first === 'me' ? meIn.current.choice : oppIn.current.choice;
        if (wrongBuzz >= 0 && wrongBuzz !== correctIdx) later(60, () => crumble(wrongBuzz));
      }
    } else if (q.slider) {
      stamp(String(q.slider.truth), C.gold, 0.4, W / 2, BOARD_TOP + ROPE_H + 20, res.me.bullseye ? 'BULLSEYE!' : `You: ${meIn.current.guess ?? '-'}`);
    }
    setStakes(final ? { me: `${res.me.stake}`, opp: isRide ? null : `${res.opp.stake}` } : { me: null, opp: null });

    const meOK = res.me.correct;
    const tier = res.me.tier;
    const stampY = Math.max(RAIL_H + 40, proofTile.y - tileGeom.h * 0.5 - 70);
    if (meOK) {
      sfxKey('tv_correct', Math.min(Math.max(0, (tally.current.me.streak.streak || 1) - 1), 4));
      if (tier === 'lightning') sfxKey('spark_tick', 5, { volume: 0.7 });
      playHaptic('triviaCorrect');
      // 180-300ms: the tier stamp slams, offset ABOVE the proof tile; the avatar hop starts.
      later(180, () => {
        const pts = res.me.points;
        const isSteal = !!res.me.stole;
        const txt = isSteal ? 'STEAL!' : TIER_TEXT[tier] || `+${pts}`;
        stamp(txt, isSteal ? C.coral : TIER_COLOR[tier], isSteal ? 0.6 : TIER_WIDTH[tier], proofTile.x, stampY, TIER_TEXT[tier] || isSteal ? `+${pts}` : undefined);
        meAct(res.me.stole || res.me.buzzedFirst ? 'buzzWin' : 'hop');
        if (isSteal) { frame('singleMe'); sfx(CUE.steal); sfx(CUE.crowd, { volume: 0.6 }); clock.hitStop(90); }
      });
      // 300-700ms: star sparks arc to your rail drum, arrivals on 16ths; crowd foam fingers rise.
      later(300, () => {
        fx.current?.burst('stars', proofTile.x, proofTile.y, { count: TIER_SPARKS[tier] + (decisive ? 6 : 0), tx: railScore.x, ty: railScore.y, magnetDelay: 0.08, magnetDur: 0.32 });
        if (!reducedMotion) cheer.value = withSequence(withTiming(1, { duration: 160 }), withDelay(600, withTiming(0, { duration: 300 })));
      });
      if (res.me.bullseye) { sfx(CUE.stamp); say('bullseye'); }
      if (decisive) {
        // Match-deciding correct (Smash final hit): 130ms forced freeze, radial speed lines, hard SINGLE cut, one confetti cannon. Under 700ms, no slow-mo.
        later(190, () => {
          frame('singleMe');
          fx.current?.burst('impact', proofTile.x, stampY + 20, { count: 12 });
          fx.current?.burst('confetti', W * 0.15, STAGE_TOP + 20, { count: 30, angle: -60 });
          sfx(CUE.win, { volume: 0.55 });
        });
        if (tally.current.me.score > tally.current.opp.score) say('comeback');
      }
    } else if (myPick >= 0 || meIn.current.buzzMs != null && meIn.current.buzzMs >= 0) {
      // Wrong: your tile squashes coral with Alex's X; the correct tile pulses green twice. No red, no shake, no stamp.
      sfx(CUE.wrong, { volume: 0.55 });
      sfx(CUE.gasp, { volume: 0.5 });
      playHaptic('triviaWrong');
      meAct('wrong');
      if (res.me.points < 0) later(200, () => fx.current?.flyUp(`${res.me.points}`, railScore.x + 20, railScore.y + 30, { size: 'md', color: C.coral }));
    }

    // Opponent reaction on the same twos frame as your avatar.
    if (!isRide) {
      if (!ghost) {
        if (res.opp.correct) { later(180, () => { setFin('cheer'); finHop(meOK ? 1 : 2, meOK ? 0.6 : 1); }); say('finCorrect'); if (res.opp.stole) { later(180, () => stamp('STEAL!', C.coral, 0.6, W * 0.7, RAIL_H + STAGE_BAND * 0.4)); frame('singleOpp'); } }
        else if (oppPick >= 0 || (oppIn.current.buzzMs ?? -1) >= 0) { later(180, () => { setFin('surprised'); later(380, () => setFin('sheepish')); }); sfx(CUE.oops, { volume: 0.7, pan: 0.6 }); say(meOK ? 'youCorrect' : 'finWrong'); }
        else if (meOK) { later(180, () => { setFin('cheer'); finHop(2, 0.6); }); say('youCorrect'); }
      } else if (res.opp.correct) later(180, () => finHop(1, 0.6));
    }

    // 700ms+: who picked what. Heads fly onto the tiles they picked (Quiplash), then thermometers fill (Kahoot, 30+ answers).
    if (q.format !== 'closest') {
      later(700, () => {
        const h: SharkLook[][] = q.choices.map(() => []);
        if (myPick >= 0 && myPick < h.length) h[myPick].push('classic');
        if (!isRide && oppPick >= 0 && oppPick < h.length) h[oppPick].push(ghost ? opponentLook as SharkLook : 'blue');
        setHeads(h);
      });
      if ((q.stats.n ?? 0) >= 30 && q.stats.dist && q.stats.dist.length === q.choices.length) {
        const tot = q.stats.dist.reduce((s2, v) => s2 + Math.max(0, v), 0) || 1;
        later(900, () => setShares(q.stats.dist!.map((v) => Math.max(0, v) / tot)));
        const pc = Math.max(0, q.stats.dist[correctIdx] ?? 0) / tot;
        if (pc < 0.25) later(900, () => setChip(`Only ${Math.round(pc * 100)}% of sharks got this!`));
      }
    }

    // Streak events (11.7).
    const sEv = res.me.streak;
    if (sEv) {
      if (sEv.ignited || sEv.blazing) {
        const d = await msToGrid(2);
        later(Math.max(d, 620), () => {
          sfx(CUE.ignite);
          Haptic.comboHeavy();
          frame('singleMe');
          fx.current?.burst('embers', W * 0.22, STAGE_TOP + STAGE_BAND * 0.7, { count: 16 });
          backFx.current?.bloom(W * 0.22, STAGE_TOP + STAGE_BAND * 0.7, { color: C.gold, radius: 90, peak: 0.8, ms: 300 });
          if (sEv.ignited) {
            say('streak3');
            stamp('HOT STREAK!', C.coral, 0.62, W / 2, RAIL_H + STAGE_BAND * 0.45, sEv.shieldGranted ? 'SHIELD UP' : 'x1.5');
            if (!reducedMotion) shades.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.back(2)) });
          } else stamp('BLAZING!', C.gold, 0.58, W / 2, RAIL_H + STAGE_BAND * 0.45, 'x1.75');
        });
        setMusicBed(final ? BEDS.final : sEv.blazing ? BEDS.blazing : BEDS.hot);
      } else if (sEv.shieldUsed) {
        sfx(CUE.shieldPop);
        say('shieldSave');
        later(300, () => stamp('SHIELD!', C.gold, 0.4, W / 2, RAIL_H + STAGE_BAND * 0.45, 'Streak saved'));
      } else if (sEv.broke) {
        sfx(CUE.fizz, { volume: 0.7 });
        shades.value = withTiming(0, { duration: 300 });
        if (!final) setMusicBed(BEDS.duel);
      } else if (sEv.streak > 0 && !isRide) {
        sfxKey('streak_step', Math.min(4, sEv.streak - 1), { volume: 0.5, delayMs: 300 });
        if (sEv.streak === 2) later(300, () => stamp('STREAK x1.2', C.gold, 0.4, W / 2, RAIL_H + STAGE_BAND * 0.35));
      }
    }
    setStreakView({ streak: tally.current.me.streak.streak, shield: tally.current.me.streak.shield });
    sunburst.value = withTiming([0.35, 0.45, 0.6, 0.85, 0.85, 1][flameTier(tally.current.me.streak.streak)] ?? 0.35, { duration: 400 });

    // Scores and pips.
    later(300, () => setScores({ me: tally.current.me.score, opp: tally.current.opp.score }));
    setPips((ps) => ps.map((s, k) => (k === r.index ? (meOK && res.opp.correct ? 'both' : meOK ? 'me' : res.opp.correct ? 'opp' : 'none') : s)));
    if (!isRide && !ghost && q.format !== 'closest') void updateMemory((m) => recordCategory(m, q.category, meOK));
    if (q.fact) factsRef.current.push({ id: q.id, fact: q.fact, source: q.source, tpsArticleUrl: q.tpsArticleUrl, gold: meOK && (tier === 'great' || tier === 'lightning'), at: Date.now() });

    // Next: tap anywhere from reveal + 300ms fast-forwards.
    setPhase('between');
    const next = () => {
      nextTap.current = null;
      clearTimers();
      setChip(null);
      frame('wide');
      F.current.advance();
    };
    later(300, () => { nextTap.current = next; });
    later((decisive ? 1500 : CEREMONY.nextQuestionMs) + (tension ? 500 : 350), next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, plan, isRide, ghost, reducedMotion, W, H, tileCenter, tileGeom, BOARD_TOP, STAGE_BAND]);

  const advance = useCallback(() => {
    const p = plan;
    if (!p) return;
    const next = roundIdx + 1;
    if (next < p.rounds.length) {
      F.current.startRound(p, next);
      return;
    }
    const t = tally.current;
    if (!isRide && t.me.score === t.opp.score && p.rounds.length < 7) {
      // SUDDEN DEATH: one medium Quick Draw, first correct lock wins.
      const sd = suddenDeathRound(p, poolRef.current, []);
      const np = { ...p, rounds: [...p.rounds, sd] };
      setPlan(np);
      setPips((ps) => [...ps, 'pending']);
      stamp('SUDDEN DEATH!', C.coral, 0.62, W / 2, RAIL_H + STAGE_BAND * 0.5);
      later(900, () => F.current.startRound(np, next));
      return;
    }
    F.current.finishMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, roundIdx, isRide, W, H]);

  // -- Match end --------------------------------------------------------------------------------------
  const buildMeta = useCallback((forfeit = false) => {
    const t = tally.current;
    return {
      mode: isRide ? 'task' : 'lineplay',
      duelMode: mode,
      score: t.me.score,
      correctCount: t.me.correct,
      totalAnswered: isRide ? Math.min(RIDE_QUESTIONS, Math.max(t.me.answered, resultsLog.current.length)) : resultsLog.current.length,
      maxCombo: t.me.streak.best,
      seed: seedRef.current,
      oppScore: t.opp.score,
      fin_rank: FIN_RANKS[rankRef.current].label,
      forfeit,
      rounds: t.me.log,
      qids: plan?.rounds.map((r) => r.question.id) ?? [],
      elapsed_ms: Date.now() - startedAt.current,
    };
  }, [isRide, mode, plan]);

  /** Stage takeover (11.2): the board retracts up into the marquee strip over 1 beat; the stage band grows. */
  const takeoverOn = useCallback((on: boolean) => {
    const d = reducedMotion ? 300 : beatMs();
    retract.value = withTiming(on ? 1 : 0, { duration: d, easing: Easing.out(Easing.cubic) });
    takeover.value = withTiming(on ? 1 : 0, { duration: d, easing: Easing.out(Easing.cubic) });
  }, [retract, takeover, reducedMotion]);

  const finishMatch = useCallback(async () => {
    const p = plan;
    if (!p) return;
    clearTimers();
    setClock({ phase: PH_IDLE });
    setRound(null);
    const t = tally.current;
    const facts = factsRef.current;
    setMusicBed(null);
    setDuelKey('e');
    spot.value = withTiming(0, { duration: 300 });
    if (isRide) {
      const won = rideWon(t.me.correct);
      const stars = rideStars(t.me.correct, p.rounds.length, t.me.score);
      void updateMemory((m) => { rememberSeen(m, p.rounds.map((r) => r.question.id), p.rounds.flatMap((r) => factKeysOf(r.question))); addFactCards(m, facts); });
      const fastest = t.me.fastestMs >= 0 ? `${(t.me.fastestMs / 1000).toFixed(1)}s` : '-';
      // The on-stage half-height card (renderResults) reads this model; the shell keeps the claim contract.
      setResults({
        won, tie: false, myScore: t.me.score, oppScore: t.opp.score, oppName,
        banners: won ? (t.me.score > t.opp.score ? ['FIN BEATEN'] : []) : [],
        nearMiss: rideNearMiss(resultsLog.current),
        rows: [
          { label: 'Correct', value: `${t.me.correct}/${p.rounds.length}` },
          { label: 'Fastest', value: fastest },
          { label: 'Best tier', value: TIER_TEXT[t.me.bestTier].replace('!', '') || 'NONE' },
        ],
        facts: facts.slice(0, 1).map((f) => ({ ...f, isNew: true })), stars, practice: false, rank: null, best: null, ride: { won },
      });
      const result: GameResult = {
        score: t.me.score,
        stars,
        message: won ? (t.me.score > t.opp.score ? 'FIN BEATEN!' : 'Ride coin earned!') : `${t.me.correct} of ${p.rounds.length} right. 2 wins the coin.`,
        thresholds: { one: 200, two: 420, three: 600 },
        stats: [
          { label: 'Correct', value: `${t.me.correct}/${p.rounds.length}` },
          { label: 'Fastest', value: fastest },
        ],
        meta: buildMeta(),
      } as GameResult;
      takeoverOn(true);
      setPhase('crate');
      if (won) {
        sfx(CUE.win);
        frame('wide');
        later(beatMs(), () => setCrate({ stars, key: Date.now() }));
        pendingShell.current = result;
      } else {
        sfx(CUE.lose);
        playHaptic('triviaWrong');
        frame('two');
        later(beatMs(), () => meAct('pratfall'));
        if (!ghost) later(beatMs() * 2, () => { setFin('cheer'); finHop(1, 0.6); say('finWins'); });
        later(beatMs() * 4, () => { setShellResult(result); setPhase('results'); });
      }
      return;
    }
    const won = t.me.score > t.opp.score;
    const stars = duelStars(t.me.score, t.opp.score, t.me.correct, p.rounds.length);
    const nm = nearMiss(p, t, resultsLog.current);
    const banners: string[] = [];
    let mem = await loadMemory();
    const prevBest = mem.best;
    const newCards: (FactCard & { isNew: boolean })[] = facts.map((f) => ({ ...f, isNew: !mem.album.some((a) => a.id === f.id) }));
    mem = await updateMemory((m) => {
      rememberSeen(m, p.rounds.map((r) => r.question.id), p.rounds.flatMap((r) => factKeysOf(r.question)));
      addFactCards(m, facts);
      if (!ghost && mode === 'queue') {
        const rk = applyMatchToRank(m.rank, won);
        if (rk.promoted) banners.push('RANK UP');
      }
      if (t.me.score > m.best) m.best = t.me.score;
      m.carry = mode === 'queue' || mode === 'practice' ? { streak: t.me.streak.streak, shield: t.me.streak.shield, at: Date.now() } : null;
      saveGhost(m, makeGhost(p, t, myName, 'classic', Date.now()));
    });
    if (won) banners.unshift(ghost ? `${oppName.toUpperCase()} BEATEN` : 'FIN BEATEN');
    if (t.me.score > prevBest && prevBest > 0) banners.push('NEW BEST');

    // Takeover: crown or good-sport loss on the stage, then the half-height card rises.
    takeoverOn(true);
    sfx(won ? CUE.win : CUE.lose);
    if (won) {
      frame('singleMe');
      if (!reducedMotion) podMe.value = withTiming(18, { duration: 400, easing: Easing.out(Easing.back(1.6)) });
      later(260 + beatMs(), () => {
        clock.hitStop(50, { force: true });
        camera.shake(0.4);
        playHaptic('triviaCorrect');
        flash();
        fx.current?.burst('confetti', W * 0.12, STAGE_TOP + 10, { count: 30, angle: -60 });
        fx.current?.burst('confetti', W * 0.88, STAGE_TOP + 10, { count: 30, angle: -120 });
        sfx(CUE.crowd);
        if (!reducedMotion) cheer.value = withRepeat(withSequence(withTiming(1, { duration: 200 }), withTiming(0.4, { duration: 200 })), 4, true);
        crownDrop();
      });
      later(260 + beatMs() * 3, () => frame('two'));
      if (!ghost) { later(400, () => { setFin('dizzy'); sfx(CUE.bonk, { pan: 0.6 }); }); say('finLoses'); }
      if (!reducedMotion) later(260 + beatMs() * 3, () => { meY.value = withRepeat(withSequence(withTiming(-14, { duration: beatMs() / 2 }), withTiming(0, { duration: beatMs() / 2 })), 3); });
    } else {
      frame('two');
      playHaptic('triviaWrong');
      if (!ghost) { setFin('cheer'); finHop(1); later(beatMs() * 2, () => say('finWins')); }
      later(beatMs(), () => meAct('pratfall'));
    }
    const fastest = t.me.fastestMs >= 0 ? `${(t.me.fastestMs / 1000).toFixed(1)}s` : '-';
    const rows = [
      { label: 'Correct', value: `${t.me.correct}/${p.rounds.length}` },
      { label: 'Fastest', value: fastest },
      { label: 'Best tier', value: TIER_TEXT[t.me.bestTier].replace('!', '') || 'NONE' },
      { label: 'Streak', value: String(t.me.streak.best) },
    ];
    const rk = mem.rank;
    const ri = FIN_RANK_ORDER.indexOf(rk.rank);
    const nextRank = ri < FIN_RANK_ORDER.length - 1 ? FIN_RANKS[FIN_RANK_ORDER[ri + 1]].label : null;
    const fastestIdx = t.me.log.findIndex((row, i) => resultsLog.current[i]?.me.correct && row.lockMs === t.me.fastestMs);
    setResults({
      won, tie: t.me.score === t.opp.score, myScore: t.me.score, oppScore: t.opp.score, oppName,
      banners, nearMiss: nm.line, rows, facts: newCards.slice(0, 1), stars, practice: mode === 'practice',
      rank: ghost ? null : { label: FIN_RANKS[rk.rank].label, progress: nextRank ? Math.min(1, rk.winsAtRank / FIN_RANKS[rk.rank].promoteAfter) : 1, next: nextRank },
      best: t.me.fastestMs >= 0 ? { label: `${fastest} on Q${Math.max(0, fastestIdx) + 1}` } : null,
    });
    later(beatMs() * 2, () => setPhase('results'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, isRide, ghost, mode, myName, oppName, reducedMotion, W, H, buildMeta]);

  const pendingShell = useRef<GameResult | null>(null);
  const onCrateDone = useCallback(() => {
    setCrate(null);
    if (pendingShell.current) {
      setShellResult(pendingShell.current);
      pendingShell.current = null;
    }
    setPhase('results');
  }, []);

  // Crown drops onto your avatar's head part with a squash (drawn in the stage, 11.9).
  const crownDrop = useCallback(() => {
    crown.value = 0.001;
    crown.value = reducedMotion ? 1 : withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) });
    if (!reducedMotion) {
      meSY.value = withDelay(260, withSequence(withTiming(0.9, { duration: 83 }), withSpring(1, { damping: 8, stiffness: 300 })));
      meSX.value = withDelay(260, withSequence(withTiming(1.08, { duration: 83 }), withSpring(1, { damping: 8, stiffness: 300 })));
    }
  }, [crown, meSX, meSY, reducedMotion]);

  const onContinue = useCallback(() => {
    const stars = results?.stars ?? 0;
    const meta = buildMeta();
    setMusicBed(null);
    if (stars > 0) onComplete(stars >= 3 ? 1.5 : stars === 2 ? 1.25 : 1, meta);
    else onClose();
  }, [results, buildMeta, onComplete, onClose]);

  const onRematch = useCallback(() => {
    setGhost(null);
    setResults(null);
    crown.value = 0;
    setRunKey((k) => k + 1);
    void beginMatch(true);
  }, [beginMatch, crown]);

  const onPassToCrew = useCallback(async () => {
    const mem = await loadMemory();
    const g = listGhosts(mem)[0];
    if (!g) return;
    setResults(null);
    crown.value = 0;
    setGhost({ ...g, name: g.name === myName ? 'Crew ghost' : g.name, look: 'blue' });
  }, [myName, crown]);
  const ghostKey = ghost ? `${ghost.seed}:${ghost.at}` : '';
  useEffect(() => {
    if (!ghost || !visible || phase === 'loading') return;
    void beginMatch(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostKey]);

  // -- Dev autoplay (demo capture only; __DEV__ + EXPO_PUBLIC_TRIVIA_AUTOPLAY=1) ----------------------
  const autoN = useRef(0);
  const autoplayOn = (ev: number, r: PlannedRound) => {
    const q = r.question;
    const k = (autoN.current += 1);
    const skill = (mixSeed(seedRef.current, k) % 100) / 100;
    const pick = skill < 0.78 ? q.correctIndex : (q.correctIndex + 1) % Math.max(2, q.choices.length);
    const tapAt = (i: number, ms: number) => later(ms, () => {
      const alive = tilesRef.current.map((t, kk) => (t !== 'removed' ? kk : -1)).filter((kk) => kk >= 0);
      const x = alive.includes(i) ? i : alive.includes(q.correctIndex) ? q.correctIndex : alive[0] ?? i;
      runOnUI((y: number) => { 'worklet'; onTapUI(y); })(x);
    });
    if (ev === EV_UNLOCK) {
      const ms = 900 + skill * 2200;
      if (r.spec.type === 'buzz') {
        const fb = oppIn.current.buzzMs ?? -1;
        if (playsRef.current % 2 === 0 || fb < 0) later(Math.min(ms * 0.6, fb >= 0 ? fb - 150 : 99999), onBuzzUI);
      } else if (q.format === 'closest' && q.slider) {
        const guess = q.slider.truth + (skill < 0.7 ? 0 : 3);
        later(ms * 0.6, () => setSliderVal(guess));
        later(ms, lockSlider);
      } else {
        if (k % 4 === 1 && chompHeld && q.choices.length >= 3) later(400, useChomp);
        tapAt(pick, ms);
      }
    } else if (ev === EV_BUZZ) tapAt(pick, 900);
    else if (ev === EV_FIN_BUZZ) tapAt(q.correctIndex, BUZZ.stealFlipMs + 1100);
    else if (ev === EV_TIMEOUT && r.spec.type === 'buzz') tapAt(pick, 1200);
  };
  useEffect(() => {
    if (!AUTOPLAY) return;
    if (phase === 'wager' && wager) later(1600, () => pickWager((mixSeed(seedRef.current, 77) % 10) < 7 ? wager.suggested : (wager.suggested + 1) % 3));
    if (phase === 'category' && catPick?.picker === 'me') later(900, () => pickCategory(1));
    if (phase === 'results' && results && !isRide) later(6500, () => (playsRef.current < 3 ? onRematch() : playsRef.current === 3 && !ghost ? void onPassToCrew() : onContinue()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, results]);

  F.current = { startRound, presentQuestion, runFinalIntro, reveal, advance, finishMatch, lockWager };

  // -- Chomp (6): server-removed in graded modes; speed capped at 50 ----------------------------------
  const twoTile = (round?.question.choices.length ?? 4) <= 2;
  const canChomp = phase === 'question' && chompHeld && !usedThisQ && round != null && !twoTile && (tiles[0] !== 'down' || subMode === 'buzzAnswer')
    && (round.spec.type !== 'buzz' || subMode === 'buzzAnswer') && !locks.me;
  const useChomp = useCallback(() => {
    const r = round;
    if (!r || !chompHeld || usedThisQ) return;
    const q = r.question;
    if (q.format === 'closest' && q.slider) {
      const s = q.slider;
      setNarrow([Math.max(s.min, s.truth - s.tol), Math.min(s.max, s.truth + s.tol)]);
    } else {
      const wrong = q.choices.map((_, i) => i).filter((i) => i !== q.correctIndex);
      const rm = wrong.sort((a, b) => ((mixSeed(seedRef.current, a + 77) % 7) - (mixSeed(seedRef.current, b + 77) % 7))).slice(0, 2);
      rm.forEach((i, k) => later(k * 120, () => {
        setChomped((c) => [...c, i]);
        sfx(CUE.chomp);
        Haptic.hitMedium();
        const c = tileCenter(i);
        fx.current?.burst('shards', c.x, c.y, { count: 10 });
      }));
      later(460, () => setTiles((ts) => ts.map((s, k) => (rm.includes(k) ? 'removed' : s))));
      setClock({ removed: rm.reduce((m, i) => m | (1 << i), 0) });
    }
    setClock({ chomp: 1 });
    meIn.current = { ...meIn.current, chomp: true };
    setChompHeld(false);
    setUsedThisQ(true);
  }, [round, chompHeld, usedThisQ, later, tileCenter, setClock]);

  // -- Shell hooks ----------------------------------------------------------------------------------------
  // The countdown is the show's own (design 11, spotlight iris): 55%-width
  // stamps on the stage, 3-2-1-GO on the shell's step timing, no scrim.
  const onStart = useCallback(async () => {
    await (warmRef.current ?? Promise.resolve());
    await new Promise((r) => setTimeout(r, 250));
    const steps = ['3', '2', '1', 'GO!'];
    // Over the face-down board (the stage band draws above the stamp layer).
    const y = ZONE_TOP + 40;
    steps.forEach((label, i) => later(i * COUNTDOWN.stepMs, () => {
      // 55% of the screen width: a digit at ~1.1x its font size per glyph, GO! at three glyphs.
      const size = Math.round((0.55 * W) / (label === 'GO!' ? 1.9 : 1.1));
      stamp(label, label === 'GO!' ? C.gold : '#ffffff', 0.55, W / 2, y + size * 0.5, undefined, Math.min(size, 190));
      sfx(CUE.tick, { volume: label === 'GO!' ? 0.7 : 0.45 });
      Haptic.tickSelection();
    }));
    later(3 * COUNTDOWN.stepMs + COUNTDOWN.goMs, () => { void beginMatch(false); });
  }, [beginMatch, later, stamp, W]);

  const onPause = useCallback(() => {
    clock.pause();
    holdStart.current = Date.now();
    setHeld(true);
    holdTimers(true);
    muffle(false);
    runOnUI(() => {
      'worklet';
      const q = qc.value;
      // HOLD after unlock forfeits this question's speed bonus (15).
      if (q.phase === PH_LIVE || q.phase === PH_SUB) q.forfeit = 1;
    })();
    if (meIn.current) meIn.current = { ...meIn.current, holdForfeit: qc.value.phase === PH_LIVE || qc.value.phase === PH_SUB ? true : meIn.current.holdForfeit };
  }, [clock, qc, holdTimers]);

  const onResume = useCallback(() => {
    const heldMs = Date.now() - holdStart.current;
    const credit = graded ? HOLD.creditMs : Infinity;
    runOnUI((h: number, cr: number, restart: number) => {
      'worklet';
      const q = qc.value;
      q.lastSim = -1;
      // A HOLD during the read-lock restarts it with 600ms left.
      if (q.phase === PH_READ) q.t = Math.max(0, q.unlockAt - restart);
      // Past the 6s credit the graded window runs on.
      if ((q.phase === PH_LIVE || q.phase === PH_LOCKED) && h > cr) q.t += h - cr;
      if (q.phase === PH_SUB && h > cr) q.sub += h - cr;
    })(heldMs, credit, READ_LOCK.holdRestartMs);
    setHeld(false);
    holdTimers(false);
    clock.resume();
  }, [clock, qc, graded, holdTimers]);

  const onWrapUp = useCallback((): GameResult => {
    // "Your ride's up!": remaining rounds are forfeited, results saved.
    clearTimers();
    setClock({ phase: PH_IDLE });
    const t = tally.current;
    const stars = isRide ? rideStars(t.me.correct, RIDE_QUESTIONS, t.me.score) : duelStars(t.me.score, t.opp.score, t.me.correct, plan?.rounds.length ?? 5);
    return { score: t.me.score, stars, meta: buildMeta(true) };
  }, [clearTimers, setClock, isRide, plan, buildMeta]);

  // Reset when hidden.
  useEffect(() => {
    if (visible) return;
    clearTimers();
    setPhase('loading');
    setResults(null);
    setShellResult(null);
    setMusicBed(null);
  }, [visible, clearTimers]);

  useEffect(() => { if (__DEV__) console.log('[trivia-duel] phase', phase, round?.index ?? -1, round?.spec.type ?? ''); }, [phase, round]);

  // Spotlight iris (11.3): the countdown keeps the stage lit (no scrim) with warm cones on both podiums.
  useEffect(() => {
    if (!visible) return;
    if (phase === 'loading') spot.value = reducedMotion ? 1 : withTiming(1, { duration: beatMs() });
    else if (phase === 'question' && round?.spec.type !== 'final') spot.value = withTiming(0, { duration: 300 });
  }, [visible, phase, round, spot, reducedMotion]);

  // Pre-warm the pool and memory before the countdown (the countdown waits for it, so its beats stay even).
  const warmRef = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    if (!visible) return;
    const jobs: Promise<unknown>[] = [loadMemory()];
    if (!props.pool) jobs.push(loadPool({ rideId, parkId, chapterId }).then((p) => { poolRef.current = p; }));
    else poolRef.current = props.pool;
    warmRef.current = Promise.all(jobs).catch(() => undefined);
  }, [visible, rideId, parkId, chapterId, props.pool]);

  const tapAnywhere = useCallback(() => {
    if (phase === 'between' && nextTap.current) nextTap.current();
  }, [phase]);

  const onTileTouch = useCallback((_i: number, down: boolean) => {
    if (down) Haptic.tapLight();
  }, []);
  const onTierEdge = useCallback(() => { Haptic.tickSelection(); }, []);

  // -- Render --------------------------------------------------------------------------------------------------
  const q = round?.question;
  const preview = phase === 'loading' || phase === 'intro';
  const tileStates: TileState[] = held ? tiles.map(() => 'down') : tiles;
  const flameT = flameTier(streakView.streak);
  const sunSpeed = flameT >= 5 ? 0.94 : flameT >= 3 ? 0.63 : flameT >= 2 ? 0.42 : 0.1;
  const roundLabel = round
    ? (isRide ? `QUESTION ${round.index + 1} OF ${plan?.rounds.length ?? 3}` : `ROUND ${round.index + 1}  ${ROUND_NAMES[round.spec.type]}`)
    : (isRide ? 'QUESTION 1 OF 3' : 'ROUND 1  QUICK DRAW');
  const showBoard = (preview && visible) || (!!round && (phase === 'question' || phase === 'reveal' || phase === 'between' || phase === 'finalIntro' || phase === 'category' || phase === 'wager'));
  const showTiles = !!round && (phase === 'question' || phase === 'reveal' || phase === 'between');
  const mult = isRide ? 1 : streakMult(streakView.streak + 1);
  const multChip = !isRide && mult > 1 ? `x${mult}` : null;
  const drumOn = phase === 'question' && round != null && (tiles[0] !== 'down' || q?.format === 'closest' || bellOn);
  const finalRound = round?.spec.type === 'final';
  const zoneTiles = q?.choices.length ? q.choices : ['', '', '', ''];
  const finStripes = FIN_RANKS[rankRef.current].stripes;
  // Before the Final's read-lock the board never shows its question: the intro, the topic pick and the wager say what is coming.
  const finalTopic = plan?.rounds[roundIdx]?.question.category ?? '';
  const boardText = phase === 'finalIntro' ? "Fin's Final is next"
    : phase === 'category' ? (catPick?.picker === 'me' ? 'You pick the topic' : `${oppName} picks the topic`)
    : phase === 'wager' ? `Topic: ${finalTopic}. Place your bet.`
    : preview ? '' : q?.prompt ?? '';

  return (
    <GameShellV2
      ref={shell}
      visible={visible}
      title={title ?? (isRide ? 'Beat the Buzzer' : 'Trivia Duel')}
      subtitle={subtitle ?? (isRide ? 'Ride Challenge: 2 of 3 to win' : ghost ? `vs ${oppName}` : 'Queue Duel')}
      score={scores.me}
      result={shellResult}
      thresholds={isRide ? { one: 200, two: 420, three: 600 } : undefined}
      onStart={onStart}
      onPause={onPause}
      onResume={onResume}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
      gameId="trivia"
      onWrapUp={onWrapUp}
      countdownScrim="none"
      countdownStyle="none"
      resultsScrim="none"
      renderResults={isRide ? (args) => (
        <View style={{ width: '100%', height: Dimensions.get('window').height }} pointerEvents="box-none">
          {results ? (
            <DuelResults model={{ ...results, stars: args.stars }} beatMs={beatMs()} onContinue={args.claim} reducedMotion={args.reducedMotion} height={RESULTS_H} />
          ) : null}
        </View>
      ) : undefined}
      hideHeaderScore
      pauseExtras={<RelaxedToggle on={relaxed} onToggle={toggleRelaxed} />}
    >
      <GestureHandlerRootView style={styles.field} onLayout={onLayout}>
        <Pressable style={StyleSheet.absoluteFill} onPress={tapAnywhere} accessible={false}>
          <View style={styles.bg} />
          <Animated.View style={[styles.stageWrap, { top: STAGE_TOP, height: STAGE_FULL }, camera.style]}>
            <Stage
              width={W}
              height={STAGE_FULL}
              bandH={STAGE_BAND}
              dropPx={DROP_PX}
              actors={actors}
              opponent={opponentLook}
              ghost={!!ghost}
              stripes={finStripes}
              sunburstSpeed={sunSpeed}
              reducedMotion={reducedMotion}
            />
          </Animated.View>
          {/* Bloom lives BEHIND the board and tiles (rev 7 H7): never Plus over cream. */}
          <FxStage ref={backFx} width={W} height={H} timeScale={clock.fxScale} reducedMotion={reducedMotion} flashCap={0} style={StyleSheet.absoluteFill} />

          {/* Camera-locked foreground set: railing, marquee header strip, board, desk front. */}
          <Image source={ART.railing} style={[styles.railing, { top: BOARD_TOP + ROPE_H + BOARD_H * 0.35 - (W / 390) * 130, width: W, height: (W / 390) * 130 }]} resizeMode="stretch" />
          <View style={[styles.deskWrap, { top: DESK_TOP }]} pointerEvents="none">
            <DeskFront width={W} height={H - DESK_TOP + 6} />
          </View>
          <MarqueeStrip width={W} top={BOARD_TOP - 6} />

          {showBoard ? (
            <View style={[styles.boardWrap, { top: BOARD_TOP }]} pointerEvents="box-none">
              <QuestionCard
                roundLabel={roundLabel}
                question={boardText}
                drum={drum}
                drumOn={drumOn}
                multChip={multChip}
                speed={ringSpeed}
                beat={music.beat}
                fxMs={clock.fxMs}
                hot={hotSv}
                lockFlashAt={lockFlashAt}
                fuse={fuse}
                urgent={urgentSv}
                readProgress={readProg}
                preview={preview}
                dropKey={dropKey}
                flip3d={finalRound && phase === 'question'}
                faceDown={held}
                retract={retract}
                reducedMotion={reducedMotion}
                width={BOARD_W}
                onTierEdge={onTierEdge}
              />
              {canChomp ? (
                <View style={[styles.chomp, { left: (W + BOARD_W) / 2 - 60, top: ROPE_H + BOARD_H - 34 }]}>
                  <LifelineButton onPress={useChomp} />
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Answer zone: the bottom 45%, every target at least 62pt tall. */}
          {((preview && visible) || phase === 'finalIntro') ? (
            <View style={[styles.zone, { top: ZONE_TOP, height: ZONE_H, width: tileGeom.zoneW, left: (W - tileGeom.zoneW) / 2, opacity: 0.6 }]} pointerEvents="none">
              <View style={[styles.tiles, { flexDirection: 'row' }]}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={{ marginBottom: 12, marginRight: i % 2 === 0 ? 12 : 0 }}>
                    <Tile index={i} label="" state="down" width={(tileGeom.zoneW - 12) / 2} height={96} onTapUI={onTapUI} flipDelay={0} heads={[]} share={-1} wiggleKey={0} reducedMotion={reducedMotion} fontSize={18} chomped={false} disabled />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {showTiles && q ? (
            <View style={[styles.zone, { top: ZONE_TOP, height: ZONE_H, width: tileGeom.zoneW, left: (W - tileGeom.zoneW) / 2 }]}>
              {q.format === 'closest' && q.slider ? (
                <ClosestSlider
                  key={q.id}
                  min={q.slider.min}
                  max={q.slider.max}
                  value={sliderVal}
                  onChange={(v) => { setSliderVal(v); sfx(CUE.tick, { volume: 0.35 }); Haptic.tickSelection(); }}
                  onLock={lockSlider}
                  disabled={phase !== 'question' || !!locks.me}
                  width={tileGeom.zoneW}
                  narrow={narrow}
                />
              ) : (
                <View style={[styles.tiles, { flexDirection: tileGeom.cols === 1 ? 'column' : 'row' }]}>
                  {zoneTiles.map((c, i) => (
                    <View key={`${q.id}-${i}`} style={{ marginBottom: tileGeom.gap, marginRight: tileGeom.cols === 2 && i % 2 === 0 ? tileGeom.gap : 0 }}>
                      <Tile
                        index={i}
                        label={c}
                        state={tileStates[i] ?? 'down'}
                        width={tileGeom.w}
                        height={tileGeom.h}
                        onTapUI={onTapUI}
                        onTouch={onTileTouch}
                        holdToLock={finalRound}
                        flipDelay={i * CEREMONY.unlockStaggerMs}
                        heads={heads[i] ?? []}
                        share={shares ? shares[i] ?? -1 : -1}
                        wiggleKey={wiggle[i] ?? 0}
                        reducedMotion={reducedMotion}
                        fontSize={tileFont(c, tileGeom.w)}
                        chomped={chomped.includes(i)}
                        tense={tense && (tileStates[i] === 'locked' || tileStates[i] === 'amber')}
                      />
                    </View>
                  ))}
                </View>
              )}
              {bellOn && !held ? (
                <BuzzBell onBuzz={onBuzzUI} disabled={!bellOn} pressedKey={bellKey} reducedMotion={reducedMotion} stake={bellStake} risk={tally.current.me.streak.shield ? 'Shield: -0' : '-100'} />
              ) : null}
            </View>
          ) : null}

          {subMode ? (
            <View style={[styles.subChip, { top: ZONE_TOP - 40 }]} pointerEvents="none">
              <Text style={styles.subChipText}>{subMode === 'buzzAnswer' ? 'YOUR ANSWER! 3.5s' : subMode === 'steal' ? 'PICK IN CASE THEY MISS' : 'OPEN TILES  +50'}</Text>
            </View>
          ) : null}
          {chip ? (
            <View style={[styles.subChip, { top: RAIL_H + 8 }]} pointerEvents="none">
              <Text style={styles.subChipText} numberOfLines={1}>{chip}</Text>
            </View>
          ) : null}

          {wager ? (
            <View style={[styles.zone, { top: ZONE_TOP - 18, height: ZONE_H + 18, width: tileGeom.zoneW, left: (W - tileGeom.zoneW) / 2 }]}>
              <WagerChips
                stakes={wager.stakes}
                labels={WAGER.labels}
                picked={wager.picked}
                suggested={wager.suggested}
                reason={wager.reason}
                ifRight={wager.ifRight}
                onPick={pickWager}
                secondsLeft={wager.left}
                category={plan?.rounds[roundIdx]?.question.category ?? 'Trivia'}
                height={ZONE_H + 18}
              />
            </View>
          ) : null}
          {catPick ? (
            <View style={[styles.zone, { top: ZONE_TOP - 18, height: ZONE_H + 18, width: tileGeom.zoneW, left: (W - tileGeom.zoneW) / 2 }]}>
              <CategoryPick cats={catPick.cats} mine={catPick.picker === 'me'} picked={catPick.picked} left={catPick.left} oppName={oppName} onPick={pickCategory} height={ZONE_H + 18} />
            </View>
          ) : null}

          <View style={styles.railWrap}>
            <Rail
              me={{ name: myName, score: scores.me, look: 'classic', lockLabel: locks.me, stake: stakes.me }}
              opp={{ name: oppName, score: scores.opp, look: opponentLook, lockLabel: locks.opp, stake: stakes.opp, ghost: !!ghost }}
              pips={pips}
              flame={flameT}
              streak={streakView.streak}
              shield={streakView.shield}
              shieldOn={features.shield && !isRide}
              moving={!!movement?.moving}
              reducedMotion={reducedMotion}
              onTickCoin={() => sfxKey('coin_tick', 0, { volume: 0.5 })}
            />
          </View>
          <View style={{ position: 'absolute', top: RAIL_H + 34, left: 0, right: 0 }} pointerEvents="none">
            <Bark text={bark.text} barkKey={bark.key} side="right" onTalk={onTalk} voice={VOICE[rankRef.current]} />
          </View>


          <FxStage
            ref={fx}
            width={W}
            height={H}
            timeScale={clock.fxScale}
            reducedMotion={reducedMotion}
            flashCap={0.35}
            style={StyleSheet.absoluteFill}
            onArrive={(n) => {
              for (let k = 0; k < Math.min(4, n); k++) sfxKey('spark_tick', Math.min(5, k + 1), { volume: 0.7, delayMs: k * 110 });
              if (n) Haptic.tickSelection();
            }}
          />

          {crate ? (
            <RideCoinCrate
              key={crate.key}
              podium={{ x: W * 0.22, y: STAGE_TOP + STAGE_BAND * 0.7 - 6 + DROP_PX }}
              counter={{ x: 40, y: 10 }}
              width={W}
              height={H}
              stars={crate.stars}
              beatMs={beatMs()}
              coin={coinSrc}
              reducedMotion={reducedMotion}
              onShake={() => Haptic.tapLight()}
              onOpen={(x, y) => {
                sfx(CUE.stamp, { volume: 0.7 });
                fx.current?.burst('coins', x, y, { count: 24 });
                fx.current?.burst('sparkles', x, y, { count: 12 });
              }}
              onHalfTurn={(n) => sfxKey('coin_tick', Math.min(2, n - 1), { volume: 0.8 })}
              onTurn={() => Haptic.tickSelection()}
              onStar={(n) => { sfxKey('spark_tick', Math.min(5, n + 1), { volume: 0.8 }); }}
              onLand={() => {
                playHaptic('triviaCorrect');
                sfx(CUE.rankUp, { volume: 0.8 });
                if (crate.stars >= 3) fx.current?.ring(40, 10, { color: C.gold, from: 12, to: 90, ms: 220 });
              }}
              onDone={onCrateDone}
            />
          ) : null}

          {vs ? (
            <VsIntro ms={vs.ms} meName={myName} oppName={ghost ? oppName : 'Captain Fin'} oppLook={opponentLook} rankLabel={ghost ? 'GHOST RUN' : FIN_RANKS[rankRef.current].label.replace(' Fin', '').toUpperCase()} onDone={onVsDone} reducedMotion={reducedMotion} />
          ) : null}
          {results && phase === 'results' && !isRide ? (
            <DuelResults
              key={runKey}
              model={results}
              beatMs={beatMs()}
              onRematch={mode === 'daily' ? undefined : onRematch}
              onGhost={mode === 'daily' ? undefined : () => { void onPassToCrew(); }}
              onContinue={onContinue}
              reducedMotion={reducedMotion}
              height={RESULTS_H}
            />
          ) : null}
          {/* Stamps draw above the board and the countdown preview. */}
          {stamps.map((s) => <Stamp key={s.key} spec={s} reducedMotion={reducedMotion} />)}
          {phase === 'loading' && visible && !preview ? <View style={styles.loading}><OutlinedText text="Setting the stage..." size={20} color="#ffffff" width={2} /></View> : null}
        </Pressable>
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

/** Marquee header strip (code-drawn): blue and cream awning stripes with a scalloped edge; the board's ropes hang from it. */
function MarqueeStrip({ width, top }: { width: number; top: number }) {
  const n = Math.ceil(width / 26) + 1;
  return (
    <View style={[styles.marquee, { top, width }]} pointerEvents="none">
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={[styles.awning, { left: i * 26 - 4, backgroundColor: i % 2 ? C.cream : C.blue }]}>
          <View style={[styles.scallop, { backgroundColor: i % 2 ? C.cream : C.blue }]} />
        </View>
      ))}
      <View style={styles.marqueeLine} />
    </View>
  );
}

/** The hold sheet's Relaxed pace switch. Same points, calmer clock. */
function RelaxedToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }} style={styles.relaxRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.relaxTitle}>Relaxed pace</Text>
        <Text style={styles.relaxSub}>More time to read, same points. Starts next match.</Text>
      </View>
      <View style={[styles.relaxPill, on && styles.relaxPillOn]}>
        <View style={[styles.relaxKnob, on && styles.relaxKnobOn]} />
      </View>
    </Pressable>
  );
}

/**
 * Largest size (15-20) where the longest word fits on one line and the label
 * wraps into at most 3 lines (greedy word wrap, ~0.56em per glyph). Tile copy
 * floor is 15pt and never breaks words (3).
 */
export function tileFont(label: string, tileW: number): number {
  const avail = tileW - (label.length > TILE_COMPACT_CHARS && tileW < 260 ? 46 : 62);
  const words = label.split(/\s+/);
  for (let size = label.length > 26 ? 17 : label.length > 14 ? 18 : 20; size > 15; size -= 1) {
    const cpl = Math.floor(avail / (size * 0.56));
    let lines = 1;
    let cur = 0;
    let fits = true;
    for (const w of words) {
      if (w.length > cpl) { fits = false; break; }
      if (cur === 0) cur = w.length;
      else if (cur + 1 + w.length <= cpl) cur += 1 + w.length;
      else { lines += 1; cur = w.length; }
    }
    if (fits && lines <= 3) return size;
  }
  return 15;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

const styles = StyleSheet.create({
  relaxRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cream, borderRadius: 16, borderWidth: 3, borderColor: C.ink, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, alignSelf: 'stretch' },
  relaxTitle: { fontFamily: 'Shark', fontSize: 18, color: C.navy },
  relaxSub: { fontFamily: 'Knockout', fontSize: 13, color: '#4b6c8c' },
  relaxPill: { width: 54, height: 32, borderRadius: 16, borderWidth: 3, borderColor: C.ink, backgroundColor: '#dfe8f0', justifyContent: 'center', paddingHorizontal: 2 },
  relaxPillOn: { backgroundColor: C.gold },
  relaxKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#ffffff', borderWidth: 2, borderColor: C.ink },
  relaxKnobOn: { alignSelf: 'flex-end' },
  field: { flex: 1, overflow: 'hidden' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#bfeaff' },
  stageWrap: { position: 'absolute', left: 0, right: 0 },
  railWrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  railing: { position: 'absolute', left: 0 },
  deskWrap: { position: 'absolute', left: 0, right: 0 },
  boardWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  chomp: { position: 'absolute' },
  zone: { position: 'absolute' },
  tiles: { flexWrap: 'wrap', justifyContent: 'center', position: 'absolute', left: 0, right: 0, bottom: 0 },
  subChip: { position: 'absolute', alignSelf: 'center', maxWidth: '92%', backgroundColor: C.gold, borderRadius: 14, borderWidth: 3, borderColor: C.ink, paddingHorizontal: 14, paddingVertical: 4 },
  subChipText: { fontFamily: 'Shark', fontSize: 17, color: C.navy },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  marquee: { position: 'absolute', left: 0, height: 22, overflow: 'visible' },
  awning: { position: 'absolute', top: 0, width: 26, height: 14, borderLeftWidth: 1.5, borderColor: C.ink },
  scallop: { position: 'absolute', left: -1, top: 6, width: 26, height: 14, borderBottomLeftRadius: 13, borderBottomRightRadius: 13, borderWidth: 2.5, borderTopWidth: 0, borderColor: C.ink },
  marqueeLine: { position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: C.ink },
});

export default TriviaDuel;
