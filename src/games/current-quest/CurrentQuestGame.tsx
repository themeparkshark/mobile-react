/**
 * Current Quest (design v7.1): "Ride the current. Beat the tide. Find the treasure."
 *
 * A turn-based lagoon puzzle built to be played while walking forward in a
 * queue. Nothing ticks: look up at the line, look back down, and the board is
 * exactly where you left it. A Quick Run is a 5x5 Trick Shot that previews the
 * Deep board's aha, then the 5x7 Deep board (6 shells). Trials (Ride
 * Challenge, LinePlay bonus) are three Rookie voyages (9 shells): every stroke
 * counts, undo rewinds the board but strokes stay spent, a life ring gives 2
 * strokes at any time and a Tip uses a ring.
 *
 * Contexts: `quick` (Puzzle, queue play), `daily` (Daily Tide, 3 voyages, one
 * scored attempt per day, streak and share card), `chart` (one Lagoon Chart
 * node), `challenge` (a friend's seed), `line` (LinePlay bonus, Trial, 3
 * rings), `ride` (Ride Challenge coin, Trial, 2 rings, stake card) and
 * `showdown` (Ghost Race vs the house crew: 3 tide voyages, aimed Splashes,
 * counter-splash, First Find and the Shield).
 *
 * The run is fully deterministic from the seed; the proof v3 in `meta.proof`
 * replays server-side through the same rules (every action is stamped with its
 * engine-apply time, which also decides the free slip undo).
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image as RNImage, LayoutChangeEvent, Share, StyleSheet, Text, View } from 'react-native';
import { useFont } from '@shopify/react-native-skia';
import { useCqImage } from './cqImages';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { GameShellV2, type GameResult, type GameShellV2Handle, type ShellResultsArgs } from '../../gamekit/GameShellV2';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { useCamera } from '../../gamekit/fx/useCamera';
import { useGameClock } from '../../gamekit/useGameClock';
import { useWalkSense } from '../../gamekit/motion/useWalkSense';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { packHex } from '../../gamekit/core/particles';
import { usePerfTier } from '../../gamekit/perf/usePerfTier';
import { TIER_FULL, TIER_NAMES } from '../../gamekit/core/perfTier';
import { useSessionRestore } from '../../gamekit/session/useSessionRestore';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import {
  A_CONTINUE, A_RESTART, A_TIP, A_TREAD, A_UNDO,
  applyAction, createRun, currentBoard, haulOf, heightOf, movesToTurn, previewFor, ringAllowed, starsFor, starThresholds, strokesLeft,
  tideAt, tipAllowed, totalShells, shellsToNextStar, TIDE_LOW, simulateStroke, SLOT_LABEL,
  type Board, type CqEvent, type CurrentQuestProofV3, type RunState, type VoyageResult,
} from './rules';
import { canClear, distanceFrom, firstDeadState, hintFrom, solveBoard } from './solver';
import { authorRoute } from './author';
import { boardsOf, challengeUrl } from './challengeLink';
import { boardById, boardRefs, dailySeed, isScored, knobsFor, pickRun, voyagesFor, type RunContext } from './library';
import {
  addGhost, dailyNumber, ghostFor, hintOf, isNewBest, liveStreak, loadProgress, localDate, recordDaily, saveProgress, withBest,
  type CqProgress, type GhostRun,
} from './progress';
import { chartNode } from './chart';
import { LagoonBoard, runsOf, type BoardImages, type BoardSV, type PreviewSV } from './LagoonBoard';
import {
  carryTime, idlePlan, newFrame, planDuration, PLAN_BUMP, PLAN_CHEER, PLAN_STROKE, PLAN_TREAD, PLAN_UNDO, PLAN_WHIRL,
  T_ANTIC, T_GRAB, T_TRAVEL, type MotionPlan,
} from './motion';
import { ArrowPad, BottomBar, DeadSheet, type DeadSheetInfo } from './Controls';
import { HUD_ROW_H, QuestHud, RUN_BAR_H, type HudState } from './QuestHud';
import { RAIL_H, ShowdownRail, type RailRacer } from './ShowdownRail';
import { CqResultsCard, ResultsVeil, type CqResultsSummary, type PodiumRow, type RouteCompare } from './ResultsCard';
import { StakeCard } from './StakeCard';
import { ShareCard, type ShareCardData, type ShareCardHandle } from './ShareCard';
import {
  AIM_MS, closeAims, createBot, createRoom, HOUSE_CREW, placesOf, progressOf, racerOf, roomApply, sendSplash, stepBot,
  SHOWDOWN_WINDOW_MS, type Bot, type Room, type RoomEvent,
} from './showdown';
import { boardLayout, cellAt, cellCenter, CQ, type BoardLayout } from './theme';
import { themeSubtitle } from './themeSubtitle';
import {
  bedFor, bedSetFor, CQ_PRELOAD, registerCqAudio, sfxAim, sfxAmbience, sfxBeached, sfxBump, sfxButton, sfxCarry, sfxChest, sfxFinalClear,
  sfxGolden, sfxHandoff, sfxLeftover, sfxOpponentClear, sfxPearl, sfxRingLost, sfxRingOn, sfxRiptide, sfxShells, sfxShieldPop, sfxSoClose,
  sfxSplashIncoming, sfxStall, sfxSwim, sfxTally, sfxTide, sfxTideShort, sfxTip, sfxTransition, sfxTread, sfxUndo, sfxUnlock, sfxWhirlpool,
  sfxWin, sfxWrongTurn, sfxParSink, startSnareRoll, useCqMusic,
} from './audio';
import { carryPlan, cqSchedule, CQH } from './cqHaptics';
import {
  bannerAt, claimBig, createGovernor, PRI_GOLDEN, PRI_RIPTIDE, PRI_UNLOCK, requestFlash, requestHitStop, requestPunch, requestShake,
} from './fxGovernor';

const BACKDROP = require('../../assets/games/current-quest/backdrop.jpg');

export interface FriendChallenge {
  readonly seed: number;
  readonly name: string;
  readonly shells: number;
  readonly strokes: number;
  /** Exact board refs (`id~tf`) from the link, so both players sail the same voyages. */
  readonly boards?: readonly string[];
}

