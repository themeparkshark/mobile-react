/**
 * Current Quest v2 (design v5): "Ride the current. Beat the tide. Find the treasure."
 *
 * A turn-based lagoon puzzle built to be played while walking forward in a
 * queue. Nothing ticks: look up at the line, look back down, and the board is
 * exactly where you left it. A Quick Run is two voyages (Warm-up 5x5, then a
 * 5x7 Treasure board, 6 shells); Trials (Ride Challenge, LinePlay bonus) are
 * three Rookie voyages (9 shells) with life rings that fall only when the
 * stroke budget runs out.
 *
 * Contexts: `quick` (Puzzle profile, practice / queue play), `line` (LinePlay
 * bonus, Trial profile with 3 rings), `ride` (Ride Challenge coin, Trial with
 * 2 rings), `showdown` (Same-Board Showdown vs the house crew). The run is
 * fully deterministic from the seed; the proof v2 in `meta.proof` replays
 * server-side through the same rules (every action is stamped with its
 * engine-apply time, which also decides the free slip undo).
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image as RNImage, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useFont, useImage } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn, FadeOut, runOnJS, useSharedValue, withSequence, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { GameShellV2, type GameResult, type GameShellV2Handle } from '../../gamekit/GameShellV2';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { useCamera } from '../../gamekit/fx/useCamera';
import { useGameClock } from '../../gamekit/useGameClock';
import { useWalkSense } from '../../gamekit/motion/useWalkSense';
import { useGameMusic } from '../../gamekit/audio/useGameMusic';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { nextBarMs } from '../../gamekit/core/audioMix';
import { Haptic, playHaptic, scheduleHaptics } from '../../gamekit/Haptics';
import { gridSteps } from '../../gamekit/core/hapticGrammar';
import { packHex } from '../../gamekit/core/particles';
import { usePerfTier } from '../../gamekit/perf/usePerfTier';
import { TIER_FULL, TIER_NAMES } from '../../gamekit/core/perfTier';
import { useSessionRestore } from '../../gamekit/session/useSessionRestore';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import {
  A_CONTINUE, A_RESTART, A_SPLASH, A_TIP, A_TREAD, A_UNDO,
  applyAction, createRun, currentBoard, heightOf, limitFor, movesToTurn, previewFor, starsFor, starThresholds, strokesLeft,
  tideAt, tipAllowed, tipCostOf, totalShells, treasureOf, shellsToNextStar, TIDE_LOW, simulateStroke,
  type Board, type CqEvent, type CurrentQuestProofV2, type RunState, type VoyageResult,
} from './rules';
import { distanceFrom, firstDeadState, hintFrom, solveBoard } from './solver';
import { boardRefs, isScored, knobsFor, pickRun, voyagesFor, type RunContext } from './library';
import { addGhost, ghostFor, hintOf, loadProgress, saveProgress, type CqProgress, type GhostRun } from './progress';
import { LagoonBoard, runsOf, type BoardImages, type BoardSV, type PreviewSV } from './LagoonBoard';
import {
  idlePlan, newFrame, planDuration, PLAN_BUMP, PLAN_CHEER, PLAN_STROKE, PLAN_TREAD, PLAN_UNDO, PLAN_WHIRL,
  T_ANTIC, T_GRAB, T_TILE, T_TRAVEL, type MotionPlan,
} from './motion';
import { BottomBar, ArrowPad, StallCard, StrokeBar } from './Controls';
import { QuestHud, type HudState } from './QuestHud';
import { GhostRail } from './GhostRail';
import { ShowdownRail, type RailRacer } from './ShowdownRail';
import {
  createBot, HOUSE_CREW, progressOf, placesOf, splashTarget, stepBot, SHOWDOWN_WINDOW_MS,
  type Bot, type RacerProgress,
} from './showdown';
import { boardLayout, cellAt, cellCenter, CQ, type BoardLayout } from './theme';
import { themeSubtitle } from './themeSubtitle';
import {
  bedFor, CQ_PRELOAD, registerCqAudio, sfxAim, sfxAmbience, sfxBeached, sfxBump, sfxButton, sfxCarry, sfxChest, sfxFinalClear,
  sfxGolden, sfxHandoff, sfxLeftover, sfxPearl, sfxRingLost, sfxRingOn, sfxRiptide, sfxShells, sfxSpitOut, sfxStall, sfxSwim,
  sfxTally, sfxTide, sfxTideShort, sfxTip, sfxTransition, sfxTread, sfxUndo, sfxUnlock, sfxWhirlpool, sfxWin, sfxWrongTurn,
} from './audio';
import {
  bannerAt, claimBig, createGovernor, PRI_GOLDEN, PRI_RIPTIDE, PRI_UNLOCK, requestFlash, requestHitStop, requestPunch, requestShake,
} from './fxGovernor';

const BACKDROP = require('../../assets/games/current-quest/backdrop.jpg');
const CROWN = require('../../assets/games/current-quest/crown.png');
const AVATAR_IMG: Record<string, number> = {
  you: require('../../assets/games/current-quest/avatar_classic.png'),
  blue: require('../../assets/games/current-quest/avatar_blue.png'),
  green: require('../../assets/games/current-quest/avatar_green.png'),
  orange: require('../../assets/games/current-quest/avatar_orange.png'),
};

export interface CurrentQuestGameProps {
  visible: boolean;
  seed?: number;
  /** Legacy: the ride name. Never shown (design 10.2); the subtitle comes from `themeId`. */
  taskName?: string;
  themeId?: string;
  context?: RunContext;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
}

const THRESHOLD_STAND = 18;
const THRESHOLD_WALK = 24;
const TIP_IDLE_MS = 8000;
const THIN_IDLE_MS = 6000;
/** 4 bars of the 89 BPM lagoon bed: how long a Riptide surge glows. */
const SURGE_MS = 10780;
const SLOT_NAMES: Record<string, string> = { warmup: 'Warm-up', standard: 'Standard', treasure: 'Treasure' };

interface StallInfo { nearMiss: string | null; hint: boolean; wrong: boolean }

