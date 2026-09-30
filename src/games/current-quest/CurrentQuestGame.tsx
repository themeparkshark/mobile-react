/**
 * Current Quest v2 (design v4): "Ride the current. Beat the tide. Find the treasure."
 *
 * A turn-based lagoon puzzle built to be played while walking forward in a
 * queue. Nothing ticks: look up at the line, look back down, and the board is
 * exactly where you left it. Three voyages per run (warm-up, standard,
 * treasure), 9 shells, stars from shells.
 *
 * Contexts: `quick` (Puzzle profile, practice / queue play), `line` (LinePlay
 * bonus, Trial profile with 3 rings), `ride` (Ride Challenge coin, Trial with
 * 2 rings). The run is fully deterministic from the seed; the proof v2 in
 * `meta.proof` replays server-side through the same rules.
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image as RNImage, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useFont, useImage } from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { GameShellV2, type GameResult, type GameShellV2Handle } from '../../gamekit/GameShellV2';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { useCamera } from '../../gamekit/fx/useCamera';
import { useGameClock } from '../../gamekit/useGameClock';
import { useWalkSense } from '../../gamekit/motion/useWalkSense';
import { useGameMusic } from '../../gamekit/audio/useGameMusic';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { Haptic, playHaptic, scheduleHaptics } from '../../gamekit/Haptics';
import { gridSteps } from '../../gamekit/core/hapticGrammar';
import { packHex } from '../../gamekit/core/particles';
import { useSessionRestore } from '../../gamekit/session/useSessionRestore';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import {
  A_CONTINUE, A_RESTART, A_SPLASH, A_TIP, A_TREAD, A_UNDO,
  applyAction, createRun, currentBoard, limitFor, movesToTurn, previewFor, starsFor, strokesLeft, tideAt, totalShells,
  treasureOf, shellsToNextStar, TIDE_LOW, simulateStroke, stepCell,
  type Board, type CqEvent, type CurrentQuestProofV2, type RunState, type VoyageResult,
} from './rules';
import { distanceFrom, hintFrom } from './solver';
import { boardRefs, knobsFor, pickRun, type RunContext } from './library';
import { addGhost, ghostFor, hintOf, loadProgress, saveProgress, type CqProgress, type GhostRun } from './progress';
import { LagoonBoard, type BoardImages, type BoardSV, type PreviewSV } from './LagoonBoard';
import {
  idlePlan, newFrame, planDuration, PLAN_BUMP, PLAN_CHEER, PLAN_IDLE, PLAN_STROKE, PLAN_TREAD, PLAN_UNDO, PLAN_WHIRL,
  T_ANTIC, T_GRAB, T_TILE, T_TRAVEL, type MotionPlan,
} from './motion';
import { BottomBar, ArrowPad, StallCard } from './Controls';
import { QuestHud, type HudState } from './QuestHud';
import { GhostRail } from './GhostRail';
import { ShowdownRail, type RailRacer } from './ShowdownRail';
import {
  createBot, HOUSE_CREW, progressOf, compareRacers, splashTarget, stepBot, SHOWDOWN_WINDOW_MS,
  type Bot, type RacerProgress,
} from './showdown';
import { boardLayout, cellCenter, CQ, type BoardLayout } from './theme';
import { themeSubtitle } from './themeSubtitle';
import {
  bedFor, BED_OPEN, CQ_PRELOAD, registerCqAudio, sfxAim, sfxBeached, sfxBump, sfxButton, sfxCarry, sfxChest, sfxFinalClear,
  sfxGolden, sfxLeftover, sfxPearl, sfxRingLost, sfxRingOn, sfxRiptide, sfxShells, sfxStall, sfxSwim, sfxTide, sfxTip,
  sfxTransition, sfxTread, sfxUndo, sfxUnlock, sfxWhirlpool,
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
const SLOT_NAMES = ['Warm-up', 'Standard', 'Treasure'];

interface StallInfo { nearMiss: string | null; hint: boolean }

function deriveSeed(base: number, attempt: number): number {
  let h = (base ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

function emptyShells(): boolean[][] { return [[false, false, false], [false, false, false], [false, false, false]]; }

export default function CurrentQuestGame({ visible, seed, themeId, context: contextProp, onClose, onQuit, onComplete }: CurrentQuestGameProps) {
  const context: RunContext = contextProp ?? (seed != null ? 'line' : 'quick');
  const knobs = knobsFor(context);
  const trial = knobs.profile === 'trial';
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

  // ---- layout -----------------------------------------------------------------
  const [field, setField] = useState<{ w: number; h: number } | null>(null);
  const [arrows, setArrows] = useState(false);
  const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setField((f) => (f && Math.abs(f.w - width) < 1 && Math.abs(f.h - height) < 1 ? f : { w: width, h: height }));
  }, []);
  const layout: BoardLayout | null = useMemo(() => {
    if (!field) return null;
    const reserved = 58 + 120 + (arrows ? 150 : 0) + 16;
    return boardLayout(field.w, field.h - reserved);
  }, [field, arrows]);

  // ---- art ---------------------------------------------------------------------
  const images: BoardImages = {
    swim: useImage(require('../../assets/games/current-quest/shark_swim_side.png')),
    dash: useImage(require('../../assets/games/current-quest/shark_dash_chomp.png')),
    ouch: useImage(require('../../assets/games/current-quest/shark_bonked.png')),
    cheer: useImage(require('../../assets/games/current-quest/shark_cheer.png')),
    dizzy: useImage(require('../../assets/games/current-quest/shark_dizzy.png')),
    rock: useImage(require('../../assets/games/current-quest/coral_rock.png')),
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

  // ---- engine clocks, camera, walk sense ---------------------------------------
  const clock = useGameClock({ autostart: true, config: { freezeBudget: 0.06 } });
  const walk = useWalkSense({ active: visible });
  const walking = walk.walking || !!movement?.moving;
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
    flow: useSharedValue(0),
    riptide: useSharedValue(0),
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
  const [ribbon, setRibbon] = useState<{ title: string; sub: string | null; key: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [tipPulse, setTipPulse] = useState(false);
  const [spentChip, setSpentChip] = useState(0);
  const [inspect, setInspect] = useState<{ text: string; x: number; y: number } | null>(null);
  const [splitChip, setSplitChip] = useState<{ text: string; good: boolean; key: number } | null>(null);
  const [treasure, setTreasure] = useState(0);
  const [elapsedNow, setElapsedNow] = useState(0);
  const busyUntil = useRef(0);
  const buffered = useRef<number | null>(null);
  const playing = useRef(false);
  const startedAt = useRef(0);
  const times = useRef<number[][]>([[], [], []]);
  const readyAt = useRef<number[]>([0, 0, 0]);
  const pathStack = useRef<number[][]>([]);
  const pearlStep = useRef(0);
  const swimStep = useRef(0);
  const firstStall = useRef(true);
  const gov = useRef(createGovernor());
  const strokeNo = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelHaptics = useRef<(() => void) | null>(null);
  const lastStrokeAt = useRef(Date.now());
  const misfires = useRef<number[]>([]);
  const lastCommitAt = useRef(0);
  const shellsRef = useRef<boolean[][]>(emptyShells());
  // Showdown (14.1): house-crew racers, incoming splashes, the 3-minute window.
  const showdown = context === 'showdown';
  const bots = useRef<Bot[]>([]);
  const [racers, setRacers] = useState<RailRacer[]>([]);
  const [sdRemaining, setSdRemaining] = useState(SHOWDOWN_WINDOW_MS);
  const incoming = useRef<{ from: string; readyAt: number }[]>([]);
  const bumps = useRef<Record<number, number>>({});
  const [podium, setPodium] = useState<RailRacer[] | null>(null);
  const finishing = useRef(false);
  const [bed, setBed] = useState<string | null>(null);

  const later = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(fn, Math.max(0, ms));
    timers.current.push(t);
    return t;
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelHaptics.current?.();
    cancelHaptics.current = null;
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

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
    const next = bedFor(low, strokesLeft(run), v.flow >= 3);
    setBed((cur) => {
      if (cur && cur !== next) {
        // Stem layers of one mix keep their position.
        void GameAudio.music.switchTo(next, 'bar', 350, true);
        return next;
      }
      return cur ?? next;
    });
  }, []);

  // ---- helpers: geometry --------------------------------------------------------------
  const center = useCallback((i: number) => (layout ? cellCenter(layout, i) : { x: 0, y: 0 }), [layout]);
  const boardOrigin = useRef({ x: 0, y: 0 });
  const toField = useCallback((x: number, y: number) => ({ x: x + boardOrigin.current.x, y: y + boardOrigin.current.y }), []);

  // ---- HUD sync ---------------------------------------------------------------------------
  const syncHud = useCallback((run: RunState) => {
    const b = currentBoard(run);
    const v = run.voyage;
    let taken = 0;
    for (let k = 0; k < b.pearls.length; k++) if (v.mask & (1 << k)) taken++;
    setHud({
      voyage: run.complete ? 2 : run.index,
      pearls: b.pearls.length,
      pearlsTaken: taken,
      hasGolden: b.golden >= 0,
      goldenTaken: v.golden,
      shells: shellsRef.current.map((s) => s.slice()),
      voyages: run.boards.length,
      flow: Math.min(3, v.flow),
      riptide: v.flow >= 3,
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

  /** Board visual state straight from the engine (after undo, restart, restore). */
  const syncBoardVisuals = useCallback((run: RunState, animateTide = true) => {
    const s = svRef.current;
    const b = currentBoard(run);
    const v = run.voyage;
    const picks = [-1, -1, -1, -1];
    for (let k = 0; k < b.pearls.length; k++) if (v.mask & (1 << k)) picks[k] = -1e9;
    if (b.golden >= 0 && v.golden) picks[b.pearls.length] = -1e9;
    s.picks.value = picks;
    s.pickQueue.value = [];
    s.chest.value = v.mask === (1 << b.pearls.length) - 1 ? 1 : 0;
    const k = b.P ? (v.moves + v.phase) % b.P : 0;
    const low = tideAt(b.P, v.moves, v.phase) === TIDE_LOW;
    const drop = !b.P ? 0 : low ? 8 - 2 * Math.min(3, k) : 2 * Math.min(3, k);
    s.tideDrop.value = animateTide ? withTiming(drop, { duration: 650 }) : drop;
    s.flow.value = Math.min(3, v.flow);
    s.riptide.value = withTiming(v.flow >= 3 ? 1 : 0, { duration: 200 });
    s.nervous.value = strokesLeft(run) <= 2 ? 1 : 0;
  }, []);

  // ---- previews (7.2) ------------------------------------------------------------------------
  const refreshPreviews = useCallback((run: RunState) => {
    if (!layout) return;
    const b = currentBoard(run);
    const v = run.voyage;
    const leftNow = strokesLeft(run);
    const out: PreviewSV[] = [];
    for (let a = 0; a <= 4; a++) {
      const pv = previewFor(run, a);
      if (!pv.valid) { out.push({ valid: 0, red: 0, pts: [], lx: 0, ly: 0, facing: 1, rot: 0, beached: 0, clears: 0 }); continue; }
      let red = 0;
      if (leftNow <= 2 && !pv.clears) {
        // Solver on the landing copy: can this stroke still reach the chest in budget?
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
      out.push({ valid: 1, red, pts, lx: land.x, ly: land.y, facing, rot, beached: pv.beached ? 1 : 0, clears: pv.clears ? 1 : 0 });
    }
    svRef.current.previews.value = out;
  }, [layout, center]);

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
    if (pv.ignitesRiptide) return 'RIPTIDE next!';
    if (pv.clears) return 'Treasure!';
    if (pv.tideTurns) return 'Tide turns';
    return null;
  }, []);

  // ---- starting a voyage ---------------------------------------------------------------------
  const showRibbon = useCallback((run: RunState) => {
    const b = currentBoard(run);
    setRibbon({ title: `${SLOT_NAMES[run.index]}: ${b.name}`, sub: b.teach ?? null, key: Date.now() });
    later(b.teach ? 2600 : 1300, () => setRibbon(null));
  }, [later]);

  const beginVoyage = useCallback((run: RunState, rise: boolean) => {
    const s = svRef.current;
    const b = currentBoard(run);
    const start = center(b.start);
    s.plan.value = { ...idlePlan(start.x, start.y, 1), t0: -1 };
    s.trail.value = [];
    s.hint.value = [];
    s.swirl.value = 0;
    s.gridA.value = 1;
    s.undoTint.value = 0;
    if (rise) s.riseT0.value = s.fxT.value;
    syncBoardVisuals(run, false);
    pathStack.current = [];
    pearlStep.current = 0;
    swimStep.current = 0;
    firstStall.current = true;
    setStall(null);
    syncHud(run);
    refreshPreviews(run);
    setBedFor(run);
    showRibbon(run);
    readyAt.current[run.index] = Math.max(0, Date.now() + (rise ? 720 : 0) - startedAt.current);
    busyUntil.current = Date.now() + (rise ? 700 : 0);
    lastStrokeAt.current = Date.now();
  }, [center, syncBoardVisuals, syncHud, refreshPreviews, setBedFor, showRibbon]);

  // New run whenever the boards change (fresh open, play again, retry).
  useEffect(() => {
    if (!visible || !boards || !layout || !restore.ready) return;
    clearTimers();
    finishing.current = false;
    shellsRef.current = emptyShells();
    times.current = [[], [], []];
    readyAt.current = [0, 0, 0];
    setResult(null);
    setFailed(false);
    setTreasure(0);
    let run = createRun(boards, knobs);
    // Interrupted run on this exact seed: replay its actions (deterministic, exact restore).
    const snap = restore.snapshot?.state;
    if (snap && Array.isArray(snap.actions)) {
      for (let vi = 0; vi < snap.actions.length; vi++) {
        for (const a of snap.actions[vi]) {
          const res = applyAction(run, a);
          if (res.ok) {
            run = res.run;
            for (const ev of res.events) if (ev.type === 'clear') {
              shellsRef.current[ev.index] = [ev.result.shellClear, ev.result.shellPar, ev.result.shellGolden];
            }
          }
        }
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
    setTreasure(treasureOf(run.results));
    beginVoyage(run, true);
    if (run.voyage.strokes > 0) {
      const p = center(run.voyage.pos);
      svRef.current.plan.value = { ...idlePlan(p.x, p.y, 1), beached: run.voyage.beached ? 1 : 0, t0: -1 };
      syncBoardVisuals(run, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, boards, layout !== null, restore.ready]);

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
      beached: ev.beached ? 1 : 0, wasBeached: ev.wasBeached && ev.dir >= 0 ? 1 : 0, bx: 0, by: 0, speed: 1,
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

    // Sound: one trigger per beat.
    if (ev.dir < 0) {
      sfxTread();
      burst('bubbles', ev.path[0], { count: 8 });
      Haptic.tapLight();
    } else if (ev.carried > 0) {
      sfxSwim(swimStep.current++ % 5);
      later(tAtPath(1, wb) - 10, () => sfxCarry(ev.carried));
      const carryStart = tAtPath(1, wb);
      cancelHaptics.current?.();
      const steps = [{ at: 0, p: 'light' as const }, ...gridSteps(Math.min(3, ev.carried), carryStart + T_GRAB, T_TILE, 'selection')];
      if (ev.carried > 3) steps.push(...gridSteps(ev.carried - 3, carryStart + T_GRAB + T_TILE * 3, T_TILE, 'light', 'selection'));
      steps.push({ at: endAt + 40, p: 'medium' as const });
      cancelHaptics.current = scheduleHaptics(steps);
      // Current flare + grid fade + camera lead.
      const runIdx = findRun(b, ev.path[1]);
      later(carryStart, () => {
        s.flareRun.value = runIdx;
        s.flareT.value = s.fxT.value;
        s.gridA.value = withTiming(0, { duration: 200 });
        const d = dirBetween(ev.path[1], ev.path[2] ?? ev.path[1]);
        if (!reducedMotion) camera.kick([0, 6, 0, -6][d] ?? 0, [-6, 0, 6, 0][d] ?? 0);
      });
      for (let k = 2; k < ev.path.length; k++) {
        later(tAtPath(k, wb), () => burst('bubbles', ev.path[k], { count: reducedMotion ? 2 : 4 }));
      }
      later(endAt + 40, () => {
        burst('splash', ev.path[ev.path.length - 1], { count: reducedMotion ? 4 : 8 });
        const d = dirBetween(ev.path[ev.path.length - 2], ev.path[ev.path.length - 1]);
        if (!reducedMotion) camera.kick([0, -2, 0, 2][d] ?? 0, [2, 0, -2, 0][d] ?? 0);
        s.gridA.value = withTiming(1, { duration: 300 });
      });
    } else {
      sfxSwim(swimStep.current++ % 5);
      scheduleHaptics([{ at: 0, p: 'light' }, { at: endAt, p: 'light' }]);
      later(T_ANTIC + 20, () => burst('bubbles', ev.path[0], { count: 3 }));
      later(endAt, () => {
        const c = center(ev.path[ev.path.length - 1]);
        const p = toField(c.x, c.y + 6);
        fx.current?.ring(p.x, p.y, { color: '#ffffff', from: 6, to: (layout?.cell ?? 60) * 0.45, ms: 260 });
      });
    }

    // Pearls: sparkle where taken, bank to the HUD together on landing (Hades magnetism).
    for (const p of ev.pearls) {
      const at = tAtPath(p.at, wb);
      later(at, () => {
        burst('sparkles', p.cell, { count: reducedMotion ? 4 : 10 });
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
            fx.current?.burst('glints', p.x, p.y, { count: 6, tx: 30 + k * 24, ty: 26, magnetDelay: 0.05, magnetDur: 0.38 });
          });
        }
        const r = runRef.current;
        if (r) syncHud(r);
      });
    }

    // Golden pearl (9.9): the one hit-stop of the stroke, at the end of the movement.
    if (ev.golden) {
      later(endAt, () => {
        const now = Date.now();
        const big = claimBig(gov.current, sn, PRI_GOLDEN);
        if (big && requestHitStop(gov.current, sn)) clock.hitStop(90, { force: true });
        sfxGolden();
        playHaptic('golden');
        burst('coins', ev.path[ev.goldenAt], { count: reducedMotion ? 6 : 18, color: packHex(CQ.gold) });
        burst('stars', ev.path[ev.goldenAt], { count: reducedMotion ? 3 : 6 });
        const c = center(ev.path[ev.goldenAt]);
        const fp = toField(c.x, c.y);
        fx.current?.ring(fp.x, fp.y, { color: CQ.gold, from: 8, to: (layout?.cell ?? 60) * 1.6, ms: 320 });
        const alpha = requestFlash(gov.current, now, 0.18);
        if (alpha > 0) fx.current?.bloom(fp.x, fp.y, { radius: (layout?.cell ?? 60) * 1.8, peak: alpha, ms: 120, color: '#ffffff' });
        if (big && !reducedMotion && requestPunch(gov.current, now)) camera.punch(0.035, 90);
        banner('GOLDEN!', PRI_GOLDEN, 0, 500);
        const r = runRef.current;
        if (r) syncHud(r);
      });
    }

    // Unlock (9.9): padlock shakes and breaks, chest lid peeks.
    if (ev.unlocked) {
      const at = tAtPath(ev.unlockedAt, wb) + 60;
      later(at, () => {
        claimBig(gov.current, sn, PRI_UNLOCK);
        s.chest.value = 1;
        s.unlockT.value = s.fxT.value;
        sfxUnlock();
        scheduleHaptics([{ at: 0, p: 'medium' }, { at: 70, p: 'medium' }]);
        burst('shards', b.chest, { count: reducedMotion ? 2 : 4, color: packHex(CQ.gold) }, -(layout?.cell ?? 60) * 0.3);
        const c = center(b.chest);
        const fp = toField(c.x, c.y - 10);
        fx.current?.ring(fp.x, fp.y, { color: CQ.gold, from: 10, to: (layout?.cell ?? 60) * 0.9, ms: 400 });
      });
    }

    // Riptide ignite (9.3).
    if (ev.riptideIgnite) {
      later(endAt, () => {
        const big = claimBig(gov.current, sn, PRI_RIPTIDE);
        sfxRiptide();
        playHaptic('feverStart');
        s.riptide.value = withTiming(1, { duration: 200 });
        if (big) banner('RIPTIDE!', PRI_RIPTIDE, 0, 650);
        burst('stars', ev.path[ev.path.length - 1], { count: reducedMotion ? 4 : 16, color: packHex(CQ.gold) });
      });
    } else if (ev.flow === 0 && s.riptide.value > 0) {
      s.riptide.value = withTiming(0, { duration: 300 });
    }
    later(endAt, () => { s.flow.value = Math.min(3, ev.flow); });

    // Tide turn (9.6), non-blocking.
    if (!ev.cleared && b.P) {
      later(endMove + 20, () => {
        const r = runRef.current;
        if (!r || r.index !== run.index) return;
        syncBoardVisuals(r);
        if (ev.tideAfter !== ev.tideBefore) {
          sfxTide();
          Haptic.hitSoft();
          for (let i = 0; i < 25; i++) if (b.tiles[i] === 's') burst(ev.tideAfter === TIDE_LOW ? 'splash' : 'bubbles', i, { count: reducedMotion ? 3 : 6 });
          banner(ev.tideAfter === TIDE_LOW ? 'LOW TIDE' : 'HIGH TIDE', 1, 2, 520);
        } else if (movesToTurn(b.P, r.voyage.moves, r.voyage.phase) === 1) {
          Haptic.tickSelection();
        }
        setBedFor(r);
      });
    }
    if (ev.beached) later(endMove + 40, () => { sfxBeached(); Haptic.hitSoft(); burst('puff', ev.path[ev.path.length - 1], { count: 6 }); });

    // Low strokes escalation (6).
    later(endAt, () => {
      const r = runRef.current;
      if (!r) return;
      s.nervous.value = ev.left <= 2 && !ev.cleared ? 1 : 0;
      syncHud(r);
      setBedFor(r);
    });

    return { dur, endAt, endMove, clearEv };
  }, [center, toField, burst, later, layout, reducedMotion, camera, clock, banner, syncHud, syncBoardVisuals, setBedFor]);

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
    if (!r) return;
    const list = [
      { seat: 0, name: 'You', avatar: 'you' as const, you: true, p: progressOf(r, times.current.flat()), shield: r.voyage.shield },
      ...bots.current.map((b) => ({ seat: b.seat.seat, name: b.seat.name, avatar: b.seat.avatar, you: false, p: progressOf(b.run, b.times), shield: b.run.voyage.shield })),
    ];
    const sorted = [...list].sort((a, b) => compareRacers(a.p, b.p));
    const rail = list.map((x) => ({
      seat: x.seat, name: x.name, avatar: x.avatar, you: x.you, cleared: x.p.voyagesCleared, shells: x.p.shells, strokes: x.p.strokes,
      finished: x.p.finished, shield: x.shield, bump: bumps.current[x.seat] ?? 0, place: sorted.indexOf(x) + 1,
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
    const ordered = [...rail].sort((a, b) => a.place - b.place);
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
      banner('1ST PLACE!', PRI_GOLDEN, 0, 1100);
      burst('confetti', currentBoard(run).chest, { count: reducedMotion ? 8 : 30 }, -(layout?.cell ?? 60));
    } else {
      sfxChest();
      Haptic.success();
      banner(done ? `${['1ST', '2ND', '3RD', '4TH'][place - 1]} PLACE` : 'OUT OF TIME', PRI_GOLDEN, done ? 0 : 1, 1000);
    }
    const p = s.shark.value;
    s.plan.value = { ...idlePlan(p.x, p.y, p.facing), kind: PLAN_CHEER, t0: -1 };
    const tr = treasureOf(run.results);
    const proof: CurrentQuestProofV2 = {
      game: 'current', v: 2, context, profile: knobs.profile, rings: 0, seed: runSeed, treasure: tr, stars: starsFor(shells, done), shells,
      elapsed_ms: now,
      voyages: boardRefs(run.boards).map((ref, i) => ({ id: ref.id, tf: ref.tf, a: run.actions[i].slice(), t: times.current[i].slice(), ready: readyAt.current[i] })),
    };
    later(3200, () => {
      setPodium(null);
      setResult({
        score: shells,
        stars,
        thresholds: { one: 2, two: 4, three: 6 },
        message: done ? (place === 1 ? 'Showdown won!' : `${['1st', '2nd', '3rd', '4th'][place - 1]} place`) : 'Out of time',
        stats: [
          { label: 'Place', value: `${place} of ${rail.length}` },
          { label: 'Shells', value: `${shells}/6` },
          { label: 'Strokes', value: String(me?.strokes ?? 0) },
        ],
        meta: { proof, showdown: { place, racers: ordered.map((x) => ({ name: x.name, shells: x.shells, strokes: x.strokes, finished: x.finished })) }, seed: runSeed, context, v: 2 },
      });
    });
  };
  const finishShowdownRef = useRef(finishShowdown);
  finishShowdownRef.current = finishShowdown;

  useEffect(() => {
    if (!showdown || !visible) return;
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
    const shells = totalShells(run.results);
    const stars = starsFor(shells, true);
    const tr = treasureOf(run.results);
    const s = svRef.current;
    const b = currentBoard(run);
    sfxFinalClear();
    Haptic.success();
    const chestC = center(b.chest);
    s.chest.value = 2;
    // Leftover payout (Sugar Crush) on 6+ shells.
    const leftover = Math.max(0, lastResult.limit - lastResult.spent);
    const big = shells >= 6;
    burst('coins', b.chest, { count: reducedMotion ? 8 : shells >= 9 ? 26 : big ? 20 : 12 }, -(layout?.cell ?? 60) * 0.3);
    if (big && leftover > 0) later(500, () => sfxLeftover(Math.min(10, leftover)));
    s.plan.value = { ...idlePlan(chestC.x, chestC.y - (layout?.cell ?? 60) * 0.35, 1), kind: PLAN_CHEER, t0: -1 };
    s.breath.value = withSequence(withTiming(0.06, { duration: 250 }), withTiming(0, { duration: 250 }));
    if (shells >= 9) {
      later(300, () => {
        banner('TIDE MASTER', PRI_GOLDEN, 0, 900);
        burst('confetti', b.chest, { count: reducedMotion ? 8 : 30 }, -(layout?.cell ?? 60));
        if (!reducedMotion) camera.punch(0.04, 120);
      });
    } else {
      banner(shells >= 6 ? 'TREASURE!' : 'CLEARED!', PRI_GOLDEN, 0, 700);
    }
    const elapsed = Date.now() - startedAt.current;
    const proof: CurrentQuestProofV2 = {
      game: 'current', v: 2, context, profile: knobs.profile, rings: knobs.rings, seed: runSeed,
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
    const nextStar = shellsToNextStar(shells);
    later(shells >= 9 ? 2400 : shells >= 6 ? 1900 : 1400, () => {
      setResult({
        // Shells are the headline (design 3.5); treasure is only a small tiebreak line.
        score: shells,
        stars,
        thresholds: { one: 3, two: 6, three: 8 },
        message: shells >= 9 ? 'Tide Master! 9 of 9 shells' : `${shells} of 9 shells`,
        stats: [
          { label: 'Treasure', value: tr.toLocaleString('en-US') },
          { label: 'Strokes', value: String(strokes.reduce((a, x) => a + x, 0)) },
          ...(nextStar ? [{ label: 'Next star', value: `${nextStar} more shell${nextStar === 1 ? '' : 's'}` }] : []),
        ],
        meta: { proof, score: tr, shells, stars, seed: runSeed, context, attempt, v: 2 },
      });
    });
  }, [center, burst, later, layout, reducedMotion, camera, banner, context, knobs.profile, knobs.rings, runSeed, attempt]);

  const presentClear = useCallback((run: RunState, ev: Extract<CqEvent, { type: 'clear' }>, startIn: number) => {
    const s = svRef.current;
    const r = ev.result;
    shellsRef.current[ev.index] = [r.shellClear, r.shellPar, r.shellGolden];
    later(startIn, () => {
      const b = run.boards[ev.index];
      if (requestHitStop(gov.current, strokeNo.current)) clock.hitStop(60);
      s.chest.value = 2;
      sfxChest();
      Haptic.success();
      burst('coins', b.chest, { count: reducedMotion ? 4 : r.shellPar ? 8 : 4, color: packHex(CQ.gold) }, -(layout?.cell ?? 60) * 0.3);
      if (r.shellGolden) burst('splash', b.chest, { count: reducedMotion ? 6 : 12 });
      s.breath.value = withSequence(withTiming(0.06, { duration: 250 }), withTiming(0, { duration: 250 }));
      setTreasure((t) => t + r.treasure);
      later(120, () => { sfxShells(r.shells); scheduleHaptics(gridSteps(r.shells, 0, 110, 'selection')); });
      const cur = runRef.current;
      if (cur) syncHud(cur);
      if (showdown && r.shellPar) sendPlayerSplash();
      if (showdown) { bumps.current[0] = Date.now(); refreshRail(); }
      // Split-delta chip vs the ghost (Trackmania).
      if (ghost && ghost.strokes[ev.index] != null) {
        const d = r.strokes - ghost.strokes[ev.index];
        setSplitChip({ text: d === 0 ? 'Even with your ghost' : `${d > 0 ? '+' : ''}${d} stroke${Math.abs(d) === 1 ? '' : 's'} vs ghost`, good: d <= 0, key: Date.now() });
        later(1800, () => setSplitChip(null));
      }
    });
    if (ev.runComplete) {
      later(startIn + 250, () => { const cur = runRef.current; if (cur) (showdown ? finishShowdownRef.current(cur) : finishRun(cur, r)); });
      return;
    }
    const nextAt = startIn + (r.shells >= 3 ? 600 : r.shells === 2 ? 500 : 350);
    later(nextAt, () => {
      const cur = runRef.current;
      if (!cur) return;
      sfxTransition();
      setVoyageIdx(cur.index);
      beginVoyage(cur, true);
    });
  }, [later, clock, burst, reducedMotion, layout, syncHud, ghost, finishRun, beginVoyage]);

  const presentStall = useCallback((run: RunState, startIn: number) => {
    const s = svRef.current;
    later(startIn, () => {
      sfxStall();
      Haptic.warning();
      s.swirl.value = withTiming(1, { duration: 400 });
      const b = currentBoard(run);
      const v = run.voyage;
      // Near miss (Candy Crush): the solver says how far the chest really was.
      const d = distanceFrom(b, v, false);
      let nearMiss: string | null = null;
      if (Number.isFinite(d) && d <= 2) nearMiss = `So close! ${d} stroke${d === 1 ? '' : 's'} short.`;
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
      setStall({ nearMiss, hint });
    });
  }, [later, center]);

  const presentFail = useCallback((run: RunState, startIn: number) => {
    const s = svRef.current;
    finishing.current = true;
    later(startIn + 200, () => {
      const p = s.shark.value;
      s.plan.value = { ...idlePlan(p.x, p.y, p.facing), kind: PLAN_WHIRL, t0: -1 };
      sfxWhirlpool();
      sfxRingLost();
      Haptic.failBuzz();
      setFailed(true);
      setStall(null);
      GameAudio.music.setState('muffled', 600);
    });
    later(startIn + 1500, () => {
      GameAudio.music.setState('open', 300);
      const shells = totalShells(run.results);
      setResult({
        score: shells,
        stars: 0,
        thresholds: { one: 3, two: 6, three: 8 },
        message: 'The tide won this round',
        stats: [{ label: 'Voyages', value: `${run.results.length}/3` }, { label: 'Shells', value: `${shells}/9` }],
        meta: { failed: true, context, seed: runSeed, attempt, v: 2 },
      });
    });
  }, [later, context, runSeed, attempt]);

  // ---- applying actions -----------------------------------------------------------------------------------
  const applyNow = useCallback((action: number) => {
    const run = runRef.current;
    if (!run || finishing.current) return;
    const res = applyAction(run, action);
    if (!res.ok) return;
    const s = svRef.current;
    s.armed.value = -1;
    setChip(null);
    setInspect(null);
    lastStrokeAt.current = Date.now();
    setTipPulse(false);
    if (!res.recorded) {
      // Bump: pose swap, nudge, board shake, rattle. Never recorded.
      const bump = res.events[0] as Extract<CqEvent, { type: 'bump' }>;
      const from = center(run.voyage.pos);
      const target = bump.target >= 0 ? center(bump.target) : { x: from.x + [0, 1, 0, -1][bump.dir] * (layout?.cell ?? 60), y: from.y + [-1, 0, 1, 0][bump.dir] * (layout?.cell ?? 60) };
      s.plan.value = { ...idlePlan(from.x, from.y, s.plan.value.facing || 1), kind: PLAN_BUMP, t0: -1, pts: [from.x, from.y], bx: target.x, by: target.y };
      sfxBump(bump.reason);
      Haptic.hitRigid();
      if (!reducedMotion && requestShake(gov.current, Date.now())) camera.shake(0.18, [0, 1, 0, -1][bump.dir] ?? 0, [-1, 0, 1, 0][bump.dir] ?? 0);
      if (bump.reason === 'locked') s.rattleT.value = s.fxT.value;
      if (bump.reason === 'locked') setToast({ text: 'Grab every pearl to open the chest', key: Date.now() });
      if (bump.reason === 'dry') setToast({ text: 'Dry sandbar. Wait for high tide.', key: Date.now() });
      if (bump.reason === 'upstream') setToast({ text: 'Too strong to swim against', key: Date.now() });
      if (Date.now() - lastCommitAt.current < 1500) noteMisfire();
      busyUntil.current = Date.now() + 200;
      later(260, () => { const r = runRef.current; if (r) s.plan.value = { ...idlePlan(from.x, from.y, s.plan.value.facing || 1), beached: r.voyage.beached ? 1 : 0, t0: -1 }; });
      return;
    }
    const t = Date.now() - startedAt.current;
    const vi = run.index;
    times.current[vi].push(Math.max(t, (times.current[vi][times.current[vi].length - 1] ?? 0) + 1));
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
        s.plan.value = { kind: PLAN_UNDO, t0: -1, pts, carry, facing: s.plan.value.facing || 1, dive: 0, beached: next.voyage.beached ? 1 : 0, wasBeached: 0, bx: 0, by: 0, speed: 1.6 };
        dur = planDuration(s.plan.value);
        s.undoTint.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: Math.max(200, dur) }));
        sfxUndo();
        if (trial) { Haptic.tapLight(); setSpentChip(Date.now()); } else Haptic.tickSelection();
        syncBoardVisuals(next);
        s.hint.value = [];
        setStall(null);
        s.swirl.value = withTiming(0, { duration: 200 });
        if (Date.now() - lastCommitAt.current < 1500) noteMisfire();
      } else if (ev.type === 'restart') {
        const b = currentBoard(next);
        const st = center(b.start);
        const cur = s.shark.value;
        burst('splash', next.voyage.pos, { count: 8 });
        s.plan.value = { ...idlePlan(st.x, st.y, 1), t0: -1 };
        void cur;
        pathStack.current = [];
        pearlStep.current = 0;
        sfxTransition();
        if (ev.ringUsed) sfxRingLost();
        Haptic.hitMedium();
        syncBoardVisuals(next);
        s.hint.value = [];
        s.swirl.value = withTiming(0, { duration: 200 });
        setStall(null);
        dur = 300;
      } else if (ev.type === 'continue') {
        sfxRingOn();
        Haptic.hitMedium();
        s.swirl.value = withTiming(0, { duration: 200 });
        s.hint.value = [];
        setStall(null);
        const p = s.shark.value;
        const fp = toField(p.x, p.y);
        fx.current?.ring(fp.x, fp.y, { color: CQ.coral, from: 10, to: (layout?.cell ?? 60) * 0.7, ms: 300 });
        setToast({ text: '+2 strokes', key: Date.now() });
        dur = 250;
      } else if (ev.type === 'splash') {
        const p = s.shark.value;
        const fp = toField(p.x, p.y);
        if (ev.blocked) {
          fx.current?.ring(fp.x, fp.y, { color: '#ffffff', from: 12, to: (layout?.cell ?? 60) * 0.9, ms: 300 });
          fx.current?.burst('bubbles', fp.x, fp.y, { count: 12 });
          setToast({ text: 'Shield popped the Splash!', key: Date.now() });
          Haptic.hitMedium();
        } else {
          syncBoardVisuals(next);
          sfxTide();
          Haptic.warning();
          if (!reducedMotion && requestShake(gov.current, Date.now())) camera.shake(0.22);
          if (layout) for (let i = 0; i < 25; i++) if (currentBoard(next).tiles[i] === 's') burst('splash', i, { count: 6 });
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
        if (ev.ringUsed) sfxRingLost();
        Haptic.tickSelection();
        setToast({ text: trial ? 'Tip used a ring. Follow the gold.' : 'Follow the gold. Par shell is gone.', key: Date.now() });
        dur = 100;
      }
    }
    busyUntil.current = Date.now() + Math.min(dur, 900);
    if (showdown) later(Math.min(dur, 900), refreshRail);
    syncHud(next);
    refreshPreviews(next);
    // Persist the exact state for an instant resume after any interruption.
    lastCommitAt.current = Date.now();
    later(Math.min(dur, 900) + 10, () => {
      const b = buffered.current;
      buffered.current = null;
      if (b !== null) applyNowRef.current(b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, layout, reducedMotion, camera, later, presentStroke, presentClear, presentStall, presentFail, trial, syncBoardVisuals, burst, toField, syncHud, refreshPreviews]);
  const applyNowRef = useRef(applyNow);
  applyNowRef.current = applyNow;

  const commit = useCallback((action: number) => {
    if (!playing.current || finishing.current || result) return;
    if (Date.now() < busyUntil.current) { buffered.current = action; return; }
    applyNowRef.current(action);
  }, [result]);

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
    if (dir < 0) { setChip(null); return; }
    sfxAim(dir);
    Haptic.tickSelection();
    setChip(chipFor(dir));
  }, [chipFor]);
  const onCancelAim = useCallback(() => setChip(null), []);
  const onInspect = useCallback((x: number, y: number) => {
    const run = runRef.current;
    if (!run || !layout) return;
    const c = Math.floor((x - layout.ax) / layout.cell);
    const r = Math.floor((y - layout.ay) / layout.cell);
    if (c < 0 || c > 4 || r < 0 || r > 4) { setInspect(null); return; }
    const i = r * 5 + c;
    const b = currentBoard(run);
    const v = run.voyage;
    const ch = b.tiles[i];
    const k = movesToTurn(b.P, v.moves, v.phase);
    const low = tideAt(b.P, v.moves, v.phase) === TIDE_LOW;
    let text = 'Open water';
    if (i === v.pos) text = v.beached ? 'Beached! Swim off any time, no cost.' : 'Your shark';
    else if (i === b.chest) text = v.mask === (1 << b.pearls.length) - 1 ? 'Treasure chest: open!' : 'Treasure chest: grab every pearl first';
    else if (ch === '#') text = 'Coral rock: blocks you and stops currents';
    else if (ch === 's') text = b.P ? `Sandbar: ${low ? 'dry' : 'underwater'} now, ${low ? 'floods' : 'dries'} in ${k} move${k === 1 ? '' : 's'}` : 'Sandbar';
    else if ('^>v<'.includes(ch)) text = `Current flowing ${['up', 'right', 'down', 'left']['^>v<'.indexOf(ch)]}: free ride, can't swim against it`;
    if (b.pearls.includes(i) && !(v.mask & (1 << b.pearls.indexOf(i)))) text = `Pearl. ${text === 'Open water' ? 'Needed to open the chest' : text}`;
    if (i === b.golden && !v.golden) text = 'Golden pearl: optional, worth a shell';
    const p = cellCenter(layout, i);
    setInspect({ text, x: p.x, y: p.y });
    Haptic.tickSelection();
  }, [layout]);

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

  // Tip idle pulse after 8 s with no stroke; walking freezes the idle count.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      if (walking) { lastStrokeAt.current += 1000; return; }
      if (playing.current && !finishing.current && Date.now() - lastStrokeAt.current > TIP_IDLE_MS) setTipPulse(true);
    }, 1000);
    return () => clearInterval(id);
  }, [visible, walking]);

  // ---- dev autoplay (studio capture only): plays with previews, one mistake + undo, then the gold route.
  const autoplay = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_CQ_AUTOPLAY === '1';
  const autoMistake = useRef<Record<number, boolean>>({});
  const autoNext = useRef(0);
  useEffect(() => {
    if (!autoplay || !visible) return;
    let stop = false;
    const tick = () => {
      if (stop) return;
      const run = runRef.current;
      const s = svRef.current;
      if (run && playing.current && !finishing.current && Date.now() > busyUntil.current + 250 && Date.now() > autoNext.current) {
        const b = currentBoard(run);
        const v = run.voyage;
        let a: number | undefined;
        let mistake = false;
        if (v.stalled) a = trial ? A_CONTINUE : A_UNDO;
        else if (run.index === 1 && !autoMistake.current[1] && v.strokes === 1) {
          // One wrong turn, felt and undone (shows the undo rewind).
          const good = hintFrom(b, v, 1, Infinity)[0];
          for (let d = 0; d < 4; d++) if (d !== good && previewFor(run, d).valid) { a = d; break; }
          autoMistake.current[1] = true;
          mistake = true;
          if (a !== undefined) { later(1100, () => commitRef.current(A_UNDO)); }
        } else a = hintFrom(b, v, 1, Infinity)[0];
        if (a !== undefined) {
          const act = a;
          if (act <= 4) { s.armed.value = act; onAim(act); }
          setTimeout(() => { s.armed.value = -1; commitRef.current(act); }, act <= 4 ? 520 : 50);
          autoNext.current = Date.now() + (mistake ? 1700 : 900);
        }
      }
      setTimeout(tick, 300);
    };
    const t = setTimeout(tick, 1500);
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
    GameAudio.music.setState('open', 200);
    setElapsedNow(0);
    if (run && run.voyage.strokes === 0) showRibbon(run);
  }, [restore.snapshot, showRibbon]);
  const handlePause = useCallback(() => {
    playing.current = false;
    buffered.current = null;
  }, []);
  const handleResume = useCallback(() => {
    playing.current = true;
    lastStrokeAt.current = Date.now();
    // Hitman GO re-find: a single gold ring pulse on the shark.
    const p = svRef.current.shark.value;
    const fp = toField(p.x, p.y);
    fx.current?.ring(fp.x, fp.y, { color: CQ.gold, from: 8, to: (layout?.cell ?? 60) * 0.8, ms: 400 });
  }, [toField, layout]);
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
      thresholds: { one: 3, two: 6, three: 8 },
      message: `${shells} shell${shells === 1 ? '' : 's'} so far`,
      stats: [{ label: 'Voyages', value: `${run.results.length}/3` }, { label: 'Shells', value: `${shells}/9` }],
      meta: { partial: true, context, seed: runSeed, v: 2 },
    };
  }, [context, runSeed]);
  const onRematch = useCallback(() => {
    // Play again on the same seed races your ghost; a failed Trial retries on fresh boards.
    clearTimers();
    if (failed || trial) setAttempt((a) => a + 1);
    else setBoardsKey((k) => k + 1);
    setResult(null);
    setFailed(false);
  }, [clearTimers, failed, trial]);

  // ---- controls callbacks -----------------------------------------------------------------------------------
  const onUndo = useCallback(() => { sfxButton(); commit(A_UNDO); }, [commit]);
  const onRestart = useCallback(() => { commit(A_RESTART); }, [commit]);
  const onContinue = useCallback(() => { commit(A_CONTINUE); }, [commit]);
  const onTip = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    if (trial) commit(A_TIP);
    else {
      // Puzzle: the tip is recorded (forfeits Par) so the server applies the same rule.
      commit(A_TIP);
    }
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

  // Toast auto-hide.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  // Ghost rail clock (async challenge).
  useEffect(() => {
    if (!ghost || !visible) return;
    const id = setInterval(() => { if (playing.current) setElapsedNow(Date.now() - startedAt.current); }, 500);
    return () => clearInterval(id);
  }, [ghost, visible]);

  // ---- render --------------------------------------------------------------------------------------------------
  const run = runRef.current;
  const board = run && boards ? boards[Math.min(voyageIdx, boards.length - 1)] : null;
  const shellsNow = shellsRef.current.flat().filter(Boolean).length;
  const par = board ? (hud?.goldenTaken ? board.parGold : board.par) : 0;
  const leftStyle = left <= 3 ? styles.counterHot : null;
  const counterPulse = useSharedValue(1);
  useEffect(() => {
    if (left <= 3 && left > 0) counterPulse.value = withSequence(withTiming(1.2, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [left, counterPulse]);
  const counterStyle = useAnimatedStyle(() => ({ transform: [{ scale: counterPulse.value }] }));
  const spent = limit - left;

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title="Current Quest"
      subtitle={themeSubtitle(themeId)}
      score={shellsNow}
      objective={showdown ? 'Showdown: 2 voyages vs the crew. Most shells wins.' : trial ? `3 voyages, ${knobs.rings} life rings. Beat par. Find the gold.` : '3 voyages. Beat par. Find the gold.'}
      result={result}
      thresholds={{ one: 3, two: 6, three: 8 }}
      resumeStyle="instant"
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
          {hud ? <QuestHud h={hud} walkingChip={walking} /> : <View style={{ height: 58 }} />}
          {showdown && racers.length ? <ShowdownRail racers={racers} remainingMs={sdRemaining} total={2} /> : null}
          {!showdown && ghost ? <GhostRail ghost={ghost} elapsedMs={elapsedNow} voyage={voyageIdx} cleared={run?.results.length ?? 0} /> : null}
          <View style={styles.boardArea}>
            {layout && board && stableImages.swim ? (
              <GestureDetector gesture={gesture}>
                <View
                  style={{ width: layout.cw, height: layout.ch }}
                  onLayout={(e) => { boardOrigin.current = { x: e.nativeEvent.layout.x + ((field?.w ?? layout.cw) - layout.cw) * 0, y: e.nativeEvent.layout.y }; }}
                  accessibilityLabel="Lagoon board. Swipe to swim, tap a tile to inspect."
                >
                  <Animated.View style={camera.style}>
                    <LagoonBoard key={`${board.id}:${voyageIdx}:${attempt}:${boardsKey}`} board={board} layout={layout} images={stableImages}
                      font={font} sv={sv} reducedMotion={reducedMotion} desaturate={failed} />
                  </Animated.View>
                  <Animated.View style={[styles.counter, leftStyle, counterStyle]} pointerEvents="none">
                    <Text style={[styles.counterTxt, left <= 3 && styles.counterTxtHot]}>{`${spent} / ${limit}`}</Text>
                    <Text style={styles.parTxt}>{`par ${par}`}</Text>
                  </Animated.View>
                  {spentChip ? (
                    <Animated.View key={spentChip} entering={FadeIn} exiting={FadeOut} style={styles.spentChip} pointerEvents="none">
                      <Text style={styles.spentTxt}>stroke spent</Text>
                    </Animated.View>
                  ) : null}
                  {chip ? (
                    <Animated.View entering={ZoomIn.duration(120)} style={[styles.aimChip, chip === 'No way home' && styles.aimChipRed, chip === 'RIPTIDE next!' && styles.aimChipGold]} pointerEvents="none">
                      <Text style={styles.aimTxt}>{chip}</Text>
                    </Animated.View>
                  ) : null}
                  {inspect ? (
                    <Animated.View entering={FadeIn.duration(120)} style={[styles.inspect, { left: Math.max(6, Math.min(layout.cw - 206, inspect.x - 100)), top: Math.max(4, inspect.y - (layout.cell * 1.3)) }]} pointerEvents="none">
                      <Text style={styles.inspectTxt}>{inspect.text}</Text>
                    </Animated.View>
                  ) : null}
                  {ribbon ? (
                    <Animated.View key={ribbon.key} entering={ZoomIn.springify().damping(11)} exiting={FadeOut} style={styles.ribbon} pointerEvents="none">
                      <Text style={styles.ribbonTxt}>{ribbon.title}</Text>
                      {ribbon.sub ? <Text style={styles.ribbonSub}>{ribbon.sub}</Text> : null}
                    </Animated.View>
                  ) : null}
                  {splitChip ? (
                    <Animated.View key={splitChip.key} entering={ZoomIn} exiting={FadeOut} style={[styles.split, splitChip.good ? styles.splitGood : styles.splitBad]} pointerEvents="none">
                      <Text style={styles.splitTxt}>{splitChip.text}</Text>
                    </Animated.View>
                  ) : null}
                  {stall && run ? (
                    <StallCard trial={trial} rings={run.rings} nearMiss={stall.nearMiss} hintShown={stall.hint}
                      onUndo={onUndo} onRestart={onRestart} onContinue={onContinue} />
                  ) : null}
                </View>
              </GestureDetector>
            ) : <View style={{ height: 300 }} />}
          </View>
          {toast ? (
            <Animated.View key={toast.key} entering={FadeIn.duration(120)} exiting={FadeOut} style={styles.toast} pointerEvents="none">
              <Text style={styles.toastTxt}>{toast.text}</Text>
            </Animated.View>
          ) : null}
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
            tipDisabled={!run || run.voyage.stalled || (trial && run.rings <= 0)}
            arrows={arrows}
            disabled={!!result || failed}
            onUndo={onUndo}
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
                <Text style={styles.podPlace}>{['1st', '2nd', '3rd', '4th'][i]}</Text>
                <RNImage source={AVATAR_IMG[r.avatar]} style={styles.podAvatar} />
                {i === 0 ? <RNImage source={CROWN} style={styles.podCrown} /> : null}
                <Text style={styles.podName}>{r.you ? 'You' : r.name}</Text>
                <Text style={styles.podStat}>{r.finished ? `${r.shells} shells, ${r.strokes} strokes` : 'out of time'}</Text>
              </Animated.View>
            ))}
          </Animated.View>
        ) : null}
        {layout ? <FxStage ref={fx} width={field?.w ?? layout.cw} height={field?.h ?? layout.ch} timeScale={clock.fxScale} reducedMotion={reducedMotion} style={styles.fx} /> : null}
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

