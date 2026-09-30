/**
 * MemoryGame.tsx: Memory Match (design v4, engine mm-4).
 *
 * "Every card you see is a promise. Keep it."
 *
 * A thin view over the pure engine (engine.ts). Modes:
 *   ride        Ride Sprint, the paid Ride Challenge: 8 pairs incl. the Golden
 *               Coin on a 45s clock, server-revealed board (in-process authority
 *               until WS7 ships memory_sessions), PB ghost, 3 tries per Ticket.
 *   timeAttack  Queue solo: look-away clock, staircase boards, one new system
 *               per board (Showtime, Peek, Tide Shift, Seagull).
 *   daily       Sudden Death practice (two slips and out, no clock).
 *
 * Layout (6.1): HUD plates on top, the barker shark at his booth, then the game
 * booth (wood rail, prize shelf, felt, rim timer) in the bottom 70%. One board
 * tap gesture with nearest-card forgiveness (4pt, 10pt walking). The line
 * moving never pauses anything (QUEUE REALITY).
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Canvas } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FxStage,
  GameAudio,
  GameShellV2,
  Haptic,
  LinePlayMovementContext,
  Sunburst,
  packHex,
  useCamera,
  useGameMusic,
  useMusicBeat,
  useStudioAudio,
  useWalkSense,
  type FxStageHandle,
  type GameResult,
} from '../../gamekit';
import { RideChallengeContext } from '../../gamekit/RideChallengeContext';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { MemoryCard, type MemoryCardHandle } from './MemoryCard';
import { deckById, deckIdForRideName, type Deck } from './decks';
import {
  ENGINE_VERSION,
  FACE_GOLD,
  FACE_GULL,
  K_MATCHED,
  K_SEEN,
  applySystems,
  boardSystems,
  createEngine,
  dailyConfig,
  dailyStars,
  dealBoard,
  glimpseMs,
  gradesFor,
  inShowtime,
  isLookAway,
  nextPairs,
  parFor,
  raceConfig,
  rideSprintConfig,
  rideStars,
  step,
  summarize,
  timeAttackConfig,
  timeAttackStars,
  type MMAction,
  type MMEvent,
  type MMState,
} from './engine';
import { boardSeed, shapeForPairs } from './logic';
import { createLocalBoard, createSimReveal, type BoardSource } from './boardSource';
import { faceFor } from './faces';
import { ChainPlate, GhostLane, StopwatchPlate, VerdictChip, type ChainPlateHandle, type VerdictChipHandle } from './Hud';
import { SharkStage, type SharkStageHandle } from './SharkStage';
import { BoardFx, type ArcState } from './BoardFx';
import { FLIP_MS, FLIP_SHOWTIME_MS, MM, hitStopFor, ladderStep, starsFor as tierStars } from './theme';
import {
  ghostPairsAt,
  loadGhost,
  loadPersonalBest,
  medianGhost,
  saveGhostIfBest,
  savePersonalBest,
  type MemoryGhost,
} from './storage';
import { useMemoryAutoplay } from './autoplay';
import type { Layout } from './logic';
import type { EmoteId } from '../../gamekit/net/partyTypes';
import {
  ATTACK_TELEGRAPH_MS,
  RACE_GLIMPSE_MS,
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
import { RACE_MS, RACE_PLAY_AT } from './race/raceSim';

const CARD_BACK = require('../../assets/games/memory/card-back.png');
const STAMP = require('../../assets/games/memory/studio/match_stamp.png');
const COIN = require('../../assets/games/memory/studio/coin_alex.png');
const GULL = require('../../assets/games/memory/studio/seagull.png');
const DIZZY = require('../../assets/games/memory/studio/fx_small_dizzy_star.png');
const SHELF_DROP = require('../../assets/games/memory/sfx/mm_shelf_drop.wav');

export type MemoryMode = 'ride' | 'timeAttack' | 'daily' | 'race';

export interface MemoryGameProps {
  visible: boolean;
  /** Legacy: 0 = Ride Sprint (paid ride challenge); 1-3 = queue boards. */
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
}

export const RIDE_TRIES = 3;
const TICK_MS = 50;
const PREVIEW_LATENCY = 0;

type Rect = { x: number; y: number; w: number; h: number };
interface Geo {
  W: number;
  H: number;
  hudY: number;
  stageY: number;
  stageH: number;
  panel: Rect;
  felt: Rect;
  shelf: Rect;
  grid: Rect;
  dock: Rect | null;
  cw: number;
  ch: number;
  gap: number;
  cols: number;
  rows: number;
}

function geometry(W: number, H: number, cols: number, rows: number, dock: boolean, bottomInset: number): Geo {
  const pad = 10;
  const hudY = 6;
  const hudH = 50;
  const stageY = hudY + hudH + 2;
  const stageH = rows >= 5 ? 84 : Math.round(Math.max(92, Math.min(150, H * 0.3 - stageY)));
  const panelY = stageY + stageH - 6;
  const panel = { x: pad, y: panelY, w: W - pad * 2, h: H - panelY - Math.max(8, bottomInset) };
  const wood = 9;
  const felt = { x: panel.x + wood, y: panel.y + wood, w: panel.w - wood * 2, h: panel.h - wood * 2 };
  const shelfH = rows >= 5 ? 36 : 42;
  const shelf = { x: felt.x + 8, y: felt.y + 8, w: felt.w - 16, h: shelfH };
  const dockH = dock ? 64 : 0;
  const gy0 = shelf.y + shelfH + 12;
  const area = { x: felt.x + 14, y: gy0, w: felt.w - 28, h: felt.y + felt.h - 14 - dockH - gy0 };
  const gap = 8;
  const colW = (area.w - gap * (cols - 1)) / cols;
  const maxCh = (area.h - gap * (rows - 1)) / rows;
  const ch = Math.min(colW / 0.74, maxCh);
  const cw = Math.min(colW, ch * 0.8);
  const gw = cw * cols + gap * (cols - 1);
  const gh = ch * rows + gap * (rows - 1);
  const grid = { x: area.x + (area.w - gw) / 2, y: area.y + (area.h - gh) / 2, w: gw, h: gh };
  const dockRect = dock ? { x: felt.x, y: felt.y + felt.h - dockH, w: felt.w, h: dockH } : null;
  return { W, H, hudY, stageY, stageH, panel, felt, shelf, grid, dock: dockRect, cw, ch, gap, cols, rows };
}

function slotXY(g: Geo, slot: number): { x: number; y: number } {
  const c = slot % g.cols;
  const r = Math.floor(slot / g.cols);
  return { x: g.grid.x + c * (g.cw + g.gap), y: g.grid.y + r * (g.ch + g.gap) };
}
function slotCenter(g: Geo, slot: number): { x: number; y: number } {
  const p = slotXY(g, slot);
  return { x: p.x + g.cw / 2, y: p.y + g.ch / 2 };
}
function shelfXY(g: Geo, k: number, pairs: number): { x: number; y: number; w: number; h: number } {
  const slotW = g.shelf.w / pairs;
  const h = g.shelf.h - 8;
  const w = Math.min(slotW - 4, h * 0.74);
  return { x: g.shelf.x + k * slotW + (slotW - w) / 2, y: g.shelf.y + 4, w, h };
}