export interface CurrentQuestGameProps {
  visible: boolean;
  seed?: number;
  /** Legacy: the ride name. Never shown (design 10.2); the subtitle comes from `themeId`. */
  taskName?: string;
  themeId?: string;
  context?: RunContext;
  /** `chart`: the Lagoon Chart node to play. */
  chartNodeId?: string;
  /** `daily`: the park key and display name, and the park-local date (YYYY-MM-DD). */
  parkKey?: string;
  parkName?: string;
  date?: string;
  /** `challenge`: the friend run to beat (from a deep link). */
  challenge?: FriendChallenge | null;
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
/** Fixed bottom-bar height (64 pt targets while walking, labels, safe area pad), reserved so walking never re-lays the board. */
const BAR_H = 96;
const ARROWS_H = 68;

const deadQuietCopy = (trial: boolean) => (trial ? 'Undo rewinds the board. A ring gives 2 strokes.' : 'Undo or restart. Nothing is lost.');

function deriveSeed(base: number, attempt: number): number {
  let h = (base ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

/** Seed for retry `attempt` (1..4) of a run issued with `base` (server mirrors this). */
export { deriveSeed };

/** The surviving route of a voyage as board cells (each stroke's full carry path), rebuilt from its undo stack. */
function routeOf(board: Board, v: { pos: number; mask: number; golden: boolean; moves: number; phase: number; stack: readonly { pos: number; mask: number; golden: boolean; moves: number }[] }): number[] {
  const states = [...v.stack.map((x) => ({ pos: x.pos, mask: x.mask, golden: x.golden, moves: x.moves })), { pos: v.pos, mask: v.mask, golden: v.golden, moves: v.moves }];
  const cells: number[] = [states[0].pos];
  for (let k = 0; k + 1 < states.length; k++) {
    const a = states[k];
    const b = states[k + 1];
    const tide = tideAt(board.P, a.moves, v.phase);
    for (const d of [0, 1, 2, 3]) {
      const sim = simulateStroke(board, a.pos, a.mask, a.golden, tide, d);
      if (!sim.bump && sim.pos === b.pos && sim.mask === b.mask) { cells.push(...sim.path.slice(1)); break; }
    }
  }
  return cells;
}

/**
 * Is this voyage's Par shell gone, and which par target is live? The solver says whether either
 * route can still finish inside its par (display only, cached graph): the buoy sinks and the
 * Par socket cracks the moment neither can.
 */
function parState(b: Board, v: RunState['voyage']): { lost: boolean; target: number } {
  const plainOk = v.strokes + distanceFrom(b, v, false) <= v.parT;
  const goldOk = b.golden >= 0 && v.strokes + distanceFrom(b, v, true) <= v.parGoldT;
  const lost = v.undos > 0 || v.tips > 0 || v.continues > 0 || (!v.cleared && !plainOk && !goldOk);
  return { lost, target: v.golden || (!plainOk && goldOk) ? v.parGoldT : v.parT };
}

/** The challenge card names the margin (0.A.11): "You beat Maya by 1 stroke", never a time. */
function challengeMargin(c: FriendChallenge, shells: number, strokes: number): string {
  const ds = shells - c.shells;
  const dk = c.strokes - strokes;
  const by = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (ds > 0) return `You beat ${c.name} by ${by(ds, 'shell')}`;
  if (ds < 0) return `${c.name} wins by ${by(-ds, 'shell')}. Try again?`;
  if (dk > 0) return `You beat ${c.name} by ${by(dk, 'stroke')}`;
  if (dk < 0) return `${c.name} wins by ${by(-dk, 'stroke')}. Try again?`;
  return `Dead even with ${c.name}`;
}

function emptyShells(n: number): boolean[][] { return Array.from({ length: n }, () => [false, false, false]); }

/** Which shell to name in the NEXT STAR tease ("Par on the Deep board = 3 stars"). */
function nextStarTease(run: RunState, needed: number): string | null {
  if (needed <= 0) return null;
  const missing: string[] = [];
  run.results.forEach((r, i) => {
    const slot = SLOT_LABEL[run.boards[i].slot] ?? `voyage ${i + 1}`;
    if (!r.shellPar) missing.push(`Par on the ${slot} board`);
    if (!r.shellGolden) missing.push(`the golden pearl on the ${slot} board`);
  });
  if (!missing.length) return null;
  const first = missing[missing.length - 1];
  return needed === 1 ? `${first[0].toUpperCase()}${first.slice(1)} = next star` : `${needed} more shells, like ${first}`;
}

function dirBetween(a: number, b: number): number {
  const dr = Math.floor(b / 5) - Math.floor(a / 5);
  const dc = (b % 5) - (a % 5);
  if (Math.abs(dc) >= Math.abs(dr)) return dc >= 0 ? 1 : 3;
  return dr >= 0 ? 2 : 0;
}

/** Path-index time of a stroke beat on the J6 carry curve (grab 80 ms, then 110/90/75/65 ms per tile). */
function tAtPath(i: number, wasBeached: boolean): number {
  const w = wasBeached ? 120 : 0;
  if (i <= 0) return w;
  if (i === 1) return w + T_ANTIC + T_TRAVEL;
  return w + T_ANTIC + T_TRAVEL + T_GRAB + carryTime(i - 1);
}

interface Toast { text: string; key: number; tone?: 'gold' | 'coral' | 'white' }
interface StartCard { title: string; parFrom?: number; parTo?: number; tone: 'coral' | 'gold'; key: number }

export default function CurrentQuestGame({
  visible, seed, themeId, context: contextProp, chartNodeId, parkKey, parkName, date, challenge, onClose, onQuit, onComplete,
}: CurrentQuestGameProps) {
  const context: RunContext = contextProp ?? (seed != null ? 'line' : 'quick');
  const knobs = knobsFor(context);
  const trial = knobs.profile === 'trial';
  const scored = isScored(context);
  const showdown = context === 'showdown';
  const node = context === 'chart' && chartNodeId ? chartNode(chartNodeId) : undefined;
  const voyagesN = context === 'chart' ? 1 : voyagesFor(context);
  const today = date ?? localDate();
  const park = parkKey ?? 'lab-park';
  const reducedMotion = useReducedGameMotion();
  const movement = useContext(LinePlayMovementContext);
  const shellRef = useRef<GameShellV2Handle>(null);
  const fx = useRef<FxStageHandle>(null);
  const shareRef = useRef<ShareCardHandle>(null);

  // ---- seed, attempt, boards ------------------------------------------------
  const baseSeed = useMemo(() => {
    if (context === 'daily') return dailySeed(park, today);
    if (context === 'challenge' && challenge) return challenge.seed >>> 0;
    return seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0;
  }, [seed, visible, context, park, today, challenge]); // eslint-disable-line react-hooks/exhaustive-deps
  const [attempt, setAttempt] = useState(0);
  const runSeed = attempt === 0 ? baseSeed : deriveSeed(baseSeed, attempt);
  const [progress, setProgress] = useState<CqProgress | null>(null);
  useEffect(() => { void loadProgress().then(setProgress); }, []);
  const [boardsKey, setBoardsKey] = useState(0);
  const boards = useMemo<Board[] | null>(() => {
    if (!progress) return null;
    if (context === 'chart') { const b = node ? boardById(node.boardId) : undefined; return b ? [b] : pickRun(runSeed, 'quick', hintOf(progress)).slice(0, 1); }
    if (context === 'challenge' && challenge?.boards && attempt === 0) {
      const exact = boardsOf(challenge.boards);
      if (exact) return exact;
    }
    return pickRun(runSeed, context, hintOf(progress));
  },
  // Progress is read once per run so a finished run never reshuffles the next boards mid-play.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [runSeed, context, boardsKey, progress === null, chartNodeId]);
  const ghost = useMemo<GhostRun | null>(() => (progress && !showdown && context !== 'daily' ? ghostFor(progress, runSeed, context) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runSeed, context, progress === null, boardsKey]);
  // Race the Author (0.A.1): a chart node with a verified Gold sends the author route as a ghost.
  const authorActs = useMemo<number[]>(() => {
    // Dev capture hook: EXPO_PUBLIC_CQ_AUTHOR=1 shows the ghost without a prior Gold.
    const devForce = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_CQ_AUTHOR === '1';
    if (context !== 'chart' || !chartNodeId || !progress || (!devForce && (progress.chart[chartNodeId]?.medal ?? 0) < 3) || !boards) return [];
    return authorRoute(boards[0]);
  }, [context, chartNodeId, progress === null, boards]); // eslint-disable-line react-hooks/exhaustive-deps
  const authorShown = useRef(0);
  const thresholds = context === 'chart' ? { one: 1, two: 2, three: 3 } : starThresholds(voyagesN);
  const tiers: [number, number] = [thresholds.two, thresholds.three];
  const runKey = context === 'chart' ? `chart:${chartNodeId}` : context;

  const sessionKey = `cq:${context}:${runSeed}:${attempt}`;
  const restore = useSessionRestore<{ actions: number[][]; times: number[][]; ready: number[]; elapsed: number }>(visible && !showdown ? sessionKey : null);

  // ---- engine clocks, camera, walk sense, perf tier -----------------------------
  const clock = useGameClock({ autostart: true, config: { freezeBudget: 0.06 } });
  const walk = useWalkSense({ active: visible });
  const walking = walk.walking || !!movement?.moving;
  const tier = usePerfTier({ active: visible });
  const lite = tier.tierJs !== TIER_FULL;

  // ---- layout: 14 pt gutters; every chrome height reserved up front (walking never re-lays the board) --
  const [field, setField] = useState<{ w: number; h: number } | null>(null);
  const [arrows, setArrows] = useState(false);
  const [rowsNow, setRowsNow] = useState(5);
  const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setField((f) => (f && Math.abs(f.w - width) < 1 && Math.abs(f.h - height) < 1 ? f : { w: width, h: height }));
  }, []);
  const layoutFor = useCallback((rows: number): BoardLayout | null => {
    if (!field) return null;
    // 0.A.1: a run shows four things; only the Showdown keeps its racer rail (the ghost speaks through split chips).
    const rail = showdown ? RAIL_H : 0;
    const reserved = HUD_ROW_H + RUN_BAR_H + rail + BAR_H + (arrows ? ARROWS_H : 0);
    return boardLayout(field.w, field.h - reserved, rows, true);
  }, [field, arrows, showdown, ghost]);
  const layout = useMemo(() => layoutFor(rowsNow), [layoutFor, rowsNow]);
  // eslint-disable-next-line no-console
  if (__DEV__ && layout && process.env.EXPO_PUBLIC_CQ_LAYOUTLOG === '1') console.log('[cq-layout]', JSON.stringify({ field, rows: rowsNow, cell: layout.cell, cw: layout.cw, ch: layout.ch }));
  const layoutRef = useRef<BoardLayout | null>(layout);
  layoutRef.current = layout;

  // ---- art (Alex's originals + the gated GPT Image 2.5 pipeline set) ------------------
  const images: BoardImages = {
    idle: useCqImage(require('../../assets/games/current-quest/cq_shark_idle_swim.png')),
    dash: useCqImage(require('../../assets/games/current-quest/cq_shark_swim_dash.png')),
    surf: useCqImage(require('../../assets/games/current-quest/cq_shark_surf_ride.png')),
    ouch: useCqImage(require('../../assets/games/current-quest/cq_shark_bump_ouch.png')),
    cheer: useCqImage(require('../../assets/games/current-quest/cq_shark_cheer.png')),
    brace: useCqImage(require('../../assets/games/current-quest/cq_shark_brace.png')),
    dizzy: useCqImage(require('../../assets/games/current-quest/cq_shark_dizzy.png')),
    blink: useCqImage(require('../../assets/games/current-quest/cq_shark_idle_swim_blink.png')),
    coralA: useCqImage(require('../../assets/games/current-quest/coral_a.png')),
    coralB: useCqImage(require('../../assets/games/current-quest/coral_b.png')),
    coralC: useCqImage(require('../../assets/games/current-quest/coral_c.png')),
    sand: useCqImage(require('../../assets/games/current-quest/sandbar.png')),
    sandWet: useCqImage(require('../../assets/games/current-quest/sandbar_wet.png')),
    foam: useCqImage(require('../../assets/games/current-quest/foam_strip.png')),
    pearl: useCqImage(require('../../assets/games/current-quest/pearl.png')),
    golden: useCqImage(require('../../assets/games/current-quest/golden_pearl.png')),
    chestClosed: useCqImage(require('../../assets/games/current-quest/chest_closed.png')),
    chestOpen: useCqImage(require('../../assets/games/current-quest/chest_open.png')),
    padlock: useCqImage(require('../../assets/games/current-quest/padlock.png')),
    chevron: useCqImage(require('../../assets/games/current-quest/current_chevron.png')),
    socket: useCqImage(require('../../assets/games/current-quest/shell_socket.png')),
    bubble: useCqImage(require('../../assets/games/current-quest/shield_bubble.png')),
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
    shield: useSharedValue(0),
    shieldPopT: useSharedValue(-1e9),
    tidePip: useSharedValue(0),
    lowK: useSharedValue(0),
    parBuoy: useSharedValue(0),
    parSinkT: useSharedValue(-1e9),
    podium: [useSharedValue<number[]>([]), useSharedValue<number[]>([]), useSharedValue<number[]>([]), useSharedValue<number[]>([])],
    podiumT0: useSharedValue(-1),
    authorPts: useSharedValue<number[]>([]),
    authorT0: useSharedValue(0),
  };
  const svRef = useRef(sv);
  svRef.current = sv;
  useEffect(() => { sv.walking.value = walking ? 1 : 0; }, [walking, sv.walking]);

  // ---- run state ------------------------------------------------------------------
  const runRef = useRef<RunState | null>(null);
  const [voyageIdx, setVoyageIdx] = useState(0);
  const [hud, setHud] = useState<HudState | null>(null);
  const [dead, setDead] = useState<DeadSheetInfo | null>(null);
  const deadEpisode = useRef(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [summary, setSummary] = useState<CqResultsSummary | null>(null);
  const [share, setShare] = useState<ShareCardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [chip, setChip] = useState<string | null>(null);
  const [ribbon, setRibbon] = useState<{ title: string; sub: string | null; key: number; gold: boolean } | null>(null);
  const [startCard, setStartCard] = useState<StartCard | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [tipPulse, setTipPulse] = useState(false);
  const [smallChip, setSmallChip] = useState<{ text: string; tone: 'coral' | 'white'; key: number } | null>(null);
  const [inspect, setInspect] = useState<{ text: string; x: number; y: number } | null>(null);
  const [splitChip, setSplitChip] = useState<{ text: string; good: boolean; key: number } | null>(null);
  // Ride Challenge: the stake card is up from the first frame (it also covers the board's load), then GO.
  const [stake, setStake] = useState(context === 'ride');
  const stakeFor = useRef('');
  const [runReady, setRunReady] = useState(false);
  const busyUntil = useRef(0);
  const buffered = useRef<number | null>(null);
  const playing = useRef(false);
  const startedAt = useRef(0);
  const times = useRef<number[][]>(boards ? boards.map(() => []) : [[], [], []]);
  const readyAt = useRef<number[]>([0, 0, 0]);
  const pathStack = useRef<number[][]>([]);
  const pearlStep = useRef(0);
  const swimStep = useRef(0);
  const tideTurnsThisVoyage = useRef(0);
  const gov = useRef(createGovernor());
  const strokeNo = useRef(0);
  const lastStrokeAt = useRef(Date.now());
  const misfires = useRef<number[]>([]);
  const lastCommitAt = useRef(0);
  const shellsRef = useRef<boolean[][]>(emptyShells(3));
  const hudHold = useRef<{ index: number; left: number; golden: boolean; par: boolean } | null>(null);
  /** The tide the board is showing (it turns on the land frame, not on touch-up); the medallion follows it. */
  const tideShown = useRef<{ index: number; moves: number } | null>(null);
  const surgeUntil = useRef(0);
  const thinned = useRef(false);
  const scrubbing = useRef(false);
  const finishing = useRef(false);
  const runEndAt = useRef(0);
  // Showdown (14.1): the room (me + house crew), the window, the aim.
  const room = useRef<Room | null>(null);
  const bots = useRef<Bot[]>([]);
  const [racers, setRacers] = useState<RailRacer[]>([]);
  const [sdRemaining, setSdRemaining] = useState(SHOWDOWN_WINDOW_MS);
  const [aiming, setAiming] = useState(false);
  const bumps = useRef<Record<number, number>>({});
  const incomingAt = useRef<Record<number, number>>({});
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  // Music: the bed set alternates by run; it starts at a random bar on the Deep voyage (silent on the Trick Shot).
  const [bed, setBed] = useState<string | null>(null);
  const startBar = useMemo(() => [0, 4, 8, 12][(runSeed >>> 3) % 4], [runSeed]);
  const bedSet = useMemo(() => bedSetFor(progress?.runsCompleted ?? 0), [progress === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const tideTag = !!progress && progress.tideRuns < 3;

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
  useCqMusic(visible ? bed : null, startBar);
  const setBedFor = useCallback((run: RunState) => {
    const b = currentBoard(run);
    const v = run.voyage;
    // The Trick Shot plays on ambience and SFX only (11.2 v7); the bed enters on the next voyage.
    if (b.slot === 'trick' && run.boards.length > 1) { setBed(null); return; }
    const low = tideAt(b.P, v.moves, v.phase) === TIDE_LOW;
    setBed(bedFor(low, strokesLeft(run), Date.now() < surgeUntil.current, thinned.current, bedSet));
  }, [bedSet]);
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

  /** The author ghost follows your surviving stroke count: stroke k of yours, stroke k of the author's. */
  const syncAuthor = useCallback((run: RunState, reset = false) => {
    const s = svRef.current;
    if (!authorActs.length || !s.authorPts) return;
    const b = currentBoard(run);
    const k = Math.min(authorActs.length, run.voyage.stack.length);
    if (!reset && k === authorShown.current) return;
    let pos = b.start; let mask = 0; let gold = false; let path: number[] = [pos];
    for (let i = 0; i < k; i++) {
      const a = authorActs[i];
      const sim = simulateStroke(b, pos, mask, gold, tideAt(b.P, i, 0), a === A_TREAD ? -1 : a);
      path = sim.path; pos = sim.pos; mask = sim.mask; gold = sim.golden;
    }
    const stepped = !reset && k === authorShown.current + 1;
    const cells = stepped ? path : [pos];
    const pts: number[] = [];
    for (const c of cells) { const q = center(c); pts.push(q.x, q.y); }
    s.authorPts.value = pts;
    if (s.authorT0) s.authorT0.value = s.fxT.value;
    authorShown.current = k;
  }, [authorActs, center]);

  // ---- HUD sync ---------------------------------------------------------------------------
  const rankOf = useCallback((): { place: number; of: number } | null => {
    const r = room.current;
    if (!r) return null;
    const list = r.racers.map((x) => ({ seat: x.seat, p: progressOf(x.run, x.times) }));
    const places = placesOf(list);
    return { place: places[0], of: list.length };
  }, []);
  const tideMoves = (run: RunState) => {
    const t = tideShown.current;
    return t && t.index === run.index ? t.moves : run.voyage.moves;
  };
  const syncHud = useCallback((run: RunState) => {
    // A cleared voyage keeps its HUD (its shells fill, its strokes freeze) until the next tray rises.
    const hold = hudHold.current;
    if (hold) {
      setHud((h) => (h ? { ...h, voyage: hold.index, left: hold.left, shells: shellsRef.current.map((x) => x.slice()), goldenTaken: hold.golden, parLost: !hold.par } : h));
      return;
    }
    const b = currentBoard(run);
    const v = run.voyage;
    const left = strokesLeft(run);
    setHud({
      voyage: run.complete ? run.boards.length - 1 : run.index,
      voyages: run.boards.length,
      left,
      limit: v.limit + v.limitBonus,
      par: v.golden ? v.parGoldT : v.parT,
      shells: shellsRef.current.map((s) => s.slice()),
      hasGolden: b.golden >= 0,
      goldenTaken: v.golden,
      parLost: parState(b, v).lost,
      hasTide: b.P > 0,
      tideLow: tideAt(b.P, tideMoves(run), v.phase) === TIDE_LOW,
      P: b.P,
      movesToTurn: movesToTurn(b.P, tideMoves(run), v.phase),
      tideTag,
      rings: run.rings,
      ringsMax: knobs.rings,
      trial,
      tiers,
      rank: showdown ? rankOf() : null,
    });
    // Par buoy (0.A.14): shows the par target, sinks with a gurgle the moment Par is lost.
    const s = svRef.current;
    // Par = strokes <= par, or <= parGold once the golden pearl is banked; it is gone only when neither can still hold.
    const { lost, target } = parState(b, v);
    s.parBuoy.value = target;
    if (lost && s.parSinkT.value < 0) {
      s.parSinkT.value = s.fxT.value;
      sfxParSink();
      const c = cellCenter(layoutRef.current as BoardLayout, b.chest);
      const p = { x: c.x + boardOrigin.current.x, y: c.y + boardOrigin.current.y };
      if (layoutRef.current) fx.current?.burst('bubbles', p.x, p.y, { count: 6 });
    } else if (!lost && s.parSinkT.value >= 0) {
      s.parSinkT.value = -1e9;
    }
    // Tide warning pip over the shark at one move left (0.A.2: a warning only).
    const k = movesToTurn(b.P, tideMoves(run), v.phase);
    s.tidePip.value = b.P && k === 1 && !v.cleared ? (tideAt(b.P, v.moves, v.phase) === TIDE_LOW ? 2 : 1) : 0;
  }, [knobs.rings, trial, tideTag, showdown, rankOf, tiers[0], tiers[1]]); // eslint-disable-line react-hooks/exhaustive-deps

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
    tideShown.current = { index: run.index, moves: v.moves };
    const picks = [-1, -1, -1, -1];
    let banked = 0;
    for (let k = 0; k < b.pearls.length; k++) if (v.mask & (1 << k)) { picks[k] = -1e9; banked++; }
    if (b.golden >= 0 && v.golden) picks[b.pearls.length] = -1e9;
    s.picks.value = picks;
    s.pickQueue.value = [];
    s.banked.value = banked;
    s.chest.value = v.mask === (1 << b.pearls.length) - 1 ? 1 : 0;
    const drop = tideDropFor(b, v.moves, v.phase);
    const low = b.P && tideAt(b.P, v.moves, v.phase) === TIDE_LOW ? 1 : 0;
    s.tideDrop.value = animateTide ? withTiming(drop, { duration: 650 }) : drop;
    s.lowK.value = animateTide ? withTiming(low, { duration: 650 }) : low;
    s.nervous.value = strokesLeft(run) <= 2 && !v.cleared ? 1 : 0;
  }, []);

  // ---- previews (7.2) and "No way home" (0.A.3) ------------------------------------------------
  const refreshPreviews = useCallback((run: RunState) => {
    if (!layoutRef.current) return;
    const b = currentBoard(run);
    const v = run.voyage;
    const leftNow = strokesLeft(run);
    const out: PreviewSV[] = [];
    for (let a = 0; a <= 4; a++) {
      const pv = previewFor(run, a);
      if (!pv.valid) { out.push({ valid: 0, red: 0, pts: [], lx: 0, ly: 0, facing: 1, rot: 0, beached: 0, clears: 0, rip: 0, icons: [], turn: 0 }); continue; }
      // Any landing state that cannot clear inside the strokes left draws coral, at any count, in both profiles.
      const red = !pv.clears && !canClear(b, { pos: pv.path[pv.path.length - 1], mask: pv.mask, golden: pv.goldenHeld, moves: v.moves + 1, phase: v.phase }, leftNow - 1) ? 1 : 0;
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
      // Riptide is announced only where it is the par route's aha (0.A.1).
      const rip = pv.riptide && !!b.parIsRiptide ? 1 : 0;
      out.push({ valid: 1, red, pts, lx: land.x, ly: land.y, facing, rot, beached: pv.beached ? 1 : 0, clears: pv.clears ? 1 : 0, rip, icons: icons.slice(0, 15), turn: pv.tideTurns ? 1 : 0 });
    }
    // J14: any armed preview whose entry changed redraws with a soft tick.
    const prevArmed = svRef.current.armed.value;
    const old = svRef.current.previews.value[prevArmed];
    const neu = out[prevArmed];
    if (prevArmed >= 0 && old && neu && (old.red !== neu.red || old.lx !== neu.lx || old.ly !== neu.ly)) CQH.tick();
    svRef.current.previews.value = out;
  }, [center]);

  const chipFor = useCallback((a: number): string | null => {
    const run = runRef.current;
    if (!run || a < 0) return null;
    const b = currentBoard(run);
    const pv = previewFor(run, a);
    if (!pv.valid) {
      if (a === A_TREAD) return null;
      return pv.bump === 'upstream' ? 'Against the current' : pv.bump === 'locked' ? 'Chest is locked' : pv.bump === 'dry' ? 'Sandbar is dry' : null;
    }
    const prevs = svRef.current.previews.value;
    if (prevs[a]?.red) return 'No way home';
    if (a === A_TREAD) return pv.tideTurns ? 'Tread: 1 stroke, tide turns' : 'Tread: 1 stroke';
    if (pv.riptide && b.parIsRiptide) return 'RIPTIDE!';
    if (pv.clears) return 'Treasure!';
    if (pv.tideTurns) return 'Tide turns';
    return null;
  }, []);

  // ---- the dead sheet (0.A.3, J12) ---------------------------------------------------------------
  /** Wrong-turn X: the tile before the first stroke after which no clear fit the budget. */
  const markWrongTurn = useCallback((run: RunState): boolean => {
    const b = currentBoard(run);
    const v = run.voyage;
    const lim = v.limit + v.limitBonus;
    const states = [...v.stack.map((x) => ({ pos: x.pos, mask: x.mask, golden: x.golden, moves: x.moves, phase: v.phase })),
      { pos: v.pos, mask: v.mask, golden: v.golden, moves: v.moves, phase: v.phase }];
    const budget = [...v.stack.map((x) => lim - x.spent), lim - v.spent];
    const k = firstDeadState(b, states, budget);
    if (k <= 0) return false;
    const s = svRef.current;
    const c = center(states[k - 1].pos);
    s.wrong.value = [c.x, c.y];
    s.wrongT0.value = s.fxT.value + 200;
    later(200, () => { sfxWrongTurn(); CQH.rigid(); });
    return true;
  }, [center, later]);

  const checkDead = useCallback((run: RunState) => {
    if (run.complete || run.failed) { setDead(null); return; }
    const b = currentBoard(run);
    const v = run.voyage;
    const left = strokesLeft(run);
    if (v.cleared) { setDead(null); return; }
    const d = distanceFrom(b, v, false);
    if (v.stalled) {
      const near = Number.isFinite(d) && d <= 2 ? `So close! ${d} stroke${d === 1 ? '' : 's'} from the chest.` : 'Out of strokes';
      markWrongTurn(run);
      setDead({ kind: 'stall', title: near, body: trial ? (run.rings > 0 ? 'A ring gives 2 strokes.' : null) : deadQuietCopy(false) });
      deadEpisode.current = true;
      return;
    }
    if (d <= left) { deadEpisode.current = false; setDead(null); return; }
    if (deadEpisode.current) return; // already shown for this dead state; the player chose to keep swimming
    deadEpisode.current = true;
    markWrongTurn(run);
    const short = Number.isFinite(d) ? d - left : Infinity;
    const title = Number.isFinite(short) && short <= 2 ? `${short} stroke${short === 1 ? '' : 's'} short of the chest` : 'No way home';
    setDead({ kind: 'dead', title, body: deadQuietCopy(trial) });
    CQH.warning();
  }, [markWrongTurn, trial]);

  // ---- starting a voyage ---------------------------------------------------------------------
  const showRibbon = useCallback((run: RunState) => {
    const b = currentBoard(run);
    const deep = b.slot === 'treasure';
    const label = SLOT_LABEL[b.slot] ?? 'Voyage';
    const objective = run.index === 0 ? (trial ? 'Every stroke counts.' : 'Beat par, find the gold.') : null;
    if (challenge && context === 'challenge' && run.index === 0) {
      setRibbon({ title: `Beat ${challenge.name}`, sub: `${challenge.shells} shells in ${challenge.strokes} strokes`, key: Date.now(), gold: true });
      later(2200, () => setRibbon(null));
      return;
    }
    if (authorActs.length) {
      const rip = b.authorRiptide;
      setRibbon({ title: 'Race the Author', sub: `Author: Gold${rip ? ` + ${rip} Riptide${rip === 1 ? '' : 's'}` : ''}, ${authorActs.length} strokes`, key: Date.now(), gold: true });
      later(2200, () => setRibbon(null));
      return;
    }
    setRibbon({ title: `${label}: ${b.title ?? b.name}`, sub: b.teach ?? objective, key: Date.now(), gold: deep });
    later(b.teach ? 2600 : 900, () => setRibbon(null));
  }, [later, trial, authorActs, challenge, context]);

  const beginVoyage = useCallback((run: RunState, rise: boolean) => {
    const s = svRef.current;
    const b = currentBoard(run);
    const H = heightOf(b);
    // Lay the new board out now so every position below uses its rows.
    layoutRef.current = layoutFor(H);
    setRowsNow(H);
    const start = center(b.start);
    s.plan.value = { ...idlePlan(start.x, start.y, 1), beached: run.voyage.beached ? 1 : 0, t0: -1 };
    s.trail.value = [];
    s.hint.value = [];
    s.swirl.value = 0;
    s.gridA.value = 1;
    s.undoTint.value = 0;
    s.wrong.value = [];
    s.recap.value = [];
    s.recapPar.value = [];
    s.sway.value = [];
    if (rise) {
      s.riseT0.value = s.fxT.value;
      // Tiles thunk into place row by row (Lara Croft GO): a settle tick as the front, middle and back rows land.
      cqSchedule([0, Math.floor(H / 2), H - 1].map((r) => ({ at: 210 + r * 40, p: 'selection' as const })));
    }
    // Glance tour (500 ms, no camera move): chest glint, golden sparkle, shark ring. Any input skips it.
    s.tourT0.value = s.fxT.value + (rise ? 480 : 80);
    s.idleSince.value = s.fxT.value;
    syncBoardVisuals(run, false);
    pathStack.current = [];
    pearlStep.current = 0;
    swimStep.current = 0;
    tideTurnsThisVoyage.current = 0;
    deadEpisode.current = false;
    setDead(null);
    hudHold.current = null;
    syncHud(run);
    refreshPreviews(run);
    setBedFor(run);
    showRibbon(run);
    syncAuthor(run, true);
    // A splashed voyage plays the full tide sweep into its phase as the tray rises (9.6).
    if (run.voyage.phase !== 0) later(rise ? 420 : 60, () => { s.sweepT0.value = s.fxT.value; sfxTide(); CQH.soft(); });
    readyAt.current[run.index] = Math.max(0, Date.now() + (rise ? 720 : 0) - startedAt.current);
    // Input is live from the first frame (the rise is only 0.4 s and buffered commits wait for it).
    busyUntil.current = Date.now() + (rise ? 420 : 0);
    lastStrokeAt.current = Date.now();
  }, [center, layoutFor, syncBoardVisuals, syncHud, refreshPreviews, setBedFor, showRibbon, later, syncAuthor]);

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
    svRef.current.shield.value = 0;
    if (svRef.current.podiumT0) svRef.current.podiumT0.value = -1;
    svRef.current.podium?.forEach((x) => { x.value = []; });
    camera.frame(1);
    setResult(null);
    setSummary(null);
    setFailed(false);
    setIncomingFrom(null);
    let run = createRun(boards, knobs);
    // Interrupted run on this exact seed: replay its actions with their times (deterministic, exact restore).
    const snap = restore.snapshot?.state;
    if (snap && Array.isArray(snap.actions) && !showdown) {
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
    if (showdown) {
      const r = createRoom(runSeed, HOUSE_CREW, boards);
      room.current = r;
      run = r.racers[0].run;
      bots.current = HOUSE_CREW.map((seat) => createBot(runSeed, seat, 0));
      bumps.current = {};
      incomingAt.current = {};
      setSdRemaining(SHOWDOWN_WINDOW_MS);
      setAiming(false);
    } else {
      room.current = null;
    }
    runRef.current = run;
    setVoyageIdx(run.index);
    beginVoyage(run, true);
    setRunReady(true);
    // Ride Challenge: the stake card is the pre-start (the shell's count is off for rides), once per attempt.
    if (context === 'ride' && run.voyage.strokes === 0 && run.index === 0 && stakeFor.current !== sessionKey) {
      // The first attempt's card is already up from mount; a retry raises it again.
      if (stakeFor.current) setStake(true);
      stakeFor.current = sessionKey;
    } else if (context === 'ride' && !stakeFor.current) { stakeFor.current = sessionKey; setStake(false); }
    if (run.voyage.strokes > 0 || run.voyage.spent > 0) {
      const p = center(run.voyage.pos);
      svRef.current.plan.value = { ...idlePlan(p.x, p.y, 1), beached: run.voyage.beached ? 1 : 0, t0: -1 };
      syncBoardVisuals(run, false);
      syncHud(run);
      refreshPreviews(run);
    }
    if (showdown) refreshRail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, boards, field !== null, restore.ready]);

  // Board layout follows the field (rotation, arrows toggle).
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
  const presentStroke = useCallback((run: RunState, ev: Extract<CqEvent, { type: 'stroke' }>, allEvents: CqEvent[]) => {
    const s = svRef.current;
    const b = run.boards[Math.min(run.index - (allEvents.some((e) => e.type === 'clear') && !run.complete ? 1 : 0), run.boards.length - 1)];
    strokeNo.current += 1;
    const sn = strokeNo.current;
    const pts: number[] = [];
    for (const c of ev.path) { const p = center(c); pts.push(p.x, p.y); }
    const facing = s.plan.value.facing || 1;
    const clearEv = allEvents.find((e) => e.type === 'clear') as Extract<CqEvent, { type: 'clear' }> | undefined;
    const celebrate = ev.riptide && !!b.parIsRiptide;
    const plan: MotionPlan = {
      kind: ev.dir < 0 ? PLAN_TREAD : PLAN_STROKE, t0: -1, pts, carry: ev.carried, facing, dive: ev.cleared ? 1 : 0,
      beached: ev.beached ? 1 : 0, wasBeached: ev.wasBeached && ev.dir >= 0 ? 1 : 0, bx: 0, by: 0, speed: 1, rip: celebrate ? 1 : 0,
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

    // Sound: one trigger per beat. Haptics: at most 3 per carry, 100 ms apart (P13, J15).
    if (ev.dir < 0) {
      sfxTread();
      burst('bubbles', ev.path[0], { count: 8 });
      CQH.light();
    } else if (ev.carried > 0) {
      sfxSwim(swimStep.current++ % 5);
      const carryStart = tAtPath(1, wb);
      later(carryStart - 10, () => sfxCarry(ev.carried, celebrate));
      cancelHaptics.current?.();
      const spitAt = carryStart + T_GRAB + carryTime(ev.carried) + 40;
      cancelHaptics.current = cqSchedule(carryPlan(ev.carried, 0, carryStart + T_GRAB + carryTime(Math.floor(ev.carried / 2)), spitAt, celebrate));
      // Grab: a 5-particle spray fan on the lean-in, the run flares, the grid fades, the camera follows (J6).
      const runs = runsOf(b, null);
      const runIdx = runs.findIndex((r) => r.cells.includes(ev.path[1]));
      later(carryStart, () => {
        burst('splash', ev.path[1], { count: reducedMotion ? 2 : 5 });
        s.flareRun.value = runIdx;
        s.flareT.value = s.fxT.value;
        s.gridA.value = withTiming(0, { duration: 200 });
        const d = dirBetween(ev.path[1], ev.path[2] ?? ev.path[1]);
        if (!reducedMotion && !lite) {
          camera.kick([0, 6, 0, -6][d] ?? 0, [-6, 0, 6, 0][d] ?? 0);
          if (ev.carried >= 3) camera.frame(ev.carried >= 5 ? 1.06 : 1.04);
        }
      });
      for (let k = 2; k < ev.path.length; k++) {
        later(tAtPath(k, wb), () => burst(celebrate ? 'sparks' : 'bubbles', ev.path[k], celebrate ? { count: reducedMotion ? 2 : 6, color: packHex(CQ.gold) } : { count: reducedMotion ? 2 : 4 }));
      }
      for (const h of ev.handoffs) {
        // Hand-off between runs: a gold foam burst and a whoosh on Riptide-aha boards, a plain splash elsewhere.
        later(tAtPath(h, wb), () => {
          burst('splash', ev.path[h], { count: reducedMotion ? 3 : 8, ...(celebrate ? { color: packHex(CQ.gold) } : {}) });
          if (celebrate) sfxHandoff();
        });
      }
      swayNear(b, ev.path.slice(1), carryStart);
      later(endAt + 40, () => {
        burst('splash', ev.path[ev.path.length - 1], { count: reducedMotion ? 4 : 8 });
        const d = dirBetween(ev.path[ev.path.length - 2], ev.path[ev.path.length - 1]);
        if (!reducedMotion) camera.kick([0, -2, 0, 2][d] ?? 0, [2, 0, -2, 0][d] ?? 0);
        if (!reducedMotion && !lite && ev.carried >= 3) later(60, () => camera.frame(1));
        s.gridA.value = withTiming(1, { duration: 300 });
      });
    } else {
      sfxSwim(swimStep.current++ % 5);
      cqSchedule([{ at: 0, p: 'light' }, { at: endAt, p: 'light' }]);
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
      });
    }
    if (ev.pearls.length) {
      later(endAt + 30, () => {
        if (ev.carried === 0) CQH.medium();
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
        later(Math.max(0, endAt - 75), () => { clock.slowMo(0.35, 250, 120); camera.frame(1.06); });
        later(endAt + 380, () => camera.frame(1));
      }
      later(endAt, () => {
        const now = Date.now();
        const big = claimBig(gov.current, sn, PRI_GOLDEN);
        if (big && requestHitStop(gov.current, sn)) clock.hitStop(90, { force: true });
        sfxGolden();
        if (fever) sfxWin();
        cancelHaptics.current?.();
        cancelHaptics.current = CQH.golden();
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
        CQH.unlock();
        burst('shards', b.chest, { count: reducedMotion ? 2 : 4, color: packHex(CQ.gold) }, -cell * 0.3);
        const c = center(b.chest);
        const fp = toField(c.x, c.y - 10);
        fx.current?.ring(fp.x, fp.y, { color: CQ.gold, from: 10, to: cell * 0.9, ms: 400 });
      });
    }

    // Riptide stroke (3.6, 9.3): celebrated only on boards whose par route turns on it (0.A.1).
    if (celebrate) {
      later(endAt + 60, () => {
        const big = claimBig(gov.current, sn, PRI_RIPTIDE);
        sfxRiptide();
        surgeUntil.current = Date.now() + SURGE_MS;
        s.surge.value = withSequence(withTiming(1, { duration: 200 }), withTiming(1, { duration: SURGE_MS - 600 }), withTiming(0, { duration: 400 }));
        if (big) banner('RIPTIDE!', PRI_RIPTIDE, 0, 650);
        burst('stars', ev.path[ev.path.length - 1], { count: reducedMotion ? 4 : 16, color: packHex(CQ.gold) });
        const r = runRef.current;
        if (r) { syncHud(r); setBedFor(r); }
        later(SURGE_MS + 50, () => { const r2 = runRef.current; if (r2) { syncHud(r2); setBedFor(r2); } });
      });
      // Mini-Fever (0.A.1, Peggle): a Riptide that clears the voyage with Par alive.
      if (clearEv?.result.shellPar && !reducedMotion) {
        later(Math.max(0, endAt - 150), () => { clock.slowMo(0.5, 150, 80); camera.frame(1.04); });
        later(endAt + 220, () => { camera.frame(1); sfxWin(); });
      }
    }

    // Tide turn (9.6, J4), non-blocking. Full horizontal wave on the voyage's first turn, compact after.
    if (!ev.cleared && b.P) {
      later(endMove + 20, () => {
        const r = runRef.current;
        if (!r || r.index !== run.index) return;
        syncBoardVisuals(r);
        syncHud(r);
        if (ev.tideAfter !== ev.tideBefore) {
          const full = tideTurnsThisVoyage.current === 0;
          tideTurnsThisVoyage.current += 1;
          const toLow = ev.tideAfter === TIDE_LOW;
          if (full) {
            s.sweepT0.value = s.fxT.value;
            sfxTide();
            CQH.soft();
            banner(toLow ? 'LOW TIDE' : 'HIGH TIDE', 1, 2, 520);
          } else {
            sfxTideShort();
            CQH.tick();
          }
          const n = b.tiles.length;
          for (let i = 0; i < n; i++) {
            if (b.tiles[i] !== 's') continue;
            const delay = full ? (Math.floor(n / 5) - Math.floor(i / 5)) * 50 : 0;
            later(delay, () => burst(toLow ? 'splash' : 'bubbles', i, { count: reducedMotion ? 3 : full ? (toLow ? 10 : 6) : 4 }));
          }
        } else if (movesToTurn(b.P, r.voyage.moves, r.voyage.phase) === 1) {
          CQH.tick();
        }
        setBedFor(r);
      });
    }
    if (ev.beached) later(endMove + 40, () => { sfxBeached(); CQH.soft(); burst('puff', ev.path[ev.path.length - 1], { count: 6 }); });

    // Low strokes escalation (6): coral at 3 left, nervous idle + tom heartbeat at 2. Dead check on the land frame.
    later(endAt, () => {
      const r = runRef.current;
      if (!r) return;
      s.nervous.value = ev.left <= 2 && !ev.cleared ? 1 : 0;
      syncHud(r);
      setBedFor(r);
    });
    if (!ev.cleared) later(endMove + 30, () => { const r = runRef.current; if (r && r.index === run.index) checkDead(r); });

    return { dur, endAt, endMove, clearEv };
  }, [center, toField, burst, later, reducedMotion, lite, camera, clock, banner, syncHud, syncBoardVisuals, setBedFor, swayNear, checkDead]);

  // ---- Showdown -------------------------------------------------------------------------------------------
  const refreshRail = () => {
    const r = room.current;
    if (!r) return;
    const list = r.racers.map((x) => ({ x, p: progressOf(x.run, x.times) }));
    const places = placesOf(list);
    setRacers(list.map(({ x, p }, i) => ({
      seat: x.seat, name: x.name, avatar: x.avatar, you: x.seat === 0, cleared: p.voyagesCleared, shells: p.shells, strokes: p.strokes,
      finished: p.finished, shield: x.shield, bump: bumps.current[x.seat] ?? 0, place: places[i],
      incomingFrom: x.pending ? x.pending.from : null, incomingAt: incomingAt.current[x.seat] ?? 0, firstFinds: x.firstFinds.length,
      aimable: aiming && x.seat !== 0 && r.aims.some((a) => a.from === 0) && !x.run.complete && x.run.index < x.run.boards.length - 1 && !x.pending,
    })));
    svRef.current.shield.value = racerOf(r, 0)?.shield ? 1 : 0;
  };
  const refreshRailRef = useRef(refreshRail);
  refreshRailRef.current = refreshRail;
  useEffect(() => { if (showdown) refreshRail(); }, [aiming]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (seat: number) => (seat === 0 ? 'You' : racerOf(room.current as Room, seat)?.name ?? 'A racer');

  /** Presentation of the room's events (sends, landings, counters, First Finds). */
  const presentRoom = useCallback((evs: RoomEvent[]) => {
    const r = room.current;
    if (!r) return;
    const s = svRef.current;
    for (const e of evs) {
      if (e.type === 'clear' && e.seat !== 0) {
        bumps.current[e.seat] = Date.now();
        sfxOpponentClear();
        CQH.tick();
        setToast({ text: `${nameOf(e.seat)} cleared the ${SLOT_LABEL[r.boards[e.voyage].slot]}!`, key: Date.now() });
      } else if (e.type === 'aim') {
        setAiming(true);
        setToast({ text: 'Par! Tap a glowing racer to aim your Splash', key: Date.now(), tone: 'gold' });
        later(AIM_MS + 50, () => setAiming(false));
      } else if (e.type === 'sent') {
        incomingAt.current[e.to] = Date.now();
        bumps.current[e.from] = Date.now();
        if (e.to === 0) {
          setIncomingFrom(nameOf(e.from));
          banner(`SPLASH from ${nameOf(e.from)}!`, PRI_RIPTIDE, 1, 1100);
          sfxSplashIncoming();
          CQH.warning();
          setToast({ text: `Next voyage: SPLASH from ${nameOf(e.from)}. Clear this one at par to block it.`, key: Date.now(), tone: 'coral' });
        } else if (e.from === 0) {
          setAiming(false);
          setToast({ text: `Splash sent to ${nameOf(e.to)}`, key: Date.now(), tone: 'gold' });
          sfxTide();
        }
      } else if (e.type === 'no-target' && e.from === 0) {
        setToast({ text: 'Everyone is on their last voyage', key: Date.now() });
      } else if (e.type === 'blocked' && e.seat === 0) {
        setIncomingFrom(null);
        const p = s.shark.value;
        const fp = toField(p.x, p.y);
        if (e.by === 'shield') { s.shield.value = 0; s.shieldPopT.value = s.fxT.value; }
        fx.current?.burst('shards', fp.x, fp.y, { count: 8, color: packHex('#ffffff') });
        fx.current?.ring(fp.x, fp.y, { color: CQ.gold, from: 12, to: cellPx() * 1.1, ms: 320 });
        sfxShieldPop();
        CQH.medium();
        banner('BLOCKED!', PRI_GOLDEN, 0, 900);
      } else if (e.type === 'landed' && e.seat === 0) {
        setIncomingFrom(null);
        setStartCard({ title: `SPLASHED by ${nameOf(e.from)}`, parFrom: e.parFrom, parTo: e.parTo, tone: 'coral', key: Date.now() });
        later(2400, () => setStartCard(null));
        CQH.warning();
      } else if (e.type === 'first-find') {
        if (e.seat === 0) {
          setToast({ text: 'You found the gold first! Shield up.', key: Date.now(), tone: 'gold' });
          CQH.success();
          s.shield.value = 1;
        } else setToast({ text: `${nameOf(e.seat)} found the gold first!`, key: Date.now() });
      }
    }
    refreshRailRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [later, banner, toField]);

  const onAimSeat = useCallback((seat: number) => {
    const r = room.current;
    if (!r || !r.aims.some((a) => a.from === 0)) return;
    const ev = sendSplash(r, 0, seat, Date.now() - startedAt.current, true);
    CQH.medium();
    presentRoom([ev]);
  }, [presentRoom]);

  const finishShowdown = (run: RunState) => {
    const r = room.current;
    if (!r || (finishing.current && summary)) return;
    finishing.current = true;
    const now = Date.now() - startedAt.current;
    // Results land when everyone is done: the crew is deterministic, so play them out to the window.
    for (let t = Math.min(now, SHOWDOWN_WINDOW_MS); t <= SHOWDOWN_WINDOW_MS; t += 250) {
      for (const b of bots.current) stepBot(r, b, t);
      closeAims(r, t);
      if (r.racers.slice(1).every((x) => x.run.complete)) break;
    }
    const list = r.racers.map((x) => ({ x, p: progressOf(x.run, x.times) }));
    const places = placesOf(list);
    const podium: PodiumRow[] = list.map(({ x, p }, i) => ({
      seat: x.seat, name: x.name, avatar: x.avatar, you: x.seat === 0, place: places[i], shells: p.shells, strokes: p.strokes, finished: p.finished,
    })).sort((a, b) => a.place - b.place || (a.you ? -1 : 1));
    const place = places[0];
    const done = run.complete;
    const shells = totalShells(run.results);
    const tie = places.filter((p) => p === place).length > 1;
    const stars = !done ? 0 : place === 1 ? 3 : place === 2 ? 2 : 1;
    if (done && place === 1) {
      sfxFinalClear();
      CQH.success();
      banner(tie ? 'SHARED CROWN!' : '1ST PLACE!', PRI_GOLDEN, 0, 1100);
      burst('confetti', currentBoard(run).chest, { count: reducedMotion ? 8 : 30 }, -cellPx());
    } else {
      sfxChest();
      CQH.success();
      banner(done ? `${['1ST', '2ND', '3RD', '4TH'][place - 1]} PLACE` : 'OUT OF TIME', PRI_GOLDEN, done ? 0 : 1, 1000);
    }
    const s = svRef.current;
    const p = s.shark.value;
    s.plan.value = { ...idlePlan(p.x, p.y, p.facing), kind: PLAN_CHEER, t0: -1 };
    // Podium (J16): every racer's final route at once as a brush trail in their shark colour, camera pulls back.
    const last = r.boards.length - 1;
    const lb = r.boards[last];
    r.racers.forEach((x, k) => {
      if (k > 3) return;
      const onLast = x.run.complete || x.run.index === last;
      const cells = onLast ? routeOf(lb, x.run.voyage) : [];
      const pts: number[] = [];
      // A small per-racer offset so overlapping routes stay readable side by side.
      const off = (k - 1.5) * cellPx() * 0.07;
      for (const c of cells) { const q = center(c); pts.push(q.x + off, q.y + off); }
      (s.podium as NonNullable<typeof s.podium>)[k].value = pts.length >= 4 ? pts : [];
    });
    later(450, () => {
      s.podiumT0!.value = s.fxT.value;
      if (!reducedMotion) camera.frame(0.92);
    });
    const proof = proofOf(run, now, done ? starsFor(shells, true, run.boards.length) : 0, !done && run.failed);
    later(2700, () => {
      setSummary({
        title: done ? (place === 1 ? (tie ? 'Shared crown!' : 'Ghost Race won!') : `${['1st', '2nd', '3rd', '4th'][place - 1]} place`) : 'Out of time',
        grid: shellsRef.current.map((x) => x.slice()), stars, failed: false, newBest: false, nextStar: null,
        stamp: tie && place === 1 ? 'DEAD HEAT' : null, coinPour: 0, line: `Ranked on shells, then strokes, undos, Riptides and golden reach. Never time.`,
        podium, shareLabel: null,
      });
      setResult({
        score: shells, stars, thresholds,
        message: done ? (place === 1 ? 'Showdown won!' : `${['1st', '2nd', '3rd', '4th'][place - 1]} place`) : 'Out of time',
        stats: [{ label: 'Place', value: `${place} of ${list.length}` }, { label: 'Shells', value: `${shells}/${run.boards.length * 3}` }],
        meta: { proof, showdown: { place, tie, racers: podium }, seed: runSeed, context, v: 3, perf_tier: TIER_NAMES[tier.tierJs] },
      });
    });
  };
  const finishShowdownRef = useRef(finishShowdown);
  finishShowdownRef.current = finishShowdown;

  useEffect(() => {
    if (!showdown || !visible) return undefined;
    const id = setInterval(() => {
      const r = room.current;
      if (!r || !playing.current || finishing.current) return;
      const now = Date.now() - startedAt.current;
      setSdRemaining(SHOWDOWN_WINDOW_MS - now);
      const evs: RoomEvent[] = [];
      for (const b of bots.current) evs.push(...stepBot(r, b, now));
      evs.push(...closeAims(r, now));
      if (evs.length) presentRoom(evs);
      const me = runRef.current;
      if (now >= SHOWDOWN_WINDOW_MS && me && !me.complete) finishShowdownRef.current(me);
    }, 250);
    return () => clearInterval(id);
  }, [showdown, visible, presentRoom]);

  // ---- proof v3 ----------------------------------------------------------------------------------------
  const proofOf = (run: RunState, elapsed: number, stars: number, failedRun = false): CurrentQuestProofV3 => ({
    game: 'current', v: 3, context, profile: knobs.profile, rings: knobs.rings, seed: runSeed, attempt,
    haul: failedRun ? 0 : haulOf(run.results), stars, shells: totalShells(run.results), elapsed_ms: elapsed, banked: null,
    ...(failedRun ? { failed: true } : {}),
    voyages: boardRefs(run.boards).map((ref, i) => ({ id: ref.id, tf: ref.tf, sp: run.splashes[i] ?? null, a: run.actions[i].slice(), t: times.current[i].slice(), ready: readyAt.current[i] })),
  });

  // ---- clears, stall, fail, finish -------------------------------------------------------------------
  const finishRun = useCallback((run: RunState, lastResult: VoyageResult) => {
    finishing.current = true;
    const n = run.boards.length;
    const shells = totalShells(run.results);
    const stars = context === 'chart' ? Math.min(3, shells) : starsFor(shells, true, n);
    const s = svRef.current;
    const b = currentBoard(run);
    const cell = cellPx();
    sfxFinalClear();
    CQH.success();
    const chestC = center(b.chest);
    s.chest.value = 2;
    // Finale scaled by stars (9.8). 2+ stars: the leftover strokes become bubbles the shark gobbles (Sugar Crush).
    const leftover = Math.max(0, lastResult.limit - lastResult.spent);
    burst('coins', b.chest, { count: reducedMotion ? 8 : stars >= 3 ? 26 : stars >= 2 ? 20 : 12 }, -cell * 0.3);
    if (stars >= 2 && leftover > 0) later(500, () => { sfxLeftover(Math.min(10, leftover)); cqSchedule(Array.from({ length: Math.min(4, leftover) }, (_, k) => ({ at: k * 180, p: 'selection' as const }))); });
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
    const proof = proofOf(run, elapsed, stars);
    const strokes = run.results.map((r) => r.strokes);
    const pars = run.results.map((r) => r.parTarget);
    const clearAt = times.current.map((t) => t[t.length - 1] ?? 0);
    const grid = run.results.map((r) => [r.shellClear, r.shellPar, r.shellGolden]);
    const prog = progress;
    const newBest = !!prog && isNewBest(prog, runKey, shells);
    const tideMet = run.boards.some((x) => x.P > 0);
    let dailyNo = 0;
    void saveProgress((p) => {
      let next: CqProgress = { ...p, runsCompleted: p.runsCompleted + 1, tideSeen: p.tideSeen || tideMet, tideRuns: p.tideRuns + (tideMet ? 1 : 0), bestShells: Math.max(p.bestShells, shells) };
      next = withBest(next, runKey, shells);
      next.sketches = [...new Set([...p.sketches, ...run.results.filter((r) => r.shells === 3).map((r) => r.boardId.split('~')[0])])].slice(-400);
      if (context === 'daily') next = recordDaily(next, today, { shells, strokes, pars, grid }).next;
      if (context === 'chart' && chartNodeId) {
        const prev = p.chart[chartNodeId];
        next.chart = { ...p.chart, [chartNodeId]: { medal: Math.max(prev?.medal ?? 0, lastResult.medal), shells: Math.max(prev?.shells ?? 0, shells) } };
      }
      next.replays = [...p.replays, { at: Date.now(), again: false }].slice(-50);
      return addGhost(next, { seed: runSeed, context, shells, strokes, clearAt, at: Date.now() });
    }).then(setProgress);
    runEndAt.current = Date.now();
    if (context === 'daily') dailyNo = dailyNumber(today);
    const nextStar = shellsToNextStar(shells, n);
    const tease = context === 'chart'
      ? (lastResult.medal >= 3 && lastResult.medal < 4 ? `Author: Gold + ${b.authorRiptide} Riptide${b.authorRiptide === 1 ? '' : 's'}` : nextStarTease(run, 3 - shells))
      : nextStarTease(run, nextStar);
    const rideStamp = trial ? (shells >= 8 ? 'TIDE MASTER RIDE' : shells >= 6 ? 'PERFECT RIDE' : null) : null;
    const stamp = rideStamp ?? (stars >= 3 && !trial ? 'TIDE MASTER' : null);
    const strokesLine = `Strokes ${strokes.reduce((a, x) => a + x, 0)}, par ${pars.reduce((a, x) => a + x, 0)}`;
    const title = context === 'daily' ? `Daily Tide #${dailyNo}` : context === 'chart' ? (node?.name ?? 'Chart') : trial ? 'Ride cleared!' : shells >= n * 3 ? 'Tide Master!' : `${shells} of ${n * 3} shells`;
    const deepBoard = run.boards[run.boards.length - 1];
    setShare(context === 'daily' || trial || context === 'quick' ? {
      heading: context === 'daily' ? `Daily Tide #${dailyNo}` : trial ? 'Ride Challenge' : 'Quick Run',
      title: deepBoard.title ?? themeSubtitle(themeId),
      grid, strokes, pars, place: parkName ?? themeSubtitle(themeId), date: today,
      streak: context === 'daily' ? (prog ? liveStreak({ lastDaily: today, dailyStreak: prog.lastDaily === today ? prog.dailyStreak : (prog.lastDaily && Math.abs(new Date(today).getTime() - new Date(prog.lastDaily).getTime()) <= 86400000 ? prog.dailyStreak + 1 : 1) }, today) : 1) : 0,
      stamp,
    } : null);
    later(stars >= 3 ? 2200 : stars >= 2 ? 1700 : 1300, () => {
      sfxTally(shells);
      setSummary({
        title, grid, stars, failed: false, newBest, nextStar: tease, stamp, coinPour: trial ? [0, 4, 7, 10][stars] : 0,
        line: challenge ? challengeMargin(challenge, shells, strokes.reduce((a, x) => a + x, 0)) : strokesLine,
        podium: null,
        shareLabel: context === 'daily' ? 'Share Daily' : trial ? 'Share ride' : null,
        routes: compareRoutes(run, lastResult),
      });
      setResult({
        score: shells,
        stars,
        thresholds,
        message: `${shells} of ${n * 3} shells`,
        rival: ghost ? { name: 'your ghost', score: ghost.shells } : null,
        stats: [{ label: 'Strokes', value: String(strokes.reduce((a, x) => a + x, 0)) }],
        meta: { proof, score: proof.haul, shells, stars, seed: runSeed, context, attempt, v: 3, perf_tier: TIER_NAMES[tier.tierJs], chart: chartNodeId ?? null, daily: context === 'daily' ? today : null },
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, burst, later, reducedMotion, camera, banner, context, knobs.profile, knobs.rings, runSeed, attempt, ghost, tier.tierJs, progress, runKey, today, chartNodeId, node, trial, challenge, parkName, themeId]);

  /** Results: your final-voyage route beside the par route (non-sealed Puzzle contexts only; 0.A.14). */
  const compareRoutes = (run: RunState, last: VoyageResult): RouteCompare | null => {
    if (trial || showdown || context === 'daily' || scored) return null;
    const b = run.boards[run.boards.length - 1];
    if (b.id.startsWith('sealed')) return null;
    const mine = routeOf(b, run.voyage);
    const sol = solveBoard(b);
    const acts = last.shellGolden && sol.solutionGold.length ? sol.solutionGold : sol.solution;
    const par: number[] = [b.start];
    let pos = b.start; let mask = 0; let gold = false;
    acts.forEach((a, i) => {
      const sim = simulateStroke(b, pos, mask, gold, tideAt(b.P, i, run.voyage.phase), a === A_TREAD ? -1 : a);
      par.push(...sim.path.slice(1)); pos = sim.pos; mask = sim.mask; gold = sim.golden;
    });
    return { tiles: b.tiles, H: heightOf(b), chest: b.chest, mine, par, mineStrokes: last.strokes, parStrokes: acts.length };
  };

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
    hudHold.current = { index: ev.index, left: Math.max(0, r.limit - r.spent), golden: r.shellGolden, par: r.shellPar };
    const recap = !r.shellPar && !ev.runComplete && !scored && !showdown && context !== 'daily' && !reducedMotion && !run.boards[ev.index].id.startsWith('sealed');
    setDead(null);
    later(startIn, () => {
      const b = run.boards[ev.index];
      shellsRef.current[ev.index] = [r.shellClear, r.shellPar, r.shellGolden];
      if (requestHitStop(gov.current, strokeNo.current)) clock.hitStop(60);
      s.chest.value = 2;
      sfxChest();
      CQH.success();
      const cell = cellPx();
      // Scaled by shells (9.8): clear only, + Par (coin pop), + Golden (splash burst, leftover gobble).
      burst('coins', b.chest, { count: reducedMotion ? 4 : r.shellPar ? 16 : 10, color: packHex(CQ.gold) }, -cell * 0.3);
      if (r.shellPar) burst('bubbles', b.chest, { count: 6 }, -cell * 0.2);
      if (r.shellGolden) burst('splash', b.chest, { count: reducedMotion ? 6 : 12 });
      s.breath.value = withSequence(withTiming(0.06, { duration: 250 }), withTiming(0, { duration: 250 }));
      later(120, () => { sfxShells(r.shells); cqSchedule(Array.from({ length: r.shells }, (_, k) => ({ at: k * 160, p: 'selection' as const }))); });
      if (r.shells >= 3 && !ev.runComplete) {
        const left = Math.max(0, Math.min(8, r.limit - r.spent));
        if (left) later(480, () => sfxLeftover(left));
      }
      const cur = runRef.current;
      if (cur) syncHud(cur);
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
    // 1.1 to 1.7 s scaled by shells, overlapping the next board's rise; a recap holds the board a little longer.
    const nextAt = startIn + (recap ? 1150 : r.shells >= 3 ? 700 : r.shells === 2 ? 550 : 400);
    later(nextAt, () => {
      const cur = runRef.current;
      if (!cur) return;
      sfxTransition();
      setVoyageIdx(cur.index);
      beginVoyage(cur, true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [later, clock, burst, reducedMotion, syncHud, ghost, finishRun, beginVoyage, scored, showdown, showRecap, context]);

  const presentStall = useCallback((run: RunState, startIn: number) => {
    const s = svRef.current;
    later(Math.min(startIn, 700), () => {
      sfxStall();
      CQH.warning();
      s.swirl.value = withTiming(1, { duration: 300 });
      // First stall of a voyage: the free first-stroke footprint from the voyage start (Par is already gone).
      const b = currentBoard(run);
      const v = run.voyage;
      const [first] = hintFrom(b, { pos: b.start, mask: 0, golden: false, moves: 0, phase: v.phase }, 1);
      if (first !== undefined && s.hint.value.length === 0) {
        const sim = simulateStroke(b, b.start, 0, false, tideAt(b.P, 0, v.phase), first === A_TREAD ? -1 : first);
        const c = center(sim.pos);
        s.hint.value = [c.x, c.y];
        s.hintT0.value = s.fxT.value + 100000; // hold while the sheet is up
      }
      later(300, () => { const r = runRef.current; if (r) checkDead(r); });
    });
  }, [later, center, checkDead]);

  const presentFail = useCallback((run: RunState, startIn: number) => {
    const s = svRef.current;
    finishing.current = true;
    setDead(null);
    later(Math.min(startIn, 500) + 100, () => {
      const p = s.shark.value;
      s.plan.value = { ...idlePlan(p.x, p.y, p.facing), kind: PLAN_WHIRL, t0: -1 };
      sfxWhirlpool();
      sfxRingLost();
      CQH.fail();
      setFailed(true);
      GameAudio.music.setState('muffled', 600);
      later(650, () => sfxSoClose());
    });
    later(Math.min(startIn, 500) + 1000, () => {
      GameAudio.music.setState('open', 300);
      const shells = totalShells(run.results);
      const v = run.voyage;
      const b = currentBoard(run);
      const d = distanceFrom(b, v, false);
      const near = Number.isFinite(d) && d <= 2 ? `${d} stroke${d === 1 ? '' : 's'} from the chest` : null;
      setSummary({
        title: 'So close!', grid: shellsRef.current.map((x) => x.slice()), stars: 0, failed: true, newBest: false,
        nextStar: near, stamp: null, coinPour: 0, line: `${run.results.length} of ${run.boards.length} voyages cleared`, podium: null, shareLabel: null,
      });
      setResult({
        score: shells,
        stars: 0,
        thresholds,
        message: 'The tide won this round',
        stats: [{ label: 'Voyages', value: `${run.results.length}/${run.boards.length}` }],
        meta: { failed: true, proof: proofOf(run, Date.now() - startedAt.current, 0, true), context, seed: runSeed, attempt, v: 3 },
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [later, context, runSeed, attempt]);

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

  const noteMisfire = () => {
    const now = Date.now();
    misfires.current = [...misfires.current.filter((t) => now - t < 20000), now];
    if (misfires.current.length >= 2 && !arrows && progress && !progress.misfireHintShown) {
      setToast({ text: 'Try the arrow buttons while walking? Menu > Arrows', key: now });
      void saveProgress((p) => ({ ...p, misfireHintShown: true })).then(setProgress);
    }
  };

  const applyNow = useCallback((action: number) => {
    const run = runRef.current;
    if (!run || finishing.current) return;
    // The proof time for an action is the moment the engine applies it (7.3).
    const vi = run.index;
    const prevT = times.current[vi][times.current[vi].length - 1] ?? 0;
    const t = Math.max(Date.now() - startedAt.current, prevT + 1);
    let res: { ok: boolean; recorded: boolean; events: CqEvent[]; run: RunState };
    let roomEvs: RoomEvent[] = [];
    if (showdown && room.current) {
      const rr = roomApply(room.current, 0, action, t);
      res = { ok: rr.ok, recorded: rr.recorded, events: rr.events, run: racerOf(room.current, 0)?.run ?? run };
      roomEvs = rr.room;
    } else {
      res = applyAction(run, action, t);
    }
    if (!res.ok) return;
    const s = svRef.current;
    s.armed.value = -1;
    setChip(null);
    setInspect(null);
    noteInput();
    if (!res.recorded) {
      // Bump: pose swap, nudge, board shake, rattle. Never recorded.
      const bump = res.events[0] as Extract<CqEvent, { type: 'bump' }>;
      if (!bump || bump.type !== 'bump') return;
      const from = center(run.voyage.pos);
      const cell = cellPx();
      const target = bump.target >= 0 ? center(bump.target) : { x: from.x + [0, 1, 0, -1][bump.dir] * cell, y: from.y + [-1, 0, 1, 0][bump.dir] * cell };
      s.plan.value = { ...idlePlan(from.x, from.y, s.plan.value.facing || 1), kind: PLAN_BUMP, t0: -1, pts: [from.x, from.y], bx: target.x, by: target.y };
      sfxBump(bump.reason);
      CQH.rigid();
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
    let stroked = false;
    for (const ev of res.events) {
      if (ev.type === 'stroke') {
        const p = presentStroke(next, ev, res.events);
        dur = p.dur;
        endMove = p.endMove;
        stroked = true;
        if (dead && dead.kind === 'dead') setDead(null);
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
        if (trial && !ev.refunded) { CQH.light(); setSmallChip({ text: 'stroke spent', tone: 'coral', key: Date.now() }); } else CQH.tick();
        if (ev.slip) setSmallChip({ text: trial ? 'Refunded' : 'Slip, Par kept', tone: 'white', key: Date.now() });
        syncBoardVisuals(next);
        s.hint.value = [];
        s.wrong.value = [];
        s.swirl.value = withTiming(0, { duration: 200 });
        deadEpisode.current = false;
        setDead(null);
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
        CQH.medium();
        if (ev.spentKept) setSmallChip({ text: 'strokes stay spent', tone: 'coral', key: Date.now() });
        syncBoardVisuals(next);
        s.hint.value = [];
        s.wrong.value = [];
        s.swirl.value = withTiming(0, { duration: 200 });
        deadEpisode.current = false;
        setDead(null);
        dur = 360;
      } else if (ev.type === 'continue') {
        sfxRingOn();
        CQH.medium();
        s.swirl.value = withTiming(0, { duration: 200 });
        s.hint.value = [];
        s.wrong.value = [];
        deadEpisode.current = false;
        setDead(null);
        const p = s.shark.value;
        const fp = toField(p.x, p.y);
        fx.current?.ring(fp.x, fp.y, { color: CQ.coral, from: 10, to: cellPx() * 0.7, ms: 300 });
        setToast({ text: '+2 strokes', key: Date.now(), tone: 'gold' });
        dur = 250;
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
        if (ev.ring) { CQH.medium(); sfxRingOn(); } else CQH.tick();
        setToast({ text: ev.ring ? 'Tip: a ring for the next 2 strokes. Follow the gold.' : 'Follow the gold. The Par shell is gone.', key: Date.now() });
        dur = 100;
      }
    }
    if (roomEvs.length) presentRoom(roomEvs);
    busyUntil.current = Date.now() + Math.min(dur, 900);
    syncHud(next);
    refreshPreviews(next);
    syncAuthor(next);
    if (!stroked && !next.voyage.stalled) later(Math.min(dur, 600), () => { const r = runRef.current; if (r) checkDead(r); });
    lastCommitAt.current = Date.now();
    later(Math.min(dur, 900) + 10, () => {
      const b = buffered.current;
      buffered.current = null;
      if (b !== null) applyNowRef.current(b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, reducedMotion, camera, later, presentStroke, presentClear, presentStall, presentFail, trial, syncBoardVisuals, burst, toField, syncHud, refreshPreviews, swayNear, checkDead, presentRoom, showdown, dead, syncAuthor]);
  const applyNowRef = useRef(applyNow);
  applyNowRef.current = applyNow;

  // Snare escalation (0.A.13): held while an armed preview banks the golden pearl on a Fever-eligible final voyage.
  const snareStop = useRef<(() => void) | null>(null);
  const stopSnare = useCallback(() => { snareStop.current?.(); snareStop.current = null; }, []);
  useEffect(() => stopSnare, [stopSnare]);
  const commit = useCallback((action: number) => {
    stopSnare();
    if (!playing.current || finishing.current || result || stake) return;
    if (Date.now() < busyUntil.current) {
      // Exactly one buffered commit; the rest of the current animation plays at 2x.
      buffered.current = action;
      fastForward();
      return;
    }
    applyNowRef.current(action);
  }, [result, fastForward, stake, stopSnare]);

  // ---- input ---------------------------------------------------------------------------------------------
  const feverPreview = (dir: number): boolean => {
    const run = runRef.current;
    if (!run || dir < 0 || reducedMotion) return false;
    const last = run.index === run.boards.length - 1 && run.boards.length > 1;
    const priorAll = shellsRef.current.slice(0, run.boards.length - 1).every((x) => x.every(Boolean));
    if (!last || !priorAll || run.voyage.golden || parState(currentBoard(run), run.voyage).lost) return false;
    const pv = previewFor(run, dir);
    return pv.valid && pv.golden;
  };
  const onAim = useCallback((dir: number) => {
    setInspect(null);
    const s = svRef.current;
    s.tourT0.value = -1e9;
    if (dir < 0) { setChip(null); stopSnare(); return; }
    sfxAim(dir);
    CQH.tick();
    setChip(chipFor(dir));
    if (feverPreview(dir)) { if (!snareStop.current) snareStop.current = startSnareRoll(); } else stopSnare();
  }, [chipFor, stopSnare]); // eslint-disable-line react-hooks/exhaustive-deps
  const onCancelAim = useCallback(() => { setChip(null); stopSnare(); }, [stopSnare]);
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
    if (i === v.pos) text = v.beached ? 'Resting on dry sand. Swim off any time, no cost.' : 'Your shark';
    else if (i === b.chest) text = v.mask === (1 << b.pearls.length) - 1 ? 'Treasure chest: open!' : `Treasure chest: ${b.pearls.length} pearls open it`;
    else if (ch === '#') text = 'Coral rock: blocks you and stops currents';
    else if (ch === 's') text = b.P ? `Sandbar: ${low ? 'dry' : 'underwater'} now, ${low ? 'floods' : 'dries'} in ${k} move${k === 1 ? '' : 's'}` : 'Sandbar';
    else if ('^>v<'.includes(ch)) text = `Current flowing ${['up', 'right', 'down', 'left']['^>v<'.indexOf(ch)]}: free ride, can't swim against it`;
    if (b.pearls.includes(i) && !(v.mask & (1 << b.pearls.indexOf(i)))) text = `Pearl. ${text === 'Open water' ? 'Needed to open the chest' : text}`;
    if (i === b.golden && !v.golden) text = 'Golden pearl: optional, worth a shell';
    const p = cellCenter(l, i);
    setInspect({ text, x: p.x, y: p.y });
    CQH.tick();
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
  // =2: the "rough day" tour: slip undo, wander into the dead sheet (wrong-turn X), recover (Puzzle undo /
  // Trial ring), a Tide Tip, then the gold route. =3: lose on purpose (Trial: burn every ring).
  const autoMode = typeof __DEV__ !== 'undefined' && __DEV__ ? process.env.EXPO_PUBLIC_CQ_AUTOPLAY ?? '0' : '0';
  const autoplay = autoMode === '1' || autoMode === '2' || autoMode === '3';
  const auto = useRef<{ slip: boolean; deadSeen: boolean; tipped: boolean; recovered: boolean }>({ slip: false, deadSeen: false, tipped: false, recovered: false });
  const autoNext = useRef(0);
  const deadRef = useRef(dead);
  deadRef.current = dead;
  useEffect(() => {
    if (!autoplay || !visible) return undefined;
    let stop = false;
    auto.current = { slip: false, deadSeen: false, tipped: false, recovered: false };
    const tick = () => {
      if (stop) return;
      const run = runRef.current;
      const s = svRef.current;
      if (run && playing.current && !finishing.current && !stake && Date.now() > busyUntil.current + 250 && Date.now() > autoNext.current) {
        const b = currentBoard(run);
        const v = run.voyage;
        const st = auto.current;
        let a: number | undefined;
        let hold = 600;
        let gap = 1100;
        const good = () => hintFrom(b, v, 1, autoMode === '1' ? Infinity : strokesLeft(run))[0];
        const wrong = () => { const g = good(); for (let d = 0; d < 4; d++) if (d !== g && previewFor(run, d).valid) return d; return undefined; };
        // Showdown: aim at the first glowing chip after a second, like a person would.
        if (room.current && room.current.aims.some((x) => x.from === 0)) {
          const target = room.current.racers.find((x) => x.seat !== 0 && !x.pending && x.run.index < x.run.boards.length - 1);
          if (target) later(900, () => onAimSeat(target.seat));
          autoNext.current = Date.now() + 1400;
          setTimeout(tick, 300);
          return;
        }
        if (autoMode === '3') {
          a = v.stalled ? (run.rings > 0 ? A_CONTINUE : undefined) : (wrong() ?? good());
          gap = 700;
        } else if (deadRef.current) {
          st.deadSeen = true;
          if (!st.recovered) { st.recovered = true; autoNext.current = Date.now() + 2600; setTimeout(tick, 300); return; }
          a = trial ? (ringAllowed(run) && deadRef.current.kind === 'stall' ? A_CONTINUE : run.voyage.stack.length ? A_UNDO : A_CONTINUE) : A_UNDO;
          gap = 900;
        } else if (run.index === 0 && !st.slip && v.strokes === 1) {
          // One wrong turn, undone at once: a slip (Par kept; a Trial refund).
          a = wrong();
          st.slip = true;
          if (a !== undefined) later(1050, () => commitRef.current(A_UNDO));
          gap = 1800;
        } else if (autoMode === '2' && run.index === (trial ? 1 : 1) && !st.deadSeen && v.strokes >= 1 && st.slip) {
          // Wander until the dead sheet rises (never more than one stroke past saving).
          let pick: number | undefined;
          for (let d = 0; d < 4; d++) {
            const pv = previewFor(run, d);
            if (pv.valid && !pv.clears && s.previews.value[d]?.red) { pick = d; break; }
          }
          a = pick ?? good();
          hold = 700;
          gap = 900;
        } else if (autoMode === '2' && !st.tipped && tipAllowed(run) && v.strokes === 0 && run.index === run.boards.length - 1) {
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
  }, [autoplay, visible, boards, stake]);

  // ---- shell callbacks ---------------------------------------------------------------------------------------
  const handleStart = useCallback(() => {
    playing.current = true;
    if (!startedAt.current || !restore.snapshot) startedAt.current = Date.now();
    const run = runRef.current;
    if (run) readyAt.current[run.index] = Math.max(readyAt.current[run.index], Date.now() - startedAt.current);
    lastStrokeAt.current = Date.now();
    svRef.current.idleSince.value = svRef.current.fxT.value;
    GameAudio.music.setState('open', 200);
    // R10 one-more metric: PLAY AGAIN within 10 s of the last results.
    if (runEndAt.current && Date.now() - runEndAt.current < 10000) {
      void saveProgress((p) => ({ ...p, replays: p.replays.map((x, i) => (i === p.replays.length - 1 ? { ...x, again: true } : x)) }));
    }

    if (run && run.voyage.strokes === 0) { showRibbon(run); svRef.current.tourT0.value = svRef.current.fxT.value + 100; }
  }, [restore.snapshot, showRibbon, context]);
  // Ride Challenge: the stake card is the pre-start, then GO (0.A.5); the shell's own count is off for rides.
  const onStakeDone = useCallback(() => {
    setStake(false);
    banner('GO!', PRI_GOLDEN, 0, 650);
    CQH.medium();
    lastStrokeAt.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    if (!run || showdown) return null;
    return {
      score: totalShells(run.results),
      state: { actions: run.actions.map((a) => a.slice()), times: times.current.map((t) => t.slice()), ready: readyAt.current.slice(), elapsed: Date.now() - startedAt.current },
    };
  }, [showdown]);
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
      meta: { partial: true, context, seed: runSeed, v: 3 },
    };
  }, [context, runSeed, thresholds]);
  const onRematch = useCallback(() => {
    // Play again on fresh boards; a failed Trial retries on fresh boards (next attemptIndex).
    clearTimers();
    if (failed || trial) setAttempt((a) => a + 1);
    else setBoardsKey((k) => k + 1);
    setResult(null);
    setSummary(null);
    setFailed(false);
  }, [clearTimers, failed, trial]);

  /** Challenge a friend (0.A.11): the system share sheet with a deep link; the app never sends anything itself. */
  const onChallengeFriend = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    const shells = totalShells(run.results);
    const strokes = run.results.reduce((a, r) => a + r.strokes, 0);
    // Player-initiated, system share sheet only; the link names the exact boards (0.A.11).
    const url = challengeUrl({ seed: runSeed, boards: run.boards.map((b) => b.id), shells, strokes });
    void Share.share({ message: `Beat my Current Quest run: ${shells} shells in ${strokes} strokes. ${url}`, url });
  }, [runSeed]);
  const onShareCard = useCallback(() => {
    if (!share) return;
    void shareRef.current?.share(`${share.heading}: ${share.grid.flat().filter(Boolean).length} shells`);
  }, [share]);

  const renderResults = useCallback((args: ShellResultsArgs) => (summary ? (
    <CqResultsCard
      s={summary}
      stars={summary.stars}
      reducedMotion={args.reducedMotion}
      onDone={args.claim}
      onAgain={args.rematch}
      onChallenge={!scored && !summary.failed && context !== 'chart' ? onChallengeFriend : undefined}
      onShare={share ? onShareCard : undefined}
    />
  ) : null), [summary, scored, context, onChallengeFriend, share, onShareCard]);

  // ---- controls callbacks -----------------------------------------------------------------------------------
  const onUndo = useCallback(() => { if (!scrubbing.current) sfxButton(); commit(A_UNDO); }, [commit]);
  const onScrub = useCallback((on: boolean) => {
    scrubbing.current = on;
    svRef.current.undoTint.value = withTiming(on ? 1 : 0, { duration: on ? 80 : 300 });
  }, []);
  const onRestart = useCallback(() => { commit(A_RESTART); }, [commit]);
  const onRing = useCallback(() => { commit(A_CONTINUE); }, [commit]);
  const onTip = useCallback(() => {
    const run = runRef.current;
    if (!run || !tipAllowed(run)) {
      if (run && trial) setToast({ text: 'A tip uses a ring, and none are left', key: Date.now() });
      return;
    }
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
  // Hold the tide medallion: the whole board previews its next tide (water level, sandbars, palette) while held.
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
      s.lowK.value = withTiming(nextLow ? 1 : 0, { duration: 220 });
      CQH.tick();
    } else {
      s.tideDrop.value = withTiming(tideDropFor(b, v.moves, v.phase), { duration: 260 });
      s.lowK.value = withTiming(tideAt(b.P, v.moves, v.phase) === TIDE_LOW ? 1 : 0, { duration: 260 });
    }
  }, []);

  // Toast and small chip auto-hide.
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.tone === 'coral' ? 2600 : 1700);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!smallChip) return undefined;
    const t = setTimeout(() => setSmallChip(null), 1100);
    return () => clearTimeout(t);
  }, [smallChip]);

  // Results: the board slides 40 px down under the white veil (P8).
  const boardDrop = useSharedValue(0);
  useEffect(() => { boardDrop.value = result ? withSpring(40, { damping: 16, stiffness: 140 }) : withTiming(0, { duration: 200 }); }, [result, boardDrop]);
  const boardDropSt = useAnimatedStyle(() => ({ transform: [{ translateY: boardDrop.value }] }));

  // ---- render --------------------------------------------------------------------------------------------------
  const run = runRef.current;
  const board = run && boards ? boards[Math.min(voyageIdx, boards.length - 1)] : null;
  const objective = showdown
    ? 'Ghost Race: 3 voyages vs the crew. Par clears send Splashes.'
    : context === 'daily' ? `Daily Tide #${dailyNumber(today)}: one scored try today.`
      : context === 'chart' ? `${node?.name ?? 'Chart'}: one voyage.`
        : trial ? 'Every stroke counts. A life ring gives 2 strokes.' : `${voyagesN} voyages. Beat par, find the gold.`;
  const controlsOn = !result && !failed;
  const hudW = Math.max(200, (field?.w ?? 375) - 28);

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title="Current Quest"
      subtitle={showdown ? 'Ghost Race' : context === 'daily' ? `Daily Tide #${dailyNumber(today)}` : themeSubtitle(themeId)}
      score={totalShells(run?.results ?? [])}
      hideHeaderScore
      objective={objective}
      result={result}
      thresholds={thresholds}
      resumeStyle="instant"
      countdownStyle={context === 'ride' ? 'none' : 'go'}
      countdownScrim="light"
      resultsScrim="none"
      renderResults={renderResults}
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
          {hud ? <QuestHud h={hud} onTideHold={onTideHold} width={hudW} tierLabels={trial ? ['6', '8'] : undefined} /> : <View style={{ height: HUD_ROW_H + RUN_BAR_H }} />}
          {showdown && racers.length ? <ShowdownRail racers={racers} remainingMs={sdRemaining} total={voyagesN} onAim={onAimSeat} /> : null}
          <Animated.View style={[styles.boardArea, boardDropSt]}>
            {layout && board && stableImages.idle ? (
              <GestureDetector gesture={gesture}>
                <View
                  style={{ width: layout.cw, height: layout.ch }}
                  onLayout={(e) => { boardOrigin.current = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y + HUD_ROW_H + RUN_BAR_H + (showdown ? RAIL_H : 0) }; }}
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
                  {splitChip ? (
                    <Animated.View key={splitChip.key} entering={ZoomIn} exiting={FadeOut} style={[styles.split, splitChip.good ? styles.splitGood : styles.splitBad]} pointerEvents="none">
                      <Text style={styles.splitTxt}>{splitChip.text}</Text>
                    </Animated.View>
                  ) : null}
                  {smallChip ? (
                    <Animated.View key={smallChip.key} entering={FadeIn.duration(100)} exiting={FadeOut} style={[styles.smallChip, smallChip.tone === 'coral' ? styles.smallChipCoral : styles.smallChipWhite]} pointerEvents="none">
                      <Text style={[styles.smallChipTxt, smallChip.tone === 'coral' && styles.smallChipTxtCoral]}>{smallChip.text}</Text>
                    </Animated.View>
                  ) : null}
                </View>
              </GestureDetector>
            ) : <View style={{ height: 300 }} />}
          </Animated.View>
          {/* Voyage ribbon and Splash start card dock over the run bar, never over the board's pickups (J12). */}
          {(ribbon && !startCard) || startCard ? (
            <View style={[styles.ribbonDock, { top: HUD_ROW_H - 4 }]} pointerEvents="none">
          {ribbon && !startCard ? (
            <Animated.View key={ribbon.key} entering={ZoomIn.springify().damping(11)} exiting={FadeOut} style={[styles.ribbon, ribbon.gold && styles.ribbonGold]} pointerEvents="none">
              <Text style={styles.ribbonTxt}>{ribbon.title}</Text>
              {ribbon.sub ? <Text style={styles.ribbonSub}>{ribbon.sub}</Text> : null}
            </Animated.View>
          ) : null}
          {startCard ? (
            <Animated.View key={startCard.key} entering={ZoomIn.springify().damping(10)} exiting={FadeOut} style={[styles.ribbon, styles.ribbonCoral]} pointerEvents="none">
              <Text style={styles.ribbonTxt}>{startCard.title}</Text>
              {startCard.parFrom != null ? (
                <Text style={styles.ribbonSub}>
                  {'par '}<Text style={styles.strike}>{String(startCard.parFrom)}</Text>{` to ${startCard.parTo}`}
                </Text>
              ) : null}
            </Animated.View>
          ) : null}
            </View>
          ) : null}
          {controlsOn && arrows ? (
            <View style={styles.arrowArea}>
              <ArrowPad big={walking} disabled={!!dead && dead.kind === 'stall'} onArm={onArrowArm} onDisarm={onArrowDisarm} onCommit={commit} />
            </View>
          ) : null}
          {controlsOn ? (
            <BottomBar
              big={walking}
              trial={trial}
              rings={run?.rings ?? 0}
              canUndo={!!run && run.voyage.stack.length > 0 && !(trial && run.voyage.stalled)}
              undos={run?.voyage.undos ?? 0}
              hasTide={!!board && board.P > 0}
              tipPulse={tipPulse}
              tipDisabled={!run || !tipAllowed(run)}
              ringDisabled={!run || !ringAllowed(run)}
              canRestart={!!run && run.voyage.stack.length > 0 && !(trial && run.voyage.stalled)}
              arrows={arrows}
              disabled={!!stake}
              onUndo={onUndo}
              onScrub={onScrub}
              onTreadArm={onTreadArm}
              onTreadCommit={onTreadCommit}
              onTreadCancel={onTreadCancel}
              onTip={onTip}
              onRing={onRing}
              onRestart={onRestart}
              onToggleArrows={onToggleArrows}
            />
          ) : <View style={{ height: BAR_H }} />}
          {controlsOn && dead && run ? (
            <DeadSheet info={dead} trial={trial} rings={run.rings} canUndo={run.voyage.stack.length > 0 && !(trial && run.voyage.stalled)}
              onUndo={onUndo} onRestart={onRestart} onRing={onRing} />
          ) : null}
          {walking && controlsOn ? (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(300)} style={styles.moving} pointerEvents="none">
              <Text style={styles.movingTxt}>Line moving</Text>
            </Animated.View>
          ) : null}
          {incomingFrom && controlsOn ? (
            <View style={styles.incoming} pointerEvents="none">
              <Text style={styles.incomingTxt}>{`Next voyage: SPLASH from ${incomingFrom}`}</Text>
            </View>
          ) : null}
          {toast ? (
            <Animated.View key={toast.key} entering={FadeIn.duration(120)} exiting={FadeOut} style={[styles.toast, toast.tone === 'gold' && styles.toastGold, toast.tone === 'coral' && styles.toastCoral]} pointerEvents="none">
              <Text style={styles.toastTxt}>{toast.text}</Text>
            </Animated.View>
          ) : null}
          {result ? <ResultsVeil /> : null}
        </View>
        {stake ? <StakeCard onDone={onStakeDone} ready={runReady} /> : null}
        {share ? <ShareCard ref={shareRef} data={share} /> : null}
        {layout ? <FxStage ref={fx} width={field?.w ?? layout.cw} height={field?.h ?? layout.ch} timeScale={clock.fxScale} reducedMotion={reducedMotion} capacity={lite ? 120 : 200} style={styles.fx} /> : null}
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  boardArea: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  fx: { position: 'absolute', left: 0, top: 0 },
  arrowArea: { alignItems: 'stretch', paddingBottom: 4 },
  // Walking is a state, not a pause (17): a quiet chip by the medallion, input stays live.
  moving: { position: 'absolute', left: 74, top: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9, backgroundColor: CQ.water, borderWidth: 1.5, borderColor: CQ.ink },
  movingTxt: { fontFamily: 'Knockout', fontSize: 11, color: '#ffffff' },
  smallChip: { position: 'absolute', right: 8, top: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1.5, borderColor: CQ.ink },
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
  ribbonDock: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  ribbon: {
    paddingHorizontal: 16, paddingVertical: 5, borderRadius: 14, backgroundColor: '#ffffff',
    borderWidth: 3, borderColor: CQ.ink, alignItems: 'center', maxWidth: '92%',
  },
  ribbonGold: { backgroundColor: CQ.gold, borderColor: CQ.ink },
  ribbonCoral: { backgroundColor: '#ffe3df', borderColor: CQ.coral },
  ribbonTxt: { fontFamily: 'Shark', fontSize: 19, color: CQ.navy },
  ribbonSub: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy, marginTop: 1, textAlign: 'center' },
  strike: { textDecorationLine: 'line-through', textDecorationColor: CQ.ink },
  split: { position: 'absolute', right: 6, top: 2, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, borderWidth: 2, borderColor: CQ.ink },
  splitGood: { backgroundColor: '#d9f7c9' },
  splitBad: { backgroundColor: '#fff3c2' },
  splitTxt: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy },
  // Toasts dock above the HUD row, never behind controls (J12).
  toast: {
    position: 'absolute', alignSelf: 'center', top: 2, maxWidth: '92%', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 2, borderColor: CQ.ink, zIndex: 30,
  },
  toastGold: { backgroundColor: '#fff3c2', borderColor: CQ.goldDeep },
  toastCoral: { backgroundColor: '#ffe3df', borderColor: CQ.coral },
  toastTxt: { fontFamily: 'Knockout', fontSize: 14, color: CQ.navy, textAlign: 'center' },
  incoming: { position: 'absolute', alignSelf: 'center', top: HUD_ROW_H + RUN_BAR_H + RAIL_H + 2, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: '#fff3c2', borderWidth: 2, borderColor: CQ.goldDeep },
  incomingTxt: { fontFamily: 'Knockout', fontSize: 12, color: CQ.navy },
});
