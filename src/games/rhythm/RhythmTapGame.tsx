/**
 * RhythmTapGame.tsx: "Parade Beat", the Rhythm Tap rework
 * (design: tps-prime-time-audit/studio/design/rhythm.md, revision 4).
 *
 * Your shark is the drum major of the park parade. Chris's songs play, notes
 * march down the parade route onto the big drum, and every note is a drum hit
 * you can hear. Tap the drum for a boom, the gold hoops for a rim click, hold
 * for rolls, two fingers for BIG notes and to launch Firework Fever.
 *
 * External contract (unchanged): MiniGameSelector, LinePlay and Crew Relay
 * render <RhythmTapGame visible seed difficulty format onComplete onClose
 * onQuit />. Proof: meta.score + meta.seed (what TaskGameProofService
 * validates today) plus meta.rhythmProof (v4, see core/proof.ts).
 *
 * QUEUE REALITY: movement never pauses. Walking switches bars to the March
 * layer (big quarter-note hits, zones ignored, softer penalties) through the
 * look-ahead lock, so a player can keep drumming by ear with eyes up.
 * Backgrounding, a locked screen or the pause button hold the round; resume
 * replays the bar before the pause as a counted pre-roll.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  runOnJS,
  runOnUI,
  useFrameCallback,
  useSharedValue,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated';
import {
  FxStage,
  GameAudio,
  GameShellV2,
  Haptic,
  deriveRunSeed,
  drainEvents,
  forEachEvent,
  playHaptic,
  registerStudioAudio,
  scheduleHaptics,
  setHapticGapMs,
  useWalkSense,
  type FxStageHandle,
  type FxState,
  type GameResult,
  type GameShellV2Handle,
  type HapticStep,
} from '../../gamekit';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { generate } from './core/generate';
import {
  EV_BAR_LAYER,
  EV_BIG_DOUBLE,
  EV_FEVER_ARMED,
  EV_FEVER_END,
  EV_FEVER_START,
  EV_FLICK,
  EV_FREEZE_FAULT,
  EV_HIT,
  EV_MILESTONE,
  EV_MISS,
  EV_OOS,
  EV_POPPER_POP,
  EV_POPPER_TAP,
  EV_ROLL_BREAK,
  EV_ROLL_TICK,
  EV_STALL,
  EV_WRONG,
  createJudge,
  feverActiveAt,
  finishJudge,
  judgeDown,
  judgeMove,
  judgeTick,
  judgeUp,
  voidAround,
  type JudgeState,
} from './core/judge';
import { buildProof } from './core/proof';
import { autoTuneOffset, summarize, type RoundSummary } from './core/score';
import { runScript, scriptHuman } from './core/sim';
import { J_GOOD, J_GREAT, J_PERFECT, J_SHARP, K_BIG, K_CYMBAL, K_RIM, K_ROLL, L_MARCH, STAR_ACCURACY, type Chart, type Difficulty, type RoundFormat } from './core/types';
import { decodeTouches } from './core/proof';
import { createDrawList, layoutFrame, beatAt } from './field/layout';
import { ParadeField, fieldGeom, zoneOfX } from './field/ParadeField';
import { applyEventsUI, createView, showRibbon, stepView, RB_MARCH, RB_READY, type ParadeView } from './field/view';
import { SongPlayer, type SongAnchor } from './audio/SongPlayer';
import {
  emptyProgress,
  ghostKey,
  loadProgress,
  pbKey,
  pickQueueStage,
  recordRound,
  saveProgress,
  type GhostRun,
  type ParadeProgress,
} from './meta/progress';
import { RIDE_STAGES, STAGES, type StageId } from './stages';
import { crewForRound, type Rival } from './multiplayer/drumline';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HEADER_H = 113;
const DEFAULT_OFFSET_MS = 25; // built-in speaker placeholder (design 4.5)
// Dev only: a scripted drummer plays the round (sigma ms) for capture and feel checks,
// and EXPO_PUBLIC_RHYTHM_WALK=1 fakes walking in 8-bar stretches (March layer demo).
const AUTOPLAY_SIGMA = __DEV__ ? Number(process.env.EXPO_PUBLIC_RHYTHM_AUTOPLAY || 0) : 0;
const FAKE_WALK = __DEV__ && process.env.EXPO_PUBLIC_RHYTHM_WALK === '1';
const DEV_STAGE = (__DEV__ ? process.env.EXPO_PUBLIC_RHYTHM_STAGE : undefined) as StageId | undefined;
const DEV_DIFF = __DEV__ ? Number(process.env.EXPO_PUBLIC_RHYTHM_DIFF || 0) : 0;

export interface RhythmTapGameProps {
  visible: boolean;
  /** Stable seed for a saved LinePlay round or a ride attempt; omitted for free play. */
  seed?: number;
  /** 1-3, chosen by the LinePlay session context. Defaults to 2. */
  difficulty?: 1 | 2 | 3;
  /** Short ride sprint or longer LinePlay round. */
  format?: 'ride' | 'queue';
  /** Force a stage (tests, Daily Parade Route); otherwise progress picks. */
  stageId?: StageId;
  /** A friend's or crew mate's ghost run to race (async challenge). */
  challenge?: GhostRun;
  /** Preserved external contract used by MiniGameSelector. */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

interface RoundPlan {
  stage: StageId;
  format: RoundFormat;
  difficulty: Difficulty;
  seed: number;
  ftue: boolean;
  autoFever: boolean;
  noFailUntil: number;
  chart: Chart;
  songSrc: number;
  feverSrc: number;
}