const now = () => (global as unknown as { performance?: { now: () => number } }).performance?.now() ?? Date.now();

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
  peekArmed: boolean;
  peeks: number;
  moved: Set<number>;
  cleared: number;
  ghost: MemoryGhost | null;
  ghostShown: number;
  wasAhead: boolean;
  shelfNext: number;
  lastTurnPop: number;
  lastMovingAt: number;
  stumbleUntil: number;
  race: RaceState | null;
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
}: MemoryGameProps) {
  const partyRef = useRef(party);
  partyRef.current = party;
  const devMode = typeof __DEV__ !== 'undefined' && __DEV__ ? (process.env.EXPO_PUBLIC_MEMORY_MODE as MemoryMode | undefined) : undefined;
  const mode: MemoryMode = party ? 'race' : devMode ?? modeProp ?? (difficulty === 0 ? 'ride' : 'timeAttack');
  const reducedMotion = useReducedGameMotion();
  const insets = useSafeAreaInsets();
  const movement = useContext(LinePlayMovementContext);
  const rideChallenge = useContext(RideChallengeContext);
  const deck: Deck = useMemo(() => deckById(deckId ?? deckIdForRideName(taskName)) ?? deckById('park')!, [deckId, taskName]);
  const baseSeed = useMemo(
    () => (party ? party.seed >>> 0 : seed != null ? seed >>> 0 : (Math.random() * 0xffffffff) >>> 0),
    // A fresh seed each time the game opens without a server seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, seed],
  );
  const ghostKey = `${deck.id}:${(taskName ?? 'ride').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  // ---------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------
  useStudioAudio('memory', [
    'mm_flip', 'mm_match', 'mm_sharp_twinkle', 'mm_scout_tick', 'mm_slip', 'mm_board_clear', 'mm_glimpse',
    'mm_overtime_hit', 'mm_strike', 'mm_peek_bank', 'mm_peek_use', 'sh_tier_up', 'sh_fever_start', 'sh_fever_end',
    'sh_camera', 'sh_seagull', 'sh_wave_wash', 'ui_tick', 'coin_tick', 'sh_whistle',
  ]);
  useEffect(() => {
    GameAudio.registerCues({
      mm_shelf_drop: { src: SHELF_DROP, bus: 'sfx', maxVoices: 3, cooldownMs: 40, durationMs: 300, approved: false, fallback: 'ui.confirm', note: 'ElevenLabs shelfDrop (memory/mm_shelf_drop), pending Dustin by-ear OK' },
    });
    void GameAudio.preload(['mm_shelf_drop']).catch(() => undefined);
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
  const [shelf, setShelf] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [personalBest, setPersonalBest] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [hud, setHud] = useState({
    seconds: null as number | null, urgent: false, frozen: false, chain: 0, gauge: 0, showtime: false,
    showWarn: false, strikes: 0, pairs: 0, total: 8, board: 1,
  });
  const [clockDelta, setClockDelta] = useState<{ id: number; ms: number } | null>(null);
  const [ghostUi, setGhostUi] = useState({ ghostPairs: 0, delta: null as string | null, ahead: false, passed: 0, label: 'PB' });
  const [tryScreen, setTryScreen] = useState<{ pairs: number; total: number; left: number } | null>(null);
  const [unlock, setUnlock] = useState<string | null>(null);
  const [peeks, setPeeks] = useState({ n: 0, armed: false, show: false });
  const [runIndex, setRunIndex] = useState(0);
  const [racers, setRacers] = useState<Racer[]>([]);
  const [stumble, setStumble] = useState(false);

  const cards = useRef<(MemoryCardHandle | null)[]>([]);
  const fx = useRef<FxStageHandle>(null);
  const stage = useRef<SharkStageHandle>(null);
  const chainPlate = useRef<ChainPlateHandle>(null);
  const chip = useRef<VerdictChipHandle>(null);
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
  const rimFrac = useSharedValue(1);
  const rimUrgent = useSharedValue(0);
  const rimDim = useSharedValue(0);
  const arc = useSharedValue<ArcState>({ x1: 0, y1: 0, x2: 0, y2: 0, p: 0, a: 0 });
  const rays = useSharedValue(0);
  const warmth = useSharedValue(0);
  const wash = useSharedValue(0);
  const flashWarm = useSharedValue(0);
  const coin = useSharedValue(0);
  const coinShake = useSharedValue(0);
  const coinFly = useSharedValue(0);
  const stampV = useSharedValue(0);
  const [stampAt, setStampAt] = useState({ x: 0, y: 0, s: 60 });
  const gull = useSharedValue(0);
  const [gullAt, setGullAt] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 });
  const dizzy = useSharedValue(0);
  const glow = useSharedValue(0);

  // Walking: accelerometer OR the line moving (5.7). Never pauses anything.
  const walk = useWalkSense({ active: visible && !result });
  const moving = !!movement?.moving;
  const walking = walk.walking || moving;
  const walkingRef = useRef(walking);
  walkingRef.current = walking;
  const calm = walking || reducedMotion;

  const geoRef = useRef<Geo | null>(null);
  const geo = useMemo(() => {
    if (!field.w) return null;
    const g = geometry(field.w, field.h, shape.cols, shape.rows, mode === 'timeAttack', insets.bottom);
    return g;
  }, [field.w, field.h, shape.cols, shape.rows, mode, insets.bottom]);
  geoRef.current = geo;

  const camera = useCamera({ width: field.w || 1, height: field.h || 1, reducedMotion, walking });
  const beat = useMusicBeat(visible && !result);

  // Music: main, then Overtime or Showtime on the next bar (7.6).
  const [bed, setBed] = useState<string | null>(null);
  useGameMusic(bed, { at: 'bar' });

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
    const next = {
      seconds,
      urgent: clock && e.overtime,
      frozen: isLookAway(e),
      chain: e.chain,
      gauge: e.gauge,
      showtime: inShowtime(e),
      showWarn: e.showWarned,
      strikes: e.strikes,
      pairs: e.pairs,
      total: e.pairsTotal,
      board: e.board,
    };
    setHud((h) => {
      for (const k of Object.keys(next) as (keyof typeof next)[]) if (h[k] !== next[k]) return next;
      return h;
    });
    if (clock) {
      const cap = r.mode === 'ride' || r.mode === 'race' ? (e.cfg.clockMs ?? 45000) : 30000;
      const frac = Math.max(0, Math.min(1, e.clockLeftMs / cap));
      rimFrac.value = withTiming(frac, { duration: TICK_MS + 10, easing: Easing.linear });
      rimDim.value = withTiming(isLookAway(e) ? 1 : 0, { duration: 200 });
      rimUrgent.value = e.overtime ? 1 : 0;
    }
    // Ghost lane
    if (r.ghost && r.mode === 'ride') {
      const gp = ghostPairsAt(r.ghost, e.elapsedMs);
      let delta: string | null = null;
      let ahead = false;
      if (e.pairs > 0) {
        const mine = e.pairTimes[e.pairs - 1];
        const theirs = r.ghost.pairTimes[e.pairs - 1] ?? r.ghost.clearMs;
        const d = (mine - theirs) / 1000;
        ahead = d <= 0;
        delta = `${d <= 0 ? '-' : '+'}${Math.abs(d).toFixed(1)}s vs ${r.ghost.median ? 'AVG' : 'PB'}`;
      }
      let passed = 0;
      if (ahead && !r.wasAhead && e.pairs > 0) {
        passed = Date.now();
        GameAudio.playLadder('mm_sharp_twinkle', 7, { volume: 0.7 });
        Haptic.tickSelection();
      }
      r.wasAhead = ahead;
      setGhostUi((u) => (u.ghostPairs === gp && u.delta === delta && u.ahead === ahead && !passed ? u : {
        ghostPairs: gp, delta, ahead, passed: passed || u.passed, label: r.ghost?.median ? 'RIDE AVG' : 'YOUR BEST',
      }));
    }
  }, [rimFrac, rimDim, rimUrgent]);

  // ---------------------------------------------------------------------------
  // Board setup
  // ---------------------------------------------------------------------------
  const cardFaceFor = useCallback((id: number) => {
    const f = faces[id];
    return f == null ? EMPTY_FACE : faceFor(deck, f);
  }, [faces, deck]);

  const buildRun = useCallback((opts: { runIndex: number; tryIndex: number; keep?: Run | null }) => {
    const s = partyRef.current ? baseSeed : boardSeed(baseSeed, opts.runIndex * 16 + opts.tryIndex);
    const deckSize = deck.symbols.length;
    let src: BoardSource;
    let eng: MMState;
    let race: RaceState | null = null;
    if (mode === 'ride') {
      const cfg = rideSprintConfig(45000);
      src = createSimReveal({ cfg, layout: { pairs: 8, deckSize, seed: s, golden: true }, deckSize, engineSeed: s ^ 0x5bd1e995, latencyMs: PREVIEW_LATENCY });
      eng = createEngine(cfg, { cols: 4, rows: 4, seed: s ^ 0x5bd1e995 });
    } else if (mode === 'daily') {
      const cfg = dailyConfig();
      src = createSimReveal({ cfg, layout: { pairs: 8, deckSize, seed: s, golden: true }, deckSize, engineSeed: s ^ 0x5bd1e995 });
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
      const sys = boardSystems(1);
      src = createLocalBoard({ pairs: 6, deckSize, seed: s, golden: sys.golden }, deckSize);
      eng = createEngine(cfg, { cols: 4, rows: 3, seed: s ^ 0x5bd1e995 });
      applySystems(eng, sys);
    }
    const r: Run = {
      eng, src, mode, pairs: src.info.pairs, seed: s, runIndex: opts.runIndex, tryIndex: opts.tryIndex,
      sizeRepeats: {}, playing: false, busy: true, ended: false, t0: now(), pausedAt: null, pausedTotal: 0,
      pending: false, peekArmed: false, peeks: 0, moved: new Set(), cleared: 0,
      ghost: opts.keep?.ghost ?? null, ghostShown: 0, wasAhead: false, shelfNext: 0, lastTurnPop: 0, lastMovingAt: 0,
      stumbleUntil: 0, race,
    };
    runRef.current = r;
    return r;
  }, [baseSeed, deck.symbols.length, mode]);

  const newBoardView = useCallback((cols: number, rows: number, pairs: number) => {
    cards.current = [];
    setShape({ cols, rows, pairs });
    setFaces({});
    setWells([]);
    setShelf([]);
    setBoardKey((k) => k + 1);
  }, []);

  /** Place and deal every card after the new board has mounted. */
  const dealCards = useCallback((fast = false) => {
    const g = geoRef.current;
    const r = runRef.current;
    if (!g || !r) return;
    const n = g.cols * g.rows;
    const pile = { x: g.W / 2 - g.cw / 2, y: g.felt.y + g.felt.h - g.ch * 0.4 };
    for (let slot = 0; slot < n; slot++) {
      const id = r.eng.ids[slot];
      const p = slotXY(g, slot);
      cards.current[id]?.place(p.x, p.y);
      cards.current[id]?.deal(pile.x, pile.y, slot * 38, fast || reducedMotion);
    }
    if (!fast) {
      GameAudio.play('fx.whoosh', { volume: 0.5 });
      for (let i = 0; i < 6; i++) later(i * 38 * 2.6, () => GameAudio.play('mm_flip', { volume: 0.35, pan: -0.4 + i * 0.16 }));
    }
  }, [later, reducedMotion]);

  // Deal once the board view for this key is mounted and geometry is known.
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

  // Keep card positions right if the layout changes (rotation, first layout).
  useEffect(() => {
    const r = runRef.current;
    if (!geo || !r) return;
    for (let slot = 0; slot < geo.cols * geo.rows; slot++) {
      const p = slotXY(geo, slot);
      cards.current[r.eng.ids[slot]]?.place(p.x, p.y);
    }
  }, [geo]);

  // Open / rematch: build a fresh run.
  useEffect(() => {
    if (!visible) return;
    clearTimers();
    const r = buildRun({ runIndex, tryIndex: 0 });
    const sh = shapeForPairs(r.pairs);
    newBoardView(sh.cols, sh.rows, sh.pairs);
    setScore(0);
    setResult(null);
    setTryScreen(null);
    setUnlock(null);
    setPeeks({ n: 0, armed: false, show: false });
    setBed(null);
    rays.value = 0;
    warmth.value = 0;
    wash.value = 0;
    coin.value = 0;
    coinFly.value = 0;
    dizzy.value = 0;
    rimFrac.value = 1;
    rimUrgent.value = 0;
    rimDim.value = 0;
    stage.current?.pose('idle');
    syncHud();
    void loadPersonalBest(mode === 'ride' ? 0 : mode === 'daily' ? 2 : 1).then(setPersonalBest);
    if (mode === 'ride') {
      void loadGhost(ghostKey).then((g) => {
        if (runRef.current === r) r.ghost = g ?? medianGhost(8);
        setGhostUi({ ghostPairs: 0, delta: null, ahead: false, passed: 0, label: g && !g.median ? 'YOUR BEST' : 'RIDE AVG' });
      });
    }
    return clearTimers;
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
    setBed('mm_loop_main');
    stage.current?.pose('idle');
    syncHud();
  }, [syncHud]);

  const runGlimpse = useCallback((after: () => void) => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g) { after(); return; }
    const n = g.cols * g.rows;
    const reps = r.sizeRepeats[r.pairs] ?? 0;
    r.sizeRepeats[r.pairs] = reps + 1;
    const hold = r.mode === 'race' ? RACE_GLIMPSE_MS : glimpseMs(r.pairs, reps);
    const faceMap: Record<number, number> = {};
    const slots: number[] = [];
    const fs: number[] = [];
    for (let s = 0; s < n; s++) {
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
    const cx = (g.cols - 1) / 2;
    const cy = (g.rows - 1) / 2;
    const stepOf = (s: number) => Math.round(Math.abs((s % g.cols) - cx) + Math.abs(Math.floor(s / g.cols) - cy));
    let maxStep = 0;
    for (let s = 0; s < n; s++) maxStep = Math.max(maxStep, stepOf(s));
    for (let s = 0; s < n; s++) {
      const d = stepOf(s);
      const id = r.eng.ids[s];
      later(60 + d * 18, () => cards.current[id]?.flipUp(FLIP_MS));
      later(60 + maxStep * 18 + FLIP_MS + hold + d * 18, () => cards.current[id]?.flipDown(FLIP_MS));
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

  // Walking into the engine (hold length, twists, forgiveness) and Peek banking.
  useEffect(() => {
    const r = runRef.current;
    if (!r || !r.playing) return;
    send({ t: 'walking', on: walking, at: gameNow() });
  }, [walking, gameNow, send]);
  useEffect(() => {
    const r = runRef.current;
    if (!moving || !r || r.mode !== 'timeAttack' || !r.playing) return;
    const t = Date.now();
    if (t - r.lastMovingAt < 8000) return;
    r.lastMovingAt = t;
    if (r.peeks >= 2) return;
    r.peeks += 1;
    setPeeks((p) => ({ ...p, n: r.peeks }));
    if (r.eng.board >= 3) GameAudio.play('mm_peek_bank');
  }, [moving]);

  // ---------------------------------------------------------------------------
  // Events -> FX, sound, haptics, poses (all on the same frame)
  // ---------------------------------------------------------------------------
  const applyEventsRef = useRef<(ev: MMEvent[]) => void>(() => undefined);

  const flyScore = useCallback((x: number, y: number, parts: { base: number; chainHalves: number; showHalves: number; golden: boolean; overtime: boolean; value: number; quick: number }) => {
    const bits = [`${parts.base}`];
    if (parts.chainHalves > 2) bits.push(`x${parts.chainHalves / 2}`);
    if (parts.showHalves > 2) bits.push('x1.5');
    if (parts.golden) bits.push('x2');
    if (parts.overtime) bits.push('x2');
    const big = parts.value >= 900 ? 'xl' : parts.value >= 300 ? 'lg' : 'md';
    const color = parts.showHalves > 2 ? '#ffcf3b' : '#ffffff';
    if (bits.length > 1) {
      fx.current?.flyUp(bits.join(' '), x, y, { size: 'md', key: 'tally', color });
      later(200, () => fx.current?.flyUp(`+${parts.value}`, x, y - 8, { size: big, key: 'tally', color }));
    } else fx.current?.flyUp(`+${parts.value}`, x, y, { size: big, key: 'tally', color });
  }, [later]);

  const finishRide = useCallback((won: boolean) => {
    const r = runRef.current;
    if (!r || r.ended) return;
    r.ended = true;
    r.playing = false;
    const e = r.eng;
    const grades = gradesFor(e);
    const stars = r.mode === 'ride' ? rideStars(e) : r.mode === 'daily' ? dailyStars(e) : timeAttackStars(r.cleared);
    const finalScore = e.score;
    setScore(finalScore);
    void savePersonalBest(r.mode === 'ride' ? 0 : r.mode === 'daily' ? 2 : 1, finalScore).then(({ best }) => setPersonalBest(best));
    if (won && r.mode === 'ride') {
      void saveGhostIfBest(ghostKey, { pairTimes: e.pairTimes.slice(), clearMs: Math.round(e.elapsedMs) });
    }
    GameAudio.music.stop(400);
    const par = parFor(e.pairsTotal);
    const verdict = r.src.verdict();
    setResult({
      score: finalScore,
      stars,
      maxCombo: e.maxChain,
      message: !won ? (r.mode === 'timeAttack' ? `BOARD ${e.board}` : 'SO CLOSE!')
        : e.turns <= parFor(e.pairsTotal) - 1 ? 'PERFECT!' : stars >= 3 ? 'SHARP!' : 'CLEARED!',
      stats: [
        { label: 'MEMORY', value: grades.memory },
        { label: 'SPEED', value: grades.speed },
        { label: 'CHAIN', value: grades.chain },
        r.mode === 'timeAttack' ? { label: 'BOARDS', value: `${r.cleared}` } : { label: 'TURNS', value: `${e.turns}/${par}` },
      ],
      note: grades.tip,
      meta: {
        game: 'memory',
        engine: ENGINE_VERSION,
        mode: r.mode,
        score: finalScore,
        duration: Math.round(e.elapsedMs),
        seed: baseSeed,
        tryIndex: r.tryIndex,
        runIndex: r.runIndex,
        deck: deck.id,
        turns: e.turns,
        pairs: e.pairs,
        maxCombo: e.maxChain,
        showtimes: e.showtimes,
        verdict,
        log: e.log.slice(),
        walking: walkingRef.current,
      },
    });
  }, [baseSeed, deck.id, ghostKey]);

  const finalPair = useCallback((a: number, b: number, bonus: number, secondsLeft: number) => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g) return;
    r.busy = true;
    const ca = slotCenter(g, a);
    const cb = slotCenter(g, b);
    const mx = (ca.x + cb.x) / 2;
    const my = (ca.y + cb.y) / 2;
    const slowMs = reducedMotion ? 120 : 900;
    if (!calm) camera.frame(1.06);
    later(slowMs, () => {
      cards.current[r.eng.ids[a]]?.pop(0, 110, true);
      cards.current[r.eng.ids[b]]?.pop(0, 110, true);
      GameAudio.play('mm_board_clear');
      GameAudio.playLadder('mm_match', 0, { volume: 0.8 });
      Haptic.success();
      later(80, () => Haptic.comboHeavy());
      fx.current?.burst('confetti', g.W / 2, g.grid.y, { count: reducedMotion ? 6 : 60 });
      fx.current?.burst('coins', g.W * 0.3, g.grid.y + g.grid.h, { count: 20, angle: -70, spread: 40 });
      fx.current?.burst('coins', g.W * 0.7, g.grid.y + g.grid.h, { count: 20, angle: -110, spread: 40 });
      if (!calm) camera.shake(0.35);
      stage.current?.pose('party');
      stage.current?.say('CLEARED!', MM.gold, 'right');
    });
    // Bonus cascade (Sugar Crush): leftover seconds become coins into the score.
    const cascadeAt = slowMs + 450;
    const steps = Math.min(12, secondsLeft);
    let shown = r.eng.score - bonus;
    const per = steps > 0 ? Math.floor((bonus) / steps) : 0;
    for (let i = 0; i < steps; i++) {
      later(cascadeAt + i * 60, () => {
        shown += per;
        setScore(shown);
        GameAudio.play(`coin_tick_${String(Math.min(12, i)).padStart(2, '0')}`, { volume: 0.8 });
        fx.current?.burst('coins', g.W / 2, g.hudY + 20, { count: 1, speed: 0.4 });
      });
    }
    const mergeAt = cascadeAt + steps * 60 + 200;
    later(mergeAt, () => {
      setScore(r.eng.score);
      if (bonus) fx.current?.flyUp(`TIME BONUS +${bonus}`, g.W / 2, g.grid.y + 20, { size: 'lg', color: '#ffcf3b' });
      setWells((w) => [...w, a, b]);
      cards.current[r.eng.ids[a]]?.flyTo(mx - g.cw / 2, my - g.ch / 2, 0.4, 0);
      cards.current[r.eng.ids[b]]?.flyTo(mx - g.cw / 2, my - g.ch / 2, 0.4, 0);
      setStampAt({ x: mx, y: my, s: g.cw * 1.4 });
      coin.value = withDelay(260, withTiming(1, { duration: 350, easing: Easing.out(Easing.back(1.6)) }));
      coinShake.value = withDelay(620, withSequence(
        ...Array.from({ length: 6 }, (_, i) => withTiming(i % 2 ? -3 : 3, { duration: 40 })),
        withTiming(0, { duration: 20 }),
      ));
      later(620, () => { Haptic.tapLight(); later(80, () => Haptic.tapLight()); later(160, () => Haptic.tapLight()); });
      later(880, () => {
        Haptic.comboHeavy();
        GameAudio.play('fx.reward');
        fx.current?.burst('stars', mx, my, { count: 12 });
        stage.current?.pose('coin');
        coinFly.value = withTiming(1, { duration: 520, easing: Easing.in(Easing.cubic) });
      });
      later(1500, () => {
        if (!calm) camera.frame(1);
        finishRide(true);
      });
    });
  }, [calm, camera, coin, coinShake, coinFly, finishRide, later, reducedMotion]);

  const timeoutScene = useCallback((out: boolean) => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g) return;
    r.busy = true;
    r.playing = false;
    GameAudio.music.stop(300);
    GameAudio.play(out ? 'mm_strike' : 'sh_whistle');
    later(260, () => GameAudio.play('mm_lose'));
    Haptic.warning();
    const layout = r.src.endReveal(r.eng.ids);
    if (layout) {
      const map: Record<number, number> = {};
      r.eng.ids.forEach((id, s) => { map[id] = layout[s]; });
      setFaces((m) => ({ ...m, ...map }));
    }
    let k = 0;
    for (let s = 0; s < r.eng.n; s++) {
      if (r.eng.know[s] === K_MATCHED) continue;
      const id = r.eng.ids[s];
      later(120 + (k++) * 30, () => cards.current[id]?.timeoutReveal(0));
    }
    wash.value = withDelay(200, withTiming(1, { duration: 300 }));
    stage.current?.pose('dizzy');
    dizzy.value = withTiming(1, { duration: 300 });
    const left = RIDE_TRIES - 1 - r.tryIndex;
    later(900, () => {
      if (r.mode === 'ride' && left > 0 && !rideChallenge) {
        setTryScreen({ pairs: r.eng.pairs, total: r.eng.pairsTotal, left });
      } else if (r.mode === 'ride' && left > 0) {
        setTryScreen({ pairs: r.eng.pairs, total: r.eng.pairsTotal, left });
      } else finishRide(false);
    });
  }, [dizzy, finishRide, later, rideChallenge, wash]);

  // ---------------------------------------------------------------------------
  // Memory Race (house crew seats on the same board, design 4.5)
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
      // The server replays every board and finalizes the round; LineParty shows results.
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
      stage.current?.say('1ST!', MM.gold, 'right');
    } else {
      GameAudio.play('mm_lose');
      Haptic.tickSelection();
      later(80, () => Haptic.tickSelection());
      stage.current?.pose('dizzy');
      dizzy.value = withTiming(1, { duration: 300 });
      const w = entries.find((x) => place[x.key] === 1);
      const wi = rc.crew.findIndex((c) => c.id === w?.key);
      if (wi >= 0) stage.current?.say(`${rc.crew[wi].name.toUpperCase()} WINS`, '#ffffff', 'right');
    }
    const ord = ['1ST', '2ND', '3RD', '4TH'][mine - 1] ?? `${mine}TH`;
    later(1400, () => {
      setScore(e.score);
      setResult({
        score: e.score,
        stars: mine === 1 ? 3 : mine === 2 ? 2 : 1,
        maxCombo: e.maxChain,
        message: mine === 1 ? '1ST PLACE!' : `${ord} PLACE`,
        stats: [
          { label: 'PLACE', value: ord },
          { label: 'PAIRS', value: `${e.pairs}/${e.pairsTotal}` },
          { label: 'MEMORY', value: grades.memory },
          { label: 'SPEED', value: grades.speed },
        ],
        note: grades.tip,
        meta: {
          game: 'memory', engine: ENGINE_VERSION, mode: 'race', score: e.score, seed: baseSeed, runIndex: r.runIndex,
          placement: mine, crew: rc.crew.map((c) => c.id), log: e.log.slice(), walking: walkingRef.current,
        },
      });
    });
  }, [baseSeed, dizzy, later, raceEntries, syncRacers]);

  const incoming = useSharedValue(0);
  const startTelegraph = useCallback((r: Run, at: number) => {
    const rc = r.race!;
    rc.telegraph = { until: at + ATTACK_TELEGRAPH_MS, blocked: false };
    GameAudio.play('sh_seagull', { volume: 0.8 });
    Haptic.warning();
    incoming.value = 0;
    incoming.value = withTiming(1, { duration: ATTACK_TELEGRAPH_MS, easing: Easing.linear });
    stage.current?.say('INCOMING GULL', MM.urgent, 'left');
  }, [incoming]);

  /** Our chain 3 sends a Gull Swap to the leading crew seat (it loses time). */
  const sendAttack = useCallback((r: Run, at: number) => {
    const rc = r.race!;
    const entries = raceEntries(r, at).slice(1);
    if (!entries.length) return;
    let best = 0;
    entries.forEach((x, i) => { if (x.pairs > entries[best].pairs || (x.pairs === entries[best].pairs && x.score > entries[best].score)) best = i; });
    const target = best;
    stage.current?.say('GULL SENT!', MM.gold, 'left');
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
    // Crew clears and emotes.
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
    // Crew attacks: chain 3 sends a Gull Swap to the current leader.
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
        stage.current?.say('BLOCKED', MM.gold, 'left');
        GameAudio.play('sh_shield_pop');
        Haptic.hitMedium();
      } else {
        applyEventsRef.current(send({ t: 'attack', at }));
      }
    }
    syncRacers(r, at);
  }, [endRace, incoming, raceEntries, send, startTelegraph, syncRacers]);

  const boardCleared = useCallback((bonus: number) => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g) return;
    r.busy = true;
    r.cleared += 1;
    GameAudio.play('mm_board_clear');
    Haptic.success();
    later(80, () => Haptic.comboHeavy());
    fx.current?.burst('confetti', g.W / 2, g.grid.y + g.grid.h / 2, { count: reducedMotion ? 6 : 50 });
    fx.current?.flyUp(`BOARD ${r.eng.board} CLEAR +${bonus}`, g.W / 2, g.grid.y + g.grid.h / 2, { size: 'lg', color: '#ffcf3b' });
    if (!calm) { camera.punch(0.02); camera.shake(0.3); }
    stage.current?.pose('party', 900);
    setClockDelta({ id: Date.now(), ms: 4000 });
    later(1100, () => {
      const rr = runRef.current;
      if (!rr || rr.ended) return;
      const pairs = nextPairs(rr.pairs, rr.eng.boardSlips);
      const nextBoard = rr.eng.board + 1;
      const sys = boardSystems(nextBoard);
      const s2 = boardSeed(rr.seed, nextBoard);
      rr.src = createLocalBoard({ pairs, deckSize: deck.symbols.length, seed: s2, golden: sys.golden, gull: sys.seagull }, deck.symbols.length);
      rr.pairs = rr.src.info.pairs;
      rr.shelfNext = 0;
      rr.moved.clear();
      const sh = shapeForPairs(rr.pairs);
      dealBoard(rr.eng, sh.cols, sh.rows, gameNow());
      applySystems(rr.eng, sys);
      send({ t: 'freeze', on: true, at: gameNow() });
      newBoardView(sh.cols, sh.rows, sh.pairs);
      if (sys.peek && rr.peeks === 0 && nextBoard === 3) { rr.peeks = 1; }
      setPeeks({ n: rr.peeks, armed: false, show: sys.peek });
      const label = sys.unlock === 'showtime' ? 'SHOWTIME GAUGE' : sys.unlock === 'peek' ? 'PEEK UNLOCKED'
        : sys.unlock === 'tide' ? 'TIDE SHIFT' : sys.unlock === 'seagull' ? 'SEAGULL PAIR' : null;
      setUnlock(label);
      later(label ? 1500 : 500, () => {
        setUnlock(null);
        runGlimpse(() => { const q = runRef.current; if (q) q.busy = false; syncHud(); });
      });
    });
  }, [calm, camera, deck.symbols.length, gameNow, later, newBoardView, reducedMotion, runGlimpse, send, syncHud]);

  const applyEvents = useCallback((events: MMEvent[]) => {
    const r = runRef.current;
    const g = geoRef.current;
    if (!r || !g || !events.length) return;
    const e = r.eng;
    const flipMs = inShowtime(e) ? FLIP_SHOWTIME_MS : FLIP_MS;
    const lastMatch = events.find((x) => x.k === 'match' && x.last) as Extract<MMEvent, { k: 'match' }> | undefined;
    for (const ev of events) {
      switch (ev.k) {
        case 'flip': {
          const id = e.ids[ev.slot];
          if (lastMatch && !ev.first && (r.mode === 'ride' || r.mode === 'daily')) cards.current[id]?.slowFlip(FLIP_MS);
          else cards.current[id]?.flipUp(flipMs);
          const col = ev.slot % g.cols;
          GameAudio.play('mm_flip', { pan: (col / Math.max(1, g.cols - 1) - 0.5) * 0.8 });
          GameAudio.play('ui.select', { volume: 0.25 });
          Haptic.tapLight();
          break;
        }
        case 'match': {
          const { a, b, recall, chain, parts } = ev;
          if (r.race?.telegraph) r.race.telegraph.blocked = true;
          const ida = e.ids[a];
          const idb = e.ids[b];
          const show = parts.showHalves > 2;
          const ca = slotCenter(g, a);
          const cb = slotCenter(g, b);
          const mx = (ca.x + cb.x) / 2;
          const my = (ca.y + cb.y) / 2;
          const land = ev.last && (r.mode === 'ride' || r.mode === 'daily') ? 0 : flipMs;
          if (ev.last && r.mode !== 'timeAttack') break;
          later(land, () => {
            const stop = recall ? hitStopFor(chain, show) : 0;
            const leanDeg = 0.12 * 20;
            cards.current[ida]?.pop(ca.x < cb.x ? leanDeg : -leanDeg, stop, recall && chain >= 3);
            cards.current[idb]?.pop(ca.x < cb.x ? -leanDeg : leanDeg, stop, recall && chain >= 3);
            setStampAt({ x: mx, y: my, s: g.cw * 0.9 });
            stampV.value = 0;
            stampV.value = withSequence(withTiming(1, { duration: 160, easing: Easing.out(Easing.back(2)) }), withDelay(260, withTiming(0, { duration: 140 })));
            // Sound + haptic on the same frame.
            GameAudio.playLadder('mm_match', ladderStep(chain));
            if (recall) GameAudio.playLadder('mm_sharp_twinkle', ladderStep(chain), { volume: 0.7 });
            if (parts.golden) GameAudio.play('fx.coin');
            Haptic.hitMedium();
            if (recall) later(60, () => Haptic.tickSelection());
            const n = reducedMotion ? 6 : tierStars(chain, show);
            fx.current?.burst('stars', ca.x, ca.y, { count: Math.ceil(n / 2) });
            fx.current?.burst('stars', cb.x, cb.y, { count: Math.ceil(n / 2) });
            if (chain >= 3 || show) {
              fx.current?.ring(ca.x, ca.y, { color: '#fec90e', from: 6, to: g.cw * 1.4, ms: 280 });
              fx.current?.ring(cb.x, cb.y, { color: '#fec90e', from: 6, to: g.cw * 1.4, ms: 280 });
              fx.current?.burst('coins', mx, my, { count: 4 });
            }
            if (show) {
              fx.current?.burst('ribbons', mx, my, { count: 6 });
              stage.current?.flashAll();
            }
            if (recall || chain >= 2) {
              arc.value = { x1: cb.x, y1: cb.y, x2: ca.x, y2: ca.y, p: 0, a: 1 };
              arc.value = withSequence(
                withTiming({ x1: cb.x, y1: cb.y, x2: ca.x, y2: ca.y, p: 1, a: 1 }, { duration: 140 }),
                withDelay(160, withTiming({ x1: cb.x, y1: cb.y, x2: ca.x, y2: ca.y, p: 1, a: 0 }, { duration: 200 })),
              ) as unknown as ArcState;
            }
            flyScore(mx, my - g.ch * 0.4, parts);
            setScore(e.score);
            if (parts.quick) {
              chainPlate.current?.quickHit();
              stage.current?.say('QUICK', '#ffffff', 'left');
            }
            if (recall) {
              stage.current?.say(ev.tierUp ? 'SWEET RUN' : 'SHARP', MM.gold, 'right');
              stage.current?.pose('fist', 700);
              if (!calm) camera.kick((mx - g.W / 2) * 0.02, 0);
            } else if (ev.tierUp) stage.current?.say('SWEET RUN', MM.gold, 'right');
            if (ev.tierUp) { GameAudio.play('sh_tier_up'); Haptic.success(); }
            if (r.race && ev.tierUp && !r.ended) sendAttack(r, gameNow());
            // Booth light warms with the chain.
            warmth.value = withTiming(Math.min(3, chain) * 0.06 + (show ? 0.12 : 0), { duration: 300 });
            chainPlate.current?.quick();
            // Prize shelf flight (not the Final Pair).
            if (!ev.last || r.mode === 'timeAttack') {
              const k = r.shelfNext++;
              const sp = shelfXY(g, k, r.pairs);
              const sc = sp.h / g.ch;
              const face = ev.face;
              later(60, () => {
                cards.current[ida]?.flyTo(sp.x - (g.cw - sp.w) / 2 - 3, sp.y - (g.ch - sp.h) / 2, sc, 0);
                cards.current[idb]?.flyTo(sp.x - (g.cw - sp.w) / 2 + 3, sp.y - (g.ch - sp.h) / 2 + 1, sc, 30, () => {
                  setShelf((s) => [...s, face]);
                  GameAudio.play('mm_shelf_drop', { volume: 0.8 });
                  fx.current?.burst('glints', sp.x + sp.w / 2, sp.y + sp.h / 2, { count: 4 });
                });
                setWells((w) => [...w, a, b]);
              });
            }
          });
          if (!ev.last) syncHud();
          break;
        }
        case 'scout': {
          chip.current?.show('scout');
          later(flipMs, () => {
            cards.current[e.ids[ev.a]]?.settle();
            cards.current[e.ids[ev.b]]?.settle();
          });
          GameAudio.play('mm_scout_tick');
          Haptic.tickSelection();
          chainPlate.current?.bounce();
          stage.current?.pose('hmm', 600);
          if (e.scouts === 1 && r.runIndex === 0 && r.tryIndex === 0) stage.current?.say('NEW CARDS ARE FREE', '#ffffff', 'right');
          break;
        }
        case 'gullMiss': {
          GameAudio.play('sh_seagull');
          Haptic.tapLight();
          stage.current?.pose('hmm', 600);
          break;
        }
        case 'slip': {
          if (r.race) {
            r.stumbleUntil = gameNow() + 1000;
            setStumble(true);
            later(1000, () => setStumble(false));
          }
          later(flipMs, () => {
            cards.current[e.ids[ev.a]]?.slip(!calm);
            cards.current[e.ids[ev.b]]?.slip(!calm);
            if (ev.ghost >= 0) {
              const gid = e.ids[ev.ghost];
              cards.current[gid]?.ghost();
            }
          });
          chip.current?.show('slip');
          GameAudio.play('mm_slip');
          later(380, () => GameAudio.playLadder('mm_match', 0, { volume: 0.45 }));
          Haptic.warning();
          chainPlate.current?.shatter();
          if (!reducedMotion) fx.current?.burst('shards', g.W - 60, g.hudY + 24, { count: 8 });
          stage.current?.pose('facepalm', 800);
          if (e.slips === 1 && r.runIndex === 0 && r.tryIndex === 0) stage.current?.say('YOU SAW THAT ONE!', MM.coral, 'right');
          warmth.value = withTiming(0, { duration: 300 });
          break;
        }
        case 'strike': {
          GameAudio.play('mm_strike');
          chip.current?.show('strike');
          break;
        }
        case 'hide': {
          const ida = e.ids[ev.a];
          const idb = e.ids[ev.b];
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
          syncHud();
          break;
        case 'showtimeOn': {
          GameAudio.play('sh_fever_start');
          GameAudio.duck(6, 60, 300, 300);
          Haptic.comboHeavy();
          stage.current?.say('SHOWTIME', MM.gold, 'left');
          stage.current?.pose('party');
          rays.value = withTiming(1, { duration: 300 });
          warmth.value = withTiming(0.3, { duration: 300 });
          glow.value = withTiming(1, { duration: 300 });
          fx.current?.burst('ribbons', g.W / 2, g.grid.y, { count: reducedMotion ? 6 : 20 });
          fx.current?.vignette({ color: '#ffcf3b', peak: 0.3, holdMs: 7000 });
          if (!calm) { camera.frame(1.025); camera.shake(0.25); }
          setBed('mm_loop_showtime');
          syncHud();
          break;
        }
        case 'showtimeWarn': {
          GameAudio.play('sh_fever_end');
          Haptic.tickSelection();
          later(1000, () => Haptic.tickSelection());
          syncHud();
          break;
        }
        case 'showtimeOff': {
          rays.value = withTiming(0, { duration: 400 });
          glow.value = withTiming(0, { duration: 400 });
          if (!calm) camera.frame(1);
          stage.current?.pose('idle');
          setBed(r.eng.overtime ? 'mm_loop_overtime' : 'mm_loop_main');
          syncHud();
          break;
        }
        case 'photoFlash': {
          later(200, () => {
            GameAudio.play('sh_camera');
            Haptic.hitMedium();
            flashWarm.value = withSequence(withTiming(0.6, { duration: 60 }), withTiming(0, { duration: 240 }));
            const map: Record<number, number> = {};
            const fs: number[] = [];
            for (const s of ev.slots) {
              const f = r.src.faceAt(s, e.ids);
              fs.push(f ?? -1);
              if (f != null) map[e.ids[s]] = f;
            }
            setFaces((m) => ({ ...m, ...map }));
            if (r.src.kind === 'local') send({ t: 'reveal', slots: ev.slots, faces: fs, at: gameNow() });
            const t = slotCenter(g, ev.slot);
            ev.slots.forEach((s, i) => {
              const c = slotCenter(g, s);
              const d = Math.round(Math.abs(c.x - t.x) / g.cw + Math.abs(c.y - t.y) / g.ch);
              later(d * 20, () => cards.current[e.ids[s]]?.peek(500));
              void i;
            });
          });
          break;
        }
        case 'overtime': {
          GameAudio.play('mm_overtime_hit');
          Haptic.warning();
          stage.current?.say('OVERTIME x2', MM.urgent, 'left');
          if (!inShowtime(e)) setBed('mm_loop_overtime');
          syncHud();
          break;
        }
        case 'second': {
          if (ev.left <= 5 && ev.left > 0 && e.cfg.clockMs != null) {
            GameAudio.play('ui_tick');
            Haptic.tickSelection();
            if (ev.left === 5) stage.current?.pose('gasp');
          }
          syncHud();
          break;
        }
        case 'clock':
          setClockDelta({ id: Date.now(), ms: ev.deltaMs });
          break;
        case 'gullSwap': {
          const s1 = ev.s1;
          const s2 = ev.s2;
          const p1 = slotXY(g, s1);
          const p2 = slotXY(g, s2);
          const id1 = e.ids[s1];
          const id2 = e.ids[s2];
          setGullAt({ x1: p2.x + g.cw / 2, y1: p2.y, x2: p1.x + g.cw / 2, y2: p1.y });
          gull.value = 0;
          gull.value = withSequence(withTiming(1, { duration: 300 }), withDelay(420, withTiming(2, { duration: 300 })), withTiming(0, { duration: 1 }));
          GameAudio.play('sh_seagull');
          later(300, () => {
            Haptic.tapLight();
            cards.current[id1]?.lift(true);
            cards.current[id2]?.lift(true);
            cards.current[id1]?.moveTo(p1.x, p1.y, 420, g.cw * 0.5);
            cards.current[id2]?.moveTo(p2.x, p2.y, 420, g.cw * 0.5);
            fx.current?.burst('puff', (p1.x + p2.x) / 2 + g.cw / 2, (p1.y + p2.y) / 2, { count: 6 });
          });
          later(740, () => {
            Haptic.hitMedium();
            cards.current[id1]?.lift(false);
            cards.current[id2]?.lift(false);
            cards.current[id1]?.moved(true);
            cards.current[id2]?.moved(true);
            r.moved.add(id1);
            r.moved.add(id2);
          });
          break;
        }
        case 'tide': {
          GameAudio.play('sh_wave_wash');
          const row = ev.row;
          for (let c = 0; c < g.cols; c++) {
            const s = row * g.cols + c;
            const id = e.ids[s];
            const p = slotXY(g, s);
            if (e.know[s] === K_MATCHED) continue;
            if (c === 0) cards.current[id]?.teleport(p.x, p.y, 600);
            else cards.current[id]?.moveTo(p.x, p.y, 360, 6, 600);
            cards.current[id]?.moved(true);
            r.moved.add(id);
          }
          const y = slotCenter(g, row * g.cols).y;
          fx.current?.burst('splash', g.grid.x, y, { count: 10 });
          fx.current?.burst('splash', g.grid.x + g.grid.w, y, { count: 10 });
          setWells((w) => w.slice());
          break;
        }
        case 'boardClear':
          boardCleared(ev.bonus);
          break;
        case 'cleared': {
          if (r.race) {
            if (!r.race.winner) r.race.winner = 'me';
            r.race.myClearAt = gameNow();
            GameAudio.play('mm_board_clear');
            fx.current?.burst('confetti', g.W / 2, g.grid.y, { count: reducedMotion ? 6 : 50 });
            endRace(gameNow());
            break;
          }
          const m = lastMatch;
          if (m) finalPair(m.a, m.b, ev.bonus, ev.secondsLeft);
          else finishRide(true);
          break;
        }
        case 'timeout':
          if (r.race) { endRace(gameNow()); break; }
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
  }, [arc, boardCleared, calm, camera, endRace, finalPair, sendAttack, finishRide, flashWarm, flyScore, gameNow, glow, gull, later, rays, reducedMotion, send, stampV, syncHud, timeoutScene, warmth]);
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
  // Input: one board tap, nearest card centre with forgiveness
  // ---------------------------------------------------------------------------
  const hitSlot = useCallback((x: number, y: number): number => {
    const g = geoRef.current;
    const r = runRef.current;
    if (!g || !r) return -1;
    const forgive = walkingRef.current ? 10 : 4;
    let best = -1;
    let bestD = Infinity;
    for (let s = 0; s < g.cols * g.rows; s++) {
      if (r.eng.know[s] === K_MATCHED) continue;
      const c = slotCenter(g, s);
      const dx = Math.abs(x - c.x);
      const dy = Math.abs(y - c.y);
      if (dx > g.cw / 2 + g.gap / 2 + forgive || dy > g.ch / 2 + g.gap / 2 + forgive) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }, []);

  const pressedId = useRef(-1);
  const onPressIn = useCallback((x: number, y: number) => {
    const g = geoRef.current;
    const r = runRef.current;
    if (!g || !r || !r.playing || r.busy) return;
    const s = hitSlot(x, y);
    if (s < 0 || r.eng.up.indexOf(s) >= 0) return;
    const c = slotCenter(g, s);
    const id = r.eng.ids[s];
    pressedId.current = id;
    cards.current[id]?.press((x - c.x) / (g.cw / 2), (y - c.y) / (g.ch / 2));
  }, [hitSlot]);

  const tapSlot = useCallback((slot: number) => {
    const r = runRef.current;
    if (!r || !r.playing || r.busy || r.ended || r.pending || r.pausedAt != null || slot < 0) return;
    const e = r.eng;
    let at = gameNow();
    if (at < r.stumbleUntil) return;
    const p = partyRef.current;
    if (p) {
      // The tap log is the proof: the server replays exactly these entries.
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
      setPeeks((p) => ({ ...p, n: r.peeks, armed: false }));
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
    const res = r.src.flip(slot, at);
    const finish = (face: number) => {
      const rr = runRef.current;
      if (rr !== r) return;
      r.pending = false;
      setFaces((m) => (m[id] === face ? m : { ...m, [id]: face }));
      const out = step(r.eng, { t: 'flip', slot, face: r.src.kind === 'local' ? (r.src.faceAt(slot, r.eng.ids) ?? face) : face, at });
      applyEvents(out);
      syncHud();
    };
    if (res instanceof Promise) {
      r.pending = true;
      cards.current[id]?.hold();
      void res.then((x) => finish(x.face));
    } else finish(r.src.kind === 'local' ? (r.src.faceAt(slot, e.ids) ?? res.face) : res.face);
  }, [applyEvents, gameNow, send, syncHud]);

  const onTap = useCallback((x: number, y: number) => {
    if (pressedId.current >= 0) cards.current[pressedId.current]?.release();
    pressedId.current = -1;
    tapSlot(hitSlot(x, y));
  }, [hitSlot, tapSlot]);
  const onCancel = useCallback(() => {
    if (pressedId.current >= 0) cards.current[pressedId.current]?.release();
    pressedId.current = -1;
  }, []);

  const ox = geo?.felt.x ?? 0;
  const oy = geo?.felt.y ?? 0;
  const tap = useMemo(() => Gesture.Tap()
    .maxDuration(900)
    .maxDistance(40)
    .onBegin((e) => { runOnJS(onPressIn)(e.x + ox, e.y + oy); })
    .onEnd((e, ok) => { if (ok) runOnJS(onTap)(e.x + ox, e.y + oy); })
    .onFinalize((_e, ok) => { if (!ok) runOnJS(onCancel)(); }),
  [onPressIn, onTap, onCancel, ox, oy]);

  // ---------------------------------------------------------------------------
  // Autoplay (dev capture only)
  // ---------------------------------------------------------------------------
  useMemoryAutoplay({ runRef, tapSlot, enabled: visible && !result && !tryScreen });

  // ---------------------------------------------------------------------------
  // Try again (Ride Sprint: 3 tries per Ticket)
  // ---------------------------------------------------------------------------
  const tryAgain = useCallback(() => {
    const prev = runRef.current;
    if (!prev) return;
    clearTimers();
    setTryScreen(null);
    const r = buildRun({ runIndex: prev.runIndex, tryIndex: prev.tryIndex + 1, keep: prev });
    newBoardView(4, 4, 8);
    wash.value = withTiming(0, { duration: 200 });
    dizzy.value = 0;
    coin.value = 0;
    coinFly.value = 0;
    rays.value = 0;
    warmth.value = 0;
    rimFrac.value = 1;
    rimUrgent.value = 0;
    stage.current?.pose('idle');
    setScore(0);
    syncHud();
    later(900, () => {
      if (runRef.current === r) beginPlay();
    });
  }, [beginPlay, buildRun, clearTimers, coin, coinFly, dizzy, later, newBoardView, rays, rimFrac, rimUrgent, syncHud, warmth, wash]);

  const giveUp = useCallback(() => {
    setTryScreen(null);
    finishRide(false);
  }, [finishRide]);

  const onRematch = useCallback(() => {
    setRunIndex((n) => n + 1);
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
    setPeeks((p) => ({ ...p, armed: r.peekArmed }));
    Haptic.tickSelection();
  }, []);

  // ---------------------------------------------------------------------------
  // Styles driven by shared values
  // ---------------------------------------------------------------------------
  const stampStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, stampV.value * 1.5),
    transform: [{ scale: 1.6 - 0.6 * Math.min(1, stampV.value) }, { rotateZ: '-8deg' }],
  }));
  const washStyle = useAnimatedStyle(() => ({ opacity: wash.value * 0.55 }));
  const warmFlashStyle = useAnimatedStyle(() => ({ opacity: flashWarm.value }));
  const feltWarmStyle = useAnimatedStyle(() => ({ opacity: warmth.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const coinStyle = useAnimatedStyle(() => ({
    opacity: coin.value > 0 ? 1 - Math.max(0, coinFly.value - 0.8) * 5 : 0,
    transform: [
      { translateY: -coinFly.value * (stampAt.y + 40) },
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
    return { opacity: t > 0.01 && t < 1.99 ? 1 : 0, transform: [{ translateX: x - 36 }, { translateY: y - 36 }, { scaleX: out > 0 ? -1 : 1 }] };
  });
  const dizzyStyle = useAnimatedStyle(() => ({ opacity: dizzy.value }));
  const incomingRimStyle = useAnimatedStyle(() => ({ opacity: incoming.value > 0 && incoming.value < 1 ? 0.6 + 0.4 * Math.abs(Math.sin(incoming.value * Math.PI * 4)) : 0 }));
  const fieldW = field.w;
  const gullShadowAnim = useAnimatedStyle(() => ({
    opacity: incoming.value > 0.001 && incoming.value < 0.999 ? 1 : 0,
    transform: [{ translateX: -100 + (fieldW + 200) * incoming.value }, { translateY: Math.sin(incoming.value * Math.PI * 2) * 18 }],
  }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const n = shape.cols * shape.rows;
  const ids = useMemo(() => Array.from({ length: n }, (_, i) => i), [n]);
  const r = runRef.current;
  const g = geo;
  const title = mode === 'ride' ? 'Ride Sprint' : mode === 'daily' ? 'Daily Deck' : mode === 'race' ? 'Memory Race' : 'Memory Match';
  const subtitle = mode === 'ride'
    ? `${deck.label}${r && r.tryIndex > 0 ? ` · Try ${r.tryIndex + 1} of ${RIDE_TRIES}` : ''}`
    : mode === 'timeAttack' ? `${deck.label} · Board ${hud.board}` : deck.label;

  return (
    <GameShellV2
      visible={visible}
      title={title}
      subtitle={subtitle}
      score={score}
      multiplier={hud.chain >= 3 ? 2 : hud.chain === 2 ? 1.5 : 1}
      fever={hud.showtime}
      personalBest={personalBest}
      objective={mode === 'ride' ? 'Clear the board' : mode === 'daily' ? 'Two slips and you are out' : mode === 'race' ? 'Same board, four sharks. First to clear wins.' : 'Race the clock. Chain clean matches.'}
      result={result}
      gameId="memory"
      onStart={onStart}
      onPause={onPause}
      onResume={onResume}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
      onRematch={mode !== 'ride' ? onRematch : undefined}
      onWrapUp={onWrapUp}
    >
      <View style={styles.field} onLayout={onFieldLayout}>
        <LinearGradient colors={['#0b80c4', '#35a8e6', '#bfe5ff']} style={StyleSheet.absoluteFill} />
        {g ? (
          <>
            {/* Showtime rays behind the booth */}
            <Canvas style={[StyleSheet.absoluteFill]} pointerEvents="none">
              <Sunburst cx={g.W / 2} cy={g.grid.y + g.grid.h / 2} radius={g.H} intensity={rays} width={g.W} height={g.H} rays={12} speed={0.105} />
            </Canvas>

            {/* HUD row: never inside the camera */}
            <View style={[styles.hud, { top: g.hudY }]} pointerEvents="none">
              <StopwatchPlate seconds={hud.seconds} urgent={hud.urgent} frozen={hud.frozen} delta={clockDelta} reducedMotion={reducedMotion} />
              {mode === 'race' ? (
                <RivalStrip racers={racers} total={8} reducedMotion={reducedMotion} />
              ) : mode === 'ride' ? (
                <GhostLane label={ghostUi.label} ghostPairs={ghostUi.ghostPairs} myPairs={hud.pairs} total={hud.total}
                  delta={ghostUi.delta} ahead={ghostUi.ahead} passed={ghostUi.passed} />
              ) : <View style={{ flex: 1 }} />}
              <ChainPlate ref={chainPlate} chain={hud.chain} gauge={hud.gauge} showtime={hud.showtime} showWarn={hud.showWarn}
                strikes={mode === 'daily' ? hud.strikes : null} strikesMax={2} reducedMotion={reducedMotion} />
              <View style={styles.chipAnchor}>
                <VerdictChip ref={chip} reducedMotion={reducedMotion} />
              </View>
            </View>

            {/* Barker shark and booth */}
            <View style={{ position: 'absolute', left: 0, top: g.stageY, width: g.W, height: g.stageH }} pointerEvents="none">
              <SharkStage ref={stage} height={g.stageH} width={g.W} beat={beat.beat} showtime={hud.showtime}
                warmth={warmth} reducedMotion={reducedMotion} calm={calm} />
              <Animated.Image source={DIZZY} style={[styles.dizzy, { left: g.W * 0.18, top: 4 }, dizzyStyle]} />
            </View>

            {/* The game booth: wood rail, felt, prize shelf, wells, cards (camera) */}
            <Animated.View style={[StyleSheet.absoluteFill, camera.style]} pointerEvents="box-none">
              <Animated.View style={[styles.glow, { left: g.panel.x - 6, top: g.panel.y - 6, width: g.panel.w + 12, height: g.panel.h + 12 }, glowStyle]} />
              <View style={[styles.panel, { left: g.panel.x, top: g.panel.y, width: g.panel.w, height: g.panel.h }]}>
                <View style={[styles.felt, { left: g.felt.x - g.panel.x, top: g.felt.y - g.panel.y, width: g.felt.w, height: g.felt.h }]}>
                  <LinearGradient colors={['#1b93e6', MM.felt, '#086cc0']} style={StyleSheet.absoluteFill} />
                  <Animated.View style={[StyleSheet.absoluteFill, styles.feltWarm, feltWarmStyle]} />
                </View>
                <RailBulbs panel={g.panel} beat={beat.beat} still={reducedMotion} />
              </View>
              <Shelf g={g} pairs={shape.pairs} filled={shelf} deck={deck} />
              {ids.map((s) => {
                const p = slotXY(g, s);
                const matched = wells.indexOf(s) >= 0;
                return (
                  <View key={`w${boardKey}-${s}`} style={[styles.well, matched && styles.wellGold,
                    { left: p.x, top: p.y, width: g.cw, height: g.ch, borderRadius: Math.min(g.cw, g.ch) * 0.12 }]} />
                );
              })}
              <View style={[StyleSheet.absoluteFill]} pointerEvents="none">
                <View style={{ position: 'absolute', left: g.felt.x - 4, top: g.felt.y - 4, width: g.felt.w + 8, height: g.felt.h + 8 }}>
                  {mode !== 'daily' ? (
                    <BoardFx width={g.felt.w + 8} height={g.felt.h + 8} inset={4} radius={12} rimFrac={rimFrac} rimUrgent={rimUrgent}
                      rimDim={rimDim} notchFrac={mode === 'ride' ? 15000 / 45000 : -1} arc={NO_ARC} showRim />
                  ) : null}
                </View>
                <View key={`b${boardKey}`} style={[StyleSheet.absoluteFill, styles.tilt]}>
                  {ids.map((id) => {
                    const home = slotXY(g, Math.max(0, r ? r.eng.ids.indexOf(id) : id));
                    return (
                    <MemoryCard
                      x0={home.x}
                      y0={home.y}
                      key={`c${boardKey}-${id}`}
                      ref={(h) => { cards.current[id] = h; }}
                      w={g.cw}
                      h={g.ch}
                      back={CARD_BACK}
                      face={cardFaceFor(id)}
                      goldBack={faces[id] === FACE_GOLD}
                      reducedMotion={reducedMotion}
                    />
                    );
                  })}
                </View>
              </View>
              <BoardFx width={g.W} height={g.H} inset={0} radius={14} rimFrac={rimFrac} rimUrgent={rimUrgent} rimDim={rimDim}
                notchFrac={mode === 'ride' ? 15000 / 45000 : -1} arc={arc} showRim={false} />
              {mode === 'race' ? (
                <>
                  <Animated.View pointerEvents="none" style={[styles.incomingRim, { left: g.panel.x - 4, top: g.panel.y - 4, width: g.panel.w + 8, height: g.panel.h + 8 }, incomingRimStyle]} />
                  <Animated.View pointerEvents="none" style={[styles.gullShadow, { top: g.grid.y + g.grid.h * 0.45 }, gullShadowAnim]} />
                  {stumble ? <View pointerEvents="none" style={[styles.stumble, { left: g.felt.x, top: g.felt.y, width: g.felt.w, height: g.felt.h }]} /> : null}
                </>
              ) : null}
              <Animated.View pointerEvents="none" style={[styles.wash, { left: g.felt.x, top: g.felt.y, width: g.felt.w, height: g.felt.h }, washStyle]} />
              <Animated.Image source={STAMP}
                style={[styles.abs, { left: stampAt.x - stampAt.s / 2, top: stampAt.y - stampAt.s / 2, width: stampAt.s, height: stampAt.s }, stampStyle]} />
              <Animated.Image source={COIN}
                style={[styles.abs, { left: stampAt.x - g.cw * 0.7, top: stampAt.y - g.cw * 0.66, width: g.cw * 1.4, height: g.cw * 1.32 }, coinStyle]} />
              <Animated.Image source={GULL} style={[styles.abs, { width: 72, height: 72 }, gullStyle]} />
            </Animated.View>

            {/* One tap gesture over the felt */}
            <GestureDetector gesture={tap}>
              <View style={[styles.abs, { left: g.felt.x, top: g.felt.y, width: g.felt.w, height: g.felt.h - (g.dock?.h ?? 0) }]}
                accessible accessibilityLabel="Memory board" accessibilityHint="Tap cards to flip them" />
            </GestureDetector>

            {/* Peek dock (Time Attack B3+) */}
            {g.dock && peeks.show ? (
              <Pressable onPress={armPeek} style={[styles.peekBtn, peeks.armed && styles.peekArmed, peeks.n === 0 && styles.peekEmpty,
                { left: g.dock.x + g.dock.w - 78, top: g.dock.y + 2 }]} accessibilityRole="button" accessibilityLabel={`Peek, ${peeks.n} banked`}>
                <Text style={styles.peekText}>PEEK</Text>
                <View style={styles.peekCount}><Text style={styles.peekCountText}>{peeks.n}</Text></View>
              </Pressable>
            ) : null}

            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.warmFlash, warmFlashStyle]} />
            <FxStage ref={fx} width={g.W} height={g.H} reducedMotion={reducedMotion} style={StyleSheet.absoluteFill} />

            {unlock ? (
              <View pointerEvents="none" style={[styles.unlock, { top: g.grid.y + g.grid.h / 2 - 40 }]}>
                <Text style={styles.unlockKicker}>NEW</Text>
                <Text style={styles.unlockText}>{unlock}</Text>
              </View>
            ) : null}

            {tryScreen ? (
              <View style={[styles.tryWrap, { top: g.felt.y + g.felt.h * 0.28 }]}>
                <Text style={styles.tryTitle}>SO CLOSE</Text>
                <Text style={styles.tryPairs}>{`${tryScreen.pairs}/${tryScreen.total} PAIRS`}</Text>
                <Pressable onPress={tryAgain} style={styles.tryBtn} accessibilityRole="button">
                  <Text style={styles.tryBtnText}>TRY AGAIN</Text>
                </Pressable>
                <Text style={styles.tryLeft}>{`${tryScreen.left} ${tryScreen.left === 1 ? 'try' : 'tries'} left on this Ticket`}</Text>
                <Pressable onPress={giveUp} hitSlop={10} accessibilityRole="button">
                  <Text style={styles.tryQuit}>End challenge</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </GameShellV2>
  );
}

const EMPTY_FACE = {};
const NO_ARC_VALUE: ArcState = { x1: 0, y1: 0, x2: 0, y2: 0, p: 0, a: 0 };
const NO_ARC = { value: NO_ARC_VALUE } as unknown as import('react-native-reanimated').SharedValue<ArcState>;

/** Wood-rail marquee bulbs, chasing on 8th notes, never fully off. */
const RailBulbs = React.memo(function RailBulbs({ panel, beat, still }: { panel: Rect; beat: import('react-native-reanimated').SharedValue<number>; still: boolean }) {
  const per = 7;
  const spots: { x: number; y: number }[] = [];
  for (let i = 0; i < per; i++) spots.push({ x: 4.5, y: 30 + (i * (panel.h - 60)) / (per - 1) });
  for (let i = 0; i < per; i++) spots.push({ x: panel.w - 4.5, y: panel.h - 30 - (i * (panel.h - 60)) / (per - 1) });
  return (
    <>
      {spots.map((s, i) => <RailBulb key={i} i={i} n={spots.length} x={s.x} y={s.y} beat={beat} still={still} />)}
    </>
  );
});

function RailBulb({ i, n, x, y, beat, still }: { i: number; n: number; x: number; y: number; beat: import('react-native-reanimated').SharedValue<number>; still: boolean }) {
  const st = useAnimatedStyle(() => {
    if (still) return { opacity: 0.7 };
    const head = (beat.value * 2) % n;
    let d = Math.abs(head - i);
    d = Math.min(d, n - d);
    const env = Math.max(0, 1 - d / 2.5);
    return { opacity: 0.4 + 0.6 * env * env };
  });
  return (
    <Animated.View style={[styles.railBulb, { left: x - 6, top: y - 6 }, st]}>
      <View style={styles.railCore} />
    </Animated.View>
  );
}

function Shelf({ g, pairs, filled, deck }: { g: Geo; pairs: number; filled: number[]; deck: Deck }) {
  return (
    <View pointerEvents="none" style={[styles.shelf, { left: g.shelf.x, top: g.shelf.y, width: g.shelf.w, height: g.shelf.h }]}>
      {Array.from({ length: pairs }, (_, k) => {
        const p = shelfXY(g, k, pairs);
        const f = filled[k];
        return (
          <View key={k} style={[styles.shelfSlot, { left: p.x - g.shelf.x, top: p.y - g.shelf.y, width: p.w, height: p.h }]}>
            {f != null ? <ShelfPair w={p.w} h={p.h} face={faceFor(deck, f)} /> : null}
          </View>
        );
      })}
      <View style={styles.shelfLip} />
    </View>
  );
}

function ShelfPair({ w, h, face }: { w: number; h: number; face: ReturnType<typeof faceFor> }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withSequence(withTiming(1.08, { duration: 60 }), withTiming(0.96, { duration: 60 }), withTiming(1, { duration: 60 }));
  }, [v]);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleY: v.value }, { scaleX: 2 - v.value }] }));
  const mini = (dx: number) => (
    <View style={[styles.mini, { width: w, height: h, left: dx, borderRadius: 4 }]}>
      {face.art ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: face.plate, alignItems: 'center', justifyContent: 'center' }]}>
          <Image source={face.art} style={{ width: w * 0.8, height: h * 0.7 }} resizeMode="contain" />
        </View>
      ) : face.sheet != null && face.slot != null ? (
        <Image source={face.sheet} resizeMode="stretch" style={{
          position: 'absolute', width: w * (face.cols ?? 4), height: h * (face.rows ?? 2),
          left: -(face.slot % (face.cols ?? 4)) * w, top: -Math.floor(face.slot / (face.cols ?? 4)) * h,
        }} />
      ) : null}
    </View>
  );
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]}>
      {mini(-3)}
      {mini(3)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, overflow: 'hidden' },
  abs: { position: 'absolute', left: 0, top: 0 },
  hud: { position: 'absolute', left: 10, right: 10, height: 50, flexDirection: 'row', alignItems: 'center' },
  chipAnchor: { position: 'absolute', right: 0, top: 50, alignItems: 'flex-end' },
  panel: {
    position: 'absolute', backgroundColor: MM.wood, borderRadius: 20, borderWidth: 3, borderColor: '#5a2e0e',
    shadowColor: '#064375', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 },
  },
  felt: { position: 'absolute', borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: '#5a2e0e' },
  feltWarm: { backgroundColor: '#ffcf6b' },
  glow: { position: 'absolute', borderRadius: 26, borderWidth: 6, borderColor: '#ffe27a' },
  railBulb: {
    position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,236,150,0.9)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#5a2e0e',
  },
  railCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fffbe0' },
  shelf: { position: 'absolute', backgroundColor: 'rgba(90,46,14,0.28)', borderRadius: 8 },
  shelfSlot: {
    position: 'absolute', borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(254,201,14,0.85)', borderStyle: 'dashed',
    backgroundColor: 'rgba(254,201,14,0.12)',
  },
  shelfLip: { position: 'absolute', left: -4, right: -4, bottom: -5, height: 7, borderRadius: 3, backgroundColor: MM.woodLight, borderWidth: 1.5, borderColor: '#5a2e0e' },
  mini: { position: 'absolute', top: 0, overflow: 'hidden', borderWidth: 1.5, borderColor: '#ffffff' },
  well: {
    position: 'absolute', backgroundColor: MM.well, borderWidth: 3, borderColor: '#ffffff',
    shadowColor: '#064375', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  wellGold: { backgroundColor: 'rgba(254,201,14,0.18)', borderColor: MM.gold, borderStyle: 'dashed', borderWidth: 2, shadowOpacity: 0 },
  incomingRim: { position: 'absolute', borderRadius: 24, borderWidth: 5, borderColor: MM.urgent },
  gullShadow: { position: 'absolute', left: 0, width: 90, height: 26, borderRadius: 45, backgroundColor: 'rgba(5,52,110,0.28)', borderWidth: 2, borderColor: MM.urgent },
  stumble: { position: 'absolute', borderRadius: 14, backgroundColor: 'rgba(120,132,150,0.45)', borderWidth: 4, borderColor: MM.coral },
  tilt: { transform: [{ perspective: 900 }, { rotateX: '2deg' }] },
  wash: { position: 'absolute', backgroundColor: '#ffffff', borderRadius: 14 },
  warmFlash: { backgroundColor: '#FFF4D6' },
  dizzy: { position: 'absolute', width: 34, height: 34 },
  peekBtn: {
    position: 'absolute', width: 72, height: 58, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 3, borderColor: MM.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  peekArmed: { backgroundColor: MM.gold, borderColor: '#ffffff' },
  peekEmpty: { opacity: 0.5 },
  peekText: { fontFamily: 'Shark', fontSize: 18, color: MM.navyText },
  peekCount: { position: 'absolute', right: -8, top: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: MM.gold, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  peekCountText: { fontFamily: 'Shark', fontSize: 14, color: MM.navyText },
  unlock: { position: 'absolute', left: 40, right: 40, alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 3, borderColor: MM.gold, paddingVertical: 10 },
  unlockKicker: { fontFamily: 'Knockout', fontSize: 14, color: MM.ink, letterSpacing: 1 },
  unlockText: { fontFamily: 'Shark', fontSize: 28, color: MM.navyText },
  tryWrap: { position: 'absolute', left: 36, right: 36, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 22, borderWidth: 3, borderColor: MM.ink, paddingVertical: 16 },
  tryTitle: { fontFamily: 'Shark', fontSize: 36, color: MM.navyText },
  tryPairs: { fontFamily: 'Shark', fontSize: 20, color: MM.coral, marginBottom: 10 },
  tryBtn: { backgroundColor: MM.gold, borderRadius: 16, paddingHorizontal: 36, paddingVertical: 12, borderBottomWidth: 4, borderBottomColor: MM.goldDeep },
  tryBtnText: { fontFamily: 'Shark', fontSize: 24, color: '#075083' },
  tryLeft: { fontFamily: 'Knockout', fontSize: 15, color: MM.navyText, marginTop: 8 },
  tryQuit: { fontFamily: 'Knockout', fontSize: 14, color: MM.ink, marginTop: 8, textDecorationLine: 'underline' },
});