function deriveSeed(base: number, attempt: number): number {
  let h = (base ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

function emptyShells(n: number): boolean[][] { return Array.from({ length: n }, () => [false, false, false]); }

/** Seed for retry `attempt` (1..4) of a run issued with `base` (server mirrors this). */
export { deriveSeed };

/** Which shell to name in the NEXT STAR tease ("Par on the Treasure board"). */
function nextStarTease(run: RunState, needed: number): string | null {
  if (needed <= 0) return null;
  const missing: string[] = [];
  run.results.forEach((r, i) => {
    const slot = SLOT_NAMES[run.boards[i].slot] ?? `voyage ${i + 1}`;
    if (!r.shellPar) missing.push(`Par on the ${slot} board`);
    if (!r.shellGolden) missing.push(`the golden pearl on the ${slot} board`);
  });
  if (!missing.length) return null;
  const first = missing[missing.length - 1];
  return needed === 1 ? `${first[0].toUpperCase()}${first.slice(1)} = next star` : `${needed} more shells, like ${first}`;
}

export default function CurrentQuestGame({ visible, seed, themeId, context: contextProp, onClose, onQuit, onComplete }: CurrentQuestGameProps) {
  const context: RunContext = contextProp ?? (seed != null ? 'line' : 'quick');
  const knobs = knobsFor(context);
  const trial = knobs.profile === 'trial';
  const scored = isScored(context);
  const voyagesN = voyagesFor(context);
  const thresholds = starThresholds(voyagesN);
  const reducedMotion = useReducedGameMotion();
  const movement = useContext(LinePlayMovementContext);
  const shellRef = useRef<GameShellV2Handle>(null);
  const fx = useRef<FxStageHandle>(null);

  // ---- seed, attempt, boards ------------------------------------------------
  const baseSeed = useMemo(() => (seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0), [seed, visible]);
  const [attempt, setAttempt] = useState(0);
  const runSeed = attempt === 0 ? baseSeed : deriveSeed(baseSeed, attempt);
  const [progress, setProgress] = useState<CqProgress | null>(null);
  useEffect(() => { void loadProgress().then(setProgress); }, []);
  const [boardsKey, setBoardsKey] = useState(0);
  const boards = useMemo<Board[] | null>(() => (progress ? pickRun(runSeed, context, hintOf(progress)) : null),
    // Progress is read once per run so a finished run never reshuffles the next boards mid-play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runSeed, context, boardsKey, progress === null]);
  const ghost = useMemo<GhostRun | null>(() => (progress ? ghostFor(progress, runSeed, context) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runSeed, context, progress === null, boardsKey]);

  const sessionKey = `cq:${context}:${runSeed}:${attempt}`;
  const restore = useSessionRestore<{ actions: number[][]; times: number[][]; ready: number[]; elapsed: number }>(visible ? sessionKey : null);

  // ---- engine clocks, camera, walk sense, perf tier -----------------------------
  const clock = useGameClock({ autostart: true, config: { freezeBudget: 0.06 } });
  const walk = useWalkSense({ active: visible });
  const walking = walk.walking || !!movement?.moving;
  const tier = usePerfTier({ active: visible });
  const lite = tier.tierJs !== TIER_FULL;

  // ---- layout (cell = min(width / 5, height / rows, 76); rows change per voyage) --
  const [field, setField] = useState<{ w: number; h: number } | null>(null);
  const [arrows, setArrows] = useState(false);
  const [rowsNow, setRowsNow] = useState(5);
  const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setField((f) => (f && Math.abs(f.w - width) < 1 && Math.abs(f.h - height) < 1 ? f : { w: width, h: height }));
  }, []);
  const showdown = context === 'showdown';
  const layoutFor = useCallback((rows: number): BoardLayout | null => {
    if (!field) return null;
    const rail = showdown ? 46 : ghost ? 42 : 0;
    // Always reserve the walking sizes: walking toggles every few steps and must never re-lay the board.
    const reserved = 58 + 36 + rail + 106 + (arrows ? 68 : 0) + 6;
    return boardLayout(field.w, field.h - reserved, rows);
  }, [field, arrows, showdown, ghost]);
  const layout = useMemo(() => layoutFor(rowsNow), [layoutFor, rowsNow]);
  const layoutRef = useRef<BoardLayout | null>(layout);
  layoutRef.current = layout;

  // ---- art (Alex's originals + the gated GPT Image 2.5 pipeline set) ------------------
  const images: BoardImages = {
    idle: useImage(require('../../assets/games/current-quest/cq_shark_idle_swim.png')),
    dash: useImage(require('../../assets/games/current-quest/cq_shark_swim_dash.png')),
    surf: useImage(require('../../assets/games/current-quest/cq_shark_surf_ride.png')),
    ouch: useImage(require('../../assets/games/current-quest/cq_shark_bump_ouch.png')),
    cheer: useImage(require('../../assets/games/current-quest/cq_shark_cheer.png')),
    coralA: useImage(require('../../assets/games/current-quest/coral_a.png')),
    coralB: useImage(require('../../assets/games/current-quest/coral_b.png')),
    coralC: useImage(require('../../assets/games/current-quest/coral_c.png')),
    sand: useImage(require('../../assets/games/current-quest/sandbar.png')),
    sandWet: useImage(require('../../assets/games/current-quest/sandbar_wet.png')),
    foam: useImage(require('../../assets/games/current-quest/foam_strip.png')),
    pearl: useImage(require('../../assets/games/current-quest/pearl.png')),
    golden: useImage(require('../../assets/games/current-quest/golden_pearl.png')),
    chestClosed: useImage(require('../../assets/games/current-quest/chest_closed.png')),
    chestOpen: useImage(require('../../assets/games/current-quest/chest_open.png')),
    padlock: useImage(require('../../assets/games/current-quest/padlock.png')),
    chevron: useImage(require('../../assets/games/current-quest/current_chevron.png')),
  };
  const imagesReady = Object.values(images).every(Boolean);
  const stableImages = useMemo(() => images,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imagesReady]);
  const font = useFont(require('../../../assets/fonts/shark-random-funnyness-2.ttf'), 40);

  const camera = useCamera({ width: layout?.cw ?? 300, height: layout?.ch ?? 300, timeScale: clock.fxScale, reducedMotion, walking });

  // ---- board shared values ------------------------------------------------------
  const sv: BoardSV = {
    fxT: useSharedValue(0),
    timeScale: clock.fxScale,
    plan: useSharedValue<MotionPlan>(idlePlan(0, 0)),
    shark: useSharedValue(newFrame()),
    tail: useSharedValue(0),
    picks: useSharedValue<number[]>([-1, -1, -1, -1]),
    pickQueue: useSharedValue<number[]>([]),
    tideDrop: useSharedValue(0),
    chest: useSharedValue(0),
    unlockT: useSharedValue(-1e9),
    rattleT: useSharedValue(-1e9),
    armed: useSharedValue(-1),
    previews: useSharedValue<PreviewSV[]>([]),
    surge: useSharedValue(0),
    gridA: useSharedValue(1),
    undoTint: useSharedValue(0),
    breath: useSharedValue(0),
    riseT0: useSharedValue(0),
    banner: useSharedValue({ text: '', t0: -1e9, kind: 0, ms: 0 }),
    hint: useSharedValue<number[]>([]),
    hintT0: useSharedValue(-1e9),
    swirl: useSharedValue(0),
    trail: useSharedValue<number[]>([]),
    flareT: useSharedValue(-1e9),
    flareRun: useSharedValue(-1),
    walking: useSharedValue(0),
    nervous: useSharedValue(0),
    banked: useSharedValue(0),
    bankT: useSharedValue(-1e9),
    recap: useSharedValue<number[]>([]),
    recapPar: useSharedValue<number[]>([]),
    recapT0: useSharedValue(-1e9),
    wrong: useSharedValue<number[]>([]),
    wrongT0: useSharedValue(-1e9),
    sweepT0: useSharedValue(-1e9),
    tourT0: useSharedValue(-1e9),
    idleSince: useSharedValue(0),
    sway: useSharedValue<number[]>([]),
  };
  const svRef = useRef(sv);
  svRef.current = sv;
  useEffect(() => { sv.walking.value = walking ? 1 : 0; }, [walking, sv.walking]);

  // ---- run state ------------------------------------------------------------------
  const runRef = useRef<RunState | null>(null);
  const [voyageIdx, setVoyageIdx] = useState(0);
  const [hud, setHud] = useState<HudState | null>(null);
  const [left, setLeft] = useState(0);
  const [limit, setLimit] = useState(0);
  const [stall, setStall] = useState<StallInfo | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [chip, setChip] = useState<string | null>(null);
  const [ribbon, setRibbon] = useState<{ title: string; sub: string | null; key: number; gold: boolean } | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [tipPulse, setTipPulse] = useState(false);
  const [smallChip, setSmallChip] = useState<{ text: string; tone: 'coral' | 'white'; key: number } | null>(null);
  const [inspect, setInspect] = useState<{ text: string; x: number; y: number } | null>(null);
  const [splitChip, setSplitChip] = useState<{ text: string; good: boolean; key: number } | null>(null);
  const [elapsedNow, setElapsedNow] = useState(0);
  const busyUntil = useRef(0);
  const buffered = useRef<number | null>(null);
  const playing = useRef(false);
  const startedAt = useRef(0);
  const times = useRef<number[][]>(boards ? boards.map(() => []) : [[], [], []]);
  const readyAt = useRef<number[]>([0, 0, 0]);
  const pathStack = useRef<number[][]>([]);
  const pearlStep = useRef(0);
  const swimStep = useRef(0);
  const firstStall = useRef(true);
  const tideTurnsThisVoyage = useRef(0);
  const gov = useRef(createGovernor());
  const strokeNo = useRef(0);
  const lastStrokeAt = useRef(Date.now());
  const misfires = useRef<number[]>([]);
  const lastCommitAt = useRef(0);
  const shellsRef = useRef<boolean[][]>(emptyShells(3));
  const parLostRef = useRef(false);
  const surgeUntil = useRef(0);
  const thinned = useRef(false);
  const scrubbing = useRef(false);
  // Showdown (14.1): house-crew racers, incoming splashes, the 3-minute window.
  const bots = useRef<Bot[]>([]);
  const [racers, setRacers] = useState<RailRacer[]>([]);
  const [sdRemaining, setSdRemaining] = useState(SHOWDOWN_WINDOW_MS);
  const incoming = useRef<{ from: string; readyAt: number }[]>([]);
  const bumps = useRef<Record<number, number>>({});
  const [podium, setPodium] = useState<RailRacer[] | null>(null);
  const finishing = useRef(false);
  const [bed, setBed] = useState<string | null>(null);

  // ---- a tiny scheduler: every delayed beat of a stroke can be fast-forwarded (7.3) --
  interface Pending { id: ReturnType<typeof setTimeout>; at: number; fn: () => void; stroke: number }
  const timers = useRef<Pending[]>([]);
  const later = useCallback((ms: number, fn: () => void) => {
    const at = Date.now() + Math.max(0, ms);
    const p: Pending = { id: setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== p);
      fn();
    }, Math.max(0, ms)), at, fn, stroke: strokeNo.current };
    timers.current.push(p);
    return p.id;
  }, []);
  const cancelHaptics = useRef<(() => void) | null>(null);
  const clearTimers = useCallback(() => {
    timers.current.forEach((p) => clearTimeout(p.id));
    timers.current = [];
    cancelHaptics.current?.();
    cancelHaptics.current = null;
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);
  /** A commit was buffered: play the rest of this stroke's animation and beats at 2x. */
  const fastForward = useCallback(() => {
    const s = svRef.current;
    const p = s.plan.value;
    if (p.t0 >= 0 && p.speed < 2 && (p.kind === PLAN_STROKE || p.kind === PLAN_UNDO)) {
      const now = s.fxT.value;
      s.plan.value = { ...p, speed: p.speed * 2, t0: now - ((now - p.t0) * p.speed) / (p.speed * 2) };
    }
    const now = Date.now();
    const pend = timers.current.filter((x) => x.stroke === strokeNo.current);
    for (const x of pend) {
      clearTimeout(x.id);
      const rest = Math.max(0, (x.at - now) / 2);
      x.at = now + rest;
      x.id = setTimeout(() => {
        timers.current = timers.current.filter((y) => y !== x);
        x.fn();
      }, rest);
    }
    busyUntil.current = now + Math.max(0, (busyUntil.current - now) / 2);
  }, []);

  // ---- audio ------------------------------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    registerCqAudio();
    void GameAudio.init().then(() => GameAudio.preload(CQ_PRELOAD)).catch(() => undefined);
  }, [visible]);
  useGameMusic(visible && bed ? bed : null, { at: 'bar', fadeMs: 350 });
  const setBedFor = useCallback((run: RunState) => {
    const b = currentBoard(run);
    const v = run.voyage;
    const low = tideAt(b.P, v.moves, v.phase) === TIDE_LOW;
    const next = bedFor(low, strokesLeft(run), Date.now() < surgeUntil.current, thinned.current);
    setBed((cur) => {
      if (cur && cur !== next) {
        // Stem layers of one mix keep their position.
        void GameAudio.music.switchTo(next, 'bar', 350, true);
        return next;
      }
      return cur ?? next;
    });
  }, []);
  // Ambient lagoon bed (-30 LUFS) under everything from GO to results; it carries a pause too.
  useEffect(() => {
    if (!visible) return undefined;
    let stop = false;
    const loop = () => { if (!stop) sfxAmbience(); };
    const first = setTimeout(loop, 600);
    const id = setInterval(loop, 19800);
    return () => { stop = true; clearTimeout(first); clearInterval(id); };
  }, [visible]);

  // ---- helpers: geometry --------------------------------------------------------------
  const center = useCallback((i: number) => {
    const l = layoutRef.current;
    return l ? cellCenter(l, i) : { x: 0, y: 0 };
  }, []);
  const boardOrigin = useRef({ x: 0, y: 0 });
  const toField = useCallback((x: number, y: number) => ({ x: x + boardOrigin.current.x, y: y + boardOrigin.current.y }), []);
  const cellPx = () => layoutRef.current?.cell ?? 60;

  // ---- HUD sync ---------------------------------------------------------------------------
  const syncHud = useCallback((run: RunState) => {
    const b = currentBoard(run);
    const v = run.voyage;
    let taken = 0;
    for (let k = 0; k < b.pearls.length; k++) if (v.mask & (1 << k)) taken++;
    parLostRef.current = v.undos > 0 || v.tips > 0 || v.continues > 0;
    setHud({
      voyage: run.complete ? run.boards.length - 1 : run.index,
      pearls: b.pearls.length,
      pearlsTaken: taken,
      hasGolden: b.golden >= 0,
      goldenTaken: v.golden,
      shells: shellsRef.current.map((s) => s.slice()),
      voyages: run.boards.length,
      ripCount: v.ripStrokes,
      riptide: Date.now() < surgeUntil.current,
      parLost: parLostRef.current,
      hasTide: b.P > 0,
      tideLow: tideAt(b.P, v.moves, v.phase) === TIDE_LOW,
      movesToTurn: movesToTurn(b.P, v.moves, v.phase),
      rings: run.rings,
      ringsMax: knobs.rings,
      trial,
    });
    setLeft(strokesLeft(run));
    setLimit(limitFor(b, run.knobs) + v.limitBonus);
  }, [knobs.rings, trial]);

  const tideDropFor = (b: Board, moves: number, phase: number) => {
    if (!b.P) return 0;
    const k = (moves + phase) % b.P;
    const low = tideAt(b.P, moves, phase) === TIDE_LOW;
    // Countdown in the water: the level creeps 2 px per move toward the next state.
    return low ? 8 - 2 * Math.min(3, k) : 2 * Math.min(3, k);
  };

  /** Board visual state straight from the engine (after undo, restart, restore). */
  const syncBoardVisuals = useCallback((run: RunState, animateTide = true) => {
    const s = svRef.current;
    const b = currentBoard(run);
    const v = run.voyage;
    const picks = [-1, -1, -1, -1];
    let banked = 0;
    for (let k = 0; k < b.pearls.length; k++) if (v.mask & (1 << k)) { picks[k] = -1e9; banked++; }
    if (b.golden >= 0 && v.golden) picks[b.pearls.length] = -1e9;
    s.picks.value = picks;
    s.pickQueue.value = [];
    s.banked.value = banked;
    s.chest.value = v.mask === (1 << b.pearls.length) - 1 ? 1 : 0;
    const drop = tideDropFor(b, v.moves, v.phase);
    s.tideDrop.value = animateTide ? withTiming(drop, { duration: 650 }) : drop;
    s.nervous.value = strokesLeft(run) <= 2 && !v.cleared ? 1 : 0;
  }, []);

  // ---- previews (7.2) ------------------------------------------------------------------------
  const refreshPreviews = useCallback((run: RunState) => {
    if (!layoutRef.current) return;
    const b = currentBoard(run);
    const v = run.voyage;
    const leftNow = strokesLeft(run);
    const out: PreviewSV[] = [];
    for (let a = 0; a <= 4; a++) {
      const pv = previewFor(run, a);
      if (!pv.valid) { out.push({ valid: 0, red: 0, pts: [], lx: 0, ly: 0, facing: 1, rot: 0, beached: 0, clears: 0, rip: 0, icons: [] }); continue; }
      let red = 0;
      if (leftNow <= 1 && !pv.clears) {
        // Last stroke: the solver on the landing copy says whether this one can still get home.
        const tide = tideAt(b.P, v.moves, v.phase);
        const sim = simulateStroke(b, v.pos, v.mask, v.golden, tide, a === A_TREAD ? -1 : a);
        const d = distanceFrom(b, { pos: sim.pos, mask: sim.mask, golden: sim.golden, moves: v.moves + 1, phase: v.phase }, false);
        if (!(d <= leftNow - 1)) red = 1;
      }
      const pts: number[] = [];
      for (const c of pv.path) { const p = center(c); pts.push(p.x, p.y); }
      const land = center(pv.path[pv.path.length - 1]);
      const prev = center(pv.path[Math.max(0, pv.path.length - 2)]);
      const dx = land.x - prev.x;
      const dy = land.y - prev.y;
      const facing = Math.abs(dx) > 0.5 ? (dx > 0 ? 1 : -1) : svRef.current.plan.value.facing || 1;
      const rot = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? -0.61 : 0.61) * facing : 0;
      const icons: number[] = [];
      pv.pearlAt.forEach((at, k) => {
        const c = center(pv.path[at]);
        const golden = pv.golden && k === pv.pearlAt.length - 1;
        icons.push(c.x, c.y, golden ? 1 : 0);
      });
      if (pv.unlockAt >= 0) { const c = center(pv.path[pv.unlockAt]); icons.push(c.x + cellPx() * 0.22, c.y, 3); }
      if (pv.tideTurns) icons.push(land.x - cellPx() * 0.24, land.y + cellPx() * 0.1, 2);
      out.push({ valid: 1, red, pts, lx: land.x, ly: land.y, facing, rot, beached: pv.beached ? 1 : 0, clears: pv.clears ? 1 : 0, rip: pv.riptide ? 1 : 0, icons: icons.slice(0, 15) });
    }
    svRef.current.previews.value = out;
  }, [center]);

  const chipFor = useCallback((a: number): string | null => {
    const run = runRef.current;
    if (!run || a < 0) return null;
    const pv = previewFor(run, a);
    if (!pv.valid) {
      if (a === A_TREAD) return null;
      return pv.bump === 'upstream' ? 'Against the current' : pv.bump === 'locked' ? 'Chest is locked' : pv.bump === 'dry' ? 'Sandbar is dry' : null;
    }
    const prevs = svRef.current.previews.value;
    if (prevs[a]?.red) return 'No way home';
    if (a === A_TREAD) return pv.tideTurns ? 'Tread: 1 stroke, tide turns' : 'Tread: 1 stroke';
    if (pv.riptide) return 'RIPTIDE!';
    if (pv.clears) return 'Treasure!';
    if (pv.tideTurns) return 'Tide turns';
    return null;
  }, []);

  // ---- starting a voyage ---------------------------------------------------------------------
  const showRibbon = useCallback((run: RunState) => {
    const b = currentBoard(run);
    const gold = b.slot === 'treasure';
    setRibbon({ title: `${SLOT_NAMES[b.slot] ?? 'Voyage'}: ${b.name}`, sub: b.teach ?? null, key: Date.now(), gold });
    later(b.teach ? 2600 : 900, () => setRibbon(null));
  }, [later]);

  const beginVoyage = useCallback((run: RunState, rise: boolean) => {
    const s = svRef.current;
    const b = currentBoard(run);
    const H = heightOf(b);
    // Lay the new board out now so every position below uses its rows.
    layoutRef.current = layoutFor(H);
    setRowsNow(H);
    const start = center(b.start);
    s.plan.value = { ...idlePlan(start.x, start.y, 1), t0: -1 };
    s.trail.value = [];
    s.hint.value = [];
    s.swirl.value = 0;
    s.gridA.value = 1;
    s.undoTint.value = 0;
    s.wrong.value = [];
    s.recap.value = [];
    s.recapPar.value = [];
    s.sway.value = [];
    if (rise) s.riseT0.value = s.fxT.value;
    // Glance tour (500 ms, no camera move): chest glint, golden sparkle, shark ring. Any input skips it.
    s.tourT0.value = s.fxT.value + (rise ? 480 : 80);
    s.idleSince.value = s.fxT.value;
    syncBoardVisuals(run, false);
    pathStack.current = [];
    pearlStep.current = 0;
    swimStep.current = 0;
    firstStall.current = true;
    tideTurnsThisVoyage.current = 0;
    setStall(null);
    syncHud(run);
    refreshPreviews(run);
    setBedFor(run);
    showRibbon(run);
    readyAt.current[run.index] = Math.max(0, Date.now() + (rise ? 720 : 0) - startedAt.current);
    // Input is live from the first frame (the rise is only 0.4 s and buffered commits wait for it).
    busyUntil.current = Date.now() + (rise ? 420 : 0);
    lastStrokeAt.current = Date.now();
  }, [center, layoutFor, syncBoardVisuals, syncHud, refreshPreviews, setBedFor, showRibbon]);

  // New run whenever the boards change (fresh open, play again, retry).
  useEffect(() => {
    if (!visible || !boards || !field || !restore.ready) return;
    clearTimers();
    finishing.current = false;
    shellsRef.current = emptyShells(boards.length);
    times.current = boards.map(() => []);
    readyAt.current = boards.map(() => 0);
    surgeUntil.current = 0;
    svRef.current.surge.value = 0;
    setResult(null);
    setFailed(false);
    let run = createRun(boards, knobs);
    // Interrupted run on this exact seed: replay its actions with their times (deterministic, exact restore).
    const snap = restore.snapshot?.state;
    if (snap && Array.isArray(snap.actions)) {
      for (let vi = 0; vi < snap.actions.length; vi++) {
        snap.actions[vi].forEach((a, k) => {
          const res = applyAction(run, a, snap.times?.[vi]?.[k]);
          if (res.ok) {
            run = res.run;
            for (const ev of res.events) if (ev.type === 'clear') {
              shellsRef.current[ev.index] = [ev.result.shellClear, ev.result.shellPar, ev.result.shellGolden];
            }
          }
        });
      }
      times.current = snap.times.map((t) => t.slice());
      readyAt.current = snap.ready.slice();
      startedAt.current = Date.now() - (snap.elapsed ?? 0);
    }
    runRef.current = run;
    if (context === 'showdown') {
      bots.current = HOUSE_CREW.map((seat) => createBot(runSeed, seat, boards, 0));
      incoming.current = [];
      bumps.current = {};
      setPodium(null);
      setSdRemaining(SHOWDOWN_WINDOW_MS);
    }
    setVoyageIdx(run.index);
    beginVoyage(run, true);
    if (run.voyage.strokes > 0 || run.voyage.spent > 0) {
      const p = center(run.voyage.pos);
      svRef.current.plan.value = { ...idlePlan(p.x, p.y, 1), beached: run.voyage.beached ? 1 : 0, t0: -1 };
      syncBoardVisuals(run, false);
      syncHud(run);
      refreshPreviews(run);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, boards, field !== null, restore.ready]);

  // Board layout follows the field (rotation, arrows toggle, walking targets).
  useEffect(() => {
    const run = runRef.current;
    if (!run || !layout) return;
    layoutRef.current = layout;
    const p = center(run.voyage.pos);
    const s = svRef.current;
    if (s.plan.value.kind === 0) s.plan.value = { ...idlePlan(p.x, p.y, s.plan.value.facing || 1), beached: run.voyage.beached ? 1 : 0, t0: -1 };
    refreshPreviews(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // ---- FX helpers ---------------------------------------------------------------------------------
  const burst = useCallback((name: Parameters<FxStageHandle['burst']>[0], cell: number, params?: Parameters<FxStageHandle['burst']>[3], dy = 0) => {
    const c = center(cell);
    const p = toField(c.x, c.y + dy);
    fx.current?.burst(name, p.x, p.y, params);
  }, [center, toField]);

  const banner = useCallback((text: string, priority: number, kind = 0, ms = 700) => {
    const now = Date.now();
    const at = bannerAt(gov.current, now, priority);
    later(at - now, () => {
      svRef.current.banner.value = { text, t0: svRef.current.fxT.value, kind, ms };
    });
  }, [later]);

  /** Coral next to any of these cells sways (adjacent carry: small impulse; bump: bigger). */
  const swayNear = useCallback((b: Board, cells: number[], atMs: number) => {
    const s = svRef.current;
    const hits: number[] = [];
    const n = b.tiles.length;
    for (let i = 0; i < n; i++) {
      if (b.tiles[i] !== '#') continue;
      if (cells.some((c) => c >= 0 && Math.abs((c % 5) - (i % 5)) + Math.abs(Math.floor(c / 5) - Math.floor(i / 5)) === 1)) hits.push(i, s.fxT.value + atMs);
    }
    if (hits.length) s.sway.value = [...s.sway.value.slice(-16), ...hits];
  }, []);

  // ---- stroke presentation ----------------------------------------------------------------------------
  const tAtPath = (i: number, wasBeached: boolean) => {
    const w = wasBeached ? 120 : 0;
    if (i <= 0) return w;
    if (i === 1) return w + T_ANTIC + T_TRAVEL;
    return w + T_ANTIC + T_TRAVEL + T_GRAB + T_TILE * (i - 1);
  };

  const presentStroke = useCallback((run: RunState, ev: Extract<CqEvent, { type: 'stroke' }>, allEvents: CqEvent[]) => {
    const s = svRef.current;
    const b = currentBoard(runRef.current ?? run);
    strokeNo.current += 1;
    const sn = strokeNo.current;
    const pts: number[] = [];
    for (const c of ev.path) { const p = center(c); pts.push(p.x, p.y); }
    const facing = s.plan.value.facing || 1;
    const clearEv = allEvents.find((e) => e.type === 'clear') as Extract<CqEvent, { type: 'clear' }> | undefined;
    const plan: MotionPlan = {
      kind: ev.dir < 0 ? PLAN_TREAD : PLAN_STROKE, t0: -1, pts, carry: ev.carried, facing, dive: ev.cleared ? 1 : 0,
      beached: ev.beached ? 1 : 0, wasBeached: ev.wasBeached && ev.dir >= 0 ? 1 : 0, bx: 0, by: 0, speed: 1, rip: ev.riptide ? 1 : 0,
    };
    // Pickups vanish on the UI thread the moment the shark reaches them.
    const q: number[] = [];
    for (const p of ev.pearls) q.push(p.at, p.k);
    if (ev.golden) q.push(ev.goldenAt, b.pearls.length);
    s.pickQueue.value = q;
    s.plan.value = plan;
    if (ev.dir >= 0) pathStack.current.push(ev.path.slice());
    const dur = planDuration(plan);
    const endMove = dur - (plan.dive ? 260 : 0) - (plan.beached ? 160 : 0);
    const wb = !!plan.wasBeached;
    const endAt = ev.carried > 0 ? tAtPath(ev.path.length - 1, wb) : tAtPath(1, wb);
    const cell = cellPx();

    // Sound: one trigger per beat.
    if (ev.dir < 0) {
      sfxTread();
      burst('bubbles', ev.path[0], { count: 8 });
      Haptic.tapLight();
    } else if (ev.carried > 0) {
      sfxSwim(swimStep.current++ % 5);
      const carryStart = tAtPath(1, wb);
      later(carryStart - 10, () => sfxCarry(ev.carried, ev.riptide));
      cancelHaptics.current?.();
      const steps = [{ at: 0, p: 'light' as const }, ...gridSteps(Math.min(3, ev.carried), carryStart + T_GRAB, T_TILE, 'selection')];
      if (ev.carried > 3) steps.push(...gridSteps(ev.carried - 3, carryStart + T_GRAB + T_TILE * 3, T_TILE, 'light', 'selection'));
      for (const h of ev.handoffs) steps.push({ at: tAtPath(h, wb), p: 'light' as const });
      steps.push({ at: endAt + 40, p: 'medium' as const });
      cancelHaptics.current = scheduleHaptics(steps);
      // Current flare + grid fade + camera lead (+2% zoom toward the landing on 3+ tiles).
      const runs = runsOf(b, null);
      const runIdx = runs.findIndex((r) => r.cells.includes(ev.path[1]));
      later(carryStart, () => {
        s.flareRun.value = runIdx;
        s.flareT.value = s.fxT.value;
        s.gridA.value = withTiming(0, { duration: 200 });
        const d = dirBetween(ev.path[1], ev.path[2] ?? ev.path[1]);
        if (!reducedMotion && !lite) {
          camera.kick([0, 6, 0, -6][d] ?? 0, [-6, 0, 6, 0][d] ?? 0);
          if (ev.carried >= 3) camera.frame(1.02);
        }
      });
      for (let k = 2; k < ev.path.length; k++) {
        later(tAtPath(k, wb), () => burst(ev.riptide ? 'sparks' : 'bubbles', ev.path[k], ev.riptide ? { count: reducedMotion ? 2 : 6, color: packHex(CQ.gold) } : { count: reducedMotion ? 2 : 4 }));
      }
      for (const h of ev.handoffs) {
        // Riptide hand-off between runs: a gold foam burst and a whoosh.
        later(tAtPath(h, wb), () => { burst('splash', ev.path[h], { count: reducedMotion ? 3 : 8, color: packHex(CQ.gold) }); sfxHandoff(); });
      }
      swayNear(b, ev.path.slice(1), carryStart);
      later(endAt + 40, () => {
        burst('splash', ev.path[ev.path.length - 1], { count: reducedMotion ? 4 : 8 });
        const d = dirBetween(ev.path[ev.path.length - 2], ev.path[ev.path.length - 1]);
        if (!reducedMotion) camera.kick([0, -2, 0, 2][d] ?? 0, [2, 0, -2, 0][d] ?? 0);
        if (!reducedMotion && !lite && ev.carried >= 3) later(200, () => camera.frame(1));
        s.gridA.value = withTiming(1, { duration: 300 });
      });
    } else {
      sfxSwim(swimStep.current++ % 5);
      scheduleHaptics([{ at: 0, p: 'light' }, { at: endAt, p: 'light' }]);
      later(T_ANTIC + 20, () => burst('bubbles', ev.path[0], { count: 3 }));
      later(endAt, () => {
        const c = center(ev.path[ev.path.length - 1]);
        const p = toField(c.x, c.y + 6);
        fx.current?.ring(p.x, p.y, { color: '#ffffff', from: 6, to: cell * 0.45, ms: 260 });
      });
    }

    // Pearls: sparkle where taken (sucked into the wake), bank together on landing (Hades magnetism).
    for (const p of ev.pearls) {
      const at = tAtPath(p.at, wb);
      later(at, () => {
        burst('sparkles', p.cell, { count: reducedMotion ? 4 : 6 });
        sfxPearl(pearlStep.current++, 0);
        Haptic.tickSelection();
      });
    }
    if (ev.pearls.length) {
      later(endAt + 30, () => {
        Haptic.hitMedium();
        const last = ev.path[ev.path.length - 1];
        for (let k = 0; k < ev.pearls.length; k++) {
          later(k * 60, () => {
            const c = center(last);
            const p = toField(c.x, c.y);
            fx.current?.burst('glints', p.x, p.y, { count: 10, tx: 30 + k * 24, ty: 26, magnetDelay: 0.05, magnetDur: 0.38 });
          });
        }
        const r = runRef.current;
        if (r) {
          let banked = 0;
          for (let k = 0; k < b.pearls.length; k++) if (r.voyage.mask & (1 << k)) banked++;
          if (r.index === run.index) { s.banked.value = banked; s.bankT.value = s.fxT.value; }
          syncHud(r);
        }
      });
    }

    // Golden pearl (9.9): the one hit-stop of the stroke, at the END of the movement.
    if (ev.golden) {
      const lastVoyage = run.complete && run.index === run.boards.length - 1;
      const priorAll = shellsRef.current.slice(0, run.boards.length - 1).every((x) => x.every(Boolean));
      const fever = lastVoyage && priorAll && clearEv?.result.shellPar;
      if (fever && !reducedMotion) {
        // Extreme Fever (Peggle): the rarest moment gets the biggest beat.
        later(Math.max(0, endAt - T_TILE), () => { clock.slowMo(0.35, 250, 120); camera.frame(1.06); });
        later(endAt + 380, () => camera.frame(1));
      }
      later(endAt, () => {
        const now = Date.now();
        const big = claimBig(gov.current, sn, PRI_GOLDEN);
        if (big && requestHitStop(gov.current, sn)) clock.hitStop(90, { force: true });
        sfxGolden();
        if (fever) sfxWin();
        playHaptic('golden');
        burst('coins', ev.path[ev.goldenAt], { count: reducedMotion ? 6 : 18, color: packHex(CQ.gold) });
        burst('stars', ev.path[ev.goldenAt], { count: reducedMotion ? 3 : 6 });
        const c = center(ev.path[ev.goldenAt]);
        const fp = toField(c.x, c.y);
        fx.current?.ring(fp.x, fp.y, { color: CQ.gold, from: 8, to: cell * 1.6, ms: 320 });
        const alpha = requestFlash(gov.current, now, 0.18);
        if (alpha > 0) fx.current?.bloom(fp.x, fp.y, { radius: cell * 1.8, peak: alpha, ms: 120, color: '#ffffff' });
        if (big && !reducedMotion && requestPunch(gov.current, now)) camera.punch(0.035, 90);
        banner(fever ? 'EXTREME FEVER!' : 'GOLDEN!', PRI_GOLDEN, 0, 500);
        const r = runRef.current;
        if (r) syncHud(r);
      });
    }

    // Unlock (9.9): padlock shakes and breaks into its own shards, the lid peeks open.
    if (ev.unlocked) {
      const at = tAtPath(ev.unlockedAt, wb) + 60;
      later(at, () => {
        claimBig(gov.current, sn, PRI_UNLOCK);
        s.chest.value = 1;
        s.unlockT.value = s.fxT.value;
        sfxUnlock();
        scheduleHaptics([{ at: 0, p: 'medium' }, { at: 70, p: 'medium' }]);
        burst('shards', b.chest, { count: reducedMotion ? 2 : 4, color: packHex(CQ.gold) }, -cell * 0.3);
        const c = center(b.chest);
        const fp = toField(c.x, c.y - 10);
        fx.current?.ring(fp.x, fp.y, { color: CQ.gold, from: 10, to: cell * 0.9, ms: 400 });
      });
    }

    // Riptide stroke (3.6, 9.3): banner after the spit-out, gold sparks, 4 bars of surge.
    if (ev.riptide) {
      later(endAt + 60, () => {
        const big = claimBig(gov.current, sn, PRI_RIPTIDE);
        sfxRiptide();
        playHaptic('feverStart');
        surgeUntil.current = Date.now() + SURGE_MS;
        s.surge.value = withSequence(withTiming(1, { duration: 200 }), withTiming(1, { duration: SURGE_MS - 600 }), withTiming(0, { duration: 400 }));
        if (big) banner('RIPTIDE!', PRI_RIPTIDE, 0, 650);
        burst('stars', ev.path[ev.path.length - 1], { count: reducedMotion ? 4 : 16, color: packHex(CQ.gold) });
        const r = runRef.current;
        if (r) { syncHud(r); setBedFor(r); }
        later(SURGE_MS + 50, () => { const r2 = runRef.current; if (r2) { syncHud(r2); setBedFor(r2); } });
      });
    }

    // Tide turn (9.6), non-blocking. Full sweep on the voyage's first turn, compact after.
    if (!ev.cleared && b.P) {
      later(endMove + 20, () => {
        const r = runRef.current;
        if (!r || r.index !== run.index) return;
        syncBoardVisuals(r);
        if (ev.tideAfter !== ev.tideBefore) {
          const full = tideTurnsThisVoyage.current === 0;
          tideTurnsThisVoyage.current += 1;
          const toLow = ev.tideAfter === TIDE_LOW;
          if (full) {
            s.sweepT0.value = s.fxT.value;
            sfxTide();
            Haptic.hitSoft();
            banner(toLow ? 'LOW TIDE' : 'HIGH TIDE', 1, 2, 520);
          } else {
            sfxTideShort();
            Haptic.tickSelection();
          }
          const n = b.tiles.length;
          for (let i = 0; i < n; i++) {
            if (b.tiles[i] !== 's') continue;
            const delay = full ? Math.abs(i % 5) * 30 : 0;
            later(delay, () => burst(toLow ? 'splash' : 'bubbles', i, { count: reducedMotion ? 3 : full ? (toLow ? 10 : 6) : 4 }));
          }
        } else if (movesToTurn(b.P, r.voyage.moves, r.voyage.phase) === 1) {
          Haptic.tickSelection();
        }
        setBedFor(r);
      });
    }
    if (ev.beached) later(endMove + 40, () => { sfxBeached(); Haptic.hitSoft(); burst('puff', ev.path[ev.path.length - 1], { count: 6 }); });

    // Low strokes escalation (6): coral at 3 left, nervous idle + tom heartbeat at 2.
    later(endAt, () => {
      const r = runRef.current;
      if (!r) return;
      s.nervous.value = ev.left <= 2 && !ev.cleared ? 1 : 0;
      syncHud(r);
      setBedFor(r);
    });

    return { dur, endAt, endMove, clearEv };
  }, [center, toField, burst, later, reducedMotion, lite, camera, clock, banner, syncHud, syncBoardVisuals, setBedFor, swayNear]);

  // ---- Showdown -------------------------------------------------------------------------------------------
  const allProgress = (): { seat: number; p: RacerProgress }[] => {
    const r = runRef.current;
    const list: { seat: number; p: RacerProgress }[] = [];
    if (r) list.push({ seat: 0, p: progressOf(r, times.current.flat()) });
    for (const b of bots.current) list.push({ seat: b.seat.seat, p: progressOf(b.run, b.times) });
    return list;
  };
  const refreshRail = () => {
    const r = runRef.current;
    if (!r) return undefined;
    const list = [
      { seat: 0, name: 'You', avatar: 'you' as const, you: true, p: progressOf(r, times.current.flat()), shield: r.voyage.shield },
      ...bots.current.map((b) => ({ seat: b.seat.seat, name: b.seat.name, avatar: b.seat.avatar, you: false, p: progressOf(b.run, b.times), shield: b.run.voyage.shield })),
    ];
    const places = placesOf(list);
    const rail = list.map((x, i) => ({
      seat: x.seat, name: x.name, avatar: x.avatar, you: x.you, cleared: x.p.voyagesCleared, shells: x.p.shells, strokes: x.p.strokes,
      finished: x.p.finished, shield: x.shield, bump: bumps.current[x.seat] ?? 0, place: places[i],
    }));
    setRacers(rail);
    return rail;
  };
  const sendPlayerSplash = () => {
    const target = splashTarget(allProgress(), 0);
    const b = bots.current.find((x) => x.seat.seat === target);
    if (!b) return;
    b.inbox += 1;
    setToast({ text: `Par clear! Splash sent to ${b.seat.name}`, key: Date.now() });
    sfxTide();
  };
  const finishShowdown = (run: RunState) => {
    if (finishing.current && podium) return;
    finishing.current = true;
    const now = Date.now() - startedAt.current;
    // Results land when everyone is done: the crew is deterministic, so play them out to the window.
    for (const b of bots.current) for (let t = Math.min(now, SHOWDOWN_WINDOW_MS); t <= SHOWDOWN_WINDOW_MS && !b.run.complete; t += 250) stepBot(b, t);
    const rail = refreshRail() ?? [];
    const ordered = [...rail].sort((a, b) => a.place - b.place || (a.you ? -1 : 1));
    setPodium(ordered);
    const me = rail.find((x) => x.you);
    const place = me?.place ?? 4;
    const done = run.complete;
    const shells = totalShells(run.results);
    const stars = !done ? 0 : place === 1 ? 3 : place === 2 ? 2 : 1;
    const s = svRef.current;
    if (done && place === 1) {
      sfxFinalClear();
      playHaptic('winRoll');
      banner(rail.filter((x) => x.place === 1).length > 1 ? 'SHARED CROWN!' : '1ST PLACE!', PRI_GOLDEN, 0, 1100);
      burst('confetti', currentBoard(run).chest, { count: reducedMotion ? 8 : 30 }, -cellPx());
    } else {
      sfxChest();
      Haptic.success();
      banner(done ? `${['1ST', '2ND', '3RD', '4TH'][place - 1]} PLACE` : 'OUT OF TIME', PRI_GOLDEN, done ? 0 : 1, 1000);
    }
    const p = s.shark.value;
    s.plan.value = { ...idlePlan(p.x, p.y, p.facing), kind: PLAN_CHEER, t0: -1 };
    const tr = treasureOf(run.results);
    const proof: CurrentQuestProofV2 = {
      game: 'current', v: 2, context, profile: knobs.profile, rings: 0, seed: runSeed, treasure: tr, stars: starsFor(shells, done, run.boards.length), shells,
      elapsed_ms: now,
      voyages: boardRefs(run.boards).map((ref, i) => ({ id: ref.id, tf: ref.tf, a: run.actions[i].slice(), t: times.current[i].slice(), ready: readyAt.current[i] })),
    };
    later(3200, () => {
      setPodium(null);
      setResult({
        score: shells,
        stars,
        thresholds,
        message: done ? (place === 1 ? 'Showdown won!' : `${['1st', '2nd', '3rd', '4th'][place - 1]} place`) : 'Out of time',
        stats: [
          { label: 'Place', value: `${place} of ${rail.length}` },
          { label: 'Shells', value: `${shells}/${run.boards.length * 3}` },
          { label: 'Strokes', value: String(me?.strokes ?? 0) },
        ],
        meta: { proof, showdown: { place, racers: ordered.map((x) => ({ name: x.name, shells: x.shells, strokes: x.strokes, finished: x.finished, place: x.place })) }, seed: runSeed, context, v: 2, perf_tier: TIER_NAMES[tier.tierJs] },
      });
    });
  };
  const finishShowdownRef = useRef(finishShowdown);
  finishShowdownRef.current = finishShowdown;

  useEffect(() => {
    if (!showdown || !visible) return undefined;
    const id = setInterval(() => {
      if (!playing.current || finishing.current) return;
      const now = Date.now() - startedAt.current;
      setSdRemaining(SHOWDOWN_WINDOW_MS - now);
      let changed = false;
      for (const b of bots.current) {
        for (const e of stepBot(b, now)) {
          changed = true;
          if (e.type === 'clear' || e.type === 'finish') {
            bumps.current[e.seat] = Date.now();
            Haptic.tickSelection();
            setToast({ text: `${b.seat.name} cleared the ${e.type === 'finish' ? 'Treasure' : 'Standard'}!`, key: Date.now() });
            if (e.par) {
              const target = splashTarget(allProgress(), e.seat);
              if (target === 0) {
                incoming.current.push({ from: b.seat.name, readyAt: Date.now() + 1500 });
                banner(`SPLASH from ${b.seat.name}!`, PRI_RIPTIDE, 1, 1300);
                playHaptic('incoming');
                sfxTide();
              } else {
                const t = bots.current.find((x) => x.seat.seat === target);
                if (t) t.inbox += 1;
              }
            }
          }
        }
      }
      if (changed) refreshRail();
      const r = runRef.current;
      const inc = incoming.current[0];
      if (inc && r && Date.now() >= inc.readyAt && Date.now() >= busyUntil.current && svRef.current.armed.value < 0 && !r.voyage.stalled && !r.complete) {
        incoming.current.shift();
        applyNowRef.current(A_SPLASH);
      }
      if (now >= SHOWDOWN_WINDOW_MS && r && !r.complete) finishShowdownRef.current(r);
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showdown, visible]);

  // ---- clears, stall, fail, finish -------------------------------------------------------------------
  const finishRun = useCallback((run: RunState, lastResult: VoyageResult) => {
    finishing.current = true;
    const n = run.boards.length;
    const shells = totalShells(run.results);
    const stars = starsFor(shells, true, n);
    const tr = treasureOf(run.results);
    const s = svRef.current;
    const b = currentBoard(run);
    const cell = cellPx();
    sfxFinalClear();
    Haptic.success();
    const chestC = center(b.chest);
    s.chest.value = 2;
    // Finale scaled by stars (9.8). 2+ stars: leftover-stroke payout (Sugar Crush).
    const leftover = Math.max(0, lastResult.limit - lastResult.spent);
    burst('coins', b.chest, { count: reducedMotion ? 8 : stars >= 3 ? 26 : stars >= 2 ? 20 : 12 }, -cell * 0.3);
    if (stars >= 2 && leftover > 0) later(500, () => { sfxLeftover(Math.min(10, leftover)); scheduleHaptics(gridSteps(Math.min(10, leftover), 0, 90, 'selection')); });
    s.plan.value = { ...idlePlan(chestC.x, chestC.y - cell * 0.35, 1), kind: PLAN_CHEER, t0: -1 };
    s.breath.value = withSequence(withTiming(0.06, { duration: 250 }), withTiming(0, { duration: 250 }));
    if (stars >= 3) {
      later(300, () => {
        banner('TIDE MASTER', PRI_GOLDEN, 0, 900);
        burst('confetti', b.chest, { count: reducedMotion ? 8 : 30 }, -cell);
        if (!reducedMotion) camera.punch(0.04, 120);
        sfxWin();
      });
    } else {
      banner(stars >= 2 ? 'TREASURE!' : 'CLEARED!', PRI_GOLDEN, 0, 700);
    }
    const elapsed = Date.now() - startedAt.current;
    const proof: CurrentQuestProofV2 = {
      game: 'current', v: 2, context, profile: knobs.profile, rings: knobs.rings, seed: runSeed, attempt,
      treasure: tr, stars, shells, elapsed_ms: elapsed,
      voyages: boardRefs(run.boards).map((ref, i) => ({ id: ref.id, tf: ref.tf, a: run.actions[i].slice(), t: times.current[i].slice(), ready: readyAt.current[i] })),
    };
    const strokes = run.results.map((r) => r.strokes);
    const clearAt = times.current.map((t) => t[t.length - 1] ?? 0);
    void saveProgress((p) => {
      const tideMet = p.tideSeen || run.boards.some((x) => x.P > 0);
      const sketches = [...new Set([...p.sketches, ...run.results.filter((r) => r.shells === 3).map((r) => r.boardId.split('~')[0])])].slice(-400);
      return addGhost({ ...p, runsCompleted: p.runsCompleted + 1, tideSeen: tideMet, bestShells: Math.max(p.bestShells, shells), sketches },
        { seed: runSeed, context, shells, strokes, clearAt, at: Date.now() });
    }).then(setProgress);
    const nextStar = shellsToNextStar(shells, n);
    const tease = nextStarTease(run, nextStar);
    later(stars >= 3 ? 2400 : stars >= 2 ? 1900 : 1400, () => {
      sfxTally(shells);
      setResult({
        // Shells are the headline (design 3.5); treasure is only a small tiebreak line.
        score: shells,
        stars,
        thresholds,
        message: shells >= n * 3 ? `Tide Master! ${shells} of ${n * 3} shells` : `${shells} of ${n * 3} shells`,
        rival: ghost ? { name: 'your ghost', score: ghost.shells } : null,
        stats: [
          ...(tease ? [{ label: 'Next star', value: tease }] : []),
          { label: 'Strokes', value: String(strokes.reduce((a, x) => a + x, 0)) },
          { label: 'Treasure', value: tr.toLocaleString('en-US') },
        ],
        meta: { proof, score: tr, shells, stars, seed: runSeed, context, attempt, v: 2, perf_tier: TIER_NAMES[tier.tierJs] },
      });
    });
  }, [center, burst, later, reducedMotion, camera, banner, context, knobs.profile, knobs.rings, runSeed, attempt, ghost, thresholds, tier.tierJs]);

  /** Route recap (missed Par, unscored contexts): your route as INK dots, the par route as a gold brush. */
  const showRecap = useCallback((run: RunState, index: number) => {
    const b = run.boards[index];
    const s = svRef.current;
    const mine: number[] = [];
    for (const path of pathStack.current) for (const c of path) { const p = center(c); mine.push(p.x, p.y); }
    const sol = solveBoard(b);
    const par: number[] = [];
    let pos = b.start; let mask = 0; let gold = false; let moves = 0;
    const p0 = center(pos); par.push(p0.x, p0.y);
    for (const a of sol.solution) {
      const sim = simulateStroke(b, pos, mask, gold, tideAt(b.P, moves, 0), a === A_TREAD ? -1 : a);
      for (let k = 1; k < sim.path.length; k++) { const p = center(sim.path[k]); par.push(p.x, p.y); }
      pos = sim.pos; mask = sim.mask; gold = sim.golden; moves++;
    }
    s.recap.value = mine;
    s.recapPar.value = par;
    s.recapT0.value = s.fxT.value;
  }, [center]);

  const presentClear = useCallback((run: RunState, ev: Extract<CqEvent, { type: 'clear' }>, startIn: number) => {
    const s = svRef.current;
    const r = ev.result;
    shellsRef.current[ev.index] = [r.shellClear, r.shellPar, r.shellGolden];
    const recap = !r.shellPar && !ev.runComplete && !scored && !showdown && !reducedMotion;
    later(startIn, () => {
      const b = run.boards[ev.index];
      if (requestHitStop(gov.current, strokeNo.current)) clock.hitStop(60);
      s.chest.value = 2;
      sfxChest();
      Haptic.success();
      const cell = cellPx();
      // Scaled by shells (9.8): clear only, + Par (coin pop), + Golden (splash burst).
      burst('coins', b.chest, { count: reducedMotion ? 4 : r.shellPar ? 8 : 4, color: packHex(CQ.gold) }, -cell * 0.3);
      if (r.shellPar) burst('bubbles', b.chest, { count: 6 }, -cell * 0.2);
      if (r.shellGolden) burst('splash', b.chest, { count: reducedMotion ? 6 : 12 });
      s.breath.value = withSequence(withTiming(0.06, { duration: 250 }), withTiming(0, { duration: 250 }));
      later(120, () => { sfxShells(r.shells); scheduleHaptics(gridSteps(r.shells, 0, 110, 'selection')); });
      const cur = runRef.current;
      if (cur) syncHud(cur);
      if (showdown && r.shellPar) sendPlayerSplash();
      if (showdown) { bumps.current[0] = Date.now(); refreshRail(); }
      if (recap) {
        showRecap(run, ev.index);
        setSplitChip({ text: `Par: ${r.parTarget}, you: ${r.strokes}`, good: false, key: Date.now() });
        later(1300, () => setSplitChip(null));
      } else if (ghost && ghost.strokes[ev.index] != null) {
        // Split-delta chip vs the ghost (Trackmania): strokes, never routes.
        const d = r.strokes - ghost.strokes[ev.index];
        setSplitChip({ text: d === 0 ? 'Even with your ghost' : `${d > 0 ? '+' : ''}${d} stroke${Math.abs(d) === 1 ? '' : 's'} vs ghost`, good: d <= 0, key: Date.now() });
        later(1800, () => setSplitChip(null));
      }
    });
    if (ev.runComplete) {
      later(startIn + 250, () => { const cur = runRef.current; if (cur) (showdown ? finishShowdownRef.current(cur) : finishRun(cur, r)); });
      return;
    }
    // Capped at 1.2 s and overlapping the next board's rise; a recap holds the board a little longer.
    const nextAt = startIn + (recap ? 1150 : r.shells >= 3 ? 600 : r.shells === 2 ? 500 : 350);
    later(nextAt, () => {
      const cur = runRef.current;
      if (!cur) return;
      sfxTransition();
      setVoyageIdx(cur.index);
      beginVoyage(cur, true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [later, clock, burst, reducedMotion, syncHud, ghost, finishRun, beginVoyage, scored, showdown, showRecap]);

  const presentStall = useCallback((run: RunState, startIn: number) => {
    const s = svRef.current;
    // 1.4 s max, any tap skips straight to the card.
    later(Math.min(startIn, 700), () => {
      sfxStall();
      Haptic.warning();
      s.swirl.value = withTiming(1, { duration: 300 });
      const b = currentBoard(run);
      const v = run.voyage;
      // Near miss (Candy Crush): the solver says how far the chest really was.
      const d = distanceFrom(b, v, false);
      let nearMiss: string | null = null;
      if (Number.isFinite(d) && d <= 2) nearMiss = `So close! ${d} stroke${d === 1 ? '' : 's'} short.`;
      // Wrong-turn marker: the tile you stood on before the first stroke with no way home in budget.
      const lim = limitFor(b, run.knobs) + v.limitBonus;
      const states = [...v.stack.map((x) => ({ pos: x.pos, mask: x.mask, golden: x.golden, moves: x.moves, phase: v.phase })),
        { pos: v.pos, mask: v.mask, golden: v.golden, moves: v.moves, phase: v.phase }];
      const budget = [...v.stack.map((x) => lim - x.spent), lim - v.spent];
      const dead = firstDeadState(b, states, budget);
      let wrong = false;
      if (dead > 0) {
        const c = center(states[dead - 1].pos);
        s.wrong.value = [c.x, c.y];
        s.wrongT0.value = s.fxT.value + 300;
        later(300, () => { sfxWrongTurn(); Haptic.hitRigid(); });
        wrong = true;
      }
      let hint = false;
      if (firstStall.current) {
        firstStall.current = false;
        const [first] = hintFrom(b, { pos: b.start, mask: 0, golden: false, moves: 0, phase: v.phase }, 1);
        if (first !== undefined) {
          const sim = simulateStroke(b, b.start, 0, false, tideAt(b.P, 0, v.phase), first === A_TREAD ? -1 : first);
          const c = center(sim.pos);
          s.hint.value = [c.x, c.y];
          s.hintT0.value = s.fxT.value + 100000; // hold while the card is up
          hint = true;
        }
      }
      later(400, () => setStall({ nearMiss, hint, wrong }));
    });
  }, [later, center]);

  const presentFail = useCallback((run: RunState, startIn: number) => {
    const s = svRef.current;
    finishing.current = true;
    later(Math.min(startIn, 500) + 100, () => {
      const p = s.shark.value;
      s.plan.value = { ...idlePlan(p.x, p.y, p.facing), kind: PLAN_WHIRL, t0: -1 };
      sfxWhirlpool();
      sfxRingLost();
      Haptic.failBuzz();
      setFailed(true);
      setStall(null);
      GameAudio.music.setState('muffled', 600);
    });
    later(Math.min(startIn, 500) + 1000, () => {
      GameAudio.music.setState('open', 300);
      const shells = totalShells(run.results);
      setResult({
        score: shells,
        stars: 0,
        thresholds,
        message: 'The tide won this round',
        stats: [{ label: 'Voyages', value: `${run.results.length}/${run.boards.length}` }, { label: 'Shells', value: `${shells}/${run.boards.length * 3}` }],
        meta: { failed: true, context, seed: runSeed, attempt, v: 2 },
      });
    });
  }, [later, context, runSeed, attempt, thresholds]);

  // ---- applying actions -----------------------------------------------------------------------------------
  const noteInput = () => {
    const s = svRef.current;
    s.idleSince.value = s.fxT.value;
    s.tourT0.value = -1e9; // any input skips the glance tour
    lastStrokeAt.current = Date.now();
    setTipPulse(false);
    if (thinned.current) {
      thinned.current = false;
      const r = runRef.current;
      if (r) setBedFor(r);
    }
  };

  const applyNow = useCallback((action: number) => {
    const run = runRef.current;
    if (!run || finishing.current) return;
    // The proof time for an action is the moment the engine applies it (7.3).
    const vi = run.index;
    const prevT = times.current[vi][times.current[vi].length - 1] ?? 0;
    const t = Math.max(Date.now() - startedAt.current, prevT + 1);
    const res = applyAction(run, action, t);
    if (!res.ok) return;
    const s = svRef.current;
    s.armed.value = -1;
    setChip(null);
    setInspect(null);
    noteInput();
    if (!res.recorded) {
      // Bump: pose swap, nudge, board shake, rattle. Never recorded.
      const bump = res.events[0] as Extract<CqEvent, { type: 'bump' }>;
      const from = center(run.voyage.pos);
      const cell = cellPx();
      const target = bump.target >= 0 ? center(bump.target) : { x: from.x + [0, 1, 0, -1][bump.dir] * cell, y: from.y + [-1, 0, 1, 0][bump.dir] * cell };
      s.plan.value = { ...idlePlan(from.x, from.y, s.plan.value.facing || 1), kind: PLAN_BUMP, t0: -1, pts: [from.x, from.y], bx: target.x, by: target.y };
      sfxBump(bump.reason);
      Haptic.hitRigid();
      if (!reducedMotion && requestShake(gov.current, Date.now())) camera.shake(0.18, [0, 1, 0, -1][bump.dir] ?? 0, [-1, 0, 1, 0][bump.dir] ?? 0);
      if (bump.reason === 'rock') swayNear(currentBoard(run), [run.voyage.pos], 60);
      if (bump.reason === 'locked') {
        s.rattleT.value = s.fxT.value;
        setToast({ text: 'Grab every pearl to open the chest', key: Date.now() });
      }
      if (bump.reason === 'dry') setToast({ text: 'Dry sandbar. Wait for high tide.', key: Date.now() });
      if (bump.reason === 'upstream') {
        setToast({ text: 'Too strong to swim against', key: Date.now() });
        s.flareRun.value = runsOf(currentBoard(run), null).findIndex((r) => r.cells.includes(bump.target) || r.cells.includes(run.voyage.pos));
        s.flareT.value = s.fxT.value;
      }
      if (Date.now() - lastCommitAt.current < 1500) noteMisfire();
      busyUntil.current = Date.now() + 200;
      later(260, () => { const r = runRef.current; if (r) s.plan.value = { ...idlePlan(from.x, from.y, s.plan.value.facing || 1), beached: r.voyage.beached ? 1 : 0, t0: -1 }; });
      return;
    }
    times.current[vi].push(t);
    runRef.current = res.run;
    const next = res.run;
    let dur = 200;
    let endMove = 0;
    for (const ev of res.events) {
      if (ev.type === 'stroke') {
        const p = presentStroke(next, ev, res.events);
        dur = p.dur;
        endMove = p.endMove;
      } else if (ev.type === 'clear') {
        presentClear(next, ev, Math.max(0, endMove));
      } else if (ev.type === 'stall') {
        presentStall(next, dur);
      } else if (ev.type === 'fail') {
        presentFail(next, dur);
      } else if (ev.type === 'undo') {
        const path = pathStack.current.pop();
        const pts: number[] = [];
        for (const c of path ?? [ev.to, ev.from].reverse()) { const p = center(c); pts.push(p.x, p.y); }
        const carry = path ? Math.max(0, path.length - 2) : 0;
        const speed = scrubbing.current ? 2.4 : 1.6;
        s.plan.value = { kind: PLAN_UNDO, t0: -1, pts, carry, facing: s.plan.value.facing || 1, dive: 0, beached: next.voyage.beached ? 1 : 0, wasBeached: 0, bx: 0, by: 0, speed, rip: 0 };
        dur = planDuration(s.plan.value);
        if (!scrubbing.current) s.undoTint.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: Math.max(200, dur) }));
        sfxUndo(scrubbing.current ? Math.min(3, (pathStack.current.length % 4)) : 0);
        if (trial) { Haptic.tapLight(); setSmallChip({ text: 'stroke spent', tone: 'coral', key: Date.now() }); } else Haptic.tickSelection();
        if (ev.slip) setSmallChip({ text: 'Slip, Par kept', tone: 'white', key: Date.now() });
        syncBoardVisuals(next);
        s.hint.value = [];
        s.wrong.value = [];
        setStall(null);
        s.swirl.value = withTiming(0, { duration: 200 });
        if (Date.now() - lastCommitAt.current < 1500 && !ev.slip) noteMisfire();
      } else if (ev.type === 'restart') {
        const b = currentBoard(next);
        const st = center(b.start);
        // The whole stack rewinds at 4x (max 600 ms): the shark skims back to the start.
        const from = s.shark.value;
        s.plan.value = { kind: PLAN_UNDO, t0: -1, pts: [st.x, st.y, from.x, from.y], carry: 0, facing: s.plan.value.facing || 1, dive: 0, beached: next.voyage.beached ? 1 : 0, wasBeached: 0, bx: 0, by: 0, speed: 1.4, rip: 0 };
        s.undoTint.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 500 }));
        burst('splash', run.voyage.pos, { count: 8 });
        pathStack.current = [];
        pearlStep.current = 0;
        sfxUndo(3);
        Haptic.hitMedium();
        if (ev.spentKept) setSmallChip({ text: 'Budget remembers', tone: 'coral', key: Date.now() });
        syncBoardVisuals(next);
        s.hint.value = [];
        s.wrong.value = [];
        s.swirl.value = withTiming(0, { duration: 200 });
        setStall(null);
        dur = 360;
      } else if (ev.type === 'continue') {
        sfxRingOn();
        Haptic.hitMedium();
        s.swirl.value = withTiming(0, { duration: 200 });
        s.hint.value = [];
        s.wrong.value = [];
        setStall(null);
        const p = s.shark.value;
        const fp = toField(p.x, p.y);
        fx.current?.ring(fp.x, fp.y, { color: CQ.coral, from: 10, to: cellPx() * 0.7, ms: 300 });
        setToast({ text: '+2 strokes', key: Date.now() });
        dur = 250;
      } else if (ev.type === 'splash') {
        const p = s.shark.value;
        const fp = toField(p.x, p.y);
        if (ev.blocked) {
          fx.current?.ring(fp.x, fp.y, { color: '#ffffff', from: 12, to: cellPx() * 0.9, ms: 300 });
          fx.current?.burst('bubbles', fp.x, fp.y, { count: 12 });
          setToast({ text: 'Shield popped the Splash!', key: Date.now() });
          Haptic.hitMedium();
        } else {
          syncBoardVisuals(next);
          s.sweepT0.value = s.fxT.value;
          sfxTide();
          Haptic.warning();
          if (!reducedMotion && requestShake(gov.current, Date.now())) camera.shake(0.22);
          const b = currentBoard(next);
          for (let i = 0; i < b.tiles.length; i++) if (b.tiles[i] === 's') burst('splash', i, { count: 6 });
          if (ev.beached) sfxBeached();
        }
        s.plan.value = { ...idlePlan(p.x, p.y, p.facing), beached: next.voyage.beached ? 1 : 0, t0: -1 };
        dur = 350;
        refreshRail();
      } else if (ev.type === 'tip') {
        const b = currentBoard(next);
        const v = next.voyage;
        const hint = hintFrom(b, v, 2, strokesLeft(next));
        const pts: number[] = [];
        let pos = v.pos; let mask = v.mask; let gold = v.golden; let moves = v.moves;
        for (const a of hint) {
          const sim = simulateStroke(b, pos, mask, gold, tideAt(b.P, moves, v.phase), a === A_TREAD ? -1 : a);
          pos = sim.pos; mask = sim.mask; gold = sim.golden; moves++;
          const c = center(pos);
          pts.push(c.x, c.y);
        }
        s.hint.value = pts;
        s.hintT0.value = s.fxT.value;
        sfxTip();
        Haptic.tickSelection();
        setToast({ text: ev.cost > 0 ? `Tip: -${ev.cost} strokes. Follow the gold.` : 'Follow the gold. Par shell is gone.', key: Date.now() });
        dur = 100;
      }
    }
    busyUntil.current = Date.now() + Math.min(dur, 900);
    if (showdown) later(Math.min(dur, 900), refreshRail);
    syncHud(next);
    refreshPreviews(next);
    lastCommitAt.current = Date.now();
    later(Math.min(dur, 900) + 10, () => {
      const b = buffered.current;
      buffered.current = null;
      if (b !== null) applyNowRef.current(b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, reducedMotion, camera, later, presentStroke, presentClear, presentStall, presentFail, trial, syncBoardVisuals, burst, toField, syncHud, refreshPreviews, swayNear]);
  const applyNowRef = useRef(applyNow);
  applyNowRef.current = applyNow;

  const commit = useCallback((action: number) => {
    if (!playing.current || finishing.current || result) return;
    if (Date.now() < busyUntil.current) {
      // Exactly one buffered commit; the rest of the current animation plays at 2x.
      buffered.current = action;
      fastForward();
      return;
    }
    applyNowRef.current(action);
  }, [result, fastForward]);

  const noteMisfire = () => {
    const now = Date.now();
    misfires.current = [...misfires.current.filter((t) => now - t < 20000), now];
    if (misfires.current.length >= 2 && !arrows && progress && !progress.misfireHintShown) {
      setToast({ text: 'Try the arrow buttons while walking?', key: now });
      void saveProgress((p) => ({ ...p, misfireHintShown: true })).then(setProgress);
    }
  };

  // ---- input ---------------------------------------------------------------------------------------------
  const onAim = useCallback((dir: number) => {
    setInspect(null);
    const s = svRef.current;
    s.tourT0.value = -1e9;
    if (dir < 0) { setChip(null); return; }
    sfxAim(dir);
    Haptic.tickSelection();
    setChip(chipFor(dir));
  }, [chipFor]);
  const onCancelAim = useCallback(() => setChip(null), []);
  const onInspect = useCallback((x: number, y: number) => {
    const run = runRef.current;
    const l = layoutRef.current;
    if (!run || !l) return;
    const i = cellAt(l, x, y);
    if (i < 0) { setInspect(null); return; }
    const b = currentBoard(run);
    const v = run.voyage;
    const ch = b.tiles[i];
    const k = movesToTurn(b.P, v.moves, v.phase);
    const low = tideAt(b.P, v.moves, v.phase) === TIDE_LOW;
    let text = 'Open water';
    if (i === v.pos) text = v.beached ? 'Beached! Swim off any time, no cost.' : 'Your shark';
    else if (i === b.chest) text = v.mask === (1 << b.pearls.length) - 1 ? 'Treasure chest: open!' : `Treasure chest: ${b.pearls.length} pearls open it`;
    else if (ch === '#') text = 'Coral rock: blocks you and stops currents';
    else if (ch === 's') text = b.P ? `Sandbar: ${low ? 'dry' : 'underwater'} now, ${low ? 'floods' : 'dries'} in ${k} move${k === 1 ? '' : 's'}` : 'Sandbar';
    else if ('^>v<'.includes(ch)) text = `Current flowing ${['up', 'right', 'down', 'left']['^>v<'.indexOf(ch)]}: free ride, can't swim against it`;
    if (b.pearls.includes(i) && !(v.mask & (1 << b.pearls.indexOf(i)))) text = `Pearl. ${text === 'Open water' ? 'Needed to open the chest' : text}`;
    if (i === b.golden && !v.golden) text = 'Golden pearl: optional, worth a shell';
    const p = cellCenter(l, i);
    setInspect({ text, x: p.x, y: p.y });
    Haptic.tickSelection();
  }, []);

  const gesture = useMemo(() => {
    const s = sv;
    const w = layout?.cw ?? 0;
    const h = layout?.ch ?? 0;
    const pan = Gesture.Pan()
      .minDistance(4)
      .onUpdate((e) => {
        'worklet';
        const thr = s.walking.value ? THRESHOLD_WALK : THRESHOLD_STAND;
        const dx = e.translationX;
        const dy = e.translationY;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        let dir = -1;
        if (Math.max(adx, ady) >= thr) dir = adx > ady ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
        if (dir !== s.armed.value) {
          s.armed.value = dir;
          runOnJS(onAim)(dir);
        }
      })
      .onEnd((e) => {
        'worklet';
        // Release commits only inside the board (+12 px): a stumble that slides off cancels.
        const inside = e.x >= -12 && e.y >= -12 && e.x <= w + 12 && e.y <= h + 12;
        const dir = s.armed.value;
        s.armed.value = -1;
        if (dir >= 0 && inside) runOnJS(commitRefCall)(dir);
        else runOnJS(onCancelAim)();
      });
    const tap = Gesture.Tap().maxDistance(10).onEnd((e) => {
      'worklet';
      runOnJS(onInspect)(e.x, e.y);
    });
    return Gesture.Race(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, onAim, onCancelAim, onInspect]);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  function commitRefCall(dir: number) { commitRef.current(dir); }

  // Idle: Tip pulse after 8 s, music thinning after 6 s. Walking freezes the idle count.
  useEffect(() => {
    if (!visible) return undefined;
    const id = setInterval(() => {
      if (walking) {
        lastStrokeAt.current += 1000;
        svRef.current.idleSince.value += 1000;
        return;
      }
      if (!playing.current || finishing.current) return;
      const idle = Date.now() - lastStrokeAt.current;
      if (idle > TIP_IDLE_MS) setTipPulse(true);
      if (idle > THIN_IDLE_MS && !thinned.current) {
        thinned.current = true;
        const r = runRef.current;
        if (r) setBedFor(r);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [visible, walking, setBedFor]);

  // Ambient coral bubble plumes (each coral, every 4 to 7 s); off in lite and reduced motion.
  useEffect(() => {
    if (!visible || lite || reducedMotion) return undefined;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (stop) return;
      const r = runRef.current;
      const s = svRef.current;
      if (r && playing.current && !finishing.current && !s.shark.value.carrying) {
        const b = currentBoard(r);
        const corals: number[] = [];
        for (let i = 0; i < b.tiles.length; i++) if (b.tiles[i] === '#') corals.push(i);
        if (corals.length) burst('bubbles', corals[Math.floor(Math.random() * corals.length)], { count: 3 }, -cellPx() * 0.45);
      }
      t = setTimeout(tick, 1800 + Math.random() * 1500);
    };
    t = setTimeout(tick, 2500);
    return () => { stop = true; clearTimeout(t); };
  }, [visible, lite, reducedMotion, burst]);

  // ---- dev autoplay (studio capture only). EXPO_PUBLIC_CQ_AUTOPLAY=1: a clean run with one slip undo.
  // =2: the "rough day" tour: slip undo, burn strokes into a stall (card, wrong-turn X, first-stroke
  // footprint), recover (Puzzle Restart / Trial ring), a Tide Tip, then the gold route.
  const autoMode = typeof __DEV__ !== 'undefined' && __DEV__ ? process.env.EXPO_PUBLIC_CQ_AUTOPLAY ?? '0' : '0';
  // =3: lose on purpose (Trial: burn every ring) to exercise the run-failed whirlpool.
  const autoplay = autoMode === '1' || autoMode === '2' || autoMode === '3';
  const auto = useRef<{ slip: boolean; stalled: boolean; tipped: boolean; recovered: boolean }>({ slip: false, stalled: false, tipped: false, recovered: false });
  const autoNext = useRef(0);
  useEffect(() => {
    if (!autoplay || !visible) return undefined;
    let stop = false;
    auto.current = { slip: false, stalled: false, tipped: false, recovered: false };
    const tick = () => {
      if (stop) return;
      const run = runRef.current;
      const s = svRef.current;
      if (run && playing.current && !finishing.current && Date.now() > busyUntil.current + 250 && Date.now() > autoNext.current) {
        const b = currentBoard(run);
        const v = run.voyage;
        const st = auto.current;
        let a: number | undefined;
        let hold = 600;
        let gap = 1100;
        const good = () => hintFrom(b, v, 1, autoMode === '1' ? Infinity : strokesLeft(run))[0];
        const wrong = () => { const g = good(); for (let d = 0; d < 4; d++) if (d !== g && previewFor(run, d).valid) return d; return undefined; };
        if (autoMode === '3') {
          a = v.stalled ? A_CONTINUE : (wrong() ?? good());
          gap = 700;
        } else if (v.stalled) {
          st.stalled = true;
          if (!st.recovered) { st.recovered = true; autoNext.current = Date.now() + 2600; setTimeout(tick, 300); return; }
          a = trial ? A_CONTINUE : A_RESTART;
          gap = 1400;
        } else if (run.index === 0 && !st.slip && v.strokes === 1) {
          // One wrong turn, undone at once: a slip (Par kept).
          a = wrong();
          st.slip = true;
          if (a !== undefined) later(1050, () => commitRef.current(A_UNDO));
          gap = 1800;
        } else if (autoMode === '2' && run.index === (trial ? 1 : 0) && !st.stalled && v.strokes >= 1 && st.slip
          && strokesLeft(run) - distanceFrom(b, v, false) >= 0) {
          // Wander, but never more than one stroke past saving: the stall lands as a near miss.
          const left0 = strokesLeft(run);
          let pick: number | undefined;
          let best = Infinity;
          for (let d = 0; d < 4; d++) {
            const pv = previewFor(run, d);
            if (!pv.valid || pv.clears) continue;
            const sim = simulateStroke(b, v.pos, v.mask, v.golden, tideAt(b.P, v.moves, v.phase), d);
            const nd = distanceFrom(b, { pos: sim.pos, mask: sim.mask, golden: sim.golden, moves: v.moves + 1, phase: v.phase }, false);
            const slack = left0 - 1 - nd;
            if (slack >= -1 && slack < best) { best = slack; pick = d; }
          }
          a = pick ?? good();
          hold = 260;
          gap = 560;
        } else if (autoMode === '2' && !st.tipped && tipAllowed(run) && v.strokes === 0
          && ((trial && run.index === 2) || (!trial && run.index === 1))) {
          st.tipped = true;
          later(50, () => commitRef.current(A_TIP));
          autoNext.current = Date.now() + 2600;
          setTimeout(tick, 300);
          return;
        } else {
          a = good();
          // Linger on previews that carry far, so the path icons and RIPTIDE! read on video.
          if (a !== undefined && a <= 4 && previewFor(run, a).carried >= 2) hold = 1000;
        }
        if (a !== undefined) {
          const act = a;
          if (act <= 4) { s.armed.value = act; onAim(act); }
          setTimeout(() => { s.armed.value = -1; commitRef.current(act); }, act <= 4 ? hold : 50);
          autoNext.current = Date.now() + gap;
        }
      }
      setTimeout(tick, 300);
    };
    const t = setTimeout(tick, 1800);
    return () => { stop = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, visible, boards]);

  // ---- shell callbacks ---------------------------------------------------------------------------------------
  const handleStart = useCallback(() => {
    playing.current = true;
    if (!startedAt.current || !restore.snapshot) startedAt.current = Date.now();
    const run = runRef.current;
    if (run) readyAt.current[run.index] = Math.max(readyAt.current[run.index], Date.now() - startedAt.current);
    lastStrokeAt.current = Date.now();
    svRef.current.idleSince.value = svRef.current.fxT.value;
    GameAudio.music.setState('open', 200);
    setElapsedNow(0);
    if (run && run.voyage.strokes === 0) { showRibbon(run); svRef.current.tourT0.value = svRef.current.fxT.value + 100; }
  }, [restore.snapshot, showRibbon]);
  const handlePause = useCallback(() => {
    playing.current = false;
    buffered.current = null;
  }, []);
  const handleResume = useCallback(() => {
    playing.current = true;
    lastStrokeAt.current = Date.now();
    // Hitman GO re-find: one gold ring pulse on the shark (no countdown; nothing ticks).
    const s = svRef.current;
    s.idleSince.value = s.fxT.value;
    const p = s.shark.value;
    const fp = toField(p.x, p.y);
    fx.current?.ring(fp.x, fp.y, { color: CQ.gold, from: 8, to: cellPx() * 0.8, ms: 400 });
  }, [toField]);
  const getSnapshot = useCallback(() => {
    const run = runRef.current;
    if (!run) return null;
    return {
      score: treasureOf(run.results),
      state: { actions: run.actions.map((a) => a.slice()), times: times.current.map((t) => t.slice()), ready: readyAt.current.slice(), elapsed: Date.now() - startedAt.current },
    };
  }, []);
  const onWrapUp = useCallback((): GameResult | null => {
    const run = runRef.current;
    if (!run) return null;
    const shells = totalShells(run.results);
    // A real queue event (boarding) saves what the run earned so far.
    return {
      score: shells,
      stars: 0,
      thresholds,
      message: `${shells} shell${shells === 1 ? '' : 's'} so far`,
      stats: [{ label: 'Voyages', value: `${run.results.length}/${run.boards.length}` }, { label: 'Shells', value: `${shells}/${run.boards.length * 3}` }],
      meta: { partial: true, context, seed: runSeed, v: 2 },
    };
  }, [context, runSeed, thresholds]);
  const onRematch = useCallback(() => {
    // Play again on fresh boards; a failed Trial retries on fresh boards (next attemptIndex).
    clearTimers();
    if (failed || trial) setAttempt((a) => a + 1);
    else setBoardsKey((k) => k + 1);
    setResult(null);
    setFailed(false);
  }, [clearTimers, failed, trial]);

  // ---- controls callbacks -----------------------------------------------------------------------------------
  const onUndo = useCallback(() => { if (!scrubbing.current) sfxButton(); commit(A_UNDO); }, [commit]);
  const onScrub = useCallback((on: boolean) => {
    scrubbing.current = on;
    svRef.current.undoTint.value = withTiming(on ? 1 : 0, { duration: on ? 80 : 300 });
  }, []);
  const onRestart = useCallback(() => { commit(A_RESTART); }, [commit]);
  const onContinue = useCallback(() => { commit(A_CONTINUE); }, [commit]);
  const onTip = useCallback(() => {
    const run = runRef.current;
    if (!run || !tipAllowed(run)) {
      if (run && trial) setToast({ text: 'Not enough strokes left for a tip', key: Date.now() });
      return;
    }
    // Recorded as action 9 in both profiles: it forfeits Par, and in a Trial it costs 2 strokes of budget.
    commit(A_TIP);
  }, [commit, trial]);
  const onTreadArm = useCallback(() => { sv.armed.value = A_TREAD; setChip(chipFor(A_TREAD)); }, [sv.armed, chipFor]);
  const onTreadCommit = useCallback(() => { sv.armed.value = -1; commit(A_TREAD); }, [sv.armed, commit]);
  const onTreadCancel = useCallback((early: boolean) => {
    sv.armed.value = -1;
    setChip(null);
    if (early) setToast({ text: 'Hold to tread', key: Date.now() });
  }, [sv.armed]);
  const onToggleArrows = useCallback(() => {
    sfxButton();
    setArrows((a) => {
      void saveProgress((p) => ({ ...p, arrows: !a }));
      return !a;
    });
  }, []);
  useEffect(() => { if (progress) setArrows(progress.arrows); }, [progress === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const onArrowArm = useCallback((dir: number) => { sv.armed.value = dir; onAim(dir); }, [sv.armed, onAim]);
  const onArrowDisarm = useCallback(() => { sv.armed.value = -1; }, [sv.armed]);
  // Hold the tide dial: the whole board previews its next tide (water level, sandbars) while held.
  const onTideHold = useCallback((on: boolean) => {
    const run = runRef.current;
    if (!run) return;
    const b = currentBoard(run);
    const v = run.voyage;
    const s = svRef.current;
    if (on) {
      const k = movesToTurn(b.P, v.moves, v.phase);
      const nextLow = tideAt(b.P, v.moves + k, v.phase) === TIDE_LOW;
      s.tideDrop.value = withTiming(nextLow ? 8 : 0, { duration: 220 });
      Haptic.tickSelection();
    } else {
      s.tideDrop.value = withTiming(tideDropFor(b, v.moves, v.phase), { duration: 260 });
    }
  }, []);

  // Toast and small chip auto-hide.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!smallChip) return undefined;
    const t = setTimeout(() => setSmallChip(null), 1100);
    return () => clearTimeout(t);
  }, [smallChip]);

  // Ghost rail clock (async challenge).
  useEffect(() => {
    if (!ghost || !visible) return undefined;
    const id = setInterval(() => { if (playing.current) setElapsedNow(Date.now() - startedAt.current); }, 500);
    return () => clearInterval(id);
  }, [ghost, visible]);

  // ---- render --------------------------------------------------------------------------------------------------
  const run = runRef.current;
  const board = run && boards ? boards[Math.min(voyageIdx, boards.length - 1)] : null;
  const shellsNow = shellsRef.current.flat().filter(Boolean).length;
  const par = board ? (hud?.goldenTaken ? board.parGold : board.par) : 0;
  const spent = limit - left;
  const objective = showdown
    ? 'Showdown: 2 voyages vs the crew. Most shells wins.'
    : trial ? `3 voyages, ${knobs.rings} life rings. Beat par. Find the gold.` : `${voyagesN} voyages. Beat par. Find the gold.`;

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title="Current Quest"
      subtitle={themeSubtitle(themeId)}
      score={shellsNow}
      objective={objective}
      result={result}
      thresholds={thresholds}
      resumeStyle="instant"
      countdownStyle="go"
      gameId="current"
      sessionKey={sessionKey}
      getSnapshot={getSnapshot}
      onWrapUp={onWrapUp}
      onStart={handleStart}
      onPause={handlePause}
      onResume={handleResume}
      onClose={onClose}
      onQuit={onQuit}
      onComplete={onComplete}
      onRematch={context === 'ride' ? undefined : onRematch}
    >
      <GestureHandlerRootView style={styles.root}>
        <RNImage source={BACKDROP} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.root} onLayout={onFieldLayout}>
          {hud ? <QuestHud h={hud} walkingChip={walking} onTideHold={onTideHold} /> : <View style={{ height: 58 }} />}
          {showdown && racers.length ? <ShowdownRail racers={racers} remainingMs={sdRemaining} total={voyagesN} /> : null}
          {!showdown && ghost ? <GhostRail ghost={ghost} elapsedMs={elapsedNow} voyage={voyageIdx} cleared={run?.results.length ?? 0} total={voyagesN} /> : null}
          <View style={[styles.strokeRow, walking && { paddingLeft: 96 }]}>
            {walking ? (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(300)} style={styles.moving} pointerEvents="none">
                <Text style={styles.movingTxt}>Line moving</Text>
              </Animated.View>
            ) : null}
            {limit > 0 && layout ? <StrokeBar limit={limit} spent={spent} par={par} hot={left <= 3 && left >= 0} width={layout.cw - (walking ? 96 : 0)} /> : null}
            {smallChip ? (
              <Animated.View key={smallChip.key} entering={FadeIn.duration(100)} exiting={FadeOut} style={[styles.smallChip, smallChip.tone === 'coral' ? styles.smallChipCoral : styles.smallChipWhite]} pointerEvents="none">
                <Text style={[styles.smallChipTxt, smallChip.tone === 'coral' && styles.smallChipTxtCoral]}>{smallChip.text}</Text>
              </Animated.View>
            ) : null}
          </View>
          <View style={styles.boardArea}>
            {layout && board && stableImages.idle ? (
              <GestureDetector gesture={gesture}>
                <View
                  style={{ width: layout.cw, height: layout.ch }}
                  onLayout={(e) => { boardOrigin.current = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y }; }}
                  accessibilityLabel="Lagoon board. Swipe to swim, tap a tile to inspect."
                >
                  <Animated.View style={camera.style}>
                    <LagoonBoard key={`${board.id}:${voyageIdx}:${attempt}:${boardsKey}:${layout.cell}`} board={board} layout={layout} images={stableImages}
                      font={font} sv={sv} reducedMotion={reducedMotion} lite={lite} desaturate={failed} />
                  </Animated.View>
                  {chip ? (
                    <Animated.View entering={ZoomIn.duration(120)} style={[styles.aimChip, chip === 'No way home' && styles.aimChipRed, chip === 'RIPTIDE!' && styles.aimChipGold]} pointerEvents="none">
                      <Text style={[styles.aimTxt, chip === 'RIPTIDE!' && styles.aimTxtRip]}>{chip}</Text>
                    </Animated.View>
                  ) : null}
                  {inspect ? (
                    <Animated.View entering={FadeIn.duration(120)} style={[styles.inspect, { left: Math.max(6, Math.min(layout.cw - 206, inspect.x - 100)), top: Math.max(4, inspect.y - (layout.cell * 1.3)) }]} pointerEvents="none">
                      <Text style={styles.inspectTxt}>{inspect.text}</Text>
                    </Animated.View>
                  ) : null}
                  {ribbon ? (
                    <Animated.View key={ribbon.key} entering={ZoomIn.springify().damping(11)} exiting={FadeOut} style={[styles.ribbon, ribbon.gold && styles.ribbonGold]} pointerEvents="none">
                      <Text style={styles.ribbonTxt}>{ribbon.title}</Text>
                      {ribbon.sub ? <Text style={styles.ribbonSub}>{ribbon.sub}</Text> : null}
                    </Animated.View>
                  ) : null}
                  {splitChip ? (
                    <Animated.View key={splitChip.key} entering={ZoomIn} exiting={FadeOut} style={[styles.split, splitChip.good ? styles.splitGood : styles.splitBad]} pointerEvents="none">
                      <Text style={styles.splitTxt}>{splitChip.text}</Text>
                    </Animated.View>
                  ) : null}
                  {toast ? (
                    <Animated.View key={toast.key} entering={FadeIn.duration(120)} exiting={FadeOut} style={styles.toast} pointerEvents="none">
                      <Text style={styles.toastTxt}>{toast.text}</Text>
                    </Animated.View>
                  ) : null}
                  {stall && run ? (
                    <StallCard trial={trial} rings={run.rings} nearMiss={stall.nearMiss} hintShown={stall.hint} wrongTurn={stall.wrong}
                      onUndo={onUndo} onRestart={onRestart} onContinue={onContinue} />
                  ) : null}
                </View>
              </GestureDetector>
            ) : <View style={{ height: 300 }} />}
          </View>
          {arrows ? (
            <View style={styles.arrowArea}>
              <ArrowPad big={walking} disabled={!!stall || !!result} onArm={onArrowArm} onDisarm={onArrowDisarm} onCommit={commit} />
            </View>
          ) : null}
          <BottomBar
            big={walking}
            trial={trial}
            rings={run?.rings ?? 0}
            canUndo={!!run && run.voyage.stack.length > 0 && !(trial && run.voyage.stalled)}
            undos={run?.voyage.undos ?? 0}
            hasTide={!!board && board.P > 0}
            tipPulse={tipPulse}
            tipDisabled={!run || !tipAllowed(run)}
            tipCost={tipCostOf(knobs)}
            arrows={arrows}
            disabled={!!result || failed}
            onUndo={onUndo}
            onScrub={onScrub}
            onTreadArm={onTreadArm}
            onTreadCommit={onTreadCommit}
            onTreadCancel={onTreadCancel}
            onTip={onTip}
            onRestart={onRestart}
            onToggleArrows={onToggleArrows}
          />
        </View>
        {podium ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.podium} pointerEvents="none">
            {podium.map((r, i) => (
              <Animated.View key={`pd${r.seat}`} entering={ZoomIn.delay(200 + (podium.length - i) * 220).springify().damping(10)} style={[styles.podRow, r.you && styles.podRowYou]}>
                <Text style={styles.podPlace}>{['1st', '2nd', '3rd', '4th'][r.place - 1]}</Text>
                <RNImage source={AVATAR_IMG[r.avatar]} style={styles.podAvatar} />
                {r.place === 1 ? <RNImage source={CROWN} style={styles.podCrown} /> : null}
                <Text style={styles.podName}>{r.you ? 'You' : r.name}</Text>
                <Text style={styles.podStat}>{r.finished ? `${r.shells} shells, ${r.strokes} strokes` : 'out of time'}</Text>
              </Animated.View>
            ))}
          </Animated.View>
        ) : null}
        {layout ? <FxStage ref={fx} width={field?.w ?? layout.cw} height={field?.h ?? layout.ch} timeScale={clock.fxScale} reducedMotion={reducedMotion} capacity={lite ? 120 : 200} style={styles.fx} /> : null}
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

function dirBetween(a: number, b: number): number {
  const dr = Math.floor(b / 5) - Math.floor(a / 5);
  const dc = (b % 5) - (a % 5);
  if (Math.abs(dc) >= Math.abs(dr)) return dc >= 0 ? 1 : 3;
  return dr >= 0 ? 2 : 0;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  boardArea: { alignItems: 'center', justifyContent: 'center', paddingBottom: 4, flex: 1 },
  fx: { position: 'absolute', left: 0, top: 0 },
  arrowArea: { alignItems: 'stretch', paddingBottom: 4 },
  strokeRow: { height: 34, alignItems: 'center', justifyContent: 'center' },
  // Walking is a state, not a pause (17): a quiet chip, input stays live.
  moving: { position: 'absolute', left: 8, top: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9, backgroundColor: CQ.water, borderWidth: 1.5, borderColor: CQ.ink },
  movingTxt: { fontFamily: 'Knockout', fontSize: 11, color: '#ffffff' },
  smallChip: { position: 'absolute', right: 10, top: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1.5, borderColor: CQ.ink },
  smallChipCoral: { backgroundColor: CQ.coral },
  smallChipWhite: { backgroundColor: '#ffffff' },
  smallChipTxt: { fontFamily: 'Knockout', fontSize: 12, color: CQ.navy },
  smallChipTxtCoral: { color: '#ffffff' },
  aimChip: {
    position: 'absolute', alignSelf: 'center', top: 2, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: '#ffffff',
    borderWidth: 2.5, borderColor: CQ.ink,
  },
  aimChipRed: { backgroundColor: '#ffe3df', borderColor: CQ.coral },
  aimChipGold: { backgroundColor: CQ.gold, borderColor: CQ.ink, paddingHorizontal: 16 },
  aimTxt: { fontFamily: 'Knockout', fontSize: 15, color: CQ.navy },
  aimTxtRip: { fontFamily: 'Shark', fontSize: 20 },
  inspect: { position: 'absolute', width: 200, padding: 8, borderRadius: 12, backgroundColor: CQ.cream, borderWidth: 2, borderColor: CQ.ink },
  inspectTxt: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy, textAlign: 'center' },
  ribbon: {
    position: 'absolute', alignSelf: 'center', bottom: 6, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14, backgroundColor: '#ffffff',
    borderWidth: 3, borderColor: CQ.ink, alignItems: 'center', maxWidth: '92%',
  },
  ribbonGold: { backgroundColor: CQ.gold, borderColor: CQ.ink },
  ribbonTxt: { fontFamily: 'Shark', fontSize: 19, color: CQ.navy },
  ribbonSub: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy, marginTop: 1, textAlign: 'center' },
  split: { position: 'absolute', right: 6, top: 2, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, borderWidth: 2, borderColor: CQ.ink },
  splitGood: { backgroundColor: '#d9f7c9' },
  splitBad: { backgroundColor: '#fff3c2' },
  splitTxt: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy },
  toast: {
    position: 'absolute', alignSelf: 'center', top: 40, maxWidth: '90%', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 2, borderColor: CQ.ink,
  },
  toastTxt: { fontFamily: 'Knockout', fontSize: 14, color: CQ.navy },
  podium: { position: 'absolute', left: 24, right: 24, top: '22%', padding: 12, borderRadius: 20, backgroundColor: CQ.cream, borderWidth: 3, borderColor: CQ.ink, gap: 6 },
  podRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: CQ.ink },
  podRowYou: { backgroundColor: '#fff3c2', borderColor: CQ.goldDeep, borderWidth: 2.5 },
  podPlace: { fontFamily: 'Shark', fontSize: 20, color: CQ.navy, width: 44 },
  podAvatar: { width: 30, height: 32, resizeMode: 'contain' },
  podCrown: { position: 'absolute', left: 52, top: -10, width: 28, height: 26, resizeMode: 'contain' },
  podName: { fontFamily: 'Shark', fontSize: 17, color: CQ.navy, flex: 1 },
  podStat: { fontFamily: 'Knockout', fontSize: 12, color: CQ.navy },
});
