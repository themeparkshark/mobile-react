/**
 * MemoryGame.tsx: Memory Match (design v8, engine mm-6).
 *
 * "Every card you see is a promise. Keep it."
 *
 * A thin view over the pure engine (engine.ts). Modes (4.0 matrix):
 *   warmup      4 pairs, no clock: Finn's free warm-up (difficulty 0, no mode)
 *   ride        Ride Sprint, the paid Ride Challenge: 8 plain pairs on a
 *               server-revealed board, a charged clock (network never costs
 *               a Ticket), Signal Mode on a weak start, the coin minted in
 *               the edition your stars earned, 3 tries per Ticket. On screen:
 *               the rim timer and the chain plate. Nothing else.
 *   timeAttack  queue solo: the staircase, one new system per board and each
 *               one earned, the line bleed instead of any freeze, opt-in Heat
 *   daily       ranked, zero luck: a Fair Deck, Sudden Death, the rail ghost
 *   race        Memory Race on Line Party (interim PRACTICE RACE)
 *
 * Layers (6.12): backdrop + booth front take camera beats (scene layer); the
 * felt, wells, rope, shadows and cards never move (the locked board); flights,
 * HUD and callouts sit above. QUEUE REALITY: the line moving never pauses
 * anything; it dims the rope (Time Attack bleed), trims the music 3dB, banks
 * Peeks and shows a gold heads-up edge.
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FxStage,
  GameAudio,
  GameShellV2,
  Haptic,
  LinePlayMovementContext,
  useCamera,
  useGameMusic,
  useMusicBeat,
  useStudioAudio,
  useWalkSense,
  type FxStageHandle,
  type GameResult,
} from '../../gamekit';
import GameIcon from '../../ui/GameIcon';
import { memoryLossBanner, memoryLossCopy, triesLeftLine } from './lossCopy';
import { RideChallengeContext } from '../../gamekit/RideChallengeContext';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { MemoryCard, makeCardValues, type CardValues, type MemoryCardHandle, type ShimmerState } from './MemoryCard';
import { deckById, deckIdForRideName, type Deck } from './decks';
import {
  ENGINE_VERSION,
  FACE_GOLD,
  FACE_GULL,
  K_MATCHED,
  K_SEEN,
  applySystems,
  chargedElapsed,
  createEngine,
  dailyConfig,
  dailyStars,
  dealBoard,
  editionForStars,
  fairParFor,
  glimpseMs,
  gradesFor,
  inShowtime,
  isLineBleed,
  luckyChip,
  modeFlags,
  nextPairs,
  parFor,
  perfectOf,
  raceConfig,
  recallPct,
  rideSprintConfig,
  rideStars,
  step,
  timeAttackConfig,
  timeAttackStars,
  upgradeEdition,
  warmupConfig,
  type CoinEdition,
  type MMAction,
  type MMEvent,
  type MMState,
  type PhotoAxis,
} from './engine';
import { boardSeed, makeRng, shapeForPairs, type Layout } from './logic';
import { createLocalBoard, createSimFairReveal, createSimReveal, type BoardSource, type FlipReveal } from './boardSource';
import { faceFor } from './faces';
import { ChainPlate, RopeNumeral, ScorePlate, VerdictChip, type ChainPlateHandle, type ScorePlateHandle, type VerdictChipHandle } from './Hud';
import { SharkStage, type SharkStageHandle } from './SharkStage';
import { BoardFxOver, BoardFxUnder, NO_ARC, type ArcState, type FlashRects, type RippleState, type RopeState } from './BoardFx';
import { AwningCallouts, BoothFront, marqueeChain, marqueeFizzle, marqueeFlash, useMarquee, type AwningCalloutsHandle, type PrizeEntry } from './MemoryBooth';
import { FlightLayer, type FlightLayerHandle } from './FlightLayer';
import { MemoryResults, type MemoryResultsData, type ResultsNumber } from './MemoryResults';
import { FLIP_MS, FLIP_SHOWTIME_MS, MM, hitStopFor, ladderStep, starsFor as tierStars } from './theme';
import { boothGeo, hitSlot as geoHitSlot, slotCenter, slotXY, waveStep, type BoothGeo } from './layout';
import {
  loadAlbum,
  loadHeat,
  loadLedger,
  loadMastery,
  saveMastery,
  loadPersonalBest,
  loadRideRecord,
  loadTaRuns,
  pushRankHistory,
  saveAlbum,
  saveDailyIfFirst,
  saveLedger,
  savePersonalBest,
  saveRideRecord,
  saveStreak,
  saveTaRuns,
  takeDailyIntro,
} from './storage';
import { useMemoryAutoplay } from './autoplay';
import type { DailySummary, RunRewards } from './MemoryExtras';
import { recordRun, rideKeyFor, stampRide, type RunMatch } from './modes/album';
import { applyRankedDay, earnsStamp, pairsAfter, railDelta, railDeltaLabel, type DailyGhost, type StreakState } from './modes/daily';
import { EMPTY_LEDGER, NO_HEAT, SYSTEM_HINT, SYSTEM_LABEL, planBoard, recordBoard, type HeatToggles, type SystemId, type UnlockLedger } from './modes/unlocks';
import { addXp, xpFor } from './modes/mastery';
import { EIGHTH_MS, FINAL_SKIP_AFTER_MS, SIXTEENTH_MS, finalPairSchedule, resolveMemoryMode, type MemoryMode } from './modes/mode';
import { SIGNAL_TURNS, PENDING_STOP_MS, signalModeFor } from './charged';
import { SHARKS } from '../../gamekit/party/partyArt';
import type { EmoteId } from '../../gamekit/net/partyTypes';
import {
  ATTACK_TELEGRAPH_MS,
  RACE_GLIMPSE_MS,
  RACE_MS,
  RACE_PLAY_AT,
  createAttackGate,
  crewFor,
  frameAt,
  offerAttack,
  placements,
  releaseStored,
  simulateCrew,
  type AttackGate,
  type CrewRun,
  type CrewSeat,
} from './race/raceSim';
import { RivalStrip, type Racer } from './race/RivalStrip';
import type { MemoryPartyBinding } from './race/partyBinding';

export type { MemoryMode } from './modes/mode';

const CARD_BACK = require('../../assets/games/memory/card-back.png');
const COIN = require('../../assets/games/memory/studio/coin_alex.png');
const GULL_LAND = require('../../assets/games/memory/studio/gull_landing.png');
const GULL_GRAB = require('../../assets/games/memory/studio/gull_grab.png');
const GULL_OFF = require('../../assets/games/memory/studio/gull_takeoff.png');
const TIDE_ARROW = require('../../assets/games/memory/studio/tide_arrow.png');
const HALO = require('../../assets/games/memory/v8/fx/glow_halo_2.png');
const JINGLE = require('../../../assets/sounds/redeem_modal_jingle.mp3');

export interface MemoryGameProps {
  visible: boolean;
  /** Legacy: 0 with no mode = Warm-up; 1-3 = queue boards. The paid ride passes mode="ride". */
  difficulty?: number;
  mode?: MemoryMode;
  /** Server attempt seed. Each run and try derives its own board from it. */
  seed?: number;
  deckId?: string;
  taskName?: string;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
  /** Preserved external contract: onComplete(multiplier, meta). */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  /** Live Line Party round (Memory Race). The party owns timing and results. */
  party?: MemoryPartyBinding;
  /** Daily Deck setup from the booth menu (deck of the day, face seed, ghost, streak). */
  daily?: DailySetup;
}

export interface DailySetup {
  day: string;
  deckId: string;
  layoutSeed: number;
  faceSeed: number;
  /** First attempt of the day (ranked). Rematches are practice. */
  ranked: boolean;
  ghost: DailyGhost | null;
  streak: StreakState;
}

export const RIDE_TRIES = 3;
const TICK_MS = 50;

const now = () => (global as unknown as { performance?: { now: () => number } }).performance?.now() ?? Date.now();

/** Dev-only knobs for captures (never in release builds). */
const DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const DEV_LATENCY = DEV ? Number(process.env.EXPO_PUBLIC_MEMORY_LATENCY || 0) : 0;
const DEV_SIGNAL = DEV && process.env.EXPO_PUBLIC_MEMORY_SIGNAL === '1';
const DEV_LEDGER = DEV && process.env.EXPO_PUBLIC_MEMORY_LEDGER === 'all';

interface Run {
  eng: MMState;
  src: BoardSource;
  mode: MemoryMode;
  pairs: number;
  seed: number;
  runIndex: number;
  tryIndex: number;
  sizeRepeats: Record<number, number>;
  playing: boolean;
  busy: boolean;
  ended: boolean;
  t0: number;
  pausedAt: number | null;
  pausedTotal: number;
  pending: boolean;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  buffered: number;
  rxPrevT: number;
  peekArmed: boolean;
  peeks: number;
  moved: Set<number>;
  cleared: number;
  prizeNext: number;
  potStack: number;
  potFaces: number[];
  lastMovingAt: number;
  stumbleUntil: number;
  race: RaceState | null;
  albumMatches: RunMatch[];
  ranked: boolean;
  introduced: number;
  ledger: UnlockLedger;
  heat: HeatToggles;
  glint: boolean;
  signal: boolean;
  capHit: boolean;
  touched: Map<number, number>;
  finalAt: number;
  finalSkipped: boolean;
  wasAhead: boolean;
  firstTips: { scout: boolean; slip: boolean };
}

interface RaceState {
  crew: CrewSeat[];
  runs: CrewRun[];
  delays: number[][];
  sendIdx: number[];
  gate: AttackGate;
  telegraph: { until: number; blocked: boolean } | null;
  winner: string | null;
  myClearAt: number | null;
  shows: boolean[];
  emotes: Record<string, { id: EmoteId; at: number }>;
  layout: Layout;
}

