/**
 * Trivia Duel (Trivia+ merged with Shark Showdown), design studio/design/trivia.md rev 3.
 *
 * A bright boardwalk game-show duel you play one-thumbed while the line
 * shuffles forward. You race Captain Fin (or a recorded ghost) to the right
 * answer: tiles stay face-down until the unlock, speed is points you watch
 * tick down, the bell is a real gamble, the Final is a wager, and reveals land
 * on the beat of Chris's music.
 *
 * Clocks: the question clock lives on the UI thread (useGameClock onFrame):
 * read-lock, unlock, the answer window, Fin's calibrated lock time and the
 * last-3-seconds ticks all fire from sim time, never wall-clock deadlines, so
 * a HOLD stops them exactly. Taps are judged in the gesture worklet against
 * the same elapsed value the ticker shows. FX run on the fx clock (hit-stop).
 *
 * QUEUE REALITY: movement never pauses anything. Only a HOLD (pause button,
 * app background) stops the clock; a HOLD after unlock forfeits that
 * question's speed bonus, and graded modes credit at most 6s per question.
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing, runOnJS, runOnUI, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GameShellV2, type GameResult, type GameShellV2Handle } from '../../gamekit/GameShellV2';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import { RideChallengeContext } from '../../gamekit/RideChallengeContext';
import { useGameClock } from '../../gamekit/useGameClock';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { useCamera } from '../../gamekit/fx/useCamera';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { useGameMusic } from '../../gamekit/audio/useGameMusic';
import { useMusicBeat } from '../../gamekit/audio/useMusicBeat';
import { Haptic } from '../../gamekit/Haptics';
import { packHex } from '../../gamekit/core/particles';
import { mixSeed } from '../../gamekit/core/rng';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { AuthContext } from '../../context/AuthProvider';
import {
  BUZZ, CEREMONY, FIN_RANKS, FIN_RESOLVE_AFTER_MS, HOLD, POINTS, READ_LOCK, RIDE_QUESTIONS, UNLOCK_GUARD_MS, WAGER,
  type DuelMode, type SpeedTier,
} from './engine/config';
import { factKeysOf, type PoolQuestion } from './engine/content';
import { applyMatchToRank, pickBark, BARKS } from './engine/finAI';
import {
  createTally, finInput, ghostInput, makeGhost, NO_INPUT, planFromIds, planMatch, resolveRound, suddenDeathRound,
  type GhostRecord, type MatchPlan, type MatchTally, type PlannedRound, type RoundResult, type SideInput,
} from './engine/match';
import { nearMiss } from './engine/nearMiss';
import { duelStars, flameTier, rideStars, rideWon, tickerValue, wagerStakes } from './engine/scoring';
import { FIN_POSE_ORDER, C, type FinPose, type SharkLook } from './art';
import { BEDS, CUE, bed, beatMs, msToGrid, registerDuelAudio, resetFreeBeat, sfx, sfxLadder } from './audio';
import { loadPool } from './pool';
import {
  activeCarry, addFactCards, currentRank, listGhosts, loadMemory, rememberSeen, saveGhost, updateMemory, type FactCard,
} from './store';
import { Stage, type StageActors } from './ui/Stage';
import { Rail, type PipState } from './ui/Rail';
import { QuestionCard } from './ui/Card';
import { Tile, type TileState } from './ui/Tile';
import { Bark, BuzzBell, ClosestSlider, LifelineButton, OutlinedText, Ribbon, Stamp, VsIntro, WagerChips, type StampSpec } from './ui/Overlays';
import { DuelResults, type ResultsModel } from './ui/DuelResults';


// -- Question clock (UI thread) ------------------------------------------------------

const GUARD_MS: number = UNLOCK_GUARD_MS;
const PH_IDLE = 0;
const PH_READ = 1;
const PH_LIVE = 2;
const PH_LOCKED = 3;
const PH_SUB = 5;
const PH_WAIT = 8;

const EV_UNLOCK = 1;
const EV_FIN = 2;
const EV_TICK = 3;
const EV_TIMEOUT = 4;
const EV_EARLY = 5;
const EV_LOCK = 6;
const EV_FIN_BUZZ = 7;
const EV_BUZZ = 8;
const EV_SUB_LOCK = 9;
const EV_SUB_TIMEOUT = 10;
const EV_FREEZE_END = 11;
const EV_FIN_LEAN = 12;

interface QClock {
  phase: number;
  t: number;
  unlockAt: number;
  windowMs: number;
  finMs: number;
  finFired: number;
  finBuzzMs: number;
  finBuzzFired: number;
  leanFired: number;
  frozen: number;
  freezeLeft: number;
  sub: number;
  subLimit: number;
  lastSec: number;
  g: number;
  h: number;
  kind: number; // 0 quick, 1 ride, 2 buzz
  chomp: number;
  forfeit: number;
  removed: number;
  lastSim: number;
}

function freshClock(): QClock {
  return { phase: PH_IDLE, t: 0, unlockAt: 0, windowMs: 1, finMs: -1, finFired: 0, finBuzzMs: -1, finBuzzFired: 0, leanFired: 0, frozen: 0, freezeLeft: 0, sub: 0, subLimit: 1, lastSec: 99, g: 400, h: 6000, kind: 0, chomp: 0, forfeit: 0, removed: 0, lastSim: -1 };
}

type SubMode = 'buzzAnswer' | 'steal' | 'open' | null;
type Phase = 'loading' | 'intro' | 'question' | 'finalIntro' | 'wager' | 'reveal' | 'between' | 'results';

export interface TriviaDuelProps {
  visible: boolean;
  mode: DuelMode;
  seed: number;
  title?: string;
  subtitle?: string;
  rideId?: number;
  parkId?: number;
  chapterId?: string;
  rideName?: string;
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
const TIER_COLOR: Record<SpeedTier, string> = { lightning: C.lightning, great: C.gold, nice: C.blue, none: C.cream };
const TIER_STEP: Record<SpeedTier, number> = { lightning: 2, great: 1, nice: 0, none: 0 };
const TIER_COINS: Record<SpeedTier, number> = { lightning: 18, great: 12, nice: 8, none: 6 };
const ROUND_NAMES = { quick: 'QUICK DRAW', buzz: 'BUZZ BELL', final: "FIN'S FINAL" } as const;

export function TriviaDuel(props: TriviaDuelProps) {
  const { visible, mode, seed: baseSeed, title, subtitle, rideId, parkId, chapterId, onComplete, onClose, onQuit } = props;
  const reducedMotion = useReducedGameMotion();
  const movement = useContext(LinePlayMovementContext);
  const rideChallenge = useContext(RideChallengeContext);
  const auth = useContext(AuthContext) as { player?: { username?: string } } | null;
  const myName = (auth?.player?.username ?? 'You').slice(0, 12);
  const isRide = mode === 'ride';
  const shell = useRef<GameShellV2Handle>(null);
  const fx = useRef<FxStageHandle>(null);

  registerDuelAudio();

  // -- Layout ---------------------------------------------------------------------
  const [field, setField] = useState({ w: SW, h: 700 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - field.w) > 1 || Math.abs(height - field.h) > 1) setField({ w: width, h: height });
  }, [field]);
  const W = field.w;
  const H = field.h;
  const RAIL_H = 84;
  // Thumb zone first: answers sit in the bottom of the screen, the card right
  // above them, and the stage takes everything between the rail and the card.
  const ZONE_H = 226;
  const ZONE_TOP = H - ZONE_H - 20;
  const CARD_H = 142;
  const CARD_TOP = ZONE_TOP - CARD_H - 10;
  const STAGE_H = Math.max(140, CARD_TOP + 22 - (RAIL_H - 4));
  const scoreAnchor = { x: 70, y: 46 };

  // -- Match state ------------------------------------------------------------------
  const [phase, setPhase] = useState<Phase>('loading');
  const [plan, setPlan] = useState<MatchPlan | null>(null);
  const [roundIdx, setRoundIdx] = useState(0);
  const [round, setRound] = useState<PlannedRound | null>(null);
  const [tiles, setTiles] = useState<TileState[]>([]);
  const [heads, setHeads] = useState<SharkLook[][]>([]);
  const [chomped, setChomped] = useState<number[]>([]);
  const [wiggle, setWiggle] = useState<number[]>([0, 0, 0, 0]);
  const [pips, setPips] = useState<PipState[]>([]);
  const [scores, setScores] = useState({ me: 0, opp: 0 });
  const [streakView, setStreakView] = useState({ streak: 0, shield: false });
  const [tray, setTray] = useState({ chomp: true, freeze: false, peek: false });
  const [usedThisQ, setUsedThisQ] = useState(false);
  const [locks, setLocks] = useState<{ me: string | null; opp: string | null }>({ me: null, opp: null });
  const [stakes, setStakes] = useState<{ me: string | null; opp: string | null }>({ me: null, opp: null });
  const [stamps, setStamps] = useState<StampSpec[]>([]);
  const [bark, setBark] = useState<{ text: string | null; key: number }>({ text: null, key: 0 });
  const [ribbon, setRibbon] = useState<{ text: string; key: number; hold: number } | null>(null);
  const [subMode, setSubMode] = useState<SubMode>(null);
  const [bellOn, setBellOn] = useState(false);
  const [bellKey, setBellKey] = useState(0);
  const [chip, setChip] = useState<string | null>(null);
  const [wager, setWager] = useState<{ stakes: number[]; picked: number; left: number } | null>(null);
  const [finalCard, setFinalCard] = useState<string | null>(null);
  const [sliderVal, setSliderVal] = useState(0);
  const [narrow, setNarrow] = useState<[number, number] | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [held, setHeld] = useState(false);
  const [results, setResults] = useState<ResultsModel | null>(null);
  const [shellResult, setShellResult] = useState<GameResult | null>(null);
  const [vs, setVs] = useState<{ ms: number } | null>(null);
  const [dropKey, setDropKey] = useState(0);
  const [musicBed, setMusicBed] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ key: number; text: string } | null>(null);
  const [polaroid, setPolaroid] = useState(0);
  const [peekLean, setPeekLean] = useState(-1);
  const [runKey, setRunKey] = useState(0);
  const [ghost, setGhost] = useState<GhostRecord | null>(props.ghost ?? null);

  // Flow functions are called from timers and UI-thread events: always go through the latest render.
  const F = useRef<Record<string, (...args: any[]) => any>>({});
  const tally = useRef<MatchTally>(createTally());
  const resultsLog = useRef<RoundResult[]>([]);
  const oppIn = useRef<SideInput>({ ...NO_INPUT });
  const meIn = useRef<SideInput>({ ...NO_INPUT });
  const resolved = useRef({ me: false, opp: false, revealing: false });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const poolRef = useRef<PoolQuestion[]>([]);
  const playsRef = useRef(0);
  const startedAt = useRef(0);
  const holdStart = useRef(0);
  const stampKey = useRef(0);
  const barkN = useRef(0);
  const nextTap = useRef<(() => void) | null>(null);
  const factsRef = useRef<FactCard[]>([]);
  const finalWager = useRef<number>(WAGER.defaultIndex);
  const seedRef = useRef(baseSeed >>> 0);
  const rankRef = useRef(FIN_RANKS.deckhand.label);
  const carryRef = useRef({ streak: 0, shield: false });

  const opponentLook: SharkLook | 'fin' = ghost ? ((ghost.look as SharkLook) || 'blue') : 'fin';
  const oppName = ghost ? ghost.name : 'Fin';
  // Only the ride challenge is graded today (local queue duels have no server window yet): a pocketed phone never burns a queue question.
  const graded = mode === 'ride';

  const later = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
    return t;
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
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
  const spot = useSharedValue(0);
  const push = useSharedValue(1);
  const pushX = useSharedValue(0);
  const stageT = useSharedValue(0);
  const podMe = useSharedValue(0);
  const podOpp = useSharedValue(0);
  const music = useMusicBeat(visible);
  const actors: StageActors = useMemo(() => ({
    finPose, finSX, finSY, finY, finRot, hatRot, hatY, meSX, meSY, meY, meRot, shades, cheer, crowdLean, sunburst,
    beat: music.beat, bulbFast, spot, push, pushX, t: stageT, podMe, podOpp,
  }), [finPose, finSX, finSY, finY, finRot, hatRot, hatY, meSX, meSY, meY, meRot, shades, cheer, crowdLean, sunburst, music.beat, bulbFast, spot, push, pushX, stageT, podMe, podOpp]);
  const baseFinPose = useRef<FinPose>('idle');
  const talking = useRef(false);

  const setFin = useCallback((pose: FinPose, squash = true) => {
    baseFinPose.current = pose;
    const idx = FIN_POSE_ORDER.indexOf(pose);
    if (!squash || reducedMotion) { finPose.value = idx; return; }
    // Anticipation 0.92 x 1.08 (80ms), swap, overshoot 1.04 x 0.97 (90ms), settle.
    finSX.value = withSequence(withTiming(0.92, { duration: 80 }), withTiming(1.04, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 320 }));
    finSY.value = withSequence(withTiming(1.08, { duration: 80 }), withTiming(0.97, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 320 }));
    hatRot.value = withSequence(withTiming(-7, { duration: 90 }), withSpring(0, { damping: 8, stiffness: 180 }));
    later(80, () => { finPose.value = idx; });
  }, [finPose, finSX, finSY, hatRot, later, reducedMotion]);

  const finHop = useCallback((n = 1, amp = 1) => {
    if (reducedMotion) return;
    const hop = withSequence(withTiming(-14 * amp, { duration: 140, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 120, easing: Easing.in(Easing.quad) }));
    finY.value = n === 1 ? hop : withRepeat(hop, n);
    hatY.value = withSequence(withDelay(40, withTiming(-6 * amp, { duration: 120 })), withSpring(0, { damping: 6, stiffness: 180 }));
    hatRot.value = withSequence(withTiming(6, { duration: 140 }), withSpring(0, { damping: 6, stiffness: 180 }));
  }, [finY, hatY, hatRot, reducedMotion]);

  // Blink and talk (idle / think families only).
  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    const blink = () => {
      if (!alive) return;
      const base = baseFinPose.current;
      if ((base === 'idle' || base === 'think') && !talking.current) {
        finPose.value = FIN_POSE_ORDER.indexOf(`${base}_blink` as FinPose);
        setTimeout(() => { if (alive && !talking.current) finPose.value = FIN_POSE_ORDER.indexOf(baseFinPose.current); }, 90);
      }
      setTimeout(blink, 2500 + Math.random() * 2500);
    };
    const t = setTimeout(blink, 2000);
    return () => { alive = false; clearTimeout(t); };
  }, [visible, finPose]);

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
    }, 100);
  }, [finPose]);

  const say = useCallback((kind: keyof typeof BARKS) => {
    if (ghost) return;
    barkN.current += 1;
    setBark({ text: pickBark(kind, (seedRef.current + barkN.current) % 97), key: barkN.current });
  }, [ghost]);

  const meHop = useCallback((kind: 'lean' | 'hop' | 'shake' | 'fist' | 'thumbs') => {
    if (reducedMotion) return;
    if (kind === 'lean') {
      meRot.value = withSequence(withTiming(0.07, { duration: 120 }), withDelay(300, withSpring(0)));
      meY.value = withSequence(withTiming(-4, { duration: 120 }), withDelay(300, withSpring(0)));
    } else if (kind === 'hop' || kind === 'fist' || kind === 'thumbs') {
      meY.value = withSequence(withTiming(kind === 'fist' ? -10 : -14, { duration: 140, easing: Easing.out(Easing.cubic) }), withTiming(0, { duration: 120, easing: Easing.in(Easing.quad) }));
      meSX.value = withSequence(withDelay(260, withTiming(1.06, { duration: 60 })), withSpring(1, { damping: 8, stiffness: 300 }));
      meSY.value = withSequence(withDelay(260, withTiming(0.9, { duration: 60 })), withSpring(1, { damping: 8, stiffness: 300 }));
      if (kind === 'fist') meRot.value = withSequence(withTiming(-0.14, { duration: 80 }), withTiming(0.1, { duration: 90 }), withTiming(0, { duration: 90 }));
    } else if (kind === 'shake') {
      meRot.value = withSequence(
        withTiming(-0.09, { duration: 50 }), withTiming(0.09, { duration: 50 }), withTiming(-0.09, { duration: 50 }),
        withTiming(0.09, { duration: 50 }), withTiming(-0.09, { duration: 50 }), withTiming(0, { duration: 50 }),
      );
      meSY.value = withDelay(300, withSequence(withTiming(0.96, { duration: 120 }), withDelay(480, withSpring(1))));
      meY.value = withDelay(300, withSequence(withTiming(4, { duration: 120 }), withDelay(480, withSpring(0))));
    }
  }, [meRot, meY, meSX, meSY, reducedMotion]);

  // -- Clocks, camera, FX ------------------------------------------------------------------
  const qc = useSharedValue<QClock>(freshClock());
  const elapsed = useSharedValue(0);
  const ticker = useSharedValue(200);
  const readProg = useSharedValue(0);
  const remain = useSharedValue(1);

  const dispatchRef = useRef<(ev: number, a: number, b: number) => void>(() => undefined);
  const dispatch = useCallback((ev: number, a: number, b: number) => dispatchRef.current(ev, a, b), []);

  const clock = useGameClock({
    config: { freezeBudget: 0.05 },
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
      if (q.phase === PH_LIVE || q.phase === PH_LOCKED || q.phase === PH_WAIT) {
        const since = q.t - q.unlockAt;
        if (q.freezeLeft > 0) {
          const f = dt < q.freezeLeft ? dt : q.freezeLeft;
          q.freezeLeft -= f;
          q.frozen += f;
          if (q.freezeLeft <= 0) runOnJS(dispatch)(EV_FREEZE_END, 0, 0);
        }
        if (q.kind !== 2 && q.finMs >= 0 && q.leanFired === 0 && since >= q.finMs - 300) {
          q.leanFired = 1;
          runOnJS(dispatch)(EV_FIN_LEAN, 0, 0);
        }
        if (q.finMs >= 0 && q.finFired === 0 && since >= q.finMs) {
          q.finFired = 1;
          runOnJS(dispatch)(EV_FIN, q.finMs, 0);
        }
        if (q.phase === PH_LIVE) {
          const my = since - q.frozen;
          elapsed.value = my;
          if (q.kind === 2) {
            ticker.value = 150 + (q.forfeit ? 0 : speedWorklet(my, q.g, q.h, q.chomp));
            if (q.finBuzzMs >= 0 && q.finBuzzFired === 0 && since >= q.finBuzzMs) {
              q.finBuzzFired = 1;
              q.phase = PH_WAIT;
              runOnJS(dispatch)(EV_FIN_BUZZ, q.finBuzzMs, 0);
              return;
            }
          } else if (q.kind === 1) {
            ticker.value = 100 + (q.forfeit ? 0 : rideSpeedWorklet(my, q.g, q.chomp));
          } else {
            ticker.value = tickerValue(my, q.g, q.h, { chomp: q.chomp === 1, holdForfeit: q.forfeit === 1 });
          }
          const left = q.windowMs - my;
          remain.value = left / q.windowMs;
          const sec = Math.ceil(left / 1000);
          if (sec <= 3 && sec > 0 && sec < q.lastSec) {
            q.lastSec = sec;
            runOnJS(dispatch)(EV_TICK, sec, 0);
          }
          if (left <= 0) {
            q.phase = PH_WAIT;
            runOnJS(dispatch)(EV_TIMEOUT, my, 0);
          }
        }
        return;
      }
      if (q.phase === PH_SUB) {
        q.sub += dt;
        const left = q.subLimit - q.sub;
        remain.value = left / q.subLimit;
        const sec = Math.ceil(left / 1000);
        if (sec <= 3 && sec > 0 && sec < q.lastSec) {
          q.lastSec = sec;
          runOnJS(dispatch)(EV_TICK, sec, 0);
        }
        if (left <= 0) {
          q.phase = PH_WAIT;
          runOnJS(dispatch)(EV_SUB_TIMEOUT, 0, 0);
        }
      }
    },
  });
  const camera = useCamera({ width: W, height: H, timeScale: clock.fxScale, reducedMotion, walking: !!movement?.moving });

  // UI-thread tap gate (tiles).
  const onTapUI = useCallback((i: number) => {
    'worklet';
    const q = qc.value;
    if (q.phase === PH_READ) {
      runOnJS(dispatch)(EV_EARLY, i, 0);
      return;
    }
    if ((q.removed >> i) & 1) return;
    if (q.phase === PH_LIVE && q.kind !== 2) {
      const my = q.t - q.unlockAt - q.frozen;
      if (my < GUARD_MS) {
        runOnJS(dispatch)(EV_EARLY, i, 0);
        return;
      }
      q.phase = PH_LOCKED;
      elapsed.value = my;
      runOnJS(dispatch)(EV_LOCK, i, my);
      return;
    }
    if (q.phase === PH_SUB) {
      q.phase = PH_WAIT;
      runOnJS(dispatch)(EV_SUB_LOCK, i, q.sub);
    }
  }, [qc, dispatch, elapsed]);

  const onBuzzUI = useCallback(() => {
    runOnUI(() => {
      'worklet';
      const q = qc.value;
      if (q.phase !== PH_LIVE || q.kind !== 2) return;
      const my = q.t - q.unlockAt - q.frozen;
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
      const my = q.t - q.unlockAt - q.frozen;
      if (my < GUARD_MS) return;
      q.phase = PH_LOCKED;
      elapsed.value = my;
      runOnJS(dispatch)(EV_LOCK, -1, my);
    })();
  }, [qc, dispatch, elapsed]);

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

  // -- Setup / rematch -----------------------------------------------------------------------
  const tileGeom = useMemo(() => {
    const n = round?.question.choices.length ?? 4;
    const gap = 12;
    const zoneW = Math.min(W - 32, 380);
    if (round?.question.format === 'opened' || n === 3) {
      return { cols: 1, w: zoneW, h: Math.min(68, (ZONE_H - 2 * gap) / 3), gap, zoneW };
    }
    if (n === 2) return { cols: 2, w: (zoneW - gap) / 2, h: Math.min(150, ZONE_H * 0.62), gap, zoneW };
    return { cols: 2, w: (zoneW - gap) / 2, h: Math.min(104, (ZONE_H - gap - 10) / 2), gap, zoneW };
  }, [round, W, ZONE_H]);

  const tileCenter = useCallback((i: number) => {
    const g = tileGeom;
    const left = (W - g.zoneW) / 2;
    const col = g.cols === 1 ? 0 : i % 2;
    const row = g.cols === 1 ? i : Math.floor(i / 2);
    return { x: left + col * (g.w + g.gap) + g.w / 2, y: ZONE_TOP + row * (g.h + g.gap) + g.h / 2 };
  }, [tileGeom, W, ZONE_TOP]);

  const stamp = useCallback((text: string, color: string, size: number, x: number, y: number, sub?: string) => {
    stampKey.current += 1;
    const spec = { key: stampKey.current, text, color, size, x, y, sub };
    setStamps((s) => [...s.slice(-2), spec]);
    later(900, () => setStamps((s) => s.filter((k) => k.key !== spec.key)));
  }, [later]);

  const beginMatch = useCallback(async (rematch: boolean) => {
    clearTimers();
    setPhase('loading');
    setResults(null);
    setShellResult(null);
    const mem = await loadMemory();
    if (!poolRef.current.length) poolRef.current = props.pool ?? await loadPool({ rideId, parkId, chapterId });
    const seed = rematch ? mixSeed(seedRef.current, 0x9e37 + playsRef.current) : (baseSeed >>> 0);
    seedRef.current = seed;
    const rank = mode === 'queue' || mode === 'practice' ? currentRank(mem) : 'firstmate';
    rankRef.current = FIN_RANKS[rank].label;
    let p: MatchPlan | null = null;
    if (ghost) p = planFromIds(ghost.mode === 'ride' ? 'queue' : ghost.mode, ghost.seed, ghost.qids, poolRef.current, rank);
    if (!p) p = planMatch(mode === 'ghost' ? 'queue' : mode, seed, poolRef.current, { parkId, seen: mem.seen, rank });
    if (__DEV__) console.log('[trivia-duel] plan', { seed, seen: mem.seen.length, pool: poolRef.current.length, ids: p.rounds.map((r) => r.question.id) });
    const carry = mode === 'queue' || mode === 'practice' ? activeCarry(mem, Date.now()) : { streak: 0, shield: false };
    carryRef.current = carry;
    tally.current = createTally(carry.streak, carry.shield);
    resultsLog.current = [];
    factsRef.current = [];
    setStreakView({ streak: carry.streak, shield: carry.shield });
    setScores({ me: 0, opp: 0 });
    setTray({ chomp: true, freeze: false, peek: false });
    setPips(p.rounds.map((_, i) => (i === 0 ? 'current' : 'pending')));
    setLocks({ me: null, opp: null });
    setStakes({ me: null, opp: null });
    shades.value = withTiming(carry.streak >= 3 ? 1 : 0);
    podMe.value = withTiming(0);
    podOpp.value = withTiming(0);
    spot.value = 0;
    push.value = 1;
    setPlan(p);
    playsRef.current += 1;
    startedAt.current = Date.now();
    resetFreeBeat();
    setMusicBed(BEDS.duel);
    setFin('idle', false);
    // VS intro: 1400ms first match of the session, 600ms plays 2-3, skipped on REMATCH / ride compress.
    const vsMs = rematch ? 0 : isRide ? (mem.vsSeen >= CEREMONY.vsCompressAfterPlays ? 0 : 800) : mem.vsSeen === 0 ? CEREMONY.vsFirstMs : mem.vsSeen < CEREMONY.vsCompressAfterPlays ? CEREMONY.vsShortMs : 0;
    void updateMemory((m) => { m.vsSeen += 1; m.plays += 1; });
    if (vsMs > 0) {
      setPhase('intro');
      setVs({ ms: vsMs });
      if (!reducedMotion) {
        pushX.value = 60;
        pushX.value = withTiming(0, { duration: 140 });
      }
      later(Math.round(vsMs * 0.29), () => {
        sfx(CUE.vsSlam);
        Haptic.comboHeavy();
        camera.shake(0.35);
        clock.hitStop(120, { force: true });
        fx.current?.burst('sparks', W / 2, H * 0.42, { count: 24 });
      });
      later(Math.round(vsMs * 0.8), () => say('intro'));
    } else {
      F.current.startRound(p, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSeed, mode, rideId, parkId, chapterId, ghost, isRide, props.pool, W, H]);

  const onVsDone = useCallback(() => {
    setVs(null);
    if (plan && phase === 'intro') F.current.startRound(plan, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, phase]);

  // -- Round flow -------------------------------------------------------------------------------
  const startRound = useCallback((p: MatchPlan, i: number) => {
    const r = p.rounds[i];
    if (!r) return;
    setRoundIdx(i);
    setRound(r);
    setPips((ps) => ps.map((s, k) => (k === i ? 'current' : s)));
    resolved.current = { me: false, opp: false, revealing: false };
    meIn.current = { ...NO_INPUT };
    setUsedThisQ(false);
    setChomped([]);
    setNarrow(null);
    setFrozen(false);
    setPeekLean(-1);
    setSubMode(null);
    setBellOn(false);
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
    // Opponent's input for this round.
    if (ghost) oppIn.current = ghostInput(ghost, i);
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
    const first = playsRef.current <= 1 && r.index === 0;
    const label = isRide ? `QUESTION ${r.index + 1} OF ${p.rounds.length}` : `ROUND ${r.index + 1}  ${ROUND_NAMES[r.spec.type]}`;
    setRibbon({ text: isRide ? `QUESTION ${r.index + 1}` : `ROUND ${r.index + 1}`, key: Date.now(), hold: first ? CEREMONY.ribbonHoldFirstMs : 0 });
    sfx(CUE.whoosh, { volume: 0.7 });
    void label;
    setFin('idle');
    readProg.value = 0;
    remain.value = 1;
    elapsed.value = 0;
    ticker.value = isRide ? 250 : r.spec.type === 'buzz' ? 250 : 200;
    const o = oppIn.current;
    const isBuzz = r.spec.type === 'buzz';
    setClock({
      phase: PH_READ, t: 0, unlockAt: r.readLockMs + r.jitterMs, windowMs: r.windowMs,
      finMs: isBuzz ? -1 : o.lockMs, finFired: 0,
      finBuzzMs: isBuzz ? (o.buzzMs ?? -1) : -1, finBuzzFired: 0, leanFired: 0,
      frozen: 0, freezeLeft: 0, sub: 0, subLimit: 1, lastSec: 99, g: r.graceMs, h: r.horizonMs,
      kind: isRide ? 1 : isBuzz ? 2 : 0, chomp: 0, forfeit: 0, removed: 0, lastSim: -1,
    });
    if (isBuzz && playsRef.current <= 1) say('buzz');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRide, setClock]);

  // FIN'S FINAL: interstitial (push-in, spotlights, stamp + full-frame flash 1 of 2), category card, wager.
  const runFinalIntro = useCallback(async (p: MatchPlan, r: PlannedRound) => {
    setPhase('finalIntro');
    setMusicBed(BEDS.finalClosed);
    if (!reducedMotion) {
      push.value = withTiming(1.06, { duration: beatMs(true) * 2, easing: Easing.inOut(Easing.cubic) });
      spot.value = withTiming(1, { duration: 400 });
    }
    const d = await msToGrid(2);
    later(d, () => {
      stamp("FIN'S FINAL", C.gold, 52, W / 2, H * 0.36);
      sfx(CUE.stamp);
      Haptic.comboHeavy();
      if (!reducedMotion) fx.current?.flash({ color: '#ffffff', peak: 0.6, ms: 160 });
      setFinalCard(r.question.category);
      const t = tally.current;
      setFin(t.opp.score > t.me.score ? 'point' : 'nervous');
      say(t.opp.score > t.me.score ? 'finalLead' : 'finalTrail');
    });
    later(d + CEREMONY.categoryCardMs, () => {
      setFinalCard(null);
      setMusicBed(BEDS.finalOpen);
      const st = wagerStakes(tally.current.me.score);
      finalWager.current = WAGER.defaultIndex;
      setWager({ stakes: st, picked: WAGER.defaultIndex, left: 5 });
      setPhase('wager');
      let left = 5;
      const tick = () => {
        left -= 1;
        if (left <= 0) {
          F.current.lockWager(p, r);
          return;
        }
        setWager((w) => (w ? { ...w, left } : w));
        later(1000, tick);
      };
      later(1000, tick);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, reducedMotion]);

  const wagerLocked = useRef(false);
  const lockWager = useCallback((p: MatchPlan, r: PlannedRound) => {
    if (wagerLocked.current) return;
    wagerLocked.current = true;
    const st = wagerStakes(tally.current.me.score);
    meIn.current.stake = st[finalWager.current];
    setWager(null);
    setStakes({ me: '?', opp: '?' });
    sfx(CUE.chip);
    Haptic.hitMedium();
    later(250, () => {
      wagerLocked.current = false;
      F.current.presentQuestion(p, r);
    });
  }, [presentQuestion, later]);

  const pickWager = useCallback((i: number) => {
    finalWager.current = i;
    setWager((w) => (w ? { ...w, picked: i } : w));
    sfx(CUE.chip);
    Haptic.tapLight();
    if (plan && round) later(220, () => F.current.lockWager(plan, round));
  }, [plan, round, lockWager, later]);

  // -- Events from the UI thread ------------------------------------------------------------------
  const finLockLabel = useCallback((ms: number) => `${oppName} ${(ms / 1000).toFixed(1)}s`, [oppName]);

  const resolveOppShown = useCallback(() => {
    if (resolved.current.opp) return;
    resolved.current.opp = true;
    const o = oppIn.current;
    if (o.lockMs < 0 && o.guess == null && o.choice < 0) {
      setLocks((l) => ({ ...l, opp: 'NO ANSWER' }));
      return;
    }
    setLocks((l) => ({ ...l, opp: finLockLabel(o.lockMs) }));
    sfx(CUE.oppLock, { pan: 0.6 });
    Haptic.tapLight();
    if (!ghost) {
      setFin('point');
      fx.current?.burst('puff', W * 0.8, RAIL_H + STAGE_H * 0.4, { count: 4 });
    }
  }, [finLockLabel, ghost, setFin, W, STAGE_H]);

  const maybeReveal = useCallback(() => {
    if (!resolved.current.me || !resolved.current.opp || resolved.current.revealing) return;
    resolved.current.revealing = true;
    void F.current.reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLockVisuals = useCallback((i: number, t: number) => {
    setTiles((ts) => ts.map((s, k) => (k === i ? 'locked' : s === 'removed' ? s : 'dim')));
    sfx(CUE.lockIn);
    later(12, () => Haptic.hitMedium());
    setLocks((l) => ({ ...l, me: `${(t / 1000).toFixed(1)}s` }));
    if (!reducedMotion) push.value = withTiming(1.03, { duration: beatMs(), easing: Easing.out(Easing.cubic) });
    meHop('lean');
    if (t < 1500 && !ghost && !isRide) {
      setFin('surprised');
      say('youFast');
    }
  }, [later, reducedMotion, push, meHop, ghost, isRide, setFin, say]);

  dispatchRef.current = (ev: number, a: number, b: number) => {
    const r = round;
    if (!r || !plan) return;
    if (AUTOPLAY) autoplayOn(ev, r);
    switch (ev) {
      case EV_UNLOCK: {
        if (r.spec.type === 'buzz') {
          setTiles((ts) => ts.map(() => 'dim'));
          setBellOn(true);
        } else setTiles((ts) => ts.map((s) => (s === 'down' ? 'up' : s)));
        sfx(CUE.unlock);
        Haptic.tickSelection();
        if (!ghost) {
          setFin('think');
          sfx(CUE.think, { volume: 0.5, pan: 0.6 });
        }
        return;
      }
      case EV_FIN_LEAN: {
        // His only tell (Quick Draw): a 6pt lean, the hat lags on its spring.
        if (!ghost && !reducedMotion) {
          finRot.value = withSequence(withTiming(-0.06, { duration: 180 }), withDelay(260, withSpring(0, { damping: 9, stiffness: 200 })));
          hatRot.value = withSequence(withDelay(40, withTiming(5, { duration: 160 })), withSpring(0, { damping: 6, stiffness: 180 }));
        }
        return;
      }
      case EV_EARLY: {
        setWiggle((w) => w.map((v, k) => (k === a ? v + 1 : v)));
        return;
      }
      case EV_TICK: {
        sfx(CUE.tickHeavy);
        Haptic.warning();
        return;
      }
      case EV_FIN: {
        if (r.spec.type === 'buzz') return;
        resolveOppShown();
        maybeReveal();
        return;
      }
      case EV_LOCK: {
        const t = b;
        meIn.current = r.question.format === 'closest'
          ? { ...meIn.current, choice: -1, lockMs: t, guess: sliderValRef.current }
          : { ...meIn.current, choice: a, lockMs: t };
        resolved.current.me = true;
        if (a >= 0) doLockVisuals(a, t);
        else {
          sfx(CUE.lockIn);
          Haptic.hitMedium();
          setLocks((l) => ({ ...l, me: `${(t / 1000).toFixed(1)}s` }));
        }
        if (!resolved.current.opp) {
          // Solo/ghost: the opponent's lock is already known, so it resolves at +350ms.
          later(FIN_RESOLVE_AFTER_MS, () => { resolveOppShown(); maybeReveal(); });
        } else maybeReveal();
        return;
      }
      case EV_TIMEOUT: {
        if (r.spec.type === 'buzz') {
          // Nobody buzzed by 8s: tiles open to everyone for 4s, flat 50.
          setBellOn(false);
          setChip('OPEN TILES!');
          setTiles((ts) => ts.map((s) => (s === 'removed' ? s : 'up')));
          const o = oppIn.current;
          oppIn.current = { choice: o.choice, lockMs: BUZZ.buzzWindowMs + Math.min(3000, 900 + (o.lockMs % 1500)), buzzMs: -1 };
          setSubMode('open');
          setClock({ phase: PH_SUB, sub: 0, subLimit: BUZZ.openPhaseMs, lastSec: 99 });
          later(Math.min(3000, 900 + (o.lockMs % 1500)), () => resolveOppShown());
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
        // Opponent rang first.
        setBellOn(false);
        setChip(`${oppName.toUpperCase()} BUZZED!`);
        Haptic.tapLight();
        sfx(CUE.bell, { volume: 0.6, pan: 0.6 });
        if (!ghost) setFin('point');
        meIn.current = { ...meIn.current, buzzMs: -1 };
        const o = oppIn.current;
        later(900, () => {
          setChip(null);
          setLocks((l) => ({ ...l, opp: finLockLabel(a) }));
          if (o.choice === r.question.correctIndex) {
            resolved.current.me = true;
            resolved.current.opp = true;
            maybeReveal();
          } else {
            // Wrong buzz: the tile crumbles, you steal.
            crumble(o.choice);
            stamp('STEAL!', C.coral, 44, W / 2, ZONE_TOP - 20);
            sfx(CUE.steal);
            say('steal');
            resolved.current.opp = true;
            setTiles((ts) => ts.map((s, k) => (k === o.choice ? 'removed' : 'up')));
            setClock({ removed: 1 << Math.max(0, o.choice) });
            setSubMode('steal');
            setClock({ phase: PH_SUB, sub: 0, subLimit: BUZZ.answerMs, lastSec: 99 });
          }
        });
        return;
      }
      case EV_BUZZ: {
        const my = a;
        const o = oppIn.current;
        let iWin = true;
        if (o.buzzMs != null && o.buzzMs >= 0 && Math.abs(o.buzzMs - my) <= BUZZ.photoFinishMs) {
          const coin = (mixSeed(seedRef.current, 0xc01 + r.index) % 1000) / 1000;
          iWin = coin < 0.5;
          setPolaroid((p) => p + 1);
          sfx(CUE.photo);
          if (!reducedMotion) crowdLean.value = withSequence(withTiming(1, { duration: 200 }), withDelay(400, withSpring(0)));
          if (!iWin) {
            setClock({ phase: PH_WAIT, finBuzzFired: 1 });
            later(700, () => dispatchRef.current(EV_FIN_BUZZ, o.buzzMs ?? my, 0));
            return;
          }
        }
        // You win the bell.
        meIn.current = { ...meIn.current, buzzMs: my };
        oppIn.current = { ...o, buzzMs: -1 };
        setBellKey((k) => k + 1);
        setBellOn(false);
        sfx(CUE.bell);
        Haptic.comboHeavy();
        camera.shake(0.3);
        clock.hitStop(BUZZ.hitStopMs, { force: true });
        fx.current?.ring(W / 2, ZONE_TOP + 70, { color: C.gold, from: 60, to: 180, ms: 260 });
        meHop('fist');
        setLocks((l) => ({ ...l, me: `${(my / 1000).toFixed(1)}s` }));
        setTiles((ts) => ts.map((s) => (s === 'removed' ? s : 'up')));
        setSubMode('buzzAnswer');
        setClock({ phase: PH_SUB, sub: 0, subLimit: BUZZ.answerMs, lastSec: 99, finFired: 1 });
        return;
      }
      case EV_SUB_LOCK:
      case EV_SUB_TIMEOUT: {
        const pick = ev === EV_SUB_LOCK ? a : -1;
        const subT = ev === EV_SUB_LOCK ? b : -1;
        if (pick >= 0) {
          setTiles((ts) => ts.map((s, k) => (k === pick ? 'locked' : s === 'removed' ? s : 'dim')));
          sfx(CUE.lockIn);
          Haptic.hitMedium();
        }
        if (subMode === 'buzzAnswer') {
          meIn.current = { ...meIn.current, choice: pick, lockMs: meIn.current.buzzMs ?? -1 };
          resolved.current.me = true;
          if (pick !== r.question.correctIndex) {
            // Your buzz was wrong: the opponent steals.
            const steal = ghost
              ? { stealChoice: ghostStealPick(oppIn.current, pick), stealMs: oppIn.current.stealMs ?? 1500 }
              : (() => { const f = finInput(plan, r, tally.current, pick).input; return { stealChoice: f.stealChoice, stealMs: f.stealMs }; })();
            oppIn.current = { ...oppIn.current, ...steal };
            later(420, () => {
              if (pick >= 0) crumble(pick);
              stamp('STEAL!', C.coral, 44, W * 0.7, ZONE_TOP - 20);
              sfx(CUE.steal);
              setTiles((ts) => ts.map((s, k) => (k === pick ? 'removed' : s)));
            });
            later(420 + Math.min(2400, steal.stealMs ?? 1500), () => {
              setLocks((l) => ({ ...l, opp: finLockLabel(steal.stealMs ?? 0) }));
              resolved.current.opp = true;
              maybeReveal();
            });
          } else {
            resolved.current.opp = true;
            maybeReveal();
          }
        } else if (subMode === 'steal') {
          meIn.current = { ...meIn.current, stealChoice: pick, stealMs: subT };
          resolved.current.me = true;
          maybeReveal();
        } else if (subMode === 'open') {
          meIn.current = { ...meIn.current, choice: pick, lockMs: pick >= 0 ? BUZZ.buzzWindowMs + subT : -1 };
          resolved.current.me = true;
          resolveOppShown();
          maybeReveal();
        }
        setSubMode(null);
        return;
      }
      case EV_FREEZE_END: {
        setFrozen(false);
        sfx(CUE.unfreeze);
        fx.current?.burst('bubbles', W - 60, CARD_TOP + 40, { count: 14 });
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

  // -- Reveal (11.4) -----------------------------------------------------------------------------
  const reveal = useCallback(async () => {
    const r = round;
    const p = plan;
    if (!r || !p) return;
    setPhase('reveal');
    const scoreBefore = { me: tally.current.me.score, opp: tally.current.opp.score };
    const coin = (mixSeed(seedRef.current, 0xc01 + r.index) % 1000) / 1000;
    const res = resolveRound(isRide ? 'ride' : 'queue', r, meIn.current, oppIn.current, tally.current, coin);
    resultsLog.current.push(res);
    const q = r.question;
    const tension = !isRide && (r.spec.type !== 'quick' || res.decisive || !!res.buzz?.steal) || (isRide && r.index === p.rounds.length - 1);
    const final = r.spec.type === 'final';

    let wait = await msToGrid(0.5);
    if (tension && !reducedMotion) {
      await sleep(wait);
      GameAudio.duck(8, 80, final ? 1100 : 520, 300);
      sfx(final ? 'sh_drumroll_1022ms' : 'sh_drumroll_441ms');
      bulbFast.value = 1;
      push.value = withTiming(1.05, { duration: beatMs(final) * (final ? 2 : 1) });
      const beat = beatMs(final) * (final ? 2 : 1);
      for (let k = 0; k < 4; k++) later(beat - beatMs(final) + k * (beatMs(final) / 4), () => Haptic.tickSelection());
      await sleep(beat);
      bulbFast.value = 0;
      clock.hitStop(CEREMONY.tensionHitStopMs, { force: true });
      wait = 0;
    }
    await sleep(wait);

    // Tiles, heads pile-up, bloom, camera punch.
    const correctIdx = q.correctIndex;
    const myPick = r.spec.type === 'buzz' && res.buzz?.steal && res.buzz.first === 'opp' ? meIn.current.stealChoice ?? -1 : meIn.current.choice;
    const oppPick = r.spec.type === 'buzz' && res.buzz?.steal && res.buzz.first === 'me' ? oppIn.current.stealChoice ?? -1 : oppIn.current.choice;
    if (q.format !== 'closest') {
      setTiles((ts) => ts.map((s, k) => (s === 'removed' ? s : k === correctIdx ? 'correct' : k === myPick ? 'wrong' : 'reveal-dim')));
      const h: SharkLook[][] = q.choices.map(() => []);
      if (myPick >= 0) h[myPick].push('classic');
      if (!isRide && oppPick >= 0 && oppPick < h.length) h[oppPick].push(ghost ? opponentLook as SharkLook : 'blue');
      later(60, () => setHeads(h));
      const cc = tileCenter(Math.max(0, correctIdx));
      fx.current?.bloom(cc.x, cc.y, { color: C.gold, radius: Math.hypot(tileGeom.w, tileGeom.h) * 0.9, peak: 0.9, ms: 220 });
      if (!reducedMotion) camera.punch(0.03);
    } else if (q.slider) {
      stamp(String(q.slider.truth), C.gold, 44, W / 2, ZONE_TOP + 10, res.me.bullseye ? 'BULLSEYE!' : `You: ${meIn.current.guess ?? '-'}`);
    }
    setStakes(final ? { me: `${res.me.stake}`, opp: isRide ? null : `${res.opp.stake}` } : { me: null, opp: null });

    // Your outcome.
    const meOK = res.me.correct;
    const tier = res.me.tier;
    if (meOK) {
      const pts = res.me.points;
      const txt = TIER_TEXT[tier] || `+${pts}`;
      stamp(txt, TIER_COLOR[tier], tier === 'lightning' ? 40 : tier === 'none' ? 30 : 34, W * 0.3, RAIL_H + STAGE_H * 0.35, TIER_TEXT[tier] ? `+${pts}` : undefined);
      sfxLadder(CUE.correct, TIER_STEP[tier]);
      later(12, () => Haptic.success());
      meHop(res.me.stole || res.me.buzzedFirst ? 'fist' : 'hop');
      if (!reducedMotion) cheer.value = withSequence(withTiming(1, { duration: 160 }), withDelay(700, withTiming(0, { duration: 300 })));
      const from = q.format === 'closest' ? { x: W / 2, y: ZONE_TOP + 40 } : tileCenter(Math.max(0, correctIdx));
      const coins = res.decisive ? TIER_COINS[tier] + 6 : TIER_COINS[tier];
      later(200, () => {
        if (res.decisive && !reducedMotion) clock.slowMo(0.3, 500, 150);
        fx.current?.burst('coins', from.x, from.y, { count: coins, tx: scoreAnchor.x, ty: scoreAnchor.y });
        fx.current?.burst('sparkles', from.x, from.y, { count: tier === 'lightning' ? 24 : tier === 'great' ? 14 : 8 });
      });
      if (res.me.bullseye) sfx(CUE.stamp);
    } else if (r.spec.type !== 'buzz' || res.buzz?.first === 'me' || res.buzz?.open || (res.buzz?.steal && res.buzz.first === 'opp')) {
      sfx(CUE.wrong, { volume: 0.55 });
      later(12, () => Haptic.comboHeavy());
      meHop('shake');
      if (res.me.points < 0) stamp(`${res.me.points}`, C.coral, 34, W * 0.3, RAIL_H + STAGE_H * 0.35);
    }

    // Opponent reaction (same frame).
    if (!isRide) {
      if (!ghost) {
        if (res.opp.correct) { setFin('cheer'); finHop(meOK ? 1 : 2, meOK ? 0.6 : 1); if (!meOK) sfx(CUE.streakStep, { volume: 0.5 }); say('finCorrect'); }
        else if (oppIn.current.lockMs >= 0 || oppIn.current.buzzMs != null) { setFin('surprised'); later(380, () => setFin('sheepish')); sfx(CUE.oops, { volume: 0.7, pan: 0.6 }); say(meOK ? 'youCorrect' : 'finWrong'); }
        else if (meOK) { setFin('cheer'); finHop(2, 0.6); say('youCorrect'); }
      } else if (res.opp.correct) finHop(1, 0.6);
    }

    // Streak events.
    const sEv = res.me.streak;
    if (sEv) {
      if (sEv.ignited || sEv.blazing) {
        const d = await msToGrid(2);
        later(d, () => {
          sfx(CUE.ignite);
          Haptic.comboHeavy();
          fx.current?.burst('embers', W * 0.5, 38, { count: 16 });
          fx.current?.bloom(W * 0.5, 40, { color: C.gold, radius: 70, peak: 0.8, ms: 300 });
          if (sEv.ignited) {
            stamp('HOT STREAK!', C.coral, 36, W / 2, RAIL_H + 40, 'SHIELD UP');
            if (!reducedMotion) shades.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.back(2)) });
          } else stamp('BLAZING!', C.gold, 38, W / 2, RAIL_H + 40);
        });
        setMusicBed(sEv.blazing ? BEDS.blazing : BEDS.hot);
      } else if (sEv.shieldUsed) {
        sfx(CUE.shieldPop);
        stamp('SHIELD!', C.gold, 32, W / 2, RAIL_H + 40, 'Streak saved');
      } else if (sEv.broke) {
        sfx(CUE.fizz, { volume: 0.7 });
        shades.value = withTiming(0, { duration: 300 });
        if (!final) setMusicBed(BEDS.duel);
      } else if (sEv.streak > 0 && !isRide) sfx(CUE.streakStep, { volume: 0.45 });
      if (sEv.freezeGranted && !isRide) { setTray((t) => ({ ...t, freeze: true })); sfx(CUE.powerup); Haptic.tapLight(); }
    }
    if (!isRide && (res.me.stole || (res.me.buzzedFirst && res.me.correct))) setTray((t) => ({ ...t, peek: true }));
    setStreakView({ streak: tally.current.me.streak.streak, shield: tally.current.me.streak.shield });
    sunburst.value = withTiming([0.35, 0.45, 0.6, 0.85, 0.85, 1][flameTier(tally.current.me.streak.streak)] ?? 0.35, { duration: 400 });

    // Scores and pips.
    later(200, () => setScores({ me: tally.current.me.score, opp: tally.current.opp.score }));
    setPips((ps) => ps.map((s, k) => (k === r.index ? (meOK && res.opp.correct ? 'both' : meOK ? 'me' : res.opp.correct ? 'opp' : 'none') : s)));
    if (q.fact) factsRef.current.push({ id: q.id, fact: q.fact, source: q.source, tpsArticleUrl: q.tpsArticleUrl, gold: meOK && (tier === 'great' || tier === 'lightning'), at: Date.now() });
    void scoreBefore;

    // Next.
    setPhase('between');
    const next = () => {
      nextTap.current = null;
      clearTimers();
      push.value = withTiming(1, { duration: 300 });
      F.current.advance();
    };
    nextTap.current = next;
    later((res.decisive ? 1500 : CEREMONY.nextQuestionMs) + (tension ? 400 : 250), next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, plan, isRide, ghost, reducedMotion, W, H, tileCenter, tileGeom]);

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
      // SUDDEN DEATH: one medium Quick Draw.
      const sd = suddenDeathRound(p, poolRef.current, []);
      const np = { ...p, rounds: [...p.rounds, sd] };
      setPlan(np);
      setPips((ps) => [...ps, 'pending']);
      stamp('SUDDEN DEATH!', C.coral, 40, W / 2, H * 0.4);
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
      fin_rank: rankRef.current,
      forfeit,
      rounds: t.me.log,
      qids: plan?.rounds.map((r) => r.question.id) ?? [],
      elapsed_ms: Date.now() - startedAt.current,
    };
  }, [isRide, mode, plan]);

  const finishMatch = useCallback(async () => {
    const p = plan;
    if (!p) return;
    clearTimers();
    setClock({ phase: PH_IDLE });
    const t = tally.current;
    const facts = factsRef.current;
    if (isRide) {
      const stars = rideStars(t.me.correct, p.rounds.length, t.me.score);
      setMusicBed(null);
      sfx(rideWon(t.me.correct) ? CUE.win : CUE.lose);
      void updateMemory((m) => { rememberSeen(m, p.rounds.map((r) => r.question.id), p.rounds.flatMap((r) => factKeysOf(r.question))); addFactCards(m, facts); });
      setShellResult({
        score: t.me.score,
        stars,
        message: rideWon(t.me.correct) ? (t.me.score > t.opp.score ? 'FIN BEATEN!' : 'Ride coin earned!') : `${t.me.correct} of ${p.rounds.length} right. You need 2.`,
        thresholds: { one: 200, two: 420, three: 600 },
        stats: [
          { label: 'Correct', value: `${t.me.correct}/${p.rounds.length}` },
          { label: 'Fastest', value: t.me.fastestMs >= 0 ? `${(t.me.fastestMs / 1000).toFixed(1)}s` : '-' },
        ],
        meta: buildMeta(),
      } as GameResult);
      setPhase('results');
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
    void mem;

    // Podiums, crown, stingers.
    setMusicBed(null);
    if (!reducedMotion) {
      push.value = withTiming(0.94, { duration: 600 });
      spot.value = withTiming(0, { duration: 400 });
      podMe.value = withTiming(won ? 30 : 10, { duration: 500, easing: Easing.out(Easing.back(1.6)) });
      podOpp.value = withTiming(won ? 10 : 30, { duration: 500, easing: Easing.out(Easing.back(1.6)) });
    }
    sfx(won ? CUE.win : CUE.lose);
    if (won) {
      later(260 + beatMs() * 1.5 + 260, () => {
        clock.hitStop(50, { force: true });
        camera.shake(0.35);
        Haptic.success();
        if (!reducedMotion) fx.current?.flash({ color: '#ffffff', peak: 0.6, ms: 160 });
        fx.current?.burst('confetti', W / 2, H * 0.3, { count: 60 });
        sfx(CUE.crowd);
        if (!reducedMotion) cheer.value = withRepeat(withSequence(withTiming(1, { duration: 200 }), withTiming(0.4, { duration: 200 })), 4, true);
      });
      if (!ghost) { setFin('dizzy'); sfx(CUE.bonk, { pan: 0.6 }); say('finLoses'); }
      if (!reducedMotion) meY.value = withRepeat(withSequence(withTiming(-14, { duration: beatMs() / 2 }), withTiming(0, { duration: beatMs() / 2 })), 3);
    } else {
      Haptic.failBuzz();
      if (!ghost) { setFin('cheer'); finHop(2); say('finWins'); }
      meHop('shake');
      later(900, () => meHop('thumbs'));
    }
    const rows = [
      { label: 'Correct', value: `${t.me.correct}/${p.rounds.length}` },
      { label: 'Fastest', value: t.me.fastestMs >= 0 ? `${(t.me.fastestMs / 1000).toFixed(1)}s` : '-' },
      { label: 'Best tier', value: TIER_TEXT[t.me.bestTier].replace('!', '') || 'NONE' },
      { label: 'Streak', value: String(t.me.streak.streak) },
    ];
    setResults({
      won, tie: t.me.score === t.opp.score, myScore: t.me.score, oppScore: t.opp.score, oppName,
      banners, nearMiss: nm.line, rows, facts: newCards.slice(0, 8), stars, practice: mode === 'practice',
    });
    setPhase('results');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, isRide, ghost, mode, myName, oppName, reducedMotion, W, H, buildMeta]);

  const onContinue = useCallback(() => {
    const t = tally.current;
    const stars = results?.stars ?? 0;
    const meta = buildMeta();
    setMusicBed(null);
    if (stars > 0) onComplete(stars >= 3 ? 1.5 : stars === 2 ? 1.25 : 1, meta);
    else onClose();
    void t;
  }, [results, buildMeta, onComplete, onClose]);

  const onRematch = useCallback(() => {
    setGhost(null);
    setResults(null);
    setRunKey((k) => k + 1);
    void beginMatch(true);
  }, [beginMatch]);

  const onPassToCrew = useCallback(async () => {
    const mem = await loadMemory();
    const g = listGhosts(mem)[0];
    if (!g) return;
    setResults(null);
    setGhost({ ...g, name: g.name === myName ? 'Crew ghost' : g.name, look: 'blue' });
  }, [myName]);
  // Starting a ghost duel after "pass to crew".
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
      const alive = tilesRef.current.map((t, k) => (t !== 'removed' ? k : -1)).filter((k) => k >= 0);
      const x = alive.includes(i) ? i : alive.includes(q.correctIndex) ? q.correctIndex : alive[0] ?? i;
      runOnUI((y: number) => { 'worklet'; onTapUI(y); })(x);
    });
    if (ev === EV_UNLOCK) {
      const ms = 900 + skill * 2200;
      if (r.spec.type === 'buzz') later(ms * 0.7, onBuzzUI);
      else if (q.format === 'closest' && q.slider) {
        const guess = q.slider.truth + (skill < 0.7 ? 0 : 3);
        later(ms * 0.6, () => setSliderVal(guess));
        later(ms, lockSlider);
      } else {
        if (k % 4 === 1 && tray.chomp && q.choices.length >= 3) later(400, useChomp);
        tapAt(pick, ms);
      }
    } else if (ev === EV_BUZZ) tapAt(pick, 700);
    else if (ev === EV_FIN_BUZZ && oppIn.current.choice !== q.correctIndex) tapAt(q.correctIndex, 2000);
    else if (ev === EV_TIMEOUT && r.spec.type === 'buzz') tapAt(pick, 1200);
  };
  useEffect(() => {
    if (!AUTOPLAY) return;
    if (phase === 'wager') later(1400, () => pickWager(2));
    if (phase === 'results' && results) later(6000, () => (playsRef.current < 2 ? onRematch() : playsRef.current === 2 && !ghost ? void onPassToCrew() : onContinue()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, results]);

  F.current = { startRound, presentQuestion, runFinalIntro, reveal, advance, finishMatch, lockWager };

  // -- Lifelines (6) -------------------------------------------------------------------------------------
  const canLifeline = phase === 'question' && !usedThisQ && round != null && (subMode === null || subMode === 'buzzAnswer');
  const useChomp = useCallback(() => {
    const r = round;
    if (!r || !tray.chomp || usedThisQ) return;
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
        fx.current?.burst('puff', c.x, c.y, { count: 10 });
      }));
      later(460, () => setTiles((ts) => ts.map((s, k) => (rm.includes(k) ? 'removed' : s))));
      setClock({ removed: rm.reduce((m, i) => m | (1 << i), 0) });
    }
    setClock({ chomp: 1 });
    setTray((t) => ({ ...t, chomp: false }));
    setUsedThisQ(true);
  }, [round, tray.chomp, usedThisQ, later, tileCenter, setClock]);

  const useFreeze = useCallback(() => {
    if (!tray.freeze || usedThisQ) return;
    setClock({ freezeLeft: 4000 });
    setFrozen(true);
    sfx(CUE.freeze);
    fx.current?.burst('sparkles', W - 60, CARD_TOP + 40, { count: 10, color: packHex(C.frost) });
    setTray((t) => ({ ...t, freeze: false }));
    setUsedThisQ(true);
  }, [tray.freeze, usedThisQ, setClock, W, CARD_TOP]);

  const usePeek = useCallback(() => {
    if (!tray.peek || usedThisQ || !round) return;
    sfx(CUE.sonar);
    if (ghost) {
      setChip(resolved.current.opp ? `${oppName} has locked` : `${oppName} is still thinking`);
      later(2000, () => setChip(null));
    } else {
      setPeekLean(oppIn.current.choice);
      later(2000, () => setPeekLean(-1));
    }
    setTray((t) => ({ ...t, peek: false }));
    setUsedThisQ(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tray.peek, usedThisQ, round, ghost, oppName, later]);

  const twoTile = (round?.question.choices.length ?? 4) <= 2;
  const lifelineButtons: ('chomp' | 'freeze' | 'peek')[] = [];
  if (canLifeline && round) {
    const buzz = round.spec.type === 'buzz';
    if (tray.chomp && !twoTile && (!buzz || subMode === 'buzzAnswer')) lifelineButtons.push('chomp');
    if (!isRide && tray.freeze && !buzz) lifelineButtons.push('freeze');
    if (!isRide && tray.peek && !buzz && round.question.format !== 'closest') lifelineButtons.push('peek');
  }

  // -- Shell hooks ----------------------------------------------------------------------------------------
  const onStart = useCallback(() => {
    void beginMatch(false);
  }, [beginMatch]);

  const onPause = useCallback(() => {
    clock.pause();
    holdStart.current = Date.now();
    setHeld(true);
    runOnUI(() => {
      'worklet';
      const q = qc.value;
      // HOLD after unlock forfeits this question's speed bonus (15.2).
      if (q.phase === PH_LIVE || q.phase === PH_SUB) q.forfeit = 1;
    })();
  }, [clock, qc]);

  const onResume = useCallback(() => {
    const heldMs = Date.now() - holdStart.current;
    const credit = graded ? HOLD.creditMs : Infinity;
    runOnUI((h: number, cr: number, restart: number) => {
      'worklet';
      const q = qc.value;
      q.lastSim = -1;
      // A HOLD during the read-lock restarts it with 600ms left.
      if (q.phase === PH_READ && q.unlockAt - q.t < restart) q.t = Math.max(0, q.unlockAt - restart);
      else if (q.phase === PH_READ) q.t = Math.max(0, q.unlockAt - restart);
      // Past the 6s credit the graded window runs on.
      if ((q.phase === PH_LIVE || q.phase === PH_LOCKED) && h > cr) q.t += h - cr;
      if (q.phase === PH_SUB && h > cr) q.sub += h - cr;
    })(heldMs, credit, READ_LOCK.holdRestartMs);
    setHeld(false);
    clock.resume();
  }, [clock, qc, graded]);

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

  // Pre-warm the pool and memory during the shell countdown.
  useEffect(() => {
    if (!visible) return;
    void loadMemory();
    if (!props.pool) void loadPool({ rideId, parkId, chapterId }).then((p) => { poolRef.current = p; });
    else poolRef.current = props.pool;
  }, [visible, rideId, parkId, chapterId, props.pool]);

  const tapAnywhere = useCallback(() => {
    if (phase === 'between' && nextTap.current) nextTap.current();
  }, [phase]);

  // -- Render --------------------------------------------------------------------------------------------------
  const q = round?.question;
  const faceDownAll = held;
  const tileStates: TileState[] = faceDownAll ? tiles.map(() => 'down') : tiles;
  const flameT = flameTier(streakView.streak);
  const sunSpeed = flameT >= 5 ? 0.94 : flameT >= 3 ? 0.63 : flameT >= 2 ? 0.42 : 0.1;
  const roundLabel = round ? (isRide ? `QUESTION ${round.index + 1} OF ${plan?.rounds.length ?? 3}` : `ROUND ${round.index + 1}  ${ROUND_NAMES[round.spec.type]}`) : '';
  const showCard = !!round && (phase === 'question' || phase === 'reveal' || phase === 'between');
  const tickerOn = phase === 'question' && round != null && (tiles[0] !== 'down' || q?.format === 'closest');

  return (
    <GameShellV2
      ref={shell}
      visible={visible}
      title={title ?? (isRide ? 'Beat the Buzzer' : 'Trivia Duel')}
      subtitle={subtitle ?? (isRide ? 'Get 2 of 3 right' : ghost ? `vs ${oppName}` : rankRef.current)}
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
    >
      <GestureHandlerRootView style={styles.field} onLayout={onLayout}>
        <Pressable style={StyleSheet.absoluteFill} onPress={tapAnywhere} accessible={false}>
          <View style={[styles.bg]} />
          <Animated.View style={[styles.stageWrap, { top: RAIL_H - 4, height: STAGE_H }, camera.style]}>
            <Stage
              width={W}
              height={STAGE_H}
              actors={actors}
              opponent={opponentLook}
              ghost={!!ghost}
              stripes={FIN_RANKS[(Object.keys(FIN_RANKS) as (keyof typeof FIN_RANKS)[]).find((k) => FIN_RANKS[k].label === rankRef.current) ?? 'deckhand'].stripes}
              sunburstSpeed={sunSpeed}
              reducedMotion={reducedMotion}
            />
          </Animated.View>
          <View style={[styles.railWrap]}>
            <Rail
              me={{ name: myName, score: scores.me, look: 'classic', lockLabel: locks.me, stake: stakes.me }}
              opp={{ name: oppName, score: scores.opp, look: opponentLook, lockLabel: locks.opp, stake: stakes.opp, ghost: !!ghost }}
              pips={pips}
              flame={flameT}
              streak={streakView.streak}
              shield={streakView.shield}
              tray={isRide ? { chomp: tray.chomp, freeze: false, peek: false } : tray}
              moving={!!movement?.moving}
              reducedMotion={reducedMotion}
              onTickCoin={() => sfxLadder(CUE.coinTick, Math.min(5, Math.floor(Math.random() * 6)), { volume: 0.7 })}
            />
          </View>
          <View style={{ position: 'absolute', top: RAIL_H + 4, left: 0, right: 0 }} pointerEvents="none"><Bark text={bark.text} barkKey={bark.key} side="right" onTalk={onTalk} /></View>

          {showCard && q ? (
            <View style={[styles.cardWrap, { top: CARD_TOP }]}>
              <QuestionCard
                roundLabel={roundLabel}
                question={q.prompt}
                ticker={ticker}
                tickerOn={tickerOn}
                readProgress={readProg}
                remain={remain}
                frozen={frozen}
                dropKey={dropKey}
                flip3d={round?.spec.type === 'final'}
                faceDown={held}
                reducedMotion={reducedMotion}
                width={Math.min(W - 24, 390)}
              />
              {lifelineButtons.length && phase === 'question' ? (
                <View style={[styles.lifeRow, { top: -62 }]}>
                  {lifelineButtons.map((k) => (
                    <LifelineButton key={k} kind={k} onPress={k === 'chomp' ? useChomp : k === 'freeze' ? useFreeze : usePeek} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {showCard && q ? (
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
                  {q.choices.map((c, i) => (
                    <View key={`${q.id}-${i}`} style={{ marginBottom: tileGeom.gap, marginRight: tileGeom.cols === 2 && i % 2 === 0 ? tileGeom.gap : 0 }}>
                      <Tile
                        index={i}
                        label={c}
                        state={tileStates[i] ?? 'down'}
                        width={tileGeom.w}
                        height={tileGeom.h}
                        onTapUI={onTapUI}
                        flipDelay={i * CEREMONY.unlockStaggerMs}
                        heads={[...(heads[i] ?? []), ...(peekLean === i ? ['blue' as SharkLook] : [])]}
                        bar={-1}
                        wiggleKey={wiggle[i] ?? 0}
                        reducedMotion={reducedMotion}
                        fontSize={tileFont(c, tileGeom.w)}
                        chomped={chomped.includes(i)}
                        frost={frozen}
                        rim={flameT >= 5 ? 5 : flameT >= 3 ? 3 : flameT >= 2 ? 1 : 0}
                      />
                    </View>
                  ))}
                </View>
              )}
              {bellOn ? <BuzzBell onBuzz={onBuzzUI} disabled={!bellOn} pressedKey={bellKey} reducedMotion={reducedMotion} fuse={0} /> : null}
            </View>
          ) : null}

          {subMode ? (
            <View style={[styles.subChip, { top: ZONE_TOP - 34 }]} pointerEvents="none">
              <Text style={styles.subChipText}>{subMode === 'buzzAnswer' ? 'YOUR ANSWER! 3.5s' : subMode === 'steal' ? 'STEAL IT!' : 'OPEN TILES! Flat 50'}</Text>
            </View>
          ) : null}
          {chip ? (
            <View style={[styles.subChip, { top: RAIL_H + STAGE_H * 0.2 }]} pointerEvents="none">
              <Text style={styles.subChipText}>{chip}</Text>
            </View>
          ) : null}

          {wager ? (
            <View style={[styles.zone, { top: ZONE_TOP - 40, height: ZONE_H + 40, width: tileGeom.zoneW, left: (W - tileGeom.zoneW) / 2 }]}>
              <WagerChips stakes={wager.stakes} labels={WAGER.labels} picked={wager.picked} onPick={pickWager} secondsLeft={wager.left} category={plan?.rounds[roundIdx]?.question.category ?? 'Trivia'} />
            </View>
          ) : null}
          {finalCard ? (
            <View style={[styles.finalCard, { top: CARD_TOP + 10 }]} pointerEvents="none">
              <Text style={styles.finalCat}>{finalCard.toUpperCase()}</Text>
              <Text style={styles.finalHard}>HARD</Text>
            </View>
          ) : null}

          {ribbon && phase === 'question' ? <View style={{ position: 'absolute', top: RAIL_H + 6, left: 0, right: 0 }} pointerEvents="none"><Ribbon text={ribbon.text} holdMs={ribbon.hold} ribbonKey={ribbon.key} reducedMotion={reducedMotion} /></View> : null}
          {polaroid ? <Polaroid k={polaroid} /> : null}
          {stamps.map((s) => <Stamp key={s.key} spec={s} reducedMotion={reducedMotion} />)}

          <FxStage ref={fx} width={W} height={H} timeScale={clock.fxScale} reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} onArrive={(n) => { for (let k = 0; k < Math.min(3, n); k++) sfxLadder(CUE.coinTick, Math.min(5, k + 1), { volume: 0.8, delayMs: k * CEREMONY.coinArriveStepMs }); if (n) Haptic.tickSelection(); }} />

          {vs ? (
            <VsIntro ms={vs.ms} meName={myName} oppName={ghost ? oppName : 'Captain Fin'} oppLook={opponentLook} rankLabel={ghost ? 'GHOST RUN' : rankRef.current} onDone={onVsDone} reducedMotion={reducedMotion} />
          ) : null}
          {results ? (
            <DuelResults
              key={runKey}
              model={results}
              beatMs={beatMs()}
              onRematch={mode === 'daily' ? undefined : onRematch}
              onGhost={mode === 'daily' ? undefined : () => { void onPassToCrew(); }}
              onContinue={onContinue}
              reducedMotion={reducedMotion}
            />
          ) : null}
          {phase === 'loading' && visible ? <View style={styles.loading}><OutlinedText text="Setting the stage..." size={20} color="#ffffff" width={2} /></View> : null}
        </Pressable>
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

function Polaroid({ k }: { k: number }) {
  const y = useSharedValue(-300);
  useEffect(() => {
    y.value = -300;
    y.value = withSequence(withTiming(0, { duration: 240, easing: Easing.out(Easing.back(1.4)) }), withDelay(400, withTiming(-300, { duration: 200 })));
  }, [k, y]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate: '-6deg' }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.polaroid, st]}>
      <OutlinedText text="PHOTO FINISH!" size={28} color="#ffffff" width={2} />
    </Animated.View>
  );
}

function ghostStealPick(o: SideInput, myWrong: number): number {
  if (o.stealChoice != null && o.stealChoice >= 0 && o.stealChoice !== myWrong) return o.stealChoice;
  return o.choice !== myWrong ? o.choice : -1;
}

function speedWorklet(t: number, g: number, h: number, chomp: number): number {
  'worklet';
  let s = h <= g ? 100 : Math.round((100 * Math.min(1, Math.max(0, 1 - (t - g) / (h - g)))) / 5) * 5;
  if (chomp) s = Math.min(s, 50);
  return s;
}

function rideSpeedWorklet(t: number, g: number, chomp: number): number {
  'worklet';
  const h = 8000;
  let s = Math.round((150 * Math.min(1, Math.max(0, 1 - (t - g) / (h - g)))) / 5) * 5;
  if (chomp) s = Math.min(s, 50);
  return s;
}

/** Largest size (15-20) where the longest word fits on one line and the label fits in 3 lines. */
function tileFont(label: string, tileW: number): number {
  const avail = tileW - 62;
  const longest = label.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 1);
  let size = label.length > 26 ? 15 : label.length > 14 ? 17 : 20;
  while (size > 12 && longest * size * 0.6 > avail) size -= 1;
  return size;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