function findRun(b: Board, cell: number): number {
  // Index of the current run containing `cell`, in the same order LagoonBoard builds them.
  const seen = new Set<number>();
  let idx = -1;
  for (let i = 0; i < 25; i++) {
    const d = '^>v<'.indexOf(b.tiles[i]);
    if (d < 0 || seen.has(i)) continue;
    let start = i;
    const back = (d + 2) % 4;
    for (;;) {
      const p = stepCell(start, back);
      if (p < 0 || '^>v<'.indexOf(b.tiles[p]) !== d || seen.has(p)) break;
      start = p;
    }
    idx++;
    let p = start;
    let hit = false;
    for (;;) {
      seen.add(p);
      if (p === cell) hit = true;
      const q = stepCell(p, d);
      if (q < 0 || '^>v<'.indexOf(b.tiles[q]) !== d || seen.has(q)) break;
      p = q;
    }
    if (hit) return idx;
  }
  return -1;
}

function dirBetween(a: number, b: number): number {
  const dr = Math.floor(b / 5) - Math.floor(a / 5);
  const dc = (b % 5) - (a % 5);
  if (Math.abs(dc) >= Math.abs(dr)) return dc >= 0 ? 1 : 3;
  return dr >= 0 ? 2 : 0;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  boardArea: { alignItems: 'center', justifyContent: 'center', paddingBottom: 10, flex: 1 },
  fx: { position: 'absolute', left: 0, top: 0 },
  arrowArea: { alignItems: 'center', paddingBottom: 4 },
  counter: {
    position: 'absolute', left: 4, top: 2, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: '#ffffff',
    borderWidth: 2.5, borderColor: CQ.ink, alignItems: 'center',
  },
  counterHot: { backgroundColor: '#ffe3df', borderColor: CQ.coral },
  counterTxt: { fontFamily: 'Shark', fontSize: 20, color: CQ.navy },
  counterTxtHot: { color: CQ.coral },
  parTxt: { fontFamily: 'Knockout', fontSize: 11, color: CQ.goldDeep, marginTop: -2 },
  spentChip: { position: 'absolute', left: 6, top: 52, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9, backgroundColor: CQ.coral, borderWidth: 1.5, borderColor: CQ.ink },
  spentTxt: { fontFamily: 'Knockout', fontSize: 12, color: '#ffffff' },
  aimChip: {
    position: 'absolute', alignSelf: 'center', top: 2, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: '#ffffff',
    borderWidth: 2.5, borderColor: CQ.ink,
  },
  aimChipRed: { backgroundColor: '#ffe3df', borderColor: CQ.coral },
  aimChipGold: { backgroundColor: '#fff3c2', borderColor: CQ.goldDeep },
  aimTxt: { fontFamily: 'Knockout', fontSize: 15, color: CQ.navy },
  inspect: { position: 'absolute', width: 200, padding: 8, borderRadius: 12, backgroundColor: CQ.cream, borderWidth: 2, borderColor: CQ.ink },
  inspectTxt: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy, textAlign: 'center' },
  ribbon: {
    position: 'absolute', alignSelf: 'center', bottom: 6, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14, backgroundColor: CQ.gold,
    borderWidth: 3, borderColor: CQ.ink, alignItems: 'center', maxWidth: '92%',
  },
  ribbonTxt: { fontFamily: 'Shark', fontSize: 19, color: CQ.navy },
  ribbonSub: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy, marginTop: 1, textAlign: 'center' },
  split: { position: 'absolute', right: 6, top: 2, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, borderWidth: 2, borderColor: CQ.ink },
  splitGood: { backgroundColor: '#d9f7c9' },
  splitBad: { backgroundColor: '#ffe3df' },
  splitTxt: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy },
  toast: {
    position: 'absolute', alignSelf: 'center', bottom: 104, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.95)',
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