export default function MemoryGame({
  visible,
  difficulty = 1,
  mode: modeProp,
  seed,
  deckId,
  taskName,
  onClose,
  onQuit,
  onComplete,
  party,
  daily,
}: MemoryGameProps) {
  const partyRef = useRef(party);
  partyRef.current = party;
  const devMode = DEV ? process.env.EXPO_PUBLIC_MEMORY_MODE || null : null;
  const mode: MemoryMode = resolveMemoryMode({ party, devMode, mode: modeProp, difficulty });
  const flags = modeFlags(mode === 'race' ? 'race' : mode);
  const reducedMotion = useReducedGameMotion();
  const insets = useSafeAreaInsets();
  const movement = useContext(LinePlayMovementContext);
  const rideChallenge = useContext(RideChallengeContext);
  const deck: Deck = useMemo(() => deckById(daily?.deckId ?? (mode === 'warmup' ? 'park' : undefined) ?? deckId ?? deckIdForRideName(taskName)) ?? deckById('park')!, [daily?.deckId, deckId, taskName, mode]);
  const baseSeed = useMemo(
    () => (party ? party.seed >>> 0 : seed != null ? seed >>> 0 : (Math.random() * 0xffffffff) >>> 0),
    // A fresh seed each time the game opens without a server seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, seed],
  );
  const rideKey = useMemo(() => rideKeyFor(taskName) ?? `${deck.id}:${(taskName ?? 'ride').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, [taskName, deck.id]);

  // ---------------------------------------------------------------------------
  // Audio: every cue and bed preloads before GO (audio-api 0.6.5 mid-run decodes).
  // ---------------------------------------------------------------------------
  useStudioAudio('memory', [
    'mm_flip', 'mm_match', 'mm_match_third', 'mm_match_fifth', 'mm_sharp_twinkle', 'mm_scout_tick', 'mm_slip', 'mm_board_clear',
    'mm_brass_g', 'mm_glimpse', 'mm_overtime_hit', 'mm_strike', 'mm_peek_bank', 'mm_peek_use', 'mm_shelf_drop', 'mm_sting_showtime',
    'mm_sting_sweet_run', 'mm_final_riser', 'mm_golden_reveal', 'mm_hat_pop', 'mm_pot_burst', 'mm_clock_tick', 'mm_ink_puff',
    'sh_fever_start', 'sh_fever_end', 'sh_camera', 'sh_seagull', 'sh_wave_wash', 'sh_whistle', 'sh_shield_pop', 'sh_tier_up',
    'coin_tick', 'fx.coin', 'fx.reward', 'fx.whoosh', 'fx.hit', 'mm_lose', 'ui.select', 'ui.tap',
    ...Array.from({ length: 13 }, (_, i) => `coin_tick_${String(i).padStart(2, '0')}`),
  ]);
  useEffect(() => {
    GameAudio.registerCues({
      mm_win: { src: JINGLE, bus: 'stinger', startMs: 2000, endMs: 4500, durationMs: 2500, maxVoices: 1, priority: 3, approved: true, note: "Chris's redeem_modal_jingle.mp3, its strongest 2.5s phrase (2.0-4.5s)" },
    });
    void GameAudio.preload(['mm_win']).catch(() => undefined);
    void GameAudio.preloadBeds(['mm_loop_main', 'mm_loop_showtime', 'mm_loop_overtime', 'mm_loop_main_muffled']).catch(() => undefined);
  }, []);

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  const [field, setField] = useState({ w: 0, h: 0 });
  const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setField((f) => (Math.abs(f.w - width) < 1 && Math.abs(f.h - height) < 1 ? f : { w: width, h: height }));
  }, []);

  // ---------------------------------------------------------------------------
  // Run state
  // ---------------------------------------------------------------------------
  const runRef = useRef<Run | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const [shape, setShape] = useState({ cols: 4, rows: 4, pairs: 8 });
  const [faces, setFaces] = useState<Record<number, number>>({});
  const [wells, setWells] = useState<number[]>([]);
  const [prizes, setPrizes] = useState<(PrizeEntry | null)[]>([]);
  const [pot, setPot] = useState<{ faces: ReturnType<typeof faceFor>[]; value: number } | null>(null);
  const [score, setScore] = useState(0);
  const [personalBest, setPersonalBest] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [resultData, setResultData] = useState<MemoryResultsData | null>(null);
  const [hud, setHud] = useState({
    seconds: null as number | null, urgent: false, chain: 0, gauge: 0, showtime: false, showLeft: 0, showWarn: false,
    strikes: 0, pairs: 0, total: 8, board: 1, turns: 0, turnsLeft: null as number | null,
  });
  const [tryScreen, setTryScreen] = useState<{ pairs: number; total: number; left: number } | null>(null);
  const tryCardIn = useSharedValue(0);
  const [unlock, setUnlock] = useState<{ kicker: string; title: string; hint?: string } | null>(null);
  const [tip, setTip] = useState<{ text: string; kind: 'scout' | 'slip' } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTip = useCallback((text: string, kind: 'scout' | 'slip') => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    setTip({ text, kind });
    tipTimer.current = setTimeout(() => setTip(null), 2600);
  }, []);
  useEffect(() => () => { if (tipTimer.current) clearTimeout(tipTimer.current); }, []);
  const [peeks, setPeeks] = useState({ n: 0, armed: false, show: false });
  const [photoPick, setPhotoPick] = useState<number | null>(null);
  const [runIndex, setRunIndex] = useState(0);
  const [racers, setRacers] = useState<Racer[]>([]);
  const [stumble, setStumble] = useState(false);
  const [rail, setRail] = useState<{ slot: number; delta: string | null; ahead: boolean; label: string } | null>(null);
  const [bounceKey, setBounceKey] = useState(0);
  const [mergeEdition, setMergeEdition] = useState<CoinEdition>('none');
  const dailyRef = useRef(daily);
  dailyRef.current = daily;

  const cards = useRef<(MemoryCardHandle | null)[]>([]);
  const fx = useRef<FxStageHandle>(null);
  const stage = useRef<SharkStageHandle>(null);
  const chainPlate = useRef<ChainPlateHandle>(null);
  const chip = useRef<VerdictChipHandle>(null);
  const flights = useRef<FlightLayerHandle>(null);
  const awning = useRef<AwningCalloutsHandle>(null);
  const scorePlate = useRef<ScorePlateHandle>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  // Shared values
  const marquee = useMarquee();
  const rope: RopeState = {
    frac: useSharedValue(1),
    urgent: useSharedValue(0),
    dim: useSharedValue(0),
    glint: useSharedValue(-1),
    capHit: useSharedValue(0),
  };
  const beadsLeft = useSharedValue(SIGNAL_TURNS);
  const arc = useSharedValue<ArcState>(NO_ARC);
  const slipArc = useSharedValue<ArcState>(NO_ARC);
  const trail = useSharedValue<ArcState>(NO_ARC);
  const flash = useSharedValue<FlashRects>({ rects: [], p: 0 });
  const flashP = useSharedValue(0);
  const ripple = useSharedValue<RippleState>({ x: 0, y: 0, p: 0, strength: 0 });
  const shimmer = useSharedValue<ShimmerState>({ id: -1, p: 0 });
  const rays = useSharedValue(0);
  const wash = useSharedValue(0);
  const coin = useSharedValue(0);
  const coinShake = useSharedValue(0);
  const coinFly = useSharedValue(0);
  const [coinAt, setCoinAt] = useState({ x: 0, y: 0, s: 60 });
  const gull = useSharedValue(0);
  const tide = useSharedValue(0);
  const [tideAt, setTideAt] = useState({ x0: 0, x1: 0, y: 0 });
  const [gullAt, setGullAt] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });
  const headsUp = useSharedValue(0);
  const incoming = useSharedValue(0);
  const tabs = useSharedValue(0);

  // Walking: accelerometer OR the line moving (5.7). Never pauses anything.
  const walk = useWalkSense({ active: visible && !result });
  const moving = !!movement?.moving;
  const walking = walk.walking || moving;
  const walkingRef = useRef(walking);
  walkingRef.current = walking;
  const calm = walking || reducedMotion;

  const geoRef = useRef<BoothGeo | null>(null);
  const geo = useMemo(() => {
    if (!field.w) return null;
    return boothGeo(field.w, field.h, shape.cols, shape.rows, { bottomInset: insets.bottom, peek: mode === 'timeAttack' });
  }, [field.w, field.h, shape.cols, shape.rows, mode, insets.bottom]);
  geoRef.current = geo;

  // Card mutables per board (the shadow layer reads them).
  const n = shape.cols * shape.rows;
  const cardValues = useMemo<CardValues[]>(() => {
    const g = geoRef.current;
    return Array.from({ length: n }, (_, id) => {
      const p = g ? slotXY(g, id) : { x: 0, y: 0 };
      return makeCardValues(p.x, p.y);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, n]);
  const [slotIds, setSlotIds] = useState<number[]>(() => Array.from({ length: 16 }, (_, i) => i));

  const camera = useCamera({ width: field.w || 1, height: field.h || 1, reducedMotion, walking });
  const beat = useMusicBeat(visible && !result);

  // Music: main, then Overtime or Showtime on the next bar (7.4).
  const [bed, setBed] = useState<string | null>(null);
  useGameMusic(bed, { at: 'bar' });
  useEffect(() => {
    // Line moving: music -3dB, never stops. Duels and Race run at -3dB.
    GameAudio.music.setTrimDb(moving || mode === 'race' ? -3 : 0, 300);
  }, [moving, mode]);
  useEffect(() => () => { GameAudio.music.setTrimDb(0, 0); GameAudio.music.setState('open', 0); }, []);

  // Heads-up edge glow while the line moves (no sound, no haptic).
  useEffect(() => {
    headsUp.value = withTiming(moving ? 1 : 0, { duration: moving ? 200 : 400 });
  }, [moving, headsUp]);

  // ---------------------------------------------------------------------------
  // Clock helpers
  // ---------------------------------------------------------------------------
  const gameNow = useCallback(() => {
    const r = runRef.current;
    if (!r) return 0;
    const p = partyRef.current;
    if (p) return Math.max(0, p.boardTime() ?? 0);
    const paused = r.pausedAt != null ? now() - r.pausedAt : 0;
    return Math.max(0, now() - r.t0 - r.pausedTotal - paused);
  }, []);

  const send = useCallback((a: MMAction): MMEvent[] => {
    const r = runRef.current;
    if (!r) return [];
    r.src.send(a);
    return step(r.eng, a);
  }, []);

  // ---------------------------------------------------------------------------
  // HUD sync
  // ---------------------------------------------------------------------------
  const syncHud = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    const e = r.eng;
    const clock = e.cfg.clockMs != null;
    const seconds = clock ? Math.max(0, Math.ceil(e.clockLeftMs / 1000)) : null;
    const turnsLeft = e.cfg.signalTurns > 0 ? Math.max(0, e.cfg.signalTurns - e.turns) : null;
    const next = {
      seconds,
      urgent: clock && e.overtime,
      chain: e.chain,
      gauge: e.gauge,
      showtime: inShowtime(e),
      showLeft: e.showTurnsLeft,
      showWarn: e.showTurnsLeft === 1,
      strikes: e.strikes,
      pairs: e.pairs,
      total: e.pairsTotal,
      board: e.board,
      turns: e.turns,
      turnsLeft,
    };
    setHud((h) => {
      for (const k of Object.keys(next) as (keyof typeof next)[]) if (h[k] !== next[k]) return next;
      return h;
    });
    if (clock) {
      const cap = r.mode === 'timeAttack' ? 30000 : (e.cfg.clockMs ?? 45000);
      const frac = Math.max(0, Math.min(1, e.clockLeftMs / cap));
      rope.frac.value = withTiming(frac, { duration: TICK_MS + 10, easing: Easing.linear });
      rope.dim.value = withTiming(isLineBleed(e) ? 1 : 0, { duration: 200 });
      marquee.dim.value = rope.dim.value;
      rope.urgent.value = e.overtime ? 1 : 0;
    }
    if (turnsLeft != null) beadsLeft.value = turnsLeft;
    // Daily rail ghost: by turns, on the counter rail (6.8).
    const dg = dailyRef.current?.ghost;
    if (r.mode === 'daily' && dg) {
      const gp = Math.min(e.pairsTotal, pairsAfter(dg.verdicts, e.turns));
      const d = railDelta(dg.verdicts, e.turns, e.pairs);
      const name = dg.kind === 'par' ? 'PAR' : dg.name.toUpperCase();
      const ahead = d > 0;
      if (ahead && !r.wasAhead && e.turns > 0) {
        GameAudio.playLadder('mm_sharp_twinkle', 7, { volume: 0.7 });
        Haptic.tickSelection();
      }
      r.wasAhead = ahead;
      const label = e.turns > 0 ? railDeltaLabel(d, name) : name;
      setRail((u) => (u && u.slot === gp && u.delta === label && u.ahead === ahead ? u : { slot: gp, delta: label, ahead, label: name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Board setup
  // ---------------------------------------------------------------------------
  const cardFaceFor = useCallback((id: number) => {
    const f = faces[id];
    return f == null ? EMPTY_FACE : faceFor(deck, f);
  }, [faces, deck]);

  const buildRun = useCallback((opts: { runIndex: number; tryIndex: number; ledger?: UnlockLedger; heat?: HeatToggles; glint?: boolean }) => {
    const s = partyRef.current ? baseSeed : boardSeed(baseSeed, opts.runIndex * 16 + opts.tryIndex);
    const deckSize = deck.symbols.length;
    let src: BoardSource;
    let eng: MMState;
    let race: RaceState | null = null;
    let signal = false;
    let introduced = 0;
    const ledger = opts.ledger ?? EMPTY_LEDGER;
    const heat = opts.heat ?? NO_HEAT;
    if (mode === 'ride') {
      // Signal Mode is chosen once from the start pings (in-process stand-in: dev flag).
      signal = signalModeFor(DEV_SIGNAL ? [2600, 2400, 2300] : [80, 90, 85]);
      const cfg = rideSprintConfig(45000, signal ? SIGNAL_TURNS : 0);
      src = createSimReveal({ cfg, layout: { pairs: 8, deckSize, seed: s }, deckSize, engineSeed: s ^ 0x5bd1e995, latencyMs: DEV_LATENCY });
      eng = createEngine(cfg, { cols: 4, rows: 4, seed: s ^ 0x5bd1e995 });
    } else if (mode === 'warmup') {
      const cfg = warmupConfig();
      src = createLocalBoard({ pairs: 4, deckSize, seed: s }, deckSize);
      eng = createEngine(cfg, { cols: 4, rows: 2, seed: s ^ 0x5bd1e995 });
    } else if (mode === 'daily') {
      const cfg = dailyConfig();
      const dl = dailyRef.current;
      const faceSeed = dl ? (opts.runIndex === 0 ? dl.faceSeed : boardSeed(dl.faceSeed, opts.runIndex)) : s;
      const pool = Array.from({ length: deckSize }, (_, i) => i);
      const rng = makeRng(faceSeed);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = pool[i];
        pool[i] = pool[j];
        pool[j] = t;
      }
      src = createSimFairReveal({ cfg, faces: pool.slice(0, 8), pairs: 8, seed: faceSeed, engineSeed: s ^ 0x5bd1e995, latencyMs: DEV_LATENCY });
      eng = createEngine(cfg, { cols: 4, rows: 4, seed: s ^ 0x5bd1e995 });
    } else if (mode === 'race') {
      const cfg = raceConfig();
      const local = createLocalBoard({ pairs: 8, deckSize, seed: s, golden: true }, deckSize);
      src = local;
      eng = createEngine(cfg, { cols: 4, rows: 4, seed: partyRef.current ? s : s ^ 0x5bd1e995 });
      const crew = partyRef.current ? [] : crewFor(s);
      race = {
        crew,
        runs: crew.map((c, i) => simulateCrew(s, i + 1, c, local.layout)),
        delays: crew.map(() => []),
        sendIdx: crew.map(() => 0),
        gate: createAttackGate(),
        telegraph: null,
        winner: null,
        myClearAt: null,
        shows: crew.map(() => false),
        emotes: {},
        layout: local.layout,
      };
    } else {
      const cfg = timeAttackConfig();
      const plan = planBoard(1, 0, ledger, heat);
      introduced = plan.introduced;
      src = createLocalBoard({ pairs: 6, deckSize, seed: s, golden: plan.sys.golden, gull: plan.sys.seagull }, deckSize);
      eng = createEngine(cfg, { cols: 4, rows: 3, seed: s ^ 0x5bd1e995 });
      applySystems(eng, plan.sys);
    }
    const r: Run = {
      eng, src, mode, pairs: src.info.pairs, seed: s, runIndex: opts.runIndex, tryIndex: opts.tryIndex,
      sizeRepeats: {}, playing: false, busy: true, ended: false, t0: now(), pausedAt: null, pausedTotal: 0,
      pending: false, pendingTimer: null, buffered: -1, rxPrevT: 0, peekArmed: false, peeks: 0, moved: new Set(), cleared: 0,
      prizeNext: 0, potStack: 0, potFaces: [], lastMovingAt: -1e9, stumbleUntil: 0, race, albumMatches: [],
      ranked: mode === 'daily' && !!dailyRef.current?.ranked && opts.runIndex === 0,
      introduced, ledger, heat, glint: mode === 'warmup' || (mode === 'timeAttack' && !!opts.glint), signal, capHit: false,
      touched: new Map(), finalAt: 0, finalSkipped: false, wasAhead: false, firstTips: { scout: false, slip: false },
    };
    runRef.current = r;
    return r;
  }, [baseSeed, deck.symbols.length, mode]);

  const newBoardView = useCallback((cols: number, rows: number, pairs: number) => {
    cards.current = [];
    setShape({ cols, rows, pairs });
    setFaces({});
    setWells([]);
    setPrizes(Array.from({ length: pairs }, () => null));
    setPot(null);
    setSlotIds(Array.from({ length: cols * rows }, (_, i) => i));
    setBoardKey((k) => k + 1);
    flights.current?.clear();
  }, []);

  /** Place and deal every card after the new board has mounted (from the counter centre). */
  const dealCards = useCallback((fast = false) => {
    const g = geoRef.current;
    const r = runRef.current;
    if (!g || !r) return;
    const count = g.cols * g.rows;
    const pile = { x: g.W / 2 - g.cw / 2, y: g.counter.y - g.ch * 0.3 };
    for (let slot = 0; slot < count; slot++) {
      const id = r.eng.ids[slot];
      const p = slotXY(g, slot);
      cards.current[id]?.place(p.x, p.y);
      cards.current[id]?.deal(pile.x, pile.y, slot * 38, fast || reducedMotion);
    }
    if (!fast) {
      GameAudio.play('fx.whoosh', { volume: 0.5 });
      // Deal thwips: one per card pair, rising, never more than 3 voices.
      for (let i = 0; i < Math.min(6, count); i++) later(i * 38 * 2.6, () => GameAudio.playLadder('coin_tick', i * 2, { volume: 0.25 }));
    }
  }, [later, reducedMotion]);

  const dealtKey = useRef(-1);
  useEffect(() => {
    if (!geo || !runRef.current || dealtKey.current === boardKey) return;
    const key = boardKey;
    const t = setTimeout(() => {
      if (dealtKey.current === key) return;
      dealtKey.current = key;
      dealCards(false);
    }, 30);
    return () => clearTimeout(t);
  }, [geo, boardKey, dealCards]);

  // Keep card positions right if the layout changes (first layout, rotation).
  useEffect(() => {
    const r = runRef.current;
    if (!geo || !r) return;
    for (let slot = 0; slot < geo.cols * geo.rows; slot++) {
      const p = slotXY(geo, slot);
      cards.current[r.eng.ids[slot]]?.place(p.x, p.y);
    }
  }, [geo]);

  const resetScene = useCallback(() => {
    rays.value = 0;
    wash.value = 0;
    coin.value = 0;
    coinFly.value = 0;
    rope.frac.value = 1;
    rope.urgent.value = 0;
    rope.dim.value = 0;
    rope.glint.value = -1;
    rope.capHit.value = 0;
    marquee.all.value = 0;
    marquee.chase.value = 0;
    marquee.seg.forEach((sv) => { sv.value = 0; });
    arc.value = NO_ARC;
    slipArc.value = NO_ARC;
    trail.value = NO_ARC;
    GameAudio.music.setState('open', 0);
    stage.current?.hatGag(false);
    stage.current?.pose('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open / rematch: build a fresh run.
  useEffect(() => {
    if (!visible) return;
    clearTimers();
    let live = true;
    void (async () => {
      const [ledger, heat, taRuns] = mode === 'timeAttack'
        ? await Promise.all([loadLedger(), loadHeat(), loadTaRuns()])
        : [EMPTY_LEDGER, NO_HEAT, 99];
      if (!live) return;
      const r = buildRun({ runIndex, tryIndex: 0, ledger: DEV_LEDGER ? { cleanClear: true, chain3: true, showtime: true, peekMatch: true } : ledger, heat, glint: taRuns < 3 });
      const sh = shapeForPairs(r.pairs);
      newBoardView(sh.cols, sh.rows, sh.pairs);
      setScore(0);
      setResult(null);
      setResultData(null);
      setTryScreen(null);
      setUnlock(null);
      setRail(null);
      setPeeks({ n: 0, armed: false, show: false });
      setBed(null);
      resetScene();
      syncHud();
      void loadPersonalBest(mode === 'ride' ? 0 : mode === 'daily' ? 2 : mode === 'warmup' ? 3 : 1).then(setPersonalBest);
      const dl = dailyRef.current;
      if (mode === 'daily' && dl?.ghost) setRail({ slot: 0, delta: null, ahead: false, label: dl.ghost.kind === 'par' ? 'PAR' : dl.ghost.name.toUpperCase() });
      // First play of the day: the barker's intro card.
      if (mode === 'ride' || mode === 'warmup') {
        const d = new Date();
        const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        if (await takeDailyIntro(day)) later(200, () => { stage.current?.intro(); awning.current?.ribbon('CLEAR THE BOARD'); });
      }
    })();
    return () => { live = false; clearTimers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, runIndex, baseSeed, mode]);

  // ---------------------------------------------------------------------------
  // Start, pause, resume
  // ---------------------------------------------------------------------------
  const beginPlay = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    r.t0 = now();
    r.pausedTotal = 0;
    r.pausedAt = null;
    r.playing = true;
    r.busy = false;
    r.rxPrevT = 0;
    setBed('mm_loop_main');
    syncHud();
  }, [syncHud]);

  /** Time Attack / Race glimpse: one wave flip outward from centre (18ms/step), clock frozen. */
  const runGlimpse = useCallback((after: () => void) => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g) { after(); return; }
    const count = g.cols * g.rows;
    const reps = r.sizeRepeats[r.pairs] ?? 0;
    r.sizeRepeats[r.pairs] = reps + 1;
    const hold = r.mode === 'race' ? RACE_GLIMPSE_MS : glimpseMs(r.pairs, reps);
    const faceMap: Record<number, number> = {};
    const slots: number[] = [];
    const fs: number[] = [];
    for (let s = 0; s < count; s++) {
      const f = r.src.faceAt(s, r.eng.ids);
      if (f == null) continue;
      faceMap[r.eng.ids[s]] = f;
      slots.push(s);
      fs.push(f);
    }
    setFaces((m) => ({ ...m, ...faceMap }));
    const g0 = r.mode === 'race' ? 0 : gameNow();
    send({ t: 'freeze', on: true, at: g0 });
    send({ t: 'reveal', slots, faces: fs, at: g0 });
    GameAudio.play('mm_glimpse');
    const centre = Math.floor((g.rows - 1) / 2) * g.cols + Math.floor((g.cols - 1) / 2);
    let maxStep = 0;
    for (let s = 0; s < count; s++) maxStep = Math.max(maxStep, waveStep(g, centre, s));
    for (let s = 0; s < count; s++) {
      const d = waveStep(g, centre, s);
      const id = r.eng.ids[s];
      later(60 + d * 18, () => cards.current[id]?.flipUp(FLIP_MS));
      later(60 + maxStep * 18 + FLIP_MS + hold + d * 18, () => cards.current[id]?.flipDown(FLIP_MS));
      later(60 + maxStep * 36 + FLIP_MS * 2 + hold + 40, () => cards.current[id]?.eye(true));
    }
    const endIn = r.mode === 'race' ? Math.max(0, RACE_PLAY_AT - gameNow()) : 60 + maxStep * 36 + FLIP_MS * 2 + hold;
    later(endIn, () => {
      send({ t: 'freeze', on: false, at: r.mode === 'race' ? Math.max(RACE_PLAY_AT, gameNow()) : gameNow() });
      after();
    });
  }, [gameNow, later, send]);

  const onStart = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    if (r.mode === 'timeAttack' || r.mode === 'race') {
      beginPlay();
      r.busy = true;
      const wait = Math.max(0, -(partyRef.current?.boardTime() ?? 0));
      later(wait, () => runGlimpse(() => {
        const rr = runRef.current;
        if (rr) rr.busy = false;
      }));
    } else beginPlay();
  }, [beginPlay, later, runGlimpse]);

  const applyEventsRef = useRef<(ev: MMEvent[]) => void>(() => undefined);

  const onPause = useCallback(() => {
    const r = runRef.current;
    if (!r || r.pausedAt != null) return;
    // Resolve a face-up miss so a pause can never be used to study.
    if (r.eng.phase === 2) applyEventsRef.current(send({ t: 'dismiss', slot: -1, at: gameNow() }));
    r.pausedAt = now();
  }, [gameNow, send]);

  const onResume = useCallback(() => {
    const r = runRef.current;
    if (!r || r.pausedAt == null) return;
    r.pausedTotal += now() - r.pausedAt;
    r.pausedAt = null;
  }, []);

  // Walking into the engine (twist gating) and the line into Time Attack's bleed.
  useEffect(() => {
    const r = runRef.current;
    if (!r || !r.playing) return;
    send({ t: 'walking', on: walking, at: gameNow() });
  }, [walking, gameNow, send]);
  useEffect(() => {
    const r = runRef.current;
    if (!r || !r.playing) return;
    send({ t: 'lineMoving', on: moving, at: gameNow() });
    // Peek banking: each time the line starts moving (edges >= 8s apart), max 2.
    if (!moving || r.mode !== 'timeAttack' || !peeks.show) return;
    const t = Date.now();
    if (t - r.lastMovingAt < 8000) return;
    r.lastMovingAt = t;
    if (r.peeks >= 2) return;
    r.peeks += 1;
    setPeeks((p) => ({ ...p, n: r.peeks }));
    GameAudio.play('mm_peek_bank');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);

  // Idle shimmer: one random untouched face-down card every 6-8s (every 2s in Showtime).
  useEffect(() => {
    if (!visible || reducedMotion) return undefined;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const r = runRef.current;
      if (r && r.playing && !r.ended) {
        const nowMs = Date.now();
        const pool: number[] = [];
        for (let s = 0; s < r.eng.n; s++) {
          if (r.eng.know[s] === K_MATCHED || r.eng.up.indexOf(s) >= 0) continue;
          if (nowMs - (r.touched.get(s) ?? 0) < 2000) continue;
          pool.push(r.eng.ids[s]);
        }
        if (pool.length) {
          const id = pool[Math.floor(Math.random() * pool.length)];
          shimmer.value = { id, p: 0 };
          shimmer.value = withTiming({ id, p: 1 }, { duration: 300 });
        }
      }
      const show = runRef.current ? inShowtime(runRef.current.eng) : false;
      t = setTimeout(tick, show ? 2000 : 6000 + Math.random() * 2000);
    };
    t = setTimeout(tick, 4000);
    return () => clearTimeout(t);
  }, [visible, reducedMotion, shimmer]);

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------
  /** Album, stamps, streak and today's Daily record (cosmetic, local; ranked lives on the server). */
  const collectRewards = useCallback(async (r: Run, won: boolean, perfect: boolean, stars: number): Promise<{ rewards: RunRewards | null; daily: DailySummary | null }> => {
    const e = r.eng;
    const dl = dailyRef.current;
    const key = rideKeyFor(taskName);
    try {
      const before = await loadAlbum();
      const delta = recordRun(before, deck.id, deck.symbols.length, r.albumMatches, perfect && won);
      let album = delta.album;
      let newStamp = false;
      if (r.mode === 'daily' && r.ranked && earnsStamp(won, e.turns, e.pairsTotal, key)) {
        const st = stampRide(album, key!, { day: dl?.day ?? '', deck: deck.id, label: deck.label });
        album = st.album;
        newStamp = st.isNew;
      }
      await saveAlbum(album);
      const rewards: RunRewards = { deckId: deck.id, newCards: delta.newCards, newFoils: delta.newFoils, foilDeckDone: delta.foilDeckDone, newStamp, album };
      let dailySum: DailySummary | null = null;
      if (r.mode === 'daily' && dl) {
        let streak = dl.streak.streak;
        if (r.ranked) {
          const st = applyRankedDay(dl.streak, dl.day);
          streak = st.state.streak;
          await saveStreak(st.state);
          await saveDailyIfFirst({ day: dl.day, deck: deck.id, cleared: won, turns: e.turns, pairs: e.pairsTotal, score: e.score, stars, verdicts: e.verdicts.slice(), streak });
        }
        dailySum = { day: dl.day, ranked: r.ranked, cleared: won, turns: e.turns, pairs: e.pairsTotal, stars, streak, verdicts: e.verdicts.slice(), deckId: deck.id, recall: recallPct(e) };
      }
      return { rewards, daily: dailySum };
    } catch {
      return { rewards: null, daily: null };
    }
  }, [deck.id, deck.label, deck.symbols.length, taskName]);

  const finishRun = useCallback((won: boolean) => {
    const r = runRef.current;
    if (!r || r.ended) return;
    r.ended = true;
    r.playing = false;
    const e = r.eng;
    const grades = gradesFor(e);
    const stars = r.mode === 'ride' ? rideStars(e) : r.mode === 'daily' ? dailyStars(e) : r.mode === 'warmup' ? (won ? 3 : 0) : timeAttackStars(r.cleared);
    const finalScore = e.score;
    setScore(finalScore);
    GameAudio.music.stop(400);
    GameAudio.music.setState('open', 0);
    const verdict = r.src.verdict();
    const perfect = e.status === 'cleared' && e.turns <= perfectOf(e);
    const chargedMs = Math.round(chargedElapsed(e));
    void (async () => {
      const pbKey = r.mode === 'ride' ? 0 : r.mode === 'daily' ? 2 : r.mode === 'warmup' ? 3 : 1;
      // Saving bests and records is on-device and best effort: a storage
      // failure must never leave the player on a dead board with no result.
      const pb = await savePersonalBest(pbKey, finalScore).catch(() => ({ best: finalScore, isNewBest: false }));
      const { rewards, daily: dailySum } = await collectRewards(r, won, perfect, stars);
      let edition: CoinEdition | null = null;
      let upgraded = false;
      let ridePb: number | null = null;
      let newRidePb = false;
      if (r.mode === 'ride') try {
        const rec = await loadRideRecord(rideKey);
        const minted = won ? editionForStars(stars) : 'none';
        const up = upgradeEdition(rec.edition, minted);
        edition = won ? minted : null;
        upgraded = up.upgraded;
        newRidePb = won && !r.signal && (rec.bestMs == null || chargedMs < rec.bestMs);
        ridePb = newRidePb ? chargedMs : rec.bestMs;
        await saveRideRecord(rideKey, { bestMs: ridePb, edition: up.edition });
      } catch {
        edition = won ? editionForStars(stars) : null;
      }
      if (r.mode === 'timeAttack') {
        await pushRankHistory(e.board).catch(() => undefined);
        await saveTaRuns((await loadTaRuns().catch(() => 0)) + 1).catch(() => undefined);
      }
      if (runRef.current !== r) return;
      const par = r.mode === 'daily' ? fairParFor(e.pairsTotal) : parFor(e.pairsTotal);
      const numbers: ResultsNumber[] = [];
      let banner = won ? 'CLEARED!' : memoryLossBanner(e.pairs, e.pairsTotal);
      let tally: MemoryResultsData['tally'] = null;
      let chipText: string | null = null;
      if (r.mode === 'ride') {
        numbers.push({ label: 'TURNS', value: `${e.turns}/${par}`, hot: e.turns <= par });
        if (!r.signal) numbers.push({ label: 'TIME', value: `${(chargedMs / 1000).toFixed(1)}s` });
        if (ridePb != null && !r.signal) numbers.push({ label: 'BEST', value: `${(ridePb / 1000).toFixed(1)}s`, hot: newRidePb });
        if (won) numbers.push({ label: 'SCORE', value: finalScore.toLocaleString('en-US') });
        chipText = luckyChip(e);
        if (perfect && won) banner = 'PERFECT!';
      } else if (r.mode === 'timeAttack') {
        banner = `BOARD ${e.board}`;
        tally = { parts: `${r.cleared} BOARDS · CHAIN ${e.maxChain} · ${e.showtimes} SHOWTIME`, total: finalScore };
        numbers.push({ label: 'BOARDS', value: `${r.cleared}` });
        numbers.push({ label: 'BEST CHAIN', value: `${e.maxChain}` });
      } else if (r.mode === 'daily') {
        banner = won ? 'DAILY DONE' : `OUT ${e.pairs}/${e.pairsTotal}`;
        numbers.push({ label: 'TURNS', value: `${e.turns}`, hot: won && e.turns <= par });
        numbers.push({ label: 'PAR', value: `${par}` });
        numbers.push({ label: 'STRIKES', value: `${e.strikes}/2` });
      } else if (r.mode === 'warmup') {
        banner = 'CLEARED!';
        numbers.push({ label: 'TURNS', value: `${e.turns}` });
      }
      const extra: string[] = [];
      if (upgraded && edition) extra.push(`UPGRADED TO ${edition.toUpperCase()}`);
      if (r.mode === 'timeAttack' || r.mode === 'ride' || r.mode === 'daily') {
        const xp = xpFor(r.mode, { boardsCleared: r.cleared, cleared: won, stars });
        if (xp > 0) try {
          const m = addXp(await loadMastery(), deck.id, xp);
          await saveMastery(m.mastery);
          extra.push(m.after > m.before ? `${deck.label.toUpperCase()} MASTERY LEVEL ${m.after}` : `+${xp} MASTERY XP`);
        } catch {
          // Mastery waits for the next run.
        }
      }
      const data: MemoryResultsData = {
        mode: r.mode === 'race' ? 'race' : r.mode,
        banner,
        won,
        recallPct: recallPct(e),
        edition,
        upgraded,
        stars,
        numbers,
        tally,
        chip: chipText,
        grades: r.mode === 'warmup' ? null : { memory: grades.memory, speed: grades.speed, chain: grades.chain },
        tip: r.mode === 'warmup' ? 'Remember where you saw each card. That is the whole game.' : grades.tip,
        newBest: pb.isNewBest || newRidePb,
        rewards: r.mode === 'warmup' ? null : rewards,
        daily: dailySum,
        extraRewards: extra,
        againLabel: r.mode === 'ride' ? null : r.mode === 'warmup' ? null : 'PLAY AGAIN',
      };
      setResultData(data);
      setResult({
        score: finalScore,
        stars,
        maxCombo: e.maxChain,
        message: banner,
        note: grades.tip,
        meta: {
          game: 'memory',
          engine: ENGINE_VERSION,
          mode: r.mode,
          score: finalScore,
          duration: Math.round(e.elapsedMs),
          charged_ms: chargedMs,
          signal_mode: r.signal,
          seed: baseSeed,
          tryIndex: r.tryIndex,
          ranked: r.ranked,
          runIndex: r.runIndex,
          deck: deck.id,
          turns: e.turns,
          pairs: e.pairs,
          maxCombo: e.maxChain,
          showtimes: e.showtimes,
          stars,
          edition,
          verdict,
          log: e.log.slice(),
          walking: walkingRef.current,
        },
      });
    })();
  }, [baseSeed, collectRewards, deck.id, rideKey]);

  // ---------------------------------------------------------------------------
  // Board clear (3 beats on the 232ms grid) and the Final Pair
  // ---------------------------------------------------------------------------
  const clearBeats = useCallback((r: Run, g: BoothGeo, lastSlot: number) => {
    // Beat 1: wells pop gold outward from the last pair; the clear resolves on tonic G with brass.
    for (let s = 0; s < r.eng.n; s++) {
      const d = waveStep(g, lastSlot, s);
      const c = slotCenter(g, s);
      later(d * 22, () => fx.current?.burst('glints', c.x, c.y, { count: reducedMotion ? 1 : 3 }));
    }
    GameAudio.playLadder('mm_match', 7, { volume: 0.9 });
    GameAudio.play('mm_brass_g');
    Haptic.success();
    // Beat 2: counter bounces slot by slot, coin fountains from the post tops, fist pump, scene shake.
    later(EIGHTH_MS, () => {
      setBounceKey((k) => k + 1);
      fx.current?.burst('coins', g.posts[0].x + 9, g.posts[0].y, { count: reducedMotion ? 4 : 20, angle: -70, spread: 30 });
      fx.current?.burst('coins', g.posts[1].x + 9, g.posts[1].y, { count: reducedMotion ? 4 : 20, angle: -110, spread: 30 });
      stage.current?.pose('fist', 700);
      Haptic.comboHeavy();
      if (!calm) {
        camera.shake(0.45);
        camera.frame(1.02);
      }
    });
    // Beat 3: confetti from the awning, stinger, CLEARED slams into the awning.
    later(EIGHTH_MS * 2, () => {
      fx.current?.burst('confetti', g.W / 2, g.awning.y + g.awning.h, { count: reducedMotion ? 6 : 60 });
      GameAudio.play('mm_board_clear');
      GameAudio.duck(6, 60, 300, 300);
      if (r.mode !== 'ride' && r.mode !== 'daily') awning.current?.sign('CLEARED');
    });
    later(700, () => { if (!calm) camera.frame(1); });
  }, [calm, camera, later, reducedMotion]);

  const mergeAndHandoff = useCallback((r: Run, g: BoothGeo, a: number, b: number, won: boolean) => {
    const ca = slotCenter(g, a);
    const cb = slotCenter(g, b);
    const mx = (ca.x + cb.x) / 2;
    const my = (ca.y + cb.y) / 2;
    const stars = r.mode === 'ride' ? rideStars(r.eng) : 3;
    setMergeEdition(r.mode === 'ride' ? editionForStars(stars) : 'gold');
    setWells((w) => [...w, a, b]);
    cards.current[r.eng.ids[a]]?.moveTo(mx - g.cw / 2, my - g.ch / 2, 240, 0);
    cards.current[r.eng.ids[b]]?.moveTo(mx - g.cw / 2, my - g.ch / 2, 240, 0);
    cards.current[r.eng.ids[a]]?.hide(240);
    cards.current[r.eng.ids[b]]?.hide(240);
    setCoinAt({ x: mx, y: my, s: g.cw * 1.4 });
    coin.value = withDelay(120, withTiming(1, { duration: 350, easing: Easing.out(Easing.back(1.6)) }));
    GameAudio.play('mm_win');
    Haptic.comboHeavy();
    // 250ms anticipation shake (+-3deg at 12Hz) with rising haptics, 12 stars.
    later(470, () => {
      coinShake.value = withSequence(...Array.from({ length: 6 }, (_, i) => withTiming(i % 2 ? -3 : 3, { duration: 40 })), withTiming(0, { duration: 10 }));
      Haptic.tapLight();
      later(80, () => Haptic.hitMedium());
      later(160, () => Haptic.comboHeavy());
      fx.current?.burst('stars', mx, my, { count: reducedMotion ? 6 : 12 });
      stage.current?.pose('coin');
    });
    later(720, () => {
      coinFly.value = withTiming(1, { duration: 300, easing: Easing.in(Easing.cubic) });
      finishRun(won);
    });
  }, [coin, coinFly, coinShake, finishRun, later, reducedMotion]);

  const finalPair = useCallback((a: number, b: number, bonus: number, secondsLeft: number) => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g) return;
    r.busy = true;
    r.finalAt = Date.now();
    const daily = r.mode === 'daily';
    const coins = daily ? Math.max(0, fairParFor(r.eng.pairsTotal) - r.eng.turns) : Math.min(8, secondsLeft);
    const sch = finalPairSchedule(coins);
    later(sch.swap - 20, () => {
      GameAudio.music.setState('open', 60);
      if (r.finalSkipped) return;
      clearBeats(r, g, b);
    });
    // Cash-out (Sugar Crush): coins pop out of the empty wells in a spiral on 16ths.
    const centre = Math.floor((g.rows - 1) / 2) * g.cols + Math.floor((g.cols - 1) / 2);
    const order = Array.from({ length: r.eng.n }, (_, s) => s).sort((x, y) => waveStep(g, centre, x) - waveStep(g, centre, y));
    const shown0 = r.eng.score - bonus;
    for (let i = 0; i < Math.min(8, coins); i++) {
      later(sch.cash + i * SIXTEENTH_MS, () => {
        if (r.finalSkipped) return;
        const c = slotCenter(g, order[i % order.length]);
        fx.current?.burst('coins', c.x, c.y, { count: 1, speed: 0.6 });
        GameAudio.playLadder('coin_tick', Math.min(12, i + 4), { volume: 0.8 });
        Haptic.tickSelection();
        setScore(shown0 + Math.round((bonus * (i + 1)) / Math.max(1, Math.min(8, coins))));
      });
    }
    later(sch.merge, () => {
      if (r.finalSkipped) return;
      setScore(r.eng.score);
      mergeAndHandoff(r, g, a, b, true);
    });
  }, [clearBeats, later, mergeAndHandoff]);

  /** A tap after 600ms of the Final Pair jumps straight to the merge (~1.5s). */
  const skipFinal = useCallback(() => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g || !r.finalAt || r.finalSkipped || r.ended) return;
    if (Date.now() - r.finalAt < FINAL_SKIP_AFTER_MS) return;
    r.finalSkipped = true;
    clearTimers();
    GameAudio.music.setState('open', 60);
    const last = [...r.eng.log].reverse();
    const b = last[1] ?? 0;
    let a = -1;
    for (let i = 2; i + 1 < last.length; i += 2) if (last[i + 1] >= 0) { a = last[i + 1]; break; }
    setScore(r.eng.score);
    mergeAndHandoff(r, g, a >= 0 ? a : b, b, true);
  }, [clearTimers, mergeAndHandoff]);

  const timeoutScene = useCallback((out: boolean) => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g) return;
    r.busy = true;
    r.playing = false;
    GameAudio.music.stop(300);
    GameAudio.music.setState('open', 0);
    GameAudio.play(out ? 'mm_strike' : 'sh_whistle');
    later(260, () => GameAudio.play('mm_lose'));
    Haptic.warning();
    // Show where every card was, but only cards whose picture we know: a
    // server board can keep its layout until it settles, and flipping a card
    // with no picture showed a blank white card (a dead-looking board).
    const layout = r.src.endReveal(r.eng.ids);
    const known: Record<number, number> = {};
    r.eng.ids.forEach((id, s) => {
      const face = layout?.[s] ?? r.eng.faces[s];
      if (typeof face === 'number' && face >= 0) known[id] = face;
    });
    if (Object.keys(known).length) setFaces((m) => ({ ...m, ...known }));
    let k = 0;
    for (let s = 0; s < r.eng.n; s++) {
      if (r.eng.know[s] === K_MATCHED) continue;
      const id = r.eng.ids[s];
      if (known[id] == null) continue;
      later(120 + (k++) * 30, () => cards.current[id]?.timeoutReveal(0));
    }
    // A light veil only: the cards stay readable behind the end card.
    wash.value = withDelay(200, withTiming(0.4, { duration: 300 }));
    stage.current?.hatGag(false);
    stage.current?.tumble();
    rope.urgent.value = 0;
    const left = RIDE_TRIES - 1 - r.tryIndex;
    later(1000, () => {
      // Ride challenge: every try ends on the same end card (TRY AGAIN while
      // the Ticket has tries, then Done), right over the board.
      if (r.mode === 'ride') {
        setTryScreen({ pairs: r.eng.pairs, total: r.eng.pairsTotal, left });
        tryCardIn.value = 0;
        tryCardIn.value = reducedMotion ? 1 : withSpring(1, { damping: 13, stiffness: 190 });
      } else finishRun(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishRun, later, wash, reducedMotion]);

  // ---------------------------------------------------------------------------
  // Memory Race (house crew seats on the same board, design 4.7)
  // ---------------------------------------------------------------------------
  const raceEntries = useCallback((r: Run, at: number) => {
    const rc = r.race!;
    const out = [{ key: 'me', pairs: r.eng.pairs, score: r.eng.score, clearAt: rc.myClearAt, chain: r.eng.chain, show: inShowtime(r.eng) }];
    rc.runs.forEach((run, i) => {
      const f = frameAt(run, at);
      out.push({ key: rc.crew[i].id, pairs: f.pairs, score: f.score, clearAt: run.clearAt != null && run.clearAt <= at ? run.clearAt : null, chain: f.chain, show: f.showtime });
    });
    return out;
  }, []);

  const syncRacers = useCallback((r: Run, at: number) => {
    const rc = r.race;
    if (!rc) return;
    const entries = raceEntries(r, at);
    const place = placements(entries);
    const next: Racer[] = entries.map((e, i) => ({
      key: e.key,
      name: i === 0 ? 'YOU' : rc.crew[i - 1].name,
      shark: (i === 0 ? 'classic' : rc.crew[i - 1].shark) as Racer['shark'],
      pairs: e.pairs,
      chain: e.chain,
      showtime: e.show,
      me: i === 0,
      placement: place[e.key],
      emote: rc.emotes[e.key] ?? null,
      incoming: i === 0 && !!rc.telegraph,
    })).sort((a, b) => a.placement - b.placement);
    setRacers((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [raceEntries]);

  const endRace = useCallback((at: number) => {
    const r = runRef.current;
    if (!r || !r.race || r.ended) return;
    r.ended = true;
    r.playing = false;
    r.busy = true;
    const live = partyRef.current;
    if (live) {
      GameAudio.music.stop(400);
      stage.current?.pose(r.eng.status === 'cleared' ? 'coin' : 'idle');
      live.onBoardDone();
      return;
    }
    const rc = r.race;
    const entries = raceEntries(r, at);
    const place = placements(entries);
    const mine = place.me;
    const e = r.eng;
    const grades = gradesFor(e);
    syncRacers(r, at);
    GameAudio.music.stop(400);
    if (mine === 1) {
      GameAudio.play('fx.reward');
      Haptic.success();
      stage.current?.pose('coin');
      awning.current?.ribbon('1ST PLACE');
    } else {
      GameAudio.play('mm_lose');
      Haptic.tickSelection();
      later(80, () => Haptic.tickSelection());
      stage.current?.tumble();
      const w = entries.find((x) => place[x.key] === 1);
      const wi = rc.crew.findIndex((c) => c.id === w?.key);
      if (wi >= 0) awning.current?.ribbon(`${rc.crew[wi].name.toUpperCase()} WINS`);
    }
    const ord = ['1ST', '2ND', '3RD', '4TH'][mine - 1] ?? `${mine}TH`;
    later(1400, () => {
      setScore(e.score);
      setResultData({
        mode: 'race', banner: mine === 1 ? 'YOU WIN' : `${ord} PLACE`, won: mine === 1, recallPct: recallPct(e), edition: null, upgraded: false,
        stars: mine === 1 ? 3 : mine === 2 ? 2 : 1,
        numbers: [{ label: 'PLACE', value: ord }, { label: 'PAIRS', value: `${e.pairs}/${e.pairsTotal}` }, { label: 'PRACTICE', value: 'RACE' }],
        tally: null, chip: null, grades: { memory: grades.memory, speed: grades.speed, chain: grades.chain }, tip: grades.tip, newBest: false,
        rewards: null, daily: null, extraRewards: [], againLabel: 'PLAY AGAIN',
      });
      setResult({
        score: e.score,
        stars: mine === 1 ? 3 : mine === 2 ? 2 : 1,
        maxCombo: e.maxChain,
        message: mine === 1 ? '1ST PLACE!' : `${ord} PLACE`,
        note: grades.tip,
        meta: {
          game: 'memory', engine: ENGINE_VERSION, mode: 'race', practice: true, score: e.score, seed: baseSeed, runIndex: r.runIndex,
          placement: mine, crew: rc.crew.map((c) => c.id), log: e.log.slice(), walking: walkingRef.current,
        },
      });
    });
  }, [baseSeed, later, raceEntries, syncRacers]);

  const startTelegraph = useCallback((r: Run, at: number) => {
    const rc = r.race!;
    rc.telegraph = { until: at + ATTACK_TELEGRAPH_MS, blocked: false };
    GameAudio.play('sh_seagull', { volume: 0.8 });
    Haptic.hitRigid();
    incoming.value = 0;
    incoming.value = withTiming(1, { duration: ATTACK_TELEGRAPH_MS, easing: Easing.linear });
    awning.current?.ribbon('INCOMING GULL');
  }, [incoming]);

  /** Our chain 3 sends a Gull Swap to the leading crew seat (it loses time). */
  const sendAttack = useCallback((r: Run, at: number) => {
    const rc = r.race!;
    const entries = raceEntries(r, at).slice(1);
    if (!entries.length) return;
    let best = 0;
    entries.forEach((x, i) => { if (x.pairs > entries[best].pairs || (x.pairs === entries[best].pairs && x.score > entries[best].score)) best = i; });
    const target = best;
    GameAudio.play('sh_seagull', { volume: 0.6 });
    later(ATTACK_TELEGRAPH_MS, () => {
      const rr = runRef.current;
      if (rr !== r || !rr.race || rr.ended) return;
      rc.delays[target].push(at + ATTACK_TELEGRAPH_MS);
      rc.runs[target] = simulateCrew(rr.seed, target + 1, rc.crew[target], rc.layout, rc.delays[target]);
      rc.emotes[rc.crew[target].id] = { id: 'fin', at: Date.now() };
    });
  }, [later, raceEntries]);

  const raceTick = useCallback((r: Run, at: number) => {
    const rc = r.race;
    if (!rc || r.ended) return;
    const live = partyRef.current;
    if (live) {
      live.reportProgress(r.eng.score, r.eng.chain);
      const next = live.racers();
      setRacers((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      if (at >= RACE_MS + RACE_PLAY_AT) endRace(at);
      return;
    }
    rc.runs.forEach((run, i) => {
      const f = frameAt(run, at);
      if (f.showtime && !rc.shows[i]) rc.emotes[rc.crew[i].id] = { id: 'sunglasses', at: Date.now() };
      rc.shows[i] = f.showtime;
      if (run.clearAt != null && run.clearAt <= at && !rc.winner) rc.winner = rc.crew[i].id;
    });
    if (rc.winner && rc.winner !== 'me') {
      endRace(at);
      return;
    }
    rc.runs.forEach((run, i) => {
      while (rc.sendIdx[i] < run.sends.length && run.sends[rc.sendIdx[i]] <= at) {
        rc.sendIdx[i] += 1;
        const entries = raceEntries(r, at);
        const others = entries.filter((x) => x.key !== rc.crew[i].id);
        const lead = others.reduce((a, b) => (b.pairs > a.pairs || (b.pairs === a.pairs && b.score > a.score) ? b : a));
        if (lead.key === 'me') {
          if (offerAttack(rc.gate, at) && !rc.telegraph) startTelegraph(r, at);
        } else {
          const ti = rc.crew.findIndex((c) => c.id === lead.key);
          if (ti >= 0) {
            rc.delays[ti].push(at + ATTACK_TELEGRAPH_MS);
            rc.runs[ti] = simulateCrew(r.seed, ti + 1, rc.crew[ti], rc.layout, rc.delays[ti]);
          }
        }
      }
    });
    if (!rc.telegraph && releaseStored(rc.gate, at)) startTelegraph(r, at);
    if (rc.telegraph && at >= rc.telegraph.until) {
      const blocked = rc.telegraph.blocked;
      rc.telegraph = null;
      incoming.value = withTiming(0, { duration: 160 });
      if (blocked) {
        awning.current?.ribbon('BLOCKED');
        GameAudio.play('sh_shield_pop');
        Haptic.hitMedium();
      } else {
        applyEventsRef.current(send({ t: 'attack', at }));
      }
    }
    syncRacers(r, at);
  }, [endRace, incoming, raceEntries, send, startTelegraph, syncRacers]);

  // ---------------------------------------------------------------------------
  // Time Attack: next board on the staircase, systems earned (4.2)
  // ---------------------------------------------------------------------------
  const boardCleared = useCallback((bonus: number, lastSlot: number) => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g) return;
    r.busy = true;
    r.cleared += 1;
    send({ t: 'freeze', on: true, at: gameNow() });
    clearBeats(r, g, lastSlot);
    later(EIGHTH_MS * 2, () => {
      fx.current?.flyUp(`+${bonus}`, g.W / 2, g.grid.y + g.grid.h / 2, { size: 'lg', color: '#ffcf3b' });
      scorePlate.current?.tally(`CLEAR +${bonus}`);
      setScore(r.eng.score);
    });
    // Ledger: what this board proved.
    const ledger = recordBoard(r.ledger, { cleared: true, slips: r.eng.boardSlips, maxChain: r.eng.maxChain, showtimes: r.eng.showtimes, peekMatches: r.eng.peekMatches });
    r.ledger = ledger;
    void saveLedger(ledger);
    later(1150, () => {
      const rr = runRef.current;
      if (!rr || rr.ended) return;
      const pairs = nextPairs(rr.pairs, rr.eng.boardSlips);
      const nextBoard = rr.eng.board + 1;
      const plan = planBoard(nextBoard, rr.introduced, rr.ledger, rr.heat);
      rr.introduced = plan.introduced;
      const s2 = boardSeed(rr.seed, nextBoard);
      rr.src = createLocalBoard({ pairs, deckSize: deck.symbols.length, seed: s2, golden: plan.sys.golden, gull: plan.sys.seagull }, deck.symbols.length);
      rr.pairs = rr.src.info.pairs;
      rr.prizeNext = 0;
      rr.moved.clear();
      const sh = shapeForPairs(rr.pairs);
      dealBoard(rr.eng, sh.cols, sh.rows, gameNow());
      applySystems(rr.eng, plan.sys);
      newBoardView(sh.cols, sh.rows, sh.pairs);
      const peekNow = plan.sys.peek;
      if (peekNow && rr.peeks === 0 && plan.unlock === 'peek') rr.peeks = 1;
      setPeeks({ n: rr.peeks, armed: false, show: peekNow });
      const card = plan.unlock
        ? { kicker: 'NEW', title: SYSTEM_LABEL[plan.unlock as SystemId] }
        : plan.locked
          ? { kicker: 'ONE MORE LIKE THIS', title: SYSTEM_LABEL[plan.locked as SystemId], hint: SYSTEM_HINT[plan.locked as SystemId] }
          : null;
      setUnlock(card);
      later(card ? 1200 : 450, () => {
        setUnlock(null);
        runGlimpse(() => { const q = runRef.current; if (q) q.busy = false; syncHud(); });
      });
    });
  }, [clearBeats, deck.symbols.length, gameNow, later, newBoardView, runGlimpse, send, syncHud]);

  // ---------------------------------------------------------------------------
  // Events -> FX, sound, haptics, poses (sound and haptic on the same frame)
  // ---------------------------------------------------------------------------
  const applyEvents = useCallback((events: MMEvent[]) => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g || !events.length) return;
    const e = r.eng;
    const show = inShowtime(e);
    const flipMs = show ? FLIP_SHOWTIME_MS : FLIP_MS;
    const lastMatch = events.find((x) => x.k === 'match' && x.last) as Extract<MMEvent, { k: 'match' }> | undefined;
    const recallNow = events.find((x) => x.k === 'match' && x.grade === 'recall');
    const finalSpectacle = !!lastMatch && (r.mode === 'ride' || r.mode === 'daily');
    for (const ev of events) {
      switch (ev.k) {
        case 'flip': {
          const id = e.ids[ev.slot];
          r.touched.set(ev.slot, Date.now());
          if (finalSpectacle && !ev.first) {
            // Final Pair: the riser starts, the music low-passes, the scene pushes after the second card.
            cards.current[id]?.slowFlip();
            GameAudio.play('mm_final_riser');
            GameAudio.music.setState('muffled', 120);
            const c = slotCenter(g, ev.slot);
            if (!calm) {
              camera.frame(1.06);
              camera.kick((c.x - g.W / 2) * 0.04, (c.y - g.H / 2) * 0.03);
            }
          } else {
            const golden = e.faces[ev.slot] === FACE_GOLD;
            if (golden) {
              cards.current[id]?.goldLeak();
              later(110, () => {
                GameAudio.play('mm_golden_reveal');
                Haptic.hitRigid();
                const c = slotCenter(g, ev.slot);
                fx.current?.burst('sparkles', c.x, c.y, { count: reducedMotion ? 4 : 10 });
              });
            }
            cards.current[id]?.flipUp(flipMs, !ev.first && !!recallNow);
          }
          GameAudio.play('mm_flip', { pan: ((ev.slot % g.cols) / Math.max(1, g.cols - 1) - 0.5) * 0.8 });
          Haptic.tapLight();
          if (ev.first) {
            // Curious lean toward the card's half until the turn resolves.
            const half = (ev.slot % g.cols) < g.cols / 2 ? -1 : 1;
            stage.current?.lean(half as -1 | 1);
            // Promise glint (Warm-up, first 3 Time Attack runs): A's seen partner glints.
            if (r.glint) {
              const fa = e.faces[ev.slot];
              for (let s = 0; s < e.n; s++) {
                if (s !== ev.slot && e.faces[s] === fa && e.know[s] === K_SEEN) {
                  const pid = e.ids[s];
                  later(flipMs + 150, () => cards.current[pid]?.goldLeak());
                }
              }
            }
          }
          break;
        }
        case 'match': {
          const { a, b, chain, parts, grade } = ev;
          stage.current?.lean(0);
          r.albumMatches.push({ face: ev.face, recall: grade === 'recall' });
          if (r.race?.telegraph && grade !== 'lucky') r.race.telegraph.blocked = true;
          const ida = e.ids[a];
          const idb = e.ids[b];
          const showM = parts.showHalves > 2;
          const ca = slotCenter(g, a);
          const cb = slotCenter(g, b);
          const mx = (ca.x + cb.x) / 2;
          const my = (ca.y + cb.y) / 2;
          if (finalSpectacle) break;
          const land = flipMs + (grade === 'recall' && !ev.last ? 40 : 0);
          later(land, () => {
            const stop = hitStopFor(Math.max(1, chain), showM);
            const tierRim = grade === 'recall' && chain >= 3;
            const sc = grade === 'lucky' ? 0.8 : 1;
            cards.current[ida]?.stamp(stop, tierRim, sc);
            cards.current[idb]?.stamp(stop, tierRim, sc);
            // Sound + haptic on the same frame: three distinct impacts by grade.
            const degree = ladderStep(Math.max(1, chain));
            GameAudio.playLadder('mm_match', degree);
            if (grade === 'recall') {
              GameAudio.playLadder('mm_sharp_twinkle', degree, { volume: 0.7 });
              if (chain >= 9) GameAudio.play('mm_match_third', { volume: 0.7 });
              if (chain >= 10) GameAudio.play('mm_match_fifth', { volume: 0.7 });
              Haptic.hitRigid();
            } else if (grade === 'glimpse') Haptic.hitMedium();
            else Haptic.hitSoft();
            if (parts.golden) GameAudio.play('fx.coin');
            // Particles and rings by tier.
            const nStars = reducedMotion ? 6 : grade === 'recall' ? tierStars(chain, showM) : 8;
            fx.current?.burst('stars', ca.x, ca.y, { count: Math.ceil(nStars / 2) });
            fx.current?.burst('stars', cb.x, cb.y, { count: Math.ceil(nStars / 2) });
            fx.current?.ring(ca.x, ca.y + g.ch * 0.4, { color: '#ffffff', from: 4, to: g.cw * 0.9, ms: 160 });
            fx.current?.ring(cb.x, cb.y + g.ch * 0.4, { color: '#ffffff', from: 4, to: g.cw * 0.9, ms: 160 });
            const strength = grade === 'recall' ? (chain >= 3 ? 1 : chain === 2 ? 0.7 : 0.4) : 0.4;
            if (!reducedMotion) {
              ripple.value = { x: mx, y: my, p: 0, strength };
              ripple.value = withTiming({ x: mx, y: my, p: 1, strength }, { duration: 420 });
            }
            if (grade === 'recall' && chain >= 3) {
              fx.current?.ring(ca.x, ca.y, { color: '#fec90e', from: 6, to: g.cw * 1.4, ms: 280 });
              fx.current?.ring(cb.x, cb.y, { color: '#fec90e', from: 6, to: g.cw * 1.4, ms: 280 });
              fx.current?.burst('coins', mx, my, { count: 4 });
            }
            if (showM) {
              fx.current?.burst('ribbons', g.W * 0.15, g.awning.y + g.awning.h, { count: 3 });
              fx.current?.burst('ribbons', g.W * 0.85, g.awning.y + g.awning.h, { count: 3 });
              marqueeFlash(marquee);
            }
            // Link arc from the card you saw earlier (chain 2+).
            if (grade === 'recall' && chain >= 2) {
              arc.value = { x1: cb.x, y1: cb.y, x2: ca.x, y2: ca.y, p: 0, a: 1 };
              arc.value = withSequence(
                withTiming({ x1: cb.x, y1: cb.y, x2: ca.x, y2: ca.y, p: 1, a: 1 }, { duration: 140 }),
                withTiming({ x1: cb.x, y1: cb.y, x2: ca.x, y2: ca.y, p: 1, a: 0 }, { duration: 200 }),
              ) as unknown as ArcState;
            }
            // Small card tags (hierarchy: small on cards, medium on the awning).
            const tagTop = slotXY(g, b).y - 10;
            const tag = grade === 'recall' ? 'SHARP' : grade === 'glimpse' ? 'SEEN IT' : 'LUCKY';
            flights.current?.tag(tag, cb.x, tagTop, g.cw * 0.9, grade === 'recall' ? 'gold' : grade === 'glimpse' ? 'cream' : 'white');
            if (parts.quick) {
              fx.current?.ring(cb.x, cb.y, { color: '#fec90e', from: g.cw * 0.5, to: g.cw * 0.62, ms: 120 });
              flights.current?.tag(`QUICK +${parts.quick}`, ca.x, slotXY(g, a).y - 10, g.cw * 0.9, 'gold');
            }
            if (parts.golden) flights.current?.tag('+3s', ca.x, slotXY(g, a).y + g.ch - 8, g.cw * 0.6, 'gold');
            if (ev.tierUp) {
              Haptic.success();
              if (ev.tierUp === 3) {
                awning.current?.ribbon('SWEET RUN');
                GameAudio.play('mm_sting_sweet_run');
              }
            }
            // The barker answers.
            stage.current?.pose(grade === 'recall' ? 'fist' : 'wave', 700);
            // Score (Time Attack shows it on the HUD with the Balatro tally).
            if (flags.scoreOnHud) {
              const bits = [`${parts.base}`];
              if (parts.chainHalves > 2) bits.push(`x${parts.chainHalves / 2}`);
              if (parts.showHalves > 2) bits.push('x1.5');
              if (parts.golden) bits.push('x2');
              if (parts.overtime) bits.push('x2');
              if (!ev.pot) {
                scorePlate.current?.tally(bits.join(' '));
                later(200, () => setScore(r.eng.score));
              }
            }
            marqueeChain(marquee, e.chain, reducedMotion);
            chainPlate.current?.quick();
            if (r.race && ev.tierUp === 3 && !r.ended) sendAttack(r, gameNow());
          });
          // Counter flight (or the Showtime pot), 60ms after the stamp.
          const face = ev.face;
          const toPot = ev.pot;
          const k = toPot ? -1 : r.prizeNext++;
          const target = toPot
            ? { x: g.pot.x - (g.prize[0]?.w ?? 26) / 2, y: g.counter.y - (g.prize[0]?.h ?? 32) * 0.5, w: g.prize[0]?.w ?? 26, h: g.prize[0]?.h ?? 32 }
            : g.prize[Math.min(k, g.prize.length - 1)];
          const stack = toPot ? r.potStack++ : 0;
          if (toPot) r.potFaces.push(face);
          const flyAt = land + hitStopFor(Math.max(1, chain), showM) + 200;
          later(flyAt, () => {
            cards.current[ida]?.hide(60);
            cards.current[idb]?.hide(60);
            setWells((w) => [...w, a, b]);
            flights.current?.fly({
              a: slotXY(g, a), b: slotXY(g, b), to: target, face: faceFor(deck, face), w: g.cw, h: g.ch, stack, delayMs: 0,
              onLand: () => {
                GameAudio.play('mm_shelf_drop', { volume: 0.8 });
                fx.current?.burst('glints', target.x + target.w / 2, target.y + target.h / 2, { count: 4 });
                if (toPot) {
                  setPot((p) => ({ faces: [...(p?.faces ?? []), faceFor(deck, face)], value: (p?.value ?? 0) + parts.value }));
                } else {
                  setPrizes((pz) => {
                    const c = pz.slice();
                    c[k] = { face: faceFor(deck, face), tint: face === FACE_GOLD ? 'gold' : undefined };
                    return c;
                  });
                }
              },
            });
          });
          if (!ev.last) syncHud();
          break;
        }
        case 'scout': {
          stage.current?.lean(0);
          chip.current?.show('scout');
          later(flipMs, () => {
            cards.current[e.ids[ev.a]]?.settle();
            cards.current[e.ids[ev.b]]?.settle();
          });
          GameAudio.play('mm_scout_tick');
          Haptic.tickSelection();
          chainPlate.current?.bounce();
          if (!r.firstTips.scout && r.runIndex === 0 && r.tryIndex === 0 && r.mode !== 'race') {
            r.firstTips.scout = true;
            showTip('New cards are free. Keep your chain.', 'scout');
          }
          break;
        }
        case 'gullMiss': {
          stage.current?.lean(0);
          GameAudio.play('sh_seagull');
          Haptic.tapLight();
          break;
        }
        case 'slip': {
          stage.current?.lean(0);
          if (r.race) {
            r.stumbleUntil = gameNow() + 1000;
            setStumble(true);
            later(1000, () => setStumble(false));
          }
          later(flipMs, () => {
            const wob = !calm;
            cards.current[e.ids[ev.a]]?.slip(wob);
            cards.current[e.ids[ev.b]]?.slip(wob);
            if (ev.kind === 'a' && ev.ghost >= 0) {
              // Teaching beat (a): the forgotten card lifts and shows its face, a coral dashed arc to the wrong card.
              const gid = e.ids[ev.ghost];
              cards.current[gid]?.forgot();
              const cg = slotCenter(g, ev.ghost);
              const cb = slotCenter(g, ev.b);
              slipArc.value = { x1: cg.x, y1: cg.y, x2: cb.x, y2: cb.y, p: 0, a: 1 };
              slipArc.value = withSequence(
                withTiming({ x1: cg.x, y1: cg.y, x2: cb.x, y2: cb.y, p: 1, a: 1 }, { duration: 200 }),
                withDelay(440, withTiming({ x1: cg.x, y1: cg.y, x2: cb.x, y2: cb.y, p: 1, a: 0 }, { duration: 160 })),
              ) as unknown as ArcState;
            } else if (ev.kind === 'b') {
              cards.current[e.ids[ev.b]]?.seenTag();
            }
          });
          chip.current?.show('slip');
          GameAudio.play('mm_slip');
          later(380, () => GameAudio.playLadder('mm_match', 0, { volume: 0.45 }));
          Haptic.warning();
          chainPlate.current?.shatter();
          if (!reducedMotion) fx.current?.burst('shards', g.hud.x + g.hud.w - 48, g.hud.y + 22, { count: 8 });
          marqueeFizzle(marquee);
          stage.current?.pose('facepalm', 800);
          if (!r.firstTips.slip && r.runIndex === 0 && r.tryIndex === 0 && r.mode !== 'race') {
            r.firstTips.slip = true;
            showTip('You saw that one! Chain reset.', 'slip');
          }
          break;
        }
        case 'strike': {
          GameAudio.play('mm_strike');
          later(420, () => chip.current?.show('strike'));
          break;
        }
        case 'hide': {
          const ida = e.ids[ev.a];
          const idb = e.ids[ev.b];
          stage.current?.lean(0);
          if (ev.quick) {
            cards.current[ida]?.flipDown(120);
            cards.current[idb]?.flipDown(120);
          } else {
            cards.current[ida]?.flipDown(200);
            cards.current[idb]?.flipDown(200, 60);
          }
          break;
        }
        case 'gauge':
          if (ev.delta < 0 && ev.pips > 0) GameAudio.play('ui.select', { volume: 0.35 });
          syncHud();
          break;
        case 'showtimeOn': {
          GameAudio.play('mm_sting_showtime');
          GameAudio.play('mm_hat_pop');
          GameAudio.duck(6, 60, 300, 300);
          Haptic.comboHeavy();
          awning.current?.sign('SHOWTIME');
          stage.current?.hatGag(true);
          marquee.all.value = withTiming(1, { duration: 120 });
          rays.value = withTiming(1, { duration: 300 });
          // Gold backs wave in from the trigger well (Manhattan, 18ms per step).
          for (let s = 0; s < e.n; s++) {
            if (e.know[s] === K_MATCHED) continue;
            cards.current[e.ids[s]]?.gold(true, waveStep(g, ev.slot, s) * 18);
          }
          if (!calm) {
            camera.frame(1.025);
            camera.shake(0.3);
          }
          setBed('mm_loop_showtime');
          syncHud();
          break;
        }
        case 'showtimeTurn':
          syncHud();
          break;
        case 'showtimeWarn': {
          GameAudio.play('sh_fever_end', { volume: 0.7 });
          Haptic.tickSelection();
          syncHud();
          break;
        }
        case 'potPay': {
          // Tetris Effect Zone resolve: hold, burst the pot into its own slots, one tally, coin cascade.
          const potFaces = r.potFaces.slice();
          r.potFaces = [];
          r.potStack = 0;
          later(110, () => {
            GameAudio.play('mm_pot_burst');
            Haptic.hitRigid();
            later(120, () => Haptic.comboHeavy());
            potFaces.forEach((f, i) => {
              const k = r.prizeNext++;
              const slotRect = g.prize[Math.min(k, g.prize.length - 1)];
              later(i * 40, () => {
                flights.current?.fly({
                  a: { x: g.pot.x - g.cw / 2, y: g.counter.y - g.ch * 0.6 }, b: { x: g.pot.x - g.cw / 2 + 4, y: g.counter.y - g.ch * 0.6 },
                  to: slotRect, face: faceFor(deck, f), w: g.cw * 0.5, h: g.ch * 0.5, delayMs: 0,
                  onLand: () => setPrizes((pz) => {
                    const c = pz.slice();
                    c[k] = { face: faceFor(deck, f) };
                    return c;
                  }),
                });
              });
            });
            setPot(null);
            if (flags.scoreOnHud) scorePlate.current?.tally(`POT ${ev.value.toLocaleString('en-US')}`);
            const ticks = Math.min(12, Math.max(1, Math.floor(ev.value / 200)));
            for (let i = 0; i < ticks; i++) {
              later(i * SIXTEENTH_MS, () => GameAudio.playLadder('coin_tick', i, { volume: 0.8 }));
            }
            later(220, () => setScore(r.eng.score));
          });
          break;
        }
        case 'showtimeOff': {
          rays.value = withTiming(0, { duration: 400 });
          marquee.all.value = withTiming(0, { duration: 300 });
          stage.current?.hatGag(false);
          for (let s = 0; s < e.n; s++) cards.current[e.ids[s]]?.gold(false, waveStep(g, 0, s) * 18);
          if (!calm) camera.frame(1);
          setBed(r.eng.overtime ? 'mm_loop_overtime' : 'mm_loop_main');
          syncHud();
          break;
        }
        case 'photoPick': {
          later(350, () => {
            setPhotoPick(ev.slot);
            tabs.value = withSequence(withTiming(1, { duration: 140 }), withDelay(1360, withTiming(0, { duration: 1 })));
            later(1500, () => {
              const rr = runRef.current;
              if (!rr || rr.eng.photoSlot < 0) { setPhotoPick(null); return; }
              setPhotoPick(null);
              applyEventsRef.current(send({ t: 'photoPick', axis: 'row', at: gameNow() }));
            });
          });
          break;
        }
        case 'photoFlash': {
          setPhotoPick(null);
          later(150, () => {
            GameAudio.play('sh_camera');
            Haptic.hitMedium();
            const rects = ev.slots.map((s) => ({ ...slotXY(g, s), w: g.cw, h: g.ch }));
            flash.value = { rects, p: 1 };
            flashP.value = 0;
            flashP.value = withTiming(1, { duration: 300 });
            const map: Record<number, number> = {};
            const fs: number[] = [];
            for (const s of ev.slots) {
              const f = r.src.faceAt(s, e.ids);
              fs.push(f ?? -1);
              if (f != null) map[e.ids[s]] = f;
            }
            setFaces((m) => ({ ...m, ...map }));
            if (r.src.kind === 'local') send({ t: 'reveal', slots: ev.slots, faces: fs, at: gameNow() });
            ev.slots.forEach((s, i) => later(i * 20, () => cards.current[e.ids[s]]?.peek(500)));
          });
          break;
        }
        case 'overtime': {
          GameAudio.play('mm_overtime_hit');
          Haptic.comboHeavy();
          awning.current?.ribbon(e.cfg.overtimeMult > 1 ? 'OVERTIME x2' : 'OVERTIME');
          if (!inShowtime(e)) setBed('mm_loop_overtime');
          if (!calm) camera.frame(1.03);
          syncHud();
          break;
        }
        case 'second': {
          if (ev.left <= 5 && ev.left > 0 && e.cfg.clockMs != null) {
            GameAudio.play('mm_clock_tick');
            Haptic.tickSelection();
            if (ev.left === 5) stage.current?.pose('gasp');
          }
          syncHud();
          break;
        }
        case 'clock': {
          const top = g.rope.y + 18;
          flights.current?.tag(`${ev.deltaMs > 0 ? '+' : '-'}${(Math.abs(ev.deltaMs) / 1000).toFixed(ev.deltaMs % 1000 ? 1 : 0)}s`, g.W / 2, top, 56, ev.deltaMs > 0 ? 'gold' : 'coral');
          if (ev.deltaMs > 0) GameAudio.play('ui.tap', { volume: 0.2 });
          break;
        }
        case 'gullSwap': {
          const s1 = ev.s1;
          const s2 = ev.s2;
          const p1 = slotXY(g, s1);
          const p2 = slotXY(g, s2);
          const id1 = e.ids[s1];
          const id2 = e.ids[s2];
          r.busy = true;
          send({ t: 'freeze', on: true, at: gameNow() });
          setGullAt({ x1: p2.x + g.cw / 2, y1: p2.y, x2: p1.x + g.cw / 2, y2: p1.y });
          gull.value = 0;
          // 600ms telegraph (lands, targets lift with a gold outline), 420ms carry, takeoff.
          gull.value = withSequence(withTiming(1, { duration: 600 }), withDelay(420, withTiming(2, { duration: 300 })), withTiming(0, { duration: 1 }));
          GameAudio.play('sh_seagull');
          later(300, () => {
            Haptic.tapLight();
            cards.current[id1]?.lift(true);
            cards.current[id2]?.lift(true);
            cards.current[id1]?.moved(true, true);
            cards.current[id2]?.moved(true, true);
          });
          later(600, () => {
            cards.current[id1]?.moveTo(p1.x, p1.y, 420, g.cw * 0.5);
            cards.current[id2]?.moveTo(p2.x, p2.y, 420, g.cw * 0.5);
            const c1 = slotCenter(g, s1);
            const c2 = slotCenter(g, s2);
            trail.value = { x1: c2.x, y1: c2.y, x2: c1.x, y2: c1.y, p: 0, a: 1 };
            trail.value = withSequence(
              withTiming({ x1: c2.x, y1: c2.y, x2: c1.x, y2: c1.y, p: 1, a: 1 }, { duration: 420 }),
              withDelay(1000, withTiming({ x1: c2.x, y1: c2.y, x2: c1.x, y2: c1.y, p: 1, a: 0 }, { duration: 200 })),
            ) as unknown as ArcState;
            fx.current?.burst('puff', (c1.x + c2.x) / 2, (c1.y + c2.y) / 2, { count: 6 });
          });
          later(1040, () => {
            Haptic.hitMedium();
            cards.current[id1]?.lift(false);
            cards.current[id2]?.lift(false);
            r.moved.add(id1);
            r.moved.add(id2);
            setSlotIds(r.eng.ids.slice());
            send({ t: 'freeze', on: false, at: gameNow() });
            r.busy = false;
          });
          break;
        }
        case 'tide': {
          const row = ev.row;
          r.busy = true;
          send({ t: 'freeze', on: true, at: gameNow() });
          GameAudio.play('sh_wave_wash');
          setTideAt({ x0: g.grid.x - g.cw, x1: g.grid.x + g.grid.w, y: slotCenter(g, row * g.cols).y });
          tide.value = 0;
          tide.value = withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) });
          for (let c = 0; c < g.cols; c++) {
            const s = row * g.cols + c;
            const id = e.ids[s];
            const p = slotXY(g, s);
            if (e.know[s] === K_MATCHED) continue;
            if (c === 0) cards.current[id]?.teleport(p.x, p.y, 600);
            else cards.current[id]?.moveTo(p.x, p.y, 360, 6, 600);
            later(960, () => cards.current[id]?.moved(true, true));
            r.moved.add(id);
          }
          const y = slotCenter(g, row * g.cols).y;
          later(600, () => {
            fx.current?.burst('splash', g.grid.x, y, { count: 10 });
            fx.current?.burst('splash', g.grid.x + g.grid.w, y, { count: 10 });
          });
          const nextWells: number[] = [];
          for (let s2 = 0; s2 < e.n; s2++) if (e.know[s2] === K_MATCHED) nextWells.push(s2);
          setWells(nextWells);
          later(980, () => {
            setSlotIds(r.eng.ids.slice());
            send({ t: 'freeze', on: false, at: gameNow() });
            r.busy = false;
          });
          break;
        }
        case 'boardClear': {
          const m = lastMatch;
          later(flipMs + 110, () => boardCleared(ev.bonus, m ? m.b : 0));
          break;
        }
        case 'cleared': {
          if (r.race) {
            if (!r.race.winner) r.race.winner = 'me';
            r.race.myClearAt = gameNow();
            GameAudio.play('mm_board_clear');
            fx.current?.burst('confetti', g.W / 2, g.awning.y + g.awning.h, { count: reducedMotion ? 6 : 50 });
            endRace(gameNow());
            break;
          }
          const m = lastMatch;
          if (r.mode === 'warmup') {
            r.busy = true;
            later(flipMs + 110, () => {
              clearBeats(r, g, m ? m.b : 0);
              later(EIGHTH_MS * 4, () => finishRun(true));
            });
          } else if (m) finalPair(m.a, m.b, ev.bonus, ev.secondsLeft);
          else finishRun(true);
          break;
        }
        case 'timeout':
          if (r.race) { endRace(gameNow()); break; }
          if (r.mode === 'timeAttack') {
            r.busy = true;
            GameAudio.play('sh_whistle');
            stage.current?.tumble();
            later(900, () => finishRun(false));
            break;
          }
          timeoutScene(false);
          break;
        case 'out':
          later(600, () => timeoutScene(true));
          break;
        default:
          break;
      }
    }
    // Moved rims clear once the next turn resolves.
    if (events.some((x) => x.k === 'match' || x.k === 'scout' || x.k === 'slip' || x.k === 'gullMiss')) {
      r.moved.forEach((id) => cards.current[id]?.moved(false));
      r.moved.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardCleared, calm, camera, clearBeats, deck, endRace, finalPair, finishRun, flags.scoreOnHud, gameNow, later, reducedMotion, sendAttack, send, showTip, syncHud, timeoutScene]);
  applyEventsRef.current = applyEvents;

  // ---------------------------------------------------------------------------
  // Tick
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      const r = runRef.current;
      if (!r || !r.playing || r.pausedAt != null || r.ended) return;
      const at = gameNow();
      const ev = send({ t: 'tick', at });
      if (ev.length) applyEvents(ev);
      if (r.race && !r.ended) raceTick(r, at);
      syncHud();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [visible, applyEvents, gameNow, raceTick, send, syncHud]);

  // ---------------------------------------------------------------------------
  // Input: one board tap, nearest card centre with forgiveness, one buffered tap
  // ---------------------------------------------------------------------------
  const hitSlot = useCallback((x: number, y: number): number => {
    const g = geoRef.current;
    const r = runRef.current;
    if (!g || !r) return -1;
    return geoHitSlot(g, x, y, walkingRef.current ? 10 : 4, (s) => r.eng.know[s] === K_MATCHED);
  }, []);

  const pressedId = useRef(-1);
  const holding = useRef(false);
  const onPressIn = useCallback((x: number, y: number) => {
    const g = geoRef.current;
    const r = runRef.current;
    if (!g || !r || !r.playing) return;
    const s = hitSlot(x, y);
    if (s < 0) return;
    // Touch-and-hold on a missed card keeps both up (up to 2500ms after B landed).
    if (r.eng.phase === 2 && r.eng.up.indexOf(s) >= 0) {
      holding.current = true;
      send({ t: 'hold', on: true, at: gameNow() });
      return;
    }
    if (r.busy || r.eng.up.indexOf(s) >= 0) return;
    const c = slotCenter(g, s);
    const id = r.eng.ids[s];
    pressedId.current = id;
    cards.current[id]?.press((x - c.x) / (g.cw / 2), (y - c.y) / (g.ch / 2));
  }, [gameNow, hitSlot, send]);

  const releaseHold = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    const ev = send({ t: 'hold', on: false, at: gameNow() });
    if (ev.length) applyEventsRef.current(ev);
  }, [gameNow, send]);

  const finishFlip = useCallback((r: Run, slot: number, id: number, at: number, res: FlipReveal) => {
    if (runRef.current !== r) return;
    if (r.pendingTimer) {
      clearTimeout(r.pendingTimer);
      r.pendingTimer = null;
    }
    const wasPending = r.pending;
    r.pending = false;
    if (wasPending) {
      send({ t: 'pending', on: false, at: gameNow() });
      rope.glint.value = -1;
    }
    const face = r.src.kind === 'local' ? (r.src.faceAt(slot, r.eng.ids) ?? res.face) : res.face;
    setFaces((m) => (m[id] === face ? m : { ...m, [id]: face }));
    const out = step(r.eng, { t: 'flip', slot, face, at });
    if (res.chargedMs != null) {
      out.push(...step(r.eng, { t: 'charged', ms: res.chargedMs, at: gameNow() }));
      if (res.capHit) {
        r.capHit = true;
        rope.capHit.value = 1;
      }
    }
    applyEvents(out);
    syncHud();
    r.rxPrevT = gameNow();
    // One buffered tap resolves on the next frame it becomes legal.
    if (r.buffered >= 0) {
      const b = r.buffered;
      r.buffered = -1;
      requestAnimationFrame(() => tapSlotRef.current(b, true));
    }
  }, [applyEvents, gameNow, send, syncHud]);

  const tapSlotRef = useRef<(slot: number, pipelined?: boolean) => void>(() => undefined);
  const tapSlot = useCallback((slot: number, pipelined = false) => {
    const r = runRef.current;
    if (!r) return;
    if (r.finalAt && !r.ended) { skipFinal(); return; }
    if (!r.playing || r.ended || r.pausedAt != null || slot < 0) return;
    // A tap during a pending reveal is buffered (one), sent the moment it's legal.
    if (r.pending) {
      if (r.eng.up.indexOf(slot) < 0) r.buffered = slot;
      return;
    }
    if (r.busy) return;
    const e = r.eng;
    let at = gameNow();
    if (at < r.stumbleUntil) return;
    const p = partyRef.current;
    if (p) {
      const heldNow = e.phase === 2 && e.up.indexOf(slot) >= 0;
      const t = p.recordFlip(heldNow ? -1 : slot);
      if (t == null) return;
      at = t;
    }
    let ev = send({ t: 'tick', at });
    if (ev.length) applyEvents(ev);
    if (e.status !== 'play') return;
    // Peek (Time Attack): lift one card for 400ms, never costs a turn.
    if (r.peekArmed) {
      if (e.know[slot] === K_MATCHED || e.up.indexOf(slot) >= 0) return;
      r.peekArmed = false;
      r.peeks -= 1;
      setPeeks((pk) => ({ ...pk, n: r.peeks, armed: false }));
      const f = r.src.faceAt(slot, e.ids);
      if (f == null) return;
      setFaces((m) => ({ ...m, [e.ids[slot]]: f }));
      send({ t: 'peek', slot, face: f, at });
      cards.current[e.ids[slot]]?.peek(400);
      GameAudio.play('mm_peek_use');
      Haptic.tapLight();
      return;
    }
    if (e.phase === 2) {
      const held = e.up.indexOf(slot) >= 0;
      ev = send({ t: 'dismiss', slot, at });
      applyEvents(ev);
      if (held) return;
    }
    if (e.know[slot] === K_MATCHED || e.up.indexOf(slot) >= 0) return;
    const id = e.ids[slot];
    const res = r.src.flip(slot, at, { clientT: at, rxPrevT: r.rxPrevT, pipelined });
    if (res instanceof Promise) {
      r.pending = true;
      cards.current[id]?.hold();
      // The rope stops once a reveal has been in flight 150ms; a glint travels it.
      r.pendingTimer = setTimeout(() => {
        if (!r.pending) return;
        send({ t: 'pending', on: true, at: gameNow() });
        rope.glint.value = 0;
        rope.glint.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
      }, PENDING_STOP_MS);
      void res.then((x) => finishFlip(r, slot, id, at, x));
    } else finishFlip(r, slot, id, at, res);
  }, [applyEvents, finishFlip, gameNow, send, skipFinal]);
  tapSlotRef.current = tapSlot;

  const onTap = useCallback((x: number, y: number) => {
    if (pressedId.current >= 0) cards.current[pressedId.current]?.release();
    pressedId.current = -1;
    const wasHolding = holding.current;
    releaseHold();
    const r = runRef.current;
    if (wasHolding && r && r.eng.phase !== 2) return;
    tapSlot(hitSlot(x, y));
  }, [hitSlot, releaseHold, tapSlot]);
  const onCancel = useCallback(() => {
    if (pressedId.current >= 0) cards.current[pressedId.current]?.release();
    pressedId.current = -1;
    releaseHold();
  }, [releaseHold]);

  const ox = geo?.felt.x ?? 0;
  const oy = geo?.felt.y ?? 0;
  const tap = useMemo(() => Gesture.Tap()
    .maxDuration(2600)
    .maxDistance(40)
    .onBegin((ev) => { runOnJS(onPressIn)(ev.x + ox, ev.y + oy); })
    .onEnd((ev, ok) => { if (ok) runOnJS(onTap)(ev.x + ox, ev.y + oy); })
    .onFinalize((_ev, ok) => { if (!ok) runOnJS(onCancel)(); }),
  [onPressIn, onTap, onCancel, ox, oy]);

  // ---------------------------------------------------------------------------
  // Autoplay (dev capture only)
  // ---------------------------------------------------------------------------
  useMemoryAutoplay({ runRef, tapSlot, enabled: visible && !result && !tryScreen });

  // ---------------------------------------------------------------------------
  // Try again (Ride Sprint: 3 tries per Ticket), rematch, wrap-up
  // ---------------------------------------------------------------------------
  const tryAgain = useCallback(() => {
    const prev = runRef.current;
    if (!prev || RIDE_TRIES - 1 - prev.tryIndex <= 0) return;
    Haptic.tapLight();
    clearTimers();
    setTryScreen(null);
    const r = buildRun({ runIndex: prev.runIndex, tryIndex: prev.tryIndex + 1 });
    newBoardView(4, 4, 8);
    wash.value = withTiming(0, { duration: 200 });
    resetScene();
    setScore(0);
    syncHud();
    later(900, () => {
      if (runRef.current === r) beginPlay();
    });
  }, [beginPlay, buildRun, clearTimers, later, newBoardView, resetScene, syncHud, wash]);

  const giveUp = useCallback(() => {
    Haptic.tapLight();
    setTryScreen(null);
    // In a ride challenge the ride screen owns the loss card (Ticket, retry
    // offers): go straight there in one tap instead of a second results card.
    const r = runRef.current;
    if (rideChallenge && r?.mode === 'ride') {
      r.ended = true;
      r.playing = false;
      GameAudio.music.stop(300);
      onClose();
      return;
    }
    finishRun(false);
  }, [finishRun, rideChallenge, onClose]);

  const onRematch = useCallback(() => {
    setRunIndex((k) => k + 1);
  }, []);

  const onWrapUp = useCallback((): GameResult | null => {
    const r = runRef.current;
    if (!r) return null;
    r.ended = true;
    r.playing = false;
    const g = gradesFor(r.eng);
    return {
      score: r.eng.score,
      stars: r.mode === 'timeAttack' ? timeAttackStars(r.cleared) : 0,
      stats: [
        { label: 'MEMORY', value: g.memory },
        { label: 'SPEED', value: g.speed },
        { label: 'CHAIN', value: g.chain },
      ],
      meta: { game: 'memory', engine: ENGINE_VERSION, mode: r.mode, score: r.eng.score, seed: baseSeed, log: r.eng.log.slice() },
    };
  }, [baseSeed]);

  const armPeek = useCallback(() => {
    const r = runRef.current;
    if (!r || r.peeks <= 0 || !r.playing) return;
    r.peekArmed = !r.peekArmed;
    setPeeks((pk) => ({ ...pk, armed: r.peekArmed }));
    Haptic.tickSelection();
  }, []);

  const pickPhoto = useCallback((axis: PhotoAxis) => {
    setPhotoPick(null);
    applyEventsRef.current(send({ t: 'photoPick', axis, at: gameNow() }));
  }, [gameNow, send]);

  // ---------------------------------------------------------------------------
  // Styles driven by shared values
  // ---------------------------------------------------------------------------
  const washStyle = useAnimatedStyle(() => ({ opacity: wash.value * 0.55 }));
  const coinStyle = useAnimatedStyle(() => ({
    opacity: coin.value > 0 ? 1 - Math.max(0, coinFly.value - 0.8) * 5 : 0,
    transform: [
      { translateY: -coinFly.value * (coinAt.y + 60) },
      { scale: coin.value * (1 - coinFly.value * 0.4) },
      { rotateZ: `${coinShake.value}deg` },
    ],
  }));
  const gullStyle = useAnimatedStyle(() => {
    const t = gull.value;
    const out = t > 1 ? t - 1 : 0;
    const inn = Math.min(1, t);
    const x = gullAt.x1 + (gullAt.x2 - gullAt.x1) * (inn * 0.5) + out * 120;
    const y = gullAt.y1 + (gullAt.y2 - gullAt.y1) * (inn * 0.5) - 40 - out * 160 - Math.sin(inn * Math.PI) * 20;
    return { transform: [{ translateX: x - 40 }, { translateY: y - 36 }, { scaleX: out > 0 ? -1 : 1 }] };
  });
  const gullLandStyle = useAnimatedStyle(() => ({ opacity: gull.value > 0.01 && gull.value < 0.85 ? 1 : 0 }));
  const gullGrabStyle = useAnimatedStyle(() => ({ opacity: gull.value >= 0.85 && gull.value <= 1.0 ? 1 : 0 }));
  const gullOffStyle = useAnimatedStyle(() => ({ opacity: gull.value > 1.0 && gull.value < 1.99 ? 1 : 0 }));
  const tideStyle = useAnimatedStyle(() => ({
    opacity: tide.value > 0.01 && tide.value < 0.99 ? Math.min(1, Math.sin(tide.value * Math.PI) * 2.2) : 0,
    transform: [{ translateX: tideAt.x0 + (tideAt.x1 - tideAt.x0) * tide.value }],
  }));
  const headsUpStyle = useAnimatedStyle(() => ({ opacity: headsUp.value * 0.35 }));
  const incomingRimStyle = useAnimatedStyle(() => ({ opacity: incoming.value > 0 && incoming.value < 1 ? 0.6 + 0.4 * Math.abs(Math.sin(incoming.value * Math.PI * 4)) : 0 }));
  const tabsStyle = useAnimatedStyle(() => ({ opacity: tabs.value, transform: [{ scale: 0.7 + tabs.value * 0.3 }] }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const ids = useMemo(() => Array.from({ length: n }, (_, i) => i), [n]);
  const r = runRef.current;
  const g = geo;
  const title = mode === 'ride' ? 'Memory Match' : mode === 'daily' ? 'Daily Deck' : mode === 'race' ? 'Memory Race' : mode === 'warmup' ? 'Memory Warm-up' : 'Memory Match';
  const subtitle = mode === 'ride'
    ? `${taskName || deck.label}${r && r.tryIndex > 0 ? ` · Try ${r.tryIndex + 1} of ${RIDE_TRIES}` : ''}${r?.signal ? ' · Low signal' : ''}`
    : mode === 'timeAttack' ? `${deck.label} · Board ${hud.board}`
    : mode === 'daily' ? `${deck.label} · ${daily?.ranked && runIndex === 0 ? 'Ranked' : 'Practice'}`
    : mode === 'race' ? `${deck.label} · Practice race` : deck.label;
  const notchFrac = mode === 'ride' && !(r?.signal) ? 15000 / 45000 : -1;
  const raceSharks = SHARKS;
  void raceSharks;

  const renderResults = useCallback((args: { claim: () => void; rematch?: () => void; reducedMotion: boolean }) => {
    if (!resultData) return null;
    return <MemoryResults data={resultData} claim={args.claim} again={args.rematch} reducedMotion={args.reducedMotion} />;
  }, [resultData]);

  // Ride Challenge win: hand off to Coin Catch after the merge (rideHandoffMs 350).
  const shellClaim = useRef<(() => void) | null>(null);

  return (
    <GameShellV2
      visible={visible}
      title={title}
      subtitle={subtitle}
      score={score}
      hideHeaderScore={!flags.scoreOnHud}
      multiplier={hud.chain >= 3 ? 2 : hud.chain === 2 ? 1.5 : 1}
      fever={hud.showtime}
      personalBest={personalBest}
      objective={mode === 'ride' ? (r?.signal ? 'Low signal: clear in 24 turns' : 'Clear the board') : mode === 'daily' ? 'Two slips and you are out' : mode === 'race' ? 'Same board, four sharks. First to clear wins.' : mode === 'warmup' ? 'Find the pairs. Remember where you saw them.' : 'Race the clock. Chain the cards you remember.'}
      result={result}
      gameId="memory"
      onStart={onStart}
      onPause={onPause}
      onResume={onResume}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
      onRematch={mode !== 'ride' && mode !== 'warmup' ? onRematch : undefined}
      onWrapUp={onWrapUp}
      renderResults={resultData ? (args) => { shellClaim.current = args.claim; return renderResults(args); } : undefined}
    >
      <View style={styles.field} onLayout={onFieldLayout}>
        <LinearGradient colors={['#0b80c4', '#35a8e6', '#bfe5ff']} style={StyleSheet.absoluteFill} />
        {g ? (
          <>
            {/* Scene layer: backdrop rays and the booth front take camera beats; the board never does. */}
            <Animated.View style={[StyleSheet.absoluteFill, camera.style]} pointerEvents="none">
              <Rays cx={g.W / 2} cy={g.grid.y + g.grid.h / 2} r={Math.max(g.W, g.H)} amount={rays} still={reducedMotion} />
            </Animated.View>

            <BoardFxUnder geo={g} wells={wells} cards={cardValues} ids={slotIds} rope={rope}
              showRope={flags.clock !== 'none' && !r?.signal} notchFrac={notchFrac}
              beads={r?.signal ? { total: SIGNAL_TURNS, left: beadsLeft } : null} ripple={ripple} />

            {/* Cards: locked in screen space. */}
            <View key={`b${boardKey}`} style={StyleSheet.absoluteFill} pointerEvents="none">
              {ids.map((id) => (
                <MemoryCard
                  key={`c${boardKey}-${id}`}
                  id={id}
                  ref={(h) => { cards.current[id] = h; }}
                  sv={cardValues[id]}
                  shimmer={shimmer}
                  w={g.cw}
                  h={g.ch}
                  back={CARD_BACK}
                  face={cardFaceFor(id)}
                  goldBack={faces[id] === FACE_GOLD}
                  reducedMotion={reducedMotion}
                />
              ))}
            </View>

            <BoardFxOver arc={arc} slipArc={slipArc} flash={flash} flashP={flashP} trail={trail} />
            <Animated.View pointerEvents="none" style={[styles.wash, { left: g.felt.x, top: g.felt.y, width: g.felt.w, height: g.felt.h }, washStyle]} />

            {/* The barker leans over the awning's left end; the awning front hides his lower body. */}
            <Animated.View style={[StyleSheet.absoluteFill, camera.style]} pointerEvents="none">
              <SharkStage ref={stage} x={g.barker.x} y={g.barker.y} height={g.barker.h} beat={beat.beat} reducedMotion={reducedMotion} calm={calm} />
              <BoothFront geo={g} marquee={marquee} beat={beat.beat} reducedMotion={reducedMotion} prizes={prizes} pot={pot}
                rail={rail ? { art: SHARKS.classic, ...rail } : null} bounceKey={bounceKey} />
            </Animated.View>

            {mode === 'race' ? (
              <>
                <Animated.View pointerEvents="none" style={[styles.incomingRim, { left: g.felt.x - 4, top: g.felt.y - 4, width: g.felt.w + 8, height: g.felt.h + 8 }, incomingRimStyle]} />
                {stumble ? <View pointerEvents="none" style={[styles.stumble, { left: g.felt.x, top: g.felt.y, width: g.felt.w, height: g.felt.h }]} /> : null}
              </>
            ) : null}

            {/* Flights (pairs to the counter or the pot) and card tags. */}
            <FlightLayer ref={flights} reducedMotion={reducedMotion} width={g.W} />
            <Animated.Image source={HALO}
              style={[styles.abs, { left: coinAt.x - g.cw * 1.1, top: coinAt.y - g.cw * 1.1, width: g.cw * 2.2, height: g.cw * 2.2 }, coinStyle]} />
            <Animated.View pointerEvents="none" style={[styles.abs, { left: coinAt.x - g.cw * 0.7, top: coinAt.y - g.cw * 0.66, width: g.cw * 1.4, height: g.cw * 1.32 }, coinStyle]}>
              <Image source={COIN} style={{ width: g.cw * 1.4, height: g.cw * 1.32 }} resizeMode="contain" />
              {mergeEdition !== 'none' && mergeEdition !== 'gold' ? (
                <View style={[StyleSheet.absoluteFill, { borderRadius: g.cw, backgroundColor: mergeEdition === 'bronze' ? 'rgba(200,117,51,0.38)' : 'rgba(220,233,245,0.45)' }]} />
              ) : null}
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.abs, { width: 80, height: 70 }, gullStyle]}>
              <Animated.Image source={GULL_LAND} style={[styles.gullFrame, gullLandStyle]} resizeMode="contain" />
              <Animated.Image source={GULL_GRAB} style={[styles.gullFrame, gullGrabStyle]} resizeMode="contain" />
              <Animated.Image source={GULL_OFF} style={[styles.gullFrame, gullOffStyle]} resizeMode="contain" />
            </Animated.View>
            <Animated.Image source={TIDE_ARROW} resizeMode="contain"
              style={[styles.abs, { top: tideAt.y - g.ch * 0.32, width: g.cw * 1.1, height: g.ch * 0.64 }, tideStyle]} />

            <FxStage ref={fx} width={g.W} height={g.H} reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} />

            {/* One tap gesture over the whole felt. */}
            <GestureDetector gesture={tap}>
              <View style={[styles.abs, { left: g.felt.x, top: g.felt.y, width: g.felt.w, height: g.felt.h }]}
                accessible accessibilityLabel="Memory board" accessibilityHint="Tap cards to flip them" />
            </GestureDetector>

            {/* HUD: Ride Sprint shows the rim timer and the chain plate. Nothing else. */}
            <View style={[styles.hud, { left: g.hud.x, top: g.hud.y, width: g.hud.w, height: g.hud.h }]} pointerEvents="none">
              {mode === 'race' ? (
                <RivalStrip racers={racers} total={8} reducedMotion={reducedMotion} />
              ) : flags.scoreOnHud ? (
                <ScorePlate ref={scorePlate} score={score} pb={personalBest} reducedMotion={reducedMotion} />
              ) : mode === 'daily' ? (
                <View style={styles.parPlate}><Text style={styles.parText}>{`TURN ${hud.turns} · PAR ${fairParFor(hud.total)}`}</Text></View>
              ) : null}
              <ChainPlate ref={chainPlate} chain={hud.chain} gauge={hud.gauge} showtime={hud.showtime} showWarn={hud.showWarn} showLeft={hud.showLeft}
                gaugeOn={!!r?.eng.cfg.gauge} strikes={mode === 'daily' ? hud.strikes : null} strikesMax={2} reducedMotion={reducedMotion} />
              <View style={styles.chipAnchor}>
                <VerdictChip ref={chip} reducedMotion={reducedMotion} />
              </View>
            </View>
            <RopeNumeral x={g.W / 2} y={g.rope.y} seconds={flags.clock !== 'none' ? hud.seconds : null} turnsLeft={hud.turnsLeft} urgent={hud.urgent} reducedMotion={reducedMotion} />
            <AwningCallouts ref={awning} geo={g} reducedMotion={reducedMotion} />

            {/* Peek (Time Attack, from its unlock): the counter's right end. */}
            {g.peek && peeks.show ? (
              <Pressable onPress={armPeek} style={[styles.peekBtn, peeks.armed && styles.peekArmed, peeks.n === 0 && styles.peekEmpty,
                { left: g.peek.x, top: g.peek.y, width: g.peek.w, height: g.peek.h }]} accessibilityRole="button" accessibilityLabel={`Peek, ${peeks.n} banked`}>
                <Text style={styles.peekText}>PEEK</Text>
                <View style={styles.peekCount}><Text style={styles.peekCountText}>{peeks.n}</Text></View>
              </Pressable>
            ) : null}

            {/* Photo Flash pick: row or column tabs on the trigger well. */}
            {photoPick != null ? (
              <Animated.View style={[styles.abs, { left: slotXY(g, photoPick).x - 6, top: slotXY(g, photoPick).y + g.ch / 2 - 60 }, tabsStyle]}>
                <Pressable onPress={() => pickPhoto('row')} style={[styles.tab, { marginBottom: 8 }]} accessibilityRole="button" accessibilityLabel="Flash this row">
                  <ArrowGlyph dir="h" />
                </Pressable>
                <Pressable onPress={() => pickPhoto('col')} style={styles.tab} accessibilityRole="button" accessibilityLabel="Flash this column">
                  <ArrowGlyph dir="v" />
                </Pressable>
              </Animated.View>
            ) : null}

            {/* Heads up while the line moves: a gold inner edge glow. */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headsUp, headsUpStyle]} />

            {tip ? (
              <View pointerEvents="none" style={[styles.tip, tip.kind === 'slip' && styles.tipSlip, { top: g.awning.y - 46 }]} accessibilityLiveRegion="polite">
                <Text style={styles.tipText}>{tip.text}</Text>
              </View>
            ) : null}
            {unlock ? (
              <View pointerEvents="none" style={[styles.unlock, { top: g.grid.y + g.grid.h / 2 - 50 }]}>
                <Text style={styles.unlockKicker}>{unlock.kicker}</Text>
                <Text style={styles.unlockText}>{unlock.title}</Text>
                {unlock.hint ? <Text style={styles.unlockHint}>{unlock.hint}</Text> : null}
              </View>
            ) : null}

            {tryScreen ? (
              <TryCard copy={memoryLossCopy(tryScreen.pairs, tryScreen.total)} pairs={tryScreen.pairs}
                total={tryScreen.total} left={tryScreen.left} top={g.felt.y + g.felt.h * 0.2}
                enter={tryCardIn} onTryAgain={tryAgain} onDone={giveUp} />
            ) : null}
          </>
        ) : null}
      </View>
    </GameShellV2>
  );
}

const EMPTY_FACE = {};

/**
 * The end of a Memory Match try: an honest title, the pairs found as gold
 * pips, TRY AGAIN while the Ticket has tries, and a real Done button. The
 * board stays visible behind it (light veil, revealed cards).
 */
function TryCard({ copy, pairs, total, left, top, enter, onTryAgain, onDone }: {
  copy: { title: string; line: string }; pairs: number; total: number; left: number; top: number;
  enter: import('react-native-reanimated').SharedValue<number>; onTryAgain: () => void; onDone: () => void;
}) {
  // Opacity and a short rise only: a scaled, shadowed layer smeared its own background on iOS.
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value * 1.6), transform: [{ translateY: (1 - enter.value) * 24 }] }));
  const canRetry = left > 0;
  return (
    <Animated.View style={[styles.tryPos, { top }, style]} accessibilityViewIsModal>
     <View style={styles.tryWrap}>
      <Text style={styles.tryTitle} accessibilityRole="header">{copy.title}</Text>
      <View style={styles.tryPips} accessible accessibilityLabel={`${pairs} of ${total} pairs found`}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.tryPip, i < pairs && styles.tryPipOn]} />
        ))}
      </View>
      <Text style={styles.tryLine}>{copy.line}</Text>
      {canRetry ? (
        <Pressable onPress={onTryAgain} style={({ pressed }) => [styles.tryBtn, pressed && styles.tryBtnDown]}
          accessibilityRole="button" accessibilityLabel={`Try again. ${triesLeftLine(left)}`}>
          <GameIcon name="retry" size={24} />
          <Text style={styles.tryBtnText}>TRY AGAIN</Text>
        </Pressable>
      ) : null}
      <View style={styles.tryLeftRow}>
        <GameIcon name="ticket" size={18} />
        <Text style={styles.tryLeft}>{triesLeftLine(left)}</Text>
      </View>
      <Pressable onPress={onDone} hitSlop={8} style={({ pressed }) => [canRetry ? styles.tryDone : styles.tryBtn, pressed && styles.tryBtnDown]}
        accessibilityRole="button" accessibilityLabel="Done">
        <Text style={canRetry ? styles.tryDoneText : styles.tryBtnText}>{canRetry ? 'Done' : 'DONE'}</Text>
      </Pressable>
     </View>
    </Animated.View>
  );
}

/** Showtime rays: 12 hard-edged wedges, cream and gold with an ink outline, rotating 6deg/s. */
const Rays = React.memo(function Rays({ cx, cy, r, amount, still }: { cx: number; cy: number; r: number; amount: import('react-native-reanimated').SharedValue<number>; still: boolean }) {
  const cream = useMemo(() => wedgePath(cx, cy, r, 0), [cx, cy, r]);
  const gold = useMemo(() => wedgePath(cx, cy, r, 1), [cx, cy, r]);
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    t.value = withRepeat(withTiming(360, { duration: 60000, easing: Easing.linear }), -1, false);
  }, [still, t]);
  const transform = useDerivedValue(() => [{ rotate: (t.value * Math.PI) / 180 }]);
  const op = useDerivedValue(() => amount.value * 0.55);
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group opacity={op} origin={{ x: cx, y: cy }} transform={transform}>
        <Path path={cream} color="#FFF4D6" />
        <Path path={gold} color="#ffd54a" />
        <Path path={cream} color={MM.ink} style="stroke" strokeWidth={2} />
        <Path path={gold} color={MM.ink} style="stroke" strokeWidth={2} />
      </Group>
    </Canvas>
  );
});

function wedgePath(cx: number, cy: number, r: number, parity: number) {
  const p = Skia.Path.Make();
  const nW = 12;
  for (let i = parity; i < nW; i += 2) {
    const a0 = (i / nW) * Math.PI * 2;
    const a1 = ((i + 1) / nW) * Math.PI * 2;
    p.moveTo(cx, cy);
    p.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    p.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    p.close();
  }
  return p;
}

function ArrowGlyph({ dir }: { dir: 'h' | 'v' }) {
  return (
    <View style={{ transform: [{ rotateZ: dir === 'v' ? '90deg' : '0deg' }], flexDirection: 'row', alignItems: 'center' }}>
      <View style={styles.arrowHeadL} />
      <View style={styles.arrowShaft} />
      <View style={styles.arrowHeadR} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, overflow: 'hidden' },
  abs: { position: 'absolute', left: 0, top: 0 },
  hud: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  chipAnchor: { position: 'absolute', right: 0, top: 50, alignItems: 'flex-end' },
  parPlate: { height: 34, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: MM.ink, paddingHorizontal: 10, justifyContent: 'center', marginRight: 8 },
  parText: { fontFamily: 'Shark', fontSize: 15, color: MM.navyText },
  incomingRim: { position: 'absolute', borderRadius: 24, borderWidth: 5, borderColor: MM.urgent },
  stumble: { position: 'absolute', borderRadius: 14, backgroundColor: 'rgba(120,132,150,0.45)', borderWidth: 4, borderColor: MM.coral },
  wash: { position: 'absolute', backgroundColor: '#ffffff', borderRadius: 14 },
  gullFrame: { position: 'absolute', left: 0, top: 0, width: 80, height: 70 },
  headsUp: { borderWidth: 6, borderColor: MM.gold },
  peekBtn: {
    position: 'absolute', borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 3, borderColor: MM.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  peekArmed: { backgroundColor: MM.gold, borderColor: '#ffffff' },
  peekEmpty: { opacity: 0.5 },
  peekText: { fontFamily: 'Shark', fontSize: 18, color: MM.navyText },
  peekCount: { position: 'absolute', right: -8, top: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: MM.gold, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  peekCountText: { fontFamily: 'Shark', fontSize: 14, color: MM.navyText },
  tab: { width: 56, height: 56, borderRadius: 14, backgroundColor: MM.gold, borderWidth: 3, borderColor: MM.ink, alignItems: 'center', justifyContent: 'center' },
  arrowShaft: { width: 22, height: 5, backgroundColor: MM.navyText },
  arrowHeadL: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderRightWidth: 10, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: MM.navyText },
  arrowHeadR: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 10, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: MM.navyText },
  tip: { position: 'absolute', alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 3, borderColor: MM.scout, paddingHorizontal: 14, paddingVertical: 6 },
  tipSlip: { borderColor: MM.coral },
  tipText: { fontFamily: 'Knockout', fontSize: 16, color: MM.navyText },
  unlock: { position: 'absolute', left: 40, right: 40, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 3, borderColor: MM.gold, paddingVertical: 10 },
  unlockKicker: { fontFamily: 'Knockout', fontSize: 14, color: MM.ink, letterSpacing: 1 },
  unlockText: { fontFamily: 'Shark', fontSize: 28, color: MM.navyText },
  unlockHint: { fontFamily: 'Knockout', fontSize: 14, color: MM.ink, marginTop: 2 },
  tryPos: { position: 'absolute', left: 26, right: 26 },
  tryWrap: { alignItems: 'center', backgroundColor: '#fffdf4', borderRadius: 24, borderWidth: 3, borderColor: MM.ink, paddingTop: 16, paddingBottom: 16, paddingHorizontal: 18, borderBottomWidth: 6 },
  tryTitle: { fontFamily: 'Shark', fontSize: 36, color: MM.navyText, textAlign: 'center' },
  tryPips: { flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 6 },
  tryPip: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: MM.ink, backgroundColor: '#dbe9f5' },
  tryPipOn: { backgroundColor: MM.gold, borderColor: MM.goldDeep },
  tryLine: { fontFamily: 'Knockout', fontSize: 18, lineHeight: 22, color: MM.navyText, textAlign: 'center', marginBottom: 12 },
  tryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: MM.gold, borderRadius: 16, paddingHorizontal: 30, paddingVertical: 12, borderWidth: 3, borderColor: MM.ink, borderBottomWidth: 6, borderBottomColor: MM.goldDeep, minWidth: 210, justifyContent: 'center' },
  tryBtnDown: { transform: [{ translateY: 2 }, { scale: 0.98 }] },
  tryBtnText: { fontFamily: 'Shark', fontSize: 24, color: '#075083' },
  tryLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  tryLeft: { fontFamily: 'Knockout', fontSize: 15, color: MM.navyText },
  tryDone: { marginTop: 10, minWidth: 160, minHeight: 44, borderRadius: 14, borderWidth: 2.5, borderColor: MM.ink, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  tryDoneText: { fontFamily: 'Shark', fontSize: 20, color: MM.navyText },
});