function planRound(p: ParadeProgress, props0: RhythmTapGameProps, runSeed: number): RoundPlan {
  const props: RhythmTapGameProps = {
    ...props0,
    stageId: props0.stageId ?? (DEV_STAGE && STAGES[DEV_STAGE] ? DEV_STAGE : undefined),
    difficulty: DEV_DIFF ? (DEV_DIFF as 1 | 2 | 3) : props0.difficulty,
  };
  const ride = props.format === 'ride';
  let stage: StageId;
  let format: RoundFormat = ride ? 'ride' : 'queue';
  let difficulty: Difficulty = ride ? 1 : ((props.difficulty ?? 2) as Difficulty);
  let ftue = false;
  if (ride) {
    stage = props.stageId && STAGES[props.stageId].audio.ride ? props.stageId : RIDE_STAGES[(runSeed >>> 0) % RIDE_STAGES.length];
  } else if (!p.firstParadeDone && !props.stageId) {
    // First Parade: Opening Day, a 12-bar sprint, DRUM and one BIG, cannot fail.
    stage = 'opening_day_a';
    format = 'ride';
    difficulty = 1;
    ftue = true;
  } else {
    stage = props.stageId ?? pickQueueStage(p, runSeed);
  }
  const entry = STAGES[stage];
  const audio = entry.audio[format] ?? entry.audio.queue!;
  const chart = generate(entry.json, format, difficulty, runSeed >>> 0, { ftue });
  const firstRideEver = ride && !p.firstParadeDone;
  const noFailUntil = ftue ? Infinity : firstRideEver ? chart.barStart[chart.firstBar + 4] : 0;
  return {
    stage,
    format: chart.format,
    difficulty: chart.difficulty,
    seed: runSeed >>> 0,
    ftue,
    autoFever: ftue || ride || entry.order <= 2,
    noFailUntil,
    chart,
    songSrc: audio.song,
    feverSrc: audio.fever,
  };
}

const PRELOAD = [
  'rh_bass_drum', 'rh_rim', 'rh_cymbal', 'rh_snare_tap', 'rh_glock', 'rh_firework', 'rh_whistle_call', 'rh_win', 'rh_clear', 'rh_stall',
  'sh_popper', 'sh_combo_break', 'sh_whistle', 'sh_powerup', 'sh_crowd_cheer', 'fx.reveal', 'fx.whoosh', 'fx.nope', 'fx.coin', 'fx.purchase',
];