const styles = StyleSheet.create({
  field: { flex: 1, overflow: 'hidden' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#bfeaff' },
  stageWrap: { position: 'absolute', left: 0, right: 0 },
  railWrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  cardWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  lifeRow: { position: 'absolute', left: 22, flexDirection: 'row', gap: 8 },
  zone: { position: 'absolute' },
  tiles: { flexWrap: 'wrap', justifyContent: 'center', position: 'absolute', left: 0, right: 0, bottom: 0 },
  subChip: { position: 'absolute', alignSelf: 'center', backgroundColor: C.gold, borderRadius: 14, borderWidth: 3, borderColor: C.ink, paddingHorizontal: 14, paddingVertical: 4 },
  subChipText: { fontFamily: 'Shark', fontSize: 18, color: C.navy },
  finalCard: { position: 'absolute', alignSelf: 'center', backgroundColor: C.cream, borderRadius: 20, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 8, paddingHorizontal: 28, paddingVertical: 14, alignItems: 'center' },
  finalCat: { fontFamily: 'Shark', fontSize: 30, color: C.navy },
  finalHard: { fontFamily: 'Knockout', fontSize: 18, color: C.coral, marginTop: 2 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  polaroid: { position: 'absolute', top: '30%', alignSelf: 'center', backgroundColor: '#ffffff', borderWidth: 3, borderColor: C.ink, borderRadius: 8, padding: 14, transform: [{ rotate: '-6deg' }] },
});

export default TriviaDuel;