export function RhythmTapGame(props: RhythmTapGameProps) {
  const { visible, seed: roundSeed, onComplete, onClose, onQuit } = props;
  const reducedMotion = useReducedGameMotion();
  const shellRef = useRef<GameShellV2Handle>(null);
  const fxRef = useRef<FxStageHandle>(null);
  const baseSeed = useMemo(() => (roundSeed ?? (Math.floor(Math.random() * 0xffffffff) ^ Date.now())) >>> 0, [roundSeed]);
  const [runIndex, setRunIndex] = useState(0);
  const [progress, setProgress] = useState<ParadeProgress | null>(null);
  const progressRef = useRef<ParadeProgress>(emptyProgress());
  const [result, setResult] = useState<GameResult | null>(null);
  const [score, setScore] = useState(0);
  const [mult, setMult] = useState(1);
  const [feverOn, setFeverOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [pocket, setPocket] = useState(false);
  const [goalHits, setGoalHits] = useState(0);
  const [rivalScores, setRivalScores] = useState<number[]>([]);
  const [deltaChip, setDeltaChip] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void loadProgress().then((p) => {
      if (!alive) return;
      progressRef.current = p;
      setProgress(p);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const runSeed = runIndex === 0 ? baseSeed : deriveRunSeed(baseSeed, runIndex);
  const plan = useMemo(() => (progress ? planRound(progress, props, runSeed) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progress, runSeed, props.format, props.difficulty, props.stageId]);

  // -- Geometry -------------------------------------------------------------------
  const fieldH = SCREEN_H - HEADER_H - (props.format === 'ride' ? 54 : 0);
  const geom = useMemo(() => fieldGeom(SCREEN_W, fieldH), [fieldH]);

  // -- UI-thread state ------------------------------------------------------------
  const emptyChart = useMemo(() => generate(STAGES.opening_day_a.json, 'ride', 1, 1), []);
  const judge = useSharedValue<JudgeState>(createJudge(emptyChart));
  const view = useSharedValue<ParadeView>(createView(0, geom.cx, geom.yLine, SCREEN_W));
  const draw = useSharedValue(createDrawList());
  const tick = useSharedValue(0);
  const clock = useSharedValue(0);
  const running = useSharedValue(0);
  const anchor = useSharedValue<SongAnchor>({ pos: 0, wall: 0, playing: false });
  const lastWall = useSharedValue(0);
  const offset = useSharedValue(DEFAULT_OFFSET_MS);
  const walkingSv = useSharedValue(0);
  const endMs = useSharedValue(1e12);
  const ended = useSharedValue(0);
  const beatsSv = useSharedValue<number[]>([0, 500]);
  const approachSv = useSharedValue(1300);
  const echoStyleSv = useSharedValue(0);
  const railFlash = useSharedValue<number[]>([-1e9, -1e9, -1e9]);
  const rivalHitT = useSharedValue<number[][]>([]);
  const rivalHitK = useSharedValue<number[]>([]);
  const lastBarSv = useSharedValue(-1);
  const auto = useSharedValue<{ t: number[]; type: number[]; zone: number[]; pid: number[]; i: number }>({ t: [], type: [], zone: [], pid: [], i: 0 });

  // -- Audio ------------------------------------------------------------------------
  const song = useRef<SongPlayer | null>(null);
  const hitSounds = useRef(false);
  const startWall = useRef(0);
  const pauseSpans = useRef<[number, number][]>([]);
  const pausedAt = useRef<number | null>(null);
  const hapticCancel = useRef<(() => void) | null>(null);
  const finished = useRef(false);
  const stepsRef = useRef(0);
  const stepsByBar = useRef<Map<number, number>>(new Map());
  const perfRunJs = useRef(0);
  const glockStep = useRef(0);
  const rivals = useRef<Rival[]>([]);

  const walk = useWalkSense({
    active: visible && ready && !result,
    onStep: (n) => {
      stepsRef.current = n;
    },
  });
  useEffect(() => {
    walkingSv.value = walk.walking ? 1 : 0;
  }, [walk.walking, walkingSv]);

  useEffect(() => {
    registerStudioAudio('rhythm');
    void GameAudio.init().then(() => {
      hitSounds.current = GameAudio.backendName !== 'expo-av';
      return GameAudio.preload(PRELOAD);
    }).catch(() => undefined);
    setHapticGapMs(60);
  }, []);

  // -- Round setup -----------------------------------------------------------------
  useEffect(() => {
    if (!visible || !plan) return;
    let alive = true;
    finished.current = false;
    pauseSpans.current = [];
    pausedAt.current = null;
    stepsByBar.current = new Map();
    perfRunJs.current = 0;
    glockStep.current = 0;
    setResult(null);
    setScore(0);
    setMult(1);
    setFeverOn(false);
    setGoalHits(0);
    setDeltaChip(null);
    setReady(false);
    const chart = plan.chart;
    judge.value = createJudge(chart, { autoFever: plan.autoFever, noFailUntilMs: plan.noFailUntil });
    const v = createView(chart.t.length, geom.cx, geom.yLine, SCREEN_W, countInBeats(chart));
    v.reduced = reducedMotion ? 1 : 0;
    v.pocket = pocket ? 1 : 0;
    view.value = v;
    draw.value = createDrawList();
    beatsSv.value = chart.beats;
    approachSv.value = { 1: 1600, 2: 1300, 3: 1050 }[chart.difficulty];
    echoStyleSv.value = chart.difficulty === 2 ? 1 : 0;
    endMs.value = chart.endMs;
    ended.value = 0;
    clock.value = 0;
    running.value = 0;
    lastBarSv.value = -1;
    const route = 'speaker';
    offset.value = progressRef.current.offsets[route] ?? DEFAULT_OFFSET_MS;
    // House crew and ghosts race the same chart (async Drum-Off).
    const crew = plan.format === 'queue' && !plan.ftue
      ? crewForRound(chart, plan, progressRef.current.ghosts[ghostKey(plan.stage, plan.format, plan.difficulty)] ?? null, props.challenge ?? null)
      : [];
    rivals.current = crew;
    rivalHitT.value = crew.map((r) => r.hitT);
    rivalHitK.value = crew.map(() => 0);
    railFlash.value = [-1e9, -1e9, -1e9];
    setRivalScores(crew.map(() => 0));

    if (AUTOPLAY_SIGMA > 0) {
      const sc = scriptHuman(chart, { sigmaMs: AUTOPLAY_SIGMA, lapse: 0.015 }, plan.seed);
      auto.value = { t: sc.map((x) => x.t), type: sc.map((x) => x.type), zone: sc.map((x) => x.zone), pid: sc.map((x) => x.pid), i: 0 };
    } else {
      auto.value = { t: [], type: [], zone: [], pid: [], i: 0 };
    }
    const player = new SongPlayer(plan.songSrc, plan.feverSrc);
    song.current = player;
    player.onAnchor((a) => {
      anchor.value = a;
    });
    void player.load().then(() => {
      if (!alive) return;
      player.setGain(pocket ? 0.35 : 1);
      setReady(true);
    }).catch(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
      running.value = 0;
      hapticCancel.current?.();
      player.onAnchor(null);
      void player.dispose();
      if (song.current === player) song.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, plan]);

  // Pocket Parade toggle (design 4.7): quiet song, bold beat lines, haptic metronome.
  useEffect(() => {
    song.current?.setGain(pocket ? 0.35 : 1);
    runOnUI((p: number) => {
      'worklet';
      view.value.pocket = p;
    })(pocket ? 1 : 0);
  }, [pocket, view]);

  // -- Start: the shell hands over at once (no shell 3-2-1): the song counts in.
  const startedRef = useRef(false);
  const beginSong = useCallback(() => {
    const player = song.current;
    if (!player || !plan) return;
    startedRef.current = true;
    startWall.current = Date.now();
    clock.value = 0;
    anchor.value = { pos: 0, wall: Date.now(), playing: false };
    running.value = 1;
    void player.play(0);
    // Stage title card on Alex's ribbon while the count-in plays.
    const ribbonId = plan.ftue ? 7 : plan.stage === 'waiting_room_a' && !progressRef.current.seenCallouts.includes('rim') ? 8 : 0;
    runOnUI((id: number) => {
      'worklet';
      showRibbon(view.value, id);
    })(ribbonId);
    if (!progressRef.current.seenCallouts.includes('rim') && plan.chart.kind.includes(K_RIM)) {
      progressRef.current = { ...progressRef.current, seenCallouts: [...progressRef.current.seenCallouts, 'rim'] };
    }
  }, [plan, clock, anchor, running, view]);

  const wantStart = useRef(false);
  const onStart = useCallback(() => {
    wantStart.current = true;
    if (ready) beginSong();
  }, [ready, beginSong]);
  useEffect(() => {
    if (ready && wantStart.current && !startedRef.current) beginSong();
  }, [ready, beginSong]);
  useEffect(() => {
    // A new round (first plan or PLAY AGAIN): start its song once it is loaded.
    startedRef.current = false;
  }, [plan]);

  // -- JS side of every judge batch: sound, haptics, HUD -----------------------------
  const onBatch = useCallback((batch: number[], sc: number, combo: number, fever: number, hits: number) => {
    const s = judgeMirror.current;
    forEachEvent(batch, (kind, a, b) => {
      if (kind === EV_HIT) {
        const k = s?.kind[a] ?? 0;
        if (hitSounds.current) {
          const cue = k === K_RIM ? 'rh_rim' : k === K_CYMBAL ? 'rh_cymbal' : 'rh_bass_drum';
          GameAudio.play(cue, { volume: pocket ? 0.35 : 0.55 });
        }
        if (b <= J_PERFECT) {
          perfRunJs.current += 1;
          if (perfRunJs.current % 4 === 0) {
            GameAudio.playLadder('rh_glock', glockStep.current % 10, { volume: 0.4 });
            glockStep.current += fever ? 2 : 1;
          }
        } else perfRunJs.current = 0;
        if (b === J_SHARP) Haptic.hitMedium();
        else if (k === K_RIM) Haptic.tickSelection();
        else if (b === J_PERFECT || b === J_GREAT) Haptic.tapLight();
        else if (b === J_GOOD) Haptic.tickSelection();
        if (k === K_BIG) Haptic.comboHeavy();
      } else if (kind === EV_MISS) {
        perfRunJs.current = 0;
        if (b === 1) {
          GameAudio.play('sh_combo_break', { volume: 0.7 });
          Haptic.tapLight();
        }
      } else if (kind === EV_WRONG) {
        perfRunJs.current = 0;
      } else if (kind === EV_OOS || kind === EV_FREEZE_FAULT) {
        GameAudio.play('fx.nope', { volume: 0.5 });
        Haptic.failBuzz();
      } else if (kind === EV_ROLL_TICK) {
        if (hitSounds.current) GameAudio.play('rh_snare_tap', { volume: 0.35 });
        if (b % 2 === 0) Haptic.tickSelection();
      } else if (kind === EV_ROLL_BREAK) {
        GameAudio.play('sh_combo_break', { volume: 0.5 });
      } else if (kind === EV_BIG_DOUBLE) {
        GameAudio.play('rh_firework');
        Haptic.comboHeavy();
      } else if (kind === EV_FLICK) {
        Haptic.hitMedium();
        setTimeout(() => Haptic.tapLight(), 40);
      } else if (kind === EV_POPPER_TAP) {
        Haptic.tickSelection();
      } else if (kind === EV_POPPER_POP) {
        GameAudio.play('sh_popper');
        Haptic.comboHeavy();
      } else if (kind === EV_FEVER_ARMED) {
        GameAudio.play('sh_powerup', { volume: 0.7 });
        Haptic.success();
      } else if (kind === EV_FEVER_START) {
        GameAudio.play('rh_firework');
        GameAudio.play('fx.whoosh');
        Haptic.success();
        const beat = s ? (s.barStart[a + 1] - s.barStart[a]) / 4 : 450;
        song.current?.setFever(true, beat);
        setFeverOn(true);
      } else if (kind === EV_FEVER_END) {
        const beat = s ? (s.barStart[1] - s.barStart[0]) / 4 : 450;
        song.current?.setFever(false, beat * 1.2);
        setFeverOn(false);
      } else if (kind === EV_MILESTONE) {
        GameAudio.play('fx.reveal', { volume: 0.7 });
        if (a >= 50) GameAudio.play('sh_crowd_cheer', { volume: 0.6 });
        Haptic.comboHeavy();
      } else if (kind === EV_STALL) {
        Haptic.failBuzz();
        void onStall();
      } else if (kind === EV_BAR_LAYER) {
        // March layer locked for bar a (b = 2): nothing to play, the view switches on the bar line.
      }
    });
    setScore(sc);
    setMult(combo >= 50 ? 4 : combo >= 25 ? 3 : combo >= 10 ? 2 : 1);
    setGoalHits(hits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pocket]);

  // A small JS mirror of the static chart arrays the batch handler needs.
  const judgeMirror = useRef<{ kind: number[]; barStart: number[] } | null>(null);
  useEffect(() => {
    if (plan) judgeMirror.current = { kind: plan.chart.kind, barStart: plan.chart.barStart };
  }, [plan]);

  // Heads-up haptic pulse (design 7.7) on every beat of March bars, and every
  // bar in Pocket Parade: strong on beats with a March note, medium on the
  // downbeat, soft otherwise, faint half-beat ticks. Scheduled per bar from
  // one start time (no drift), dropped if more than 40 ms late.
  const onBar = useCallback((bar: number, barWallStart: number, beatMs: number, march: number, noteBeats: number) => {
    if (!march && !pocket) return;
    const steps: HapticStep[] = [];
    for (let k = 0; k < 4; k++) {
      const strong = (noteBeats >> k) & 1;
      steps.push({ at: Math.round(k * beatMs), p: strong ? 'medium' : k === 0 ? 'light' : 'selection' });
      if (march) steps.push({ at: Math.round(k * beatMs + beatMs / 2), p: 'selection' });
    }
    hapticCancel.current?.();
    hapticCancel.current = scheduleHaptics(steps, { startAt: barWallStart, lateDropMs: 40, priority: 2 });
    stepsByBar.current.set(bar, stepsRef.current);
    // Ghost delta chip on every bar line (design 11.2).
    const r = rivals.current.find((x) => x.isGhost);
    if (r && judgeMirror.current) {
      const played = bar - (plan?.chart.firstBar ?? 2);
      if (played > 0 && played <= r.barScores.length) setDeltaChip(played);
    }
  }, [pocket, plan]);

  // FX stage state for UI-thread emission (FxStage owns it; null until mounted).
  const [fxSv, setFxSv] = useState<SharedValue<FxState> | null>(null);
  useEffect(() => {
    if (fxSv) return;
    const id = setInterval(() => {
      const st = fxRef.current?.state as SharedValue<FxState> | undefined;
      if (st) {
        setFxSv(() => st);
        clearInterval(id);
      }
    }, 50);
    return () => clearInterval(id);
  }, [fxSv, ready]);

  // -- The frame: clock, judge tick, layout, FX, events ----------------------------
  const onEnded = useRef<() => void>(() => {});
  const fireEnded = useCallback(() => onEnded.current(), []);
  const frame = useCallback((info: FrameInfo) => {
    'worklet';
    const raw = info.timeSincePreviousFrame ?? 16;
    const dt = raw > 50 ? 50 : raw;
    const nowWall = Date.now();
    const v = view.value;
    const s = judge.value;
    if (running.value) {
      let c = clock.value + dt;
      const a = anchor.value;
      if (a.playing) {
        const target = a.pos + (nowWall - a.wall);
        const err = target - c;
        if (err > 80 || err < -80) c = target;
        else c += err > 0 ? Math.min(2, err * 0.1) : Math.max(-2, err * 0.1);
      }
      clock.value = c;
      lastWall.value = nowWall;
      const vnow = c - offset.value;
      v.now = vnow;
      s.walking = walkingSv.value;
      if (FAKE_WALK) s.walking = Math.floor(beatAt(beatsSv.value, vnow + 3000) / 32) % 2;
      // Dev autoplay: feed the scripted drummer's touches.
      const ap = auto.value;
      while (ap.i < ap.t.length && ap.t[ap.i] <= vnow) {
        const k = ap.i++;
        if (ap.type[k] === 0) {
          const z = ap.zone[k];
          v.touchZone = z;
          v.touchX = z === 1 ? SCREEN_W * 0.15 : z === 2 ? SCREEN_W * 0.85 : SCREEN_W * 0.5;
          v.touchY = geom.touchTop + 80;
          const hadArmed = s.armed;
          judgeDown(s, ap.t[k], z, ap.pid[k], 700);
          if (hadArmed) judgeDown(s, ap.t[k] + 14, 0, 90000 + k, 700);
        } else if (ap.type[k] === 1) judgeUp(s, ap.t[k], ap.pid[k]);
        else judgeMove(s, ap.t[k], ap.pid[k], 660);
      }
      judgeTick(s, vnow);
      // March visuals switch on the bar line of a March bar.
      const bf = beatAt(beatsSv.value, vnow);
      const bar = Math.floor(bf / 4);
      v.marchTarget = bar >= 0 && bar < s.nBars && s.barLayer[bar] === L_MARCH ? 1 : 0;
      if (bar !== lastBarSv.value && bar >= 0 && bar < s.nBars) {
        lastBarSv.value = bar;
        if (v.marchTarget > 0.5 && (bar === 0 || s.barLayer[bar - 1] !== L_MARCH)) showRibbon(v, RB_MARCH);
        // Beats in this bar carrying a March-layer note (the "tap now" pulse).
        let mask = 0;
        const beats = beatsSv.value;
        for (let i = s.cursor; i < s.n && s.bar[i] <= bar; i++) {
          if (s.bar[i] === bar && (s.layers[i] & L_MARCH)) {
            const k = Math.round((beatAt(beats, s.t[i]) - bar * 4));
            if (k >= 0 && k < 4) mask |= 1 << k;
          }
        }
        const barStartT = s.barStart[bar];
        const beatMs = (s.barStart[bar + 1] - barStartT) / 4;
        runOnJS(onBar)(bar, nowWall + (barStartT - vnow) + offset.value, beatMs, s.barLayer[bar] === L_MARCH ? 1 : 0, mask);
      }
      if (s.armed && v.armed === 0) {
        v.armed = 1;
        showRibbon(v, RB_READY);
      }
      // Rival rails flash on their verified hits at the beat-map time.
      const rt = rivalHitT.value;
      const rk = rivalHitK.value;
      for (let r = 0; r < rt.length && r < 3; r++) {
        const list = rt[r];
        let k = rk[r];
        while (k < list.length && list[k] <= vnow) {
          railFlash.value[r] = v.wt;
          k++;
        }
        rk[r] = k;
      }
      if (!ended.value && (vnow >= endMs.value || s.stalled)) {
        ended.value = 1;
        runOnJS(fireEnded)();
      }
    }
    const fx = fxSv ? fxSv.value : null;
    stepView(v, fx, dt);
    layoutFrame(draw.value, s, beatsSv.value, geom, v.now, approachSv.value, v.march, v.missAt, v.wt, echoStyleSv.value, 1);
    const batch = drainEvents(s.ev);
    if (batch.length) {
      applyEventsUI(v, s, fx, batch);
      runOnJS(onBatch)(batch, s.score, s.combo, feverActiveAt(s, v.now) ? 1 : 0, s.hitN);
    }
    tick.value = tick.value + 1;
  }, [fxSv, onBatch, onBar, fireEnded, geom]);
  useFrameCallback(frame);

  // -- Touch: judged on touch-down on the UI thread (design 10.3) --------------------
  const gesture = useMemo(() => Gesture.Manual()
    .onTouchesDown((e) => {
      'worklet';
      if (!running.value) return;
      const s = judge.value;
      const v = view.value;
      const base = clock.value + Math.min(34, Math.max(0, Date.now() - lastWall.value)) - offset.value;
      for (const touch of e.changedTouches) {
        if (base < v.inputFrom) continue;
        const zone = zoneOfX(touch.x, SCREEN_W);
        v.touchX = touch.x;
        v.touchY = touch.y + geom.touchTop;
        v.touchZone = zone;
        judgeDown(s, base, zone, touch.id, touch.absoluteY);
      }
      const batch = drainEvents(s.ev);
      if (batch.length) {
        applyEventsUI(v, s, fxSv ? fxSv.value : null, batch);
        runOnJS(onBatch)(batch, s.score, s.combo, feverActiveAt(s, v.now) ? 1 : 0, s.hitN);
      }
    })
    .onTouchesMove((e) => {
      'worklet';
      if (!running.value) return;
      const s = judge.value;
      const t = clock.value + Math.min(34, Math.max(0, Date.now() - lastWall.value)) - offset.value;
      for (const touch of e.changedTouches) judgeMove(s, t, touch.id, touch.absoluteY);
    })
    .onTouchesUp((e) => {
      'worklet';
      const s = judge.value;
      const t = clock.value + Math.min(34, Math.max(0, Date.now() - lastWall.value)) - offset.value;
      for (const touch of e.changedTouches) judgeUp(s, t, touch.id);
    })
    .onTouchesCancelled((e) => {
      'worklet';
      const s = judge.value;
      const t = clock.value - offset.value;
      for (const touch of e.changedTouches) judgeUp(s, t, touch.id);
    }), [judge, view, clock, lastWall, offset, running, geom, fxSv, onBatch]);

  // -- Round end -----------------------------------------------------------------------
  const finishRound = useCallback(async (reason: 'end' | 'stall' | 'wrap') => {
    if (finished.current || !plan) return null;
    finished.current = true;
    running.value = 0;
    hapticCancel.current?.();
    // Pull the finished judge from the UI thread.
    const s: JudgeState = await new Promise((resolve) => {
      runOnUI(() => {
        'worklet';
        const st = judge.value;
        finishJudge(st, st.now, reason === 'wrap');
        runOnJS(resolve)(st);
      })();
    });
    const sum = summarize(s, { format: plan.format, ftue: plan.ftue });
    const player = song.current;
    if (reason === 'end') player?.fadeOut(700);
    const elapsed = Date.now() - startWall.current;
    const proof = buildProof(s, {
      stage: STAGES[plan.stage].json,
      format: plan.format,
      difficulty: plan.difficulty,
      seed: plan.seed,
      ftue: plan.ftue,
      autoFever: plan.autoFever,
      noFailUntilMs: plan.noFailUntil,
      audioBackend: GameAudio.backendName === 'expo-av' ? 'expoav' : 'expoav+audioapi-sfx',
      route: 'speaker',
      offsetMs: offset.value,
      sharpEnabled: false,
      pocket,
      elapsedMs: elapsed,
      pauseSpans: pauseSpans.current,
      walkSource: walk.walking ? 'motion' : 'motion',
      stepsPerMarchBar: sum.marchBars.map((b) => {
        const a = stepsByBar.current.get(b) ?? 0;
        const n = stepsByBar.current.get(b + 1) ?? stepsRef.current;
        return Math.max(0, n - a);
      }),
    }, plan.chart.chartVersion, plan.chart.beatmapHash);
    // Progress: PB, stars, mastery, silent offset auto-tune, ghost of a PB run.
    const board = plan.format === 'ride' ? 'ride' : sum.marchShare >= 0.5 ? 'march' : 'stage';
    const p0 = progressRef.current;
    const { next, newPb } = recordRound(p0, { stage: plan.stage, difficulty: plan.difficulty, board, score: sum.score, stars: sum.stars, ftue: plan.ftue });
    const tuned = autoTuneOffset(offset.value, s);
    next.offsets = { ...next.offsets, speaker: tuned };
    if (newPb && !plan.ftue && sum.cleared) {
      next.ghosts = {
        ...next.ghosts,
        [ghostKey(plan.stage, plan.format, plan.difficulty)]: {
          stage: plan.stage, format: plan.format, difficulty: plan.difficulty, seed: plan.seed, touches: proof.touches,
          marchBars: proof.march_bars, autoFever: plan.autoFever, score: sum.score, name: 'Your best', barScores: [], at: Date.now(),
        },
      };
    }
    progressRef.current = next;
    void saveProgress(next);
    const win = plan.format === 'ride' && !plan.ftue ? sum.rideWin : sum.stars > 0;
    const stars = plan.format === 'ride' && !plan.ftue ? (sum.rideWin ? Math.max(1, sum.stars) : 0) : sum.stars;
    if (reason !== 'stall') {
      if (win) GameAudio.play(stars >= 2 ? 'rh_win' : 'rh_clear');
      if (newPb && sum.score > 0) setTimeout(() => GameAudio.play('fx.purchase', { volume: 0.8 }), 900);
    }
    const res: GameResult = {
      score: sum.score,
      stars: win ? stars : 0,
      maxCombo: sum.maxCombo,
      message: resultMessage(sum, plan.ftue, reason),
      thresholds: undefined,
      stats: [
        { label: 'Accuracy', value: `${Math.round(sum.accuracy)}%` },
        { label: sum.steadinessLabel, value: String(sum.steadiness) },
        { label: 'Timing', value: sum.timingWords.replace("You're ", '') },
        ...(sum.marchBars.length ? [{ label: 'Marching', value: `${sum.marchBars.length} bars` }] : []),
        ...(rivals.current.length ? [{ label: 'Drum-Off', value: placeText(sum.score, rivals.current) }] : []),
      ],
      meta: {
        // Legacy proof fields (TaskGameProofService today).
        game: 'timing',
        score: sum.score,
        seed: plan.seed,
        stage: plan.stage,
        difficulty: plan.difficulty,
        format: plan.format,
        perfect: sum.counts.perfect + sum.counts.sharp,
        great: sum.counts.great,
        good: sum.counts.good,
        miss: sum.counts.miss,
        maxCombo: sum.maxCombo,
        accuracy: sum.accuracy,
        rideWin: sum.rideWin,
        newPb,
        rhythmProof: proof,
      },
    };
    return res;
  }, [plan, running, judge, pocket, offset, walk.walking]);

  onEnded.current = () => {
    void (async () => {
      const s = judge.value;
      if (s.stalled) return; // handled by onStall
      const res = await finishRound('end');
      if (res) setTimeout(() => setResult(res), 600);
    })();
  };

  const onStall = useCallback(async () => {
    if (finished.current) return;
    const player = song.current;
    const res = await finishRound('stall');
    await player?.tapeStop(620);
    GameAudio.play('rh_stall', { volume: 0.8 });
    if (res) setTimeout(() => setResult(res), 500);
  }, [finishRound]);

  // -- Pause / resume (interruptions only; walking never pauses) -----------------------
  const onPause = useCallback(() => {
    if (!running.value) return;
    running.value = 0;
    hapticCancel.current?.();
    void song.current?.pause().then(() => {
      const at = clock.value - offset.value;
      pausedAt.current = at;
      runOnUI((t: number) => {
        'worklet';
        voidAround(judge.value, t);
      })(at);
    });
  }, [running, clock, offset, judge]);

  const onResume = useCallback(() => {
    const at = pausedAt.current;
    const player = song.current;
    if (at == null || !player || !plan) {
      running.value = startedRef.current ? 1 : 0;
      return;
    }
    // Replay the bar before the pause as a counted pre-roll; input opens at the pause point.
    const bars = plan.chart.barStart;
    let b = 0;
    while (b + 1 < bars.length && bars[b + 1] <= at) b++;
    const from = Math.max(0, bars[Math.max(0, b - 1)]);
    const pre = bars[Math.max(0, b - 1)];
    pauseSpans.current.push([at, Date.now()]);
    clock.value = from + offset.value;
    anchor.value = { pos: from, wall: Date.now(), playing: false };
    const bb = Math.max(0, b - 1);
    const count: number[] = [];
    for (let k = 0; k <= 4; k++) count.push(pre + ((bars[bb + 1] - pre) * k) / 4);
    runOnUI((inputFrom: number, beats: number[]) => {
      'worklet';
      view.value.inputFrom = inputFrom;
      view.value.countBeats = beats;
    })(at, count);
    pausedAt.current = null;
    void player.play(from).then(() => {
      running.value = 1;
    });
  }, [plan, running, clock, anchor, offset, view]);

  const onWrapUp = useCallback(() => {
    // A real queue event: the round ends where it is, results saved.
    void finishRound('wrap').then((res) => {
      if (res) setResult(res);
    });
    return null;
  }, [finishRound]);

  // -- Play again / challenge ---------------------------------------------------------
  const onRematch = useCallback(() => {
    setProgress({ ...progressRef.current });
    setRunIndex((n) => n + 1);
  }, []);

  if (!visible) return null;
  const title = plan ? (plan.ftue ? 'First Parade' : STAGES[plan.stage].title) : 'Parade Beat';
  const subtitle = plan ? (plan.format === 'ride' && !plan.ftue ? 'Ride Challenge' : `Parade Beat · ${['', 'Warm-up', 'Parade', 'Showstopper'][plan.difficulty]}`) : 'Parade Beat';
  const rideTarget = plan && plan.format === 'ride' && !plan.ftue ? Math.ceil(plan.chart.t.length * 0.75) : 0;

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title={title}
      subtitle={subtitle}
      score={score}
      multiplier={mult}
      fever={feverOn}
      personalBest={plan ? progressRef.current.pb[pbKey(plan.stage, plan.difficulty, plan.format === 'ride' ? 'ride' : 'stage')] : undefined}
      objective="Tap the drum on the beat"
      goal={rideTarget ? { current: goalHits, target: rideTarget, label: 'BEATS' } : undefined}
      result={result}
      introCountdown={false}
      resumeStyle="instant"
      gameId="rhythm"
      onStart={onStart}
      onPause={onPause}
      onResume={onResume}
      onWrapUp={onWrapUp}
      onRematch={props.format === 'ride' ? undefined : onRematch}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root}>
          {plan ? (
            <ParadeField
              geom={geom}
              judge={judge}
              view={view}
              draw={draw}
              tick={tick}
              reducedMotion={reducedMotion}
              rails={rivals.current.map((r) => r.color)}
              railFlash={railFlash}
            />
          ) : null}
          <FxStage ref={fxRef} width={SCREEN_W} height={fieldH} reducedMotion={reducedMotion} flashCap={0.12} />
          <GestureDetector gesture={gesture}>
            <View style={[styles.touchZone, { top: geom.touchTop, height: fieldH - geom.touchTop }]} />
          </GestureDetector>
          {rivals.current.length ? (
            <View pointerEvents="none" style={styles.rivalStrip}>
              {rivals.current.map((r, i) => (
                <View key={r.id} style={[styles.rivalChip, { borderColor: r.color }]}>
                  <Text style={styles.rivalName} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.rivalScore}>{r.finalScore.toLocaleString()}</Text>
                  {void i}
                </View>
              ))}
            </View>
          ) : null}
          {deltaChip != null && rivals.current.find((r) => r.isGhost) ? (
            <DeltaChip bar={deltaChip} myScore={score} ghost={rivals.current.find((r) => r.isGhost)!} />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={pocket ? 'Sound on' : 'Playing without sound'}
            hitSlop={10}
            onPress={() => setPocket((p) => !p)}
            style={[styles.pocketBtn, pocket && styles.pocketBtnOn]}
          >
            <Text style={[styles.pocketTxt, pocket && styles.pocketTxtOn]}>{pocket ? 'FEEL' : 'SOUND'}</Text>
          </Pressable>
          {!ready ? (
            <View pointerEvents="none" style={styles.loading}>
              <Text style={styles.loadingTxt}>The parade is lining up...</Text>
            </View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

function DeltaChip({ bar, myScore, ghost }: { bar: number; myScore: number; ghost: Rival }) {
  const ghostScore = ghost.barScores[Math.min(ghost.barScores.length - 1, bar - 1)] ?? 0;
  const d = myScore - ghostScore;
  const ahead = d >= 0;
  return (
    <View pointerEvents="none" style={[styles.delta, { borderColor: ahead ? '#2f9be8' : '#ff7a59' }]}>
      <Text style={[styles.deltaTxt, { color: ahead ? '#1f6fc0' : '#d9502f' }]}>{`${ahead ? '+' : '-'}${Math.abs(d).toLocaleString()}`}</Text>
      <Text style={styles.deltaLbl}>{ghost.name}</Text>
    </View>
  );
}

function placeText(score: number, rivals: Rival[]): string {
  const place = 1 + rivals.filter((r) => r.finalScore > score).length;
  return ['1ST', '2ND', '3RD', '4TH'][place - 1] ?? `${place}TH`;
}

function countInBeats(chart: Chart): number[] {
  // Pre-roll bar 2 (file bar 1): numerals 4-3-2-1 on its beats.
  const out: number[] = [];
  for (let k = 4; k <= 8; k++) out.push(chart.beats[k]);
  return out;
}

function resultMessage(sum: RoundSummary, ftue: boolean, reason: string): string {
  if (reason === 'stall') return 'The parade needs you!';
  if (ftue) return 'Parade cleared';
  if (sum.allPerfect) return 'ALL PERFECT!';
  if (sum.fullCombo) return 'FULL COMBO!';
  if (sum.accuracy >= STAR_ACCURACY.three) return 'SHOWSTOPPER!';
  if (sum.accuracy >= STAR_ACCURACY.two) return 'What a parade!';
  if (sum.cleared) return 'Parade cleared';
  return 'The parade needs you!';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#4fc3ff' },
  touchZone: { position: 'absolute', left: 0, right: 0 },
  loading: { position: 'absolute', top: '40%', alignSelf: 'center', backgroundColor: '#fff8e4', borderRadius: 16, borderWidth: 3, borderColor: '#0b3a6b', paddingHorizontal: 16, paddingVertical: 8 },
  loadingTxt: { fontFamily: 'Shark', fontSize: 18, color: '#0b3a6b' },
  pocketBtn: { position: 'absolute', left: 62, top: 50, backgroundColor: '#fff8e4', borderRadius: 12, borderWidth: 2, borderColor: '#0b3a6b', paddingHorizontal: 8, paddingVertical: 4 },
  pocketBtnOn: { backgroundColor: '#0b3a6b' },
  pocketTxt: { fontFamily: 'Shark', fontSize: 12, color: '#0b3a6b' },
  pocketTxtOn: { color: '#ffcf3b' },
  rivalStrip: { position: 'absolute', top: 64, left: 8, right: 8, flexDirection: 'row', justifyContent: 'center' },
  rivalChip: { backgroundColor: 'rgba(255,248,228,0.92)', borderWidth: 2, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginHorizontal: 3, alignItems: 'center', minWidth: 64 },
  rivalName: { fontFamily: 'Knockout', fontSize: 10, color: '#0b3a6b' },
  rivalScore: { fontFamily: 'Shark', fontSize: 11, color: '#0b3a6b' },
  delta: { position: 'absolute', top: 128, alignSelf: 'center', backgroundColor: '#ffffff', borderWidth: 3, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 2, alignItems: 'center' },
  deltaTxt: { fontFamily: 'Shark', fontSize: 16 },
  deltaLbl: { fontFamily: 'Knockout', fontSize: 11, color: '#0b3a6b' },
});

export default RhythmTapGame;
export { runScript, decodeTouches, J_GREAT, K_ROLL };
