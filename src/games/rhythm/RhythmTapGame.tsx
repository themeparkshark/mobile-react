/**
 * RhythmTapGame.tsx: "Parade Beat", the Rhythm Tap rework
 * (design: tps-prime-time-audit/studio/design/rhythm.md, revision 6).
 *
 * Your shark is the drum major of the park parade. Chris's songs play, notes
 * march down the parade route onto the big drum, and every note is a drum hit
 * you can hear. Colour equals input: blue notes on the blue part of the drum,
 * coral notes on the coral part. Hold through rolls, two fingers on the gold
 * BIG stars, and swipe up off the drum to launch Firework Fever on the next
 * drop line.
 *
 * External contract (unchanged): MiniGameSelector, LinePlay and Crew Relay
 * render <RhythmTapGame visible seed difficulty format onComplete onClose
 * onQuit />. Proof: meta.score + meta.seed (what TaskGameProofService
 * validates today) plus meta.rhythmProof (v5, see core/proof.ts).
 *
 * QUEUE REALITY: movement never pauses. The MARCH pill switches the next
 * 4-bar section to the March layer (big quarter-note hits, zones ignored,
 * softer penalties) so a player can keep drumming by ear with eyes up; the
 * walk sensor only suggests it (the pill pulses), it never changes the chart.
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
} from 'react-native-reanimated';
import {
  GameAudio,
  GameShellV2,
  Haptic,
  PerfOverlay,
  usePerfProbe,
  deriveRunSeed,
  drainEvents,
  forEachEvent,
  registerStudioAudio,
  scheduleHaptics,
  setHapticGapMs,
  useWalkSense,
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
  EV_LAUNCH,
  EV_LIMP,
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
  judgeLaunch,
  judgeMove,
  judgeTick,
  judgeUp,
  barAt,
  nextOpenSection,
  noteActive,
  voidAround,
  type JudgeState,
} from './core/judge';
import { buildProof } from './core/proof';
import { autoTuneOffset, summarize, type RoundSummary } from './core/score';
import { J_GOOD, J_GREAT, J_PERFECT, J_SHARP, K_BIG, K_CYMBAL, K_FREEZE, K_POPPER, K_RIM, K_ROLL, L_MARCH, STAR_ACCURACY, type Chart, type Difficulty, type RoundFormat } from './core/types';
import { DEFAULT_GRIP, GRIP_ONE, GRIP_TWO, detectHand, gripFor, zoneOf, type GripPrefs } from './core/grip';
import { createDrawList, layoutFrame, beatAt } from './field/layout';
import { ParadeField, fieldGeom } from './field/ParadeField';
import { applyEventsUI, createView, showRibbon, stepView, RB_CORAL_SIDE, RB_DARE, RB_FULL, RB_HOLD, RB_MARCH, RB_READY, RB_TAP_BLUE, RB_TWO_THUMBS, type ParadeView } from './field/view';
import { SongPlayer, type SongAnchor } from './audio/SongPlayer';
import {
  effectiveDifficulty,
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
import { crewForRound, dareBarsFor, drumOffPlace, type Rival } from './multiplayer/drumline';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HEADER_H = 113;
const DEFAULT_OFFSET_MS = 25; // built-in speaker placeholder (design 4.5)
// Dev only: a scripted drummer plays the round (sigma ms) for capture and feel checks,
// and EXPO_PUBLIC_RHYTHM_WALK=1 fakes walking in 8-bar stretches (March layer demo).
const AUTOPLAY_SIGMA = __DEV__ ? Number(process.env.EXPO_PUBLIC_RHYTHM_AUTOPLAY || 0) : 0;
// Section names for the pending MARCH label ("MARCH from Chorus").
const SECTION_LABEL_QUEUE = ['Warm-up', 'Step it up', 'Parade', 'Chorus', 'Breakdown', 'Finale'];
const SECTION_LABEL_RIDE = ['Warm-up', 'Chorus', 'Finale'];
const FAKE_WALK = __DEV__ && process.env.EXPO_PUBLIC_RHYTHM_WALK === '1';
const DEV_STAGE = (__DEV__ ? process.env.EXPO_PUBLIC_RHYTHM_STAGE : undefined) as StageId | undefined;
const DEV_DIFF = __DEV__ ? Number(process.env.EXPO_PUBLIC_RHYTHM_DIFF || 0) : 0;
// Dev only: start from empty progress (First Parade, callouts) without touching saved data.
const DEV_FRESH = __DEV__ && process.env.EXPO_PUBLIC_RHYTHM_FRESH === '1';
// Dev only: the engine's frame-time overlay (UI fps, p5, p95).
const DEV_PERF = __DEV__ && process.env.EXPO_PUBLIC_RHYTHM_PERF === '1';

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
  /** Ride Assist (design 3.5): granted by the server after a recorded ride loss. */
  assist?: boolean;
  /**
   * "Challenge crew" (Ghost Drumline, design 11.2): when the host can deliver
   * a Line Party challenge, the results card offers it and this receives the
   * canonical run (stage, difficulty, touch log, March bars) to send.
   */
  onChallengeCrew?: (ghost: GhostRun) => void;
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
  assist: boolean;
  /** Queue rounds Limp at Groove 0 instead of stalling (design 3.6). */
  limp: boolean;
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
    // Launch ships d1 and d2 (d3 arrives with the commissioned track); d2 needs 2 stars on d1.
    difficulty = DEV_DIFF ? (Math.min(2, DEV_DIFF) as Difficulty) : effectiveDifficulty(p, stage, Math.min(2, difficulty));
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
    assist: ride && !!props.assist,
    limp: !ride && format === 'queue',
    noFailUntil,
    chart,
    songSrc: audio.song,
    feverSrc: audio.fever,
  };
}

const PRELOAD = [
  'rh_bass_drum', 'rh_rim', 'rh_cymbal', 'rh_snare_tap', 'rh_glock', 'rh_firework', 'rh_whistle_call', 'rh_win', 'rh_clear', 'rh_stall',
  'sh_popper', 'sh_combo_break', 'sh_whistle', 'sh_powerup', 'sh_crowd_cheer', 'fx.reveal', 'fx.whoosh', 'fx.nope', 'fx.coin', 'fx.purchase',
  'rh_thud', 'rh_tick',
];

// Always-on hit thuds (design 5.3): a quiet cut of the drum one-shots, 14 dB
// under the song, on every GOOD-or-better hit and on every backend.
let thudsRegistered = false;
function registerThuds(): void {
  if (thudsRegistered) return;
  thudsRegistered = true;
  GameAudio.registerCues({
    rh_thud: { src: require('./audio/sfx/rh_thud.wav'), durationMs: 120, maxVoices: 4, priority: 1, fallback: 'ui.tap' },
    rh_tick: { src: require('./audio/sfx/rh_tick.wav'), durationMs: 60, maxVoices: 4, priority: 1, fallback: 'ui.tap' },
  });
}
const THUD_VOL = 0.42;

export function RhythmTapGame(props: RhythmTapGameProps) {
  const { visible, seed: roundSeed, onComplete, onClose, onQuit } = props;
  const reducedMotion = useReducedGameMotion();
  const perfProbe = usePerfProbe(DEV_PERF);
  const shellRef = useRef<GameShellV2Handle>(null);
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
  const [deltaChip, setDeltaChip] = useState<number | null>(null);
  // MARCH pill (design 4.6): the player's choice; applies per 4-bar section.
  const [marchOn, setMarchOn] = useState(false);
  const [marchLive, setMarchLive] = useState(false);
  const [marchFrom, setMarchFrom] = useState<string | null>(null);
  const [walkHint, setWalkHint] = useState<0 | 1 | 2>(0);
  const [gripPrefs, setGripPrefs] = useState<GripPrefs>(DEFAULT_GRIP);
  const [armedJs, setArmedJs] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void (DEV_FRESH ? Promise.resolve(emptyProgress()) : loadProgress()).then((p) => {
      if (!alive) return;
      progressRef.current = p;
      setProgress(p);
      if (p.grip) setGripPrefs(p.grip);
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
  const marchSv = useSharedValue(0);
  const gripSv = useSharedValue<number[]>([GRIP_ONE, 1, 0]);
  const handXs = useSharedValue<number[]>([]);
  const endMs = useSharedValue(1e12);
  const ended = useSharedValue(0);
  const beatsSv = useSharedValue<number[]>([0, 500]);
  const approachSv = useSharedValue(1300);
  const echoStyleSv = useSharedValue(0);
  const railFlash = useSharedValue<number[]>([-1e9, -1e9, -1e9]);
  const rivalHitT = useSharedValue<number[][]>([]);
  const rivalHitK = useSharedValue<number[]>([]);
  const lastBarSv = useSharedValue(-1);
  // Hidden Dares delivered by rival Fever launches: per bar 1/0.
  const dareSv = useSharedValue<number[]>([]);
  const dareBarsRef = useRef<number[]>([]);
  const auto = useSharedValue<{ err: number[]; skip: number[]; i: number; relT: number[]; relP: number[]; popLast: number }>({ err: [], skip: [], i: 0, relT: [], relP: [], popLast: 0 });

  // -- Audio ------------------------------------------------------------------------
  const song = useRef<SongPlayer | null>(null);
  const hitSounds = useRef(false);
  const startWall = useRef(0);
  const pauseSpans = useRef<[number, number][]>([]);
  const pausedAt = useRef<number | null>(null);
  const hapticCancel = useRef<(() => void) | null>(null);
  const finished = useRef(false);
  const lastRun = useRef<GhostRun | null>(null);
  // PB as it stood when the round began (the results card compares against it).
  const pbBefore = useRef<number | undefined>(undefined);
  const perfRunJs = useRef(0);
  const glockStep = useRef(0);
  const rivals = useRef<Rival[]>([]);

  // The walk sensor only suggests (design 4.6): walking 3 s on the full chart
  // pulses "Walking? Tap to march"; standing 8 s while marching suggests the
  // full chart. It never changes the chart, scores or boards.
  const walk = useWalkSense({ active: visible && ready && !result });
  useEffect(() => {
    if (walk.walking && !progressRef.current.walkSeen) {
      progressRef.current = { ...progressRef.current, walkSeen: true };
    }
    const want = walk.walking ? (marchOn ? 0 : 1) : marchOn ? 2 : 0;
    if (!want) {
      setWalkHint(0);
      return undefined;
    }
    const id = setTimeout(() => setWalkHint(want as 1 | 2), want === 1 ? 3000 : 8000);
    return () => clearTimeout(id);
  }, [walk.walking, marchOn]);

  // Grip for this round (ride: always One Thumb).
  const hasRim = plan ? plan.chart.kind.includes(K_RIM) : true;
  const grip = plan ? gripFor(gripPrefs, plan.difficulty, plan.format, hasRim) : GRIP_ONE;
  useEffect(() => {
    gripSv.value = [grip, gripPrefs.hand, gripPrefs.swap];
  }, [grip, gripPrefs.hand, gripPrefs.swap, gripSv]);
  const saveGrip = useCallback((g: GripPrefs) => {
    setGripPrefs(g);
    progressRef.current = { ...progressRef.current, grip: g };
    void saveProgress(progressRef.current);
  }, []);
  const onHandSample = useCallback((xs: number[]) => {
    const prev = progressRef.current.grip ?? DEFAULT_GRIP;
    const hand = detectHand(xs, SCREEN_W, prev.hand);
    if (hand !== prev.hand || !progressRef.current.grip) saveGrip({ ...prev, hand });
  }, [saveGrip]);

  useEffect(() => {
    registerStudioAudio('rhythm');
    registerThuds();
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
    pbBefore.current = progressRef.current.pb[pbKey(plan.stage, plan.difficulty, plan.format === 'ride' ? 'ride' : 'stage')];
    pauseSpans.current = [];
    pausedAt.current = null;
    setMarchLive(false);
    setMarchFrom(null);
    setArmedJs(false);
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
    const js = createJudge(chart, { autoFever: plan.autoFever, noFailUntilMs: plan.noFailUntil, limp: plan.limp, assist: plan.assist });
    js.marchWant = marchSv.value;
    judge.value = js;
    const v = createView(chart.t.length, geom.cx, geom.yLine, SCREEN_W, countInBeats(chart));
    v.reduced = reducedMotion ? 1 : 0;
    v.pocket = pocket ? 1 : 0;
    view.value = v;
    draw.value = createDrawList();
    beatsSv.value = chart.beats;
    approachSv.value = js.approach;
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
    const dares = plan.format === 'queue' ? dareBarsFor(chart, crew) : [];
    dareBarsRef.current = dares;
    const flags: number[] = [];
    for (let b = 0; b < chart.barStart.length; b++) flags.push(dares.includes(b) ? 1 : 0);
    dareSv.value = flags;
    rivalHitK.value = crew.map(() => 0);
    railFlash.value = [-1e9, -1e9, -1e9];

    if (AUTOPLAY_SIGMA > 0) {
      // Per-note timing error (Gaussian) and lapses; the drummer reads whichever layer is live.
      const err: number[] = [];
      const skip: number[] = [];
      let r = plan.seed || 1;
      const rnd = () => {
        r = (Math.imul(r, 1103515245) + 12345) >>> 0;
        return (r >>> 8) / 16777216;
      };
      for (let i = 0; i < chart.t.length; i++) {
        const g = Math.sqrt(-2 * Math.log(Math.max(1e-6, rnd()))) * Math.cos(2 * Math.PI * rnd());
        err.push(g * AUTOPLAY_SIGMA);
        skip.push(rnd() < 0.015 ? 1 : 0);
      }
      auto.value = { err, skip, i: 0, relT: [], relP: [], popLast: 0 };
    } else {
      auto.value = { err: [], skip: [], i: 0, relT: [], relP: [], popLast: 0 };
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
    // One new idea per stage, once per player, on Alex's ribbon during the count-in (design 3.7).
    const seen = progressRef.current.seenCallouts;
    let callout = '';
    if (plan.ftue) callout = 'blue';
    else if (grip === GRIP_TWO && !seen.includes('two')) callout = 'two';
    else if (plan.chart.kind.includes(K_RIM) && !seen.includes('rim')) callout = 'rim';
    else if (plan.chart.kind.includes(K_ROLL) && !seen.includes('roll')) callout = 'roll';
    const ribbonId = callout === 'blue' ? RB_TAP_BLUE : callout === 'two' ? RB_TWO_THUMBS : callout === 'rim' ? RB_CORAL_SIDE : callout === 'roll' ? RB_HOLD : 0;
    runOnUI((id: number) => {
      'worklet';
      showRibbon(view.value, id);
    })(ribbonId);
    if (callout && callout !== 'blue') {
      progressRef.current = { ...progressRef.current, seenCallouts: [...seen, callout] };
    }
  }, [plan, clock, anchor, running, view, grip]);

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
        const rim = k === K_RIM;
        // Always-on thud (DRUM, BIG, ROLL head) or rim tick, quiet under the song.
        GameAudio.play(rim ? 'rh_tick' : 'rh_thud', { volume: pocket ? THUD_VOL * 0.7 : THUD_VOL });
        if (b <= J_PERFECT) {
          perfRunJs.current += 1;
          if (hitSounds.current && perfRunJs.current % 4 === 0) {
            // Glock sparkle (audio-api backend only, design 5.3).
            GameAudio.playLadder('rh_glock', glockStep.current % 10, { volume: 0.32 });
            glockStep.current += fever ? 2 : 1;
          }
        } else perfRunJs.current = 0;
        // Per-judgment haptics (design 7.7, v1 table): DRUM duller than RIM.
        if (k === K_BIG) Haptic.comboHeavy();
        else if (b <= J_PERFECT) (rim ? Haptic.hitRigid : Haptic.hitMedium)();
        else if (b === J_GREAT) (rim ? Haptic.tapLight : Haptic.hitSoft)();
        else Haptic.tickSelection();
      } else if (kind === EV_MISS) {
        perfRunJs.current = 0;
        if (b === 1) {
          GameAudio.play('sh_combo_break', { volume: 0.6 });
          Haptic.tapLight();
        }
      } else if (kind === EV_WRONG) {
        perfRunJs.current = 0;
      } else if (kind === EV_OOS || kind === EV_FREEZE_FAULT) {
        GameAudio.play('fx.nope', { volume: 0.5 });
        Haptic.failBuzz();
      } else if (kind === EV_ROLL_TICK) {
        GameAudio.play('rh_thud', { volume: THUD_VOL * 0.6 });
        if (b % 2 === 0) Haptic.tickSelection();
      } else if (kind === EV_ROLL_BREAK) {
        GameAudio.play('sh_combo_break', { volume: 0.45 });
      } else if (kind === EV_BIG_DOUBLE) {
        GameAudio.play('rh_firework');
        GameAudio.play('rh_cymbal', { volume: 0.55 });
        Haptic.comboHeavy();
      } else if (kind === EV_FLICK) {
        Haptic.hitMedium();
      } else if (kind === EV_POPPER_TAP) {
        Haptic.tickSelection();
      } else if (kind === EV_POPPER_POP) {
        GameAudio.play('sh_popper');
        Haptic.comboHeavy();
      } else if (kind === EV_FEVER_ARMED) {
        GameAudio.play('sh_powerup', { volume: 0.65 });
        Haptic.success();
        setArmedJs(true);
      } else if (kind === EV_LAUNCH) {
        GameAudio.play('fx.whoosh', { volume: 0.7 });
        Haptic.hitMedium();
        setArmedJs(false);
      } else if (kind === EV_FEVER_START) {
        GameAudio.play('rh_firework');
        GameAudio.play('fx.whoosh');
        Haptic.success();
        const beat = s ? (s.barStart[a + 1] - s.barStart[a]) / 4 : 450;
        song.current?.setFever(true, beat);
        setFeverOn(true);
        setArmedJs(false);
      } else if (kind === EV_FEVER_END) {
        const beat = s ? (s.barStart[1] - s.barStart[0]) / 4 : 450;
        song.current?.setFever(false, beat * 1.2);
        setFeverOn(false);
      } else if (kind === EV_MILESTONE) {
        GameAudio.play('fx.reveal', { volume: 0.7 });
        if (a >= 50) GameAudio.play('sh_crowd_cheer', { volume: 0.6 });
        Haptic.comboHeavy();
      } else if (kind === EV_LIMP) {
        if (a) {
          GameAudio.play('fx.nope', { volume: 0.35 });
          Haptic.warning();
        } else {
          GameAudio.play('fx.reveal', { volume: 0.5 });
          Haptic.success();
        }
      } else if (kind === EV_STALL) {
        Haptic.failBuzz();
        void onStall();
      } else if (kind === EV_BAR_LAYER) {
        // Layer locked for bar a (b = 2 March): the view switches on the bar line.
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
    setMarchLive(!!march);
    if (marchWantRef.current === !!march) setMarchFrom(null);
    // A rival's Fever dares the next bar: one bar of warning (whistle + coral rail stripes).
    if (dareBarsRef.current.includes(bar + 1) && !march) {
      GameAudio.play('rh_whistle_call', { volume: 0.55 });
      runOnUI(() => {
        'worklet';
        showRibbon(view.value, RB_DARE);
      })();
    }
    // Ghost delta chip on every bar line (design 11.2).
    const r = rivals.current.find((x) => x.isGhost);
    if (r && judgeMirror.current) {
      const played = bar - (plan?.chart.firstBar ?? 2);
      if (played > 0 && played <= r.barScores.length) setDeltaChip(played);
    }
    if (!march && !pocket) return;
    const steps: HapticStep[] = [];
    for (let k = 0; k < 4; k++) {
      const strong = (noteBeats >> k) & 1;
      steps.push({ at: Math.round(k * beatMs), p: strong ? 'medium' : k === 0 ? 'light' : 'selection' });
      if (march) steps.push({ at: Math.round(k * beatMs + beatMs / 2), p: 'selection' });
    }
    hapticCancel.current?.();
    hapticCancel.current = scheduleHaptics(steps, { startAt: barWallStart, lateDropMs: 40, priority: 2 });
  }, [pocket, plan]);

  // -- MARCH pill (design 4.6): toggles the layer from the next unlocked section.
  const marchWantRef = useRef(false);
  const toggleMarch = useCallback(() => {
    const next = !marchWantRef.current;
    marchWantRef.current = next;
    setMarchOn(next);
    setWalkHint(0);
    marchSv.value = next ? 1 : 0;
    const labels = plan?.format === 'ride' ? SECTION_LABEL_RIDE : SECTION_LABEL_QUEUE;
    const onLabel = (sec: number) => {
      setMarchFrom(sec >= 0 ? `${next ? 'MARCH' : 'FULL CHART'} from ${labels[sec] ?? 'next section'}` : null);
    };
    runOnUI((want: number) => {
      'worklet';
      const s = judge.value;
      s.marchWant = want;
      const b = nextOpenSection(s);
      runOnJS(onLabel)(b < 0 ? -1 : Math.floor((b - s.firstBar) / 4));
    })(next ? 1 : 0);
  }, [plan, judge, marchSv]);

  // -- Fever: tap the armed meter to launch (accessibility path, design 3.1).
  const launchFromMeter = useCallback(() => {
    runOnUI(() => {
      'worklet';
      if (!running.value) return;
      const s = judge.value;
      const v = view.value;
      const t = clock.value + Math.min(34, Math.max(0, Date.now() - lastWall.value)) - offset.value;
      v.touchX = SCREEN_W - 40;
      judgeLaunch(s, t, 9000 + Math.floor(t));
      const batch = drainEvents(s.ev);
      if (batch.length) {
        applyEventsUI(v, s, null, batch);
        runOnJS(onBatch)(batch, s.score, s.combo, feverActiveAt(s, v.now) ? 1 : 0, s.hitN);
      }
    })();
  }, [judge, view, clock, lastWall, offset, running, onBatch]);

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
      s.marchWant = marchSv.value;
      if (FAKE_WALK) s.marchWant = Math.floor(beatAt(beatsSv.value, vnow + 3000) / 16) % 2;
      // Dev autoplay: a scripted drummer plays whichever layer is live.
      const ap = auto.value;
      if (ap.err.length) {
        while (ap.i < s.n && s.t[ap.i] + ap.err[ap.i] <= vnow) {
          const i = ap.i++;
          const k = s.kind[i];
          if (ap.skip[i] || k === K_FREEZE || k === K_POPPER || !noteActive(s, i)) continue;
          const t = s.t[i] + ap.err[i];
          // Tap the middle of the right colour for the live grip.
          const g = gripSv.value;
          const rimX = g[0] === GRIP_TWO ? (g[2] ? 0.25 : 0.75) : g[1] < 0 ? (i % 2 ? 0.2 : 0.9) : (i % 2 ? 0.1 : 0.8);
          const drumX = g[0] === GRIP_TWO ? (g[2] ? 0.75 : 0.25) : g[1] < 0 ? 0.6 : 0.4;
          const x = (k === K_RIM ? rimX : drumX) * SCREEN_W;
          const z = zoneOf(x, SCREEN_W, g[0], g[1], g[2]);
          v.touchZone = z;
          v.touchX = x;
          v.touchY = geom.touchTop + 140;
          judgeDown(s, t, z, 1000 + i, 700);
          if (k === K_BIG) judgeDown(s, t + 14, 0, 50000 + i, 700);
          if (k === K_CYMBAL) judgeMove(s, t + 50, 1000 + i, 650);
          ap.relT.push(k === K_ROLL ? s.end[i] + 5 : t + 70);
          ap.relP.push(1000 + i);
          if (k === K_BIG) {
            ap.relT.push(t + 80);
            ap.relP.push(50000 + i);
          }
        }
        // The scripted drummer saves Fever for the Chorus (or the next drop) and swipes in the rest beat.
        if (s.armed && !s.autoFever && s.pendingDeploy < 0) {
          const chorus = s.firstBar + 12;
          const target = s.dropBars.indexOf(chorus) >= 0 && barAt(s, vnow) < chorus ? chorus : -1;
          const drop = target > 0 ? target : barAt(s, vnow) + 1;
          if (s.dropBars.indexOf(drop) >= 0) {
            const at = s.barStart[drop] - (s.barStart[drop] - s.barStart[drop - 1]) / 8 - 160;
            if (vnow >= at) {
              v.touchX = SCREEN_W * 0.5;
              judgeLaunch(s, vnow, 77000 + drop);
            }
          }
        }
        for (let q = ap.relT.length - 1; q >= 0; q--) {
          if (ap.relT[q] <= vnow) {
            judgeUp(s, ap.relT[q], ap.relP[q]);
            ap.relT.splice(q, 1);
            ap.relP.splice(q, 1);
          }
        }
        for (let i = s.cursor; i < s.n && s.t[i] <= vnow; i++) {
          if (s.kind[i] === K_POPPER && s.res[i] === 0 && vnow <= s.end[i] && vnow - ap.popLast > 105) {
            ap.popLast = vnow;
            judgeDown(s, vnow, 0, 70000 + Math.floor(vnow), 700);
            judgeUp(s, vnow + 1, 70000 + Math.floor(vnow));
          }
        }
      }
      judgeTick(s, vnow);
      // March visuals switch on the bar line of a March bar.
      const bf = beatAt(beatsSv.value, vnow);
      const bar = Math.floor(bf / 4);
      v.marchTarget = bar >= 0 && bar < s.nBars && s.barLayer[bar] === L_MARCH ? 1 : 0;
      if (bar !== lastBarSv.value && bar >= 0 && bar < s.nBars) {
        lastBarSv.value = bar;
        if (v.marchTarget > 0.5 && (bar === 0 || s.barLayer[bar - 1] !== L_MARCH)) showRibbon(v, RB_MARCH);
        else if (v.marchTarget < 0.5 && bar > 0 && s.barLayer[bar - 1] === L_MARCH && bar <= s.lastBar) showRibbon(v, RB_FULL);
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
        if (!s.autoFever) showRibbon(v, RB_READY);
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
    const fx = null;
    stepView(v, fx, dt);
    layoutFrame(draw.value, s, beatsSv.value, geom, v.now, approachSv.value, v.march, v.missAt, v.wt, echoStyleSv.value, 1, dareSv.value);
    const batch = drainEvents(s.ev);
    if (batch.length) {
      applyEventsUI(v, s, fx, batch);
      runOnJS(onBatch)(batch, s.score, s.combo, feverActiveAt(s, v.now) ? 1 : 0, s.hitN);
    }
    tick.value = tick.value + 1;
  }, [onBatch, onBar, fireEnded, geom]);
  useFrameCallback(frame);

  // -- Touch: judged on touch-down on the UI thread (design 10.3) --------------------
  const gesture = useMemo(() => Gesture.Manual()
    .onTouchesDown((e) => {
      'worklet';
      if (!running.value) return;
      const s = judge.value;
      const v = view.value;
      const base = clock.value + Math.min(34, Math.max(0, Date.now() - lastWall.value)) - offset.value;
      const g = gripSv.value;
      for (const touch of e.changedTouches) {
        if (base < v.inputFrom) continue;
        const zone = zoneOf(touch.x, SCREEN_W, g[0], g[1], g[2]);
        const hx = handXs.value;
        if (hx.length < 20) {
          hx.push(touch.x);
          if (hx.length === 20) runOnJS(onHandSample)(hx.slice());
        }
        v.touchX = touch.x;
        v.touchY = touch.y + geom.touchTop;
        v.touchZone = zone;
        judgeDown(s, base, zone, touch.id, touch.absoluteY);
      }
      const batch = drainEvents(s.ev);
      if (batch.length) {
        applyEventsUI(v, s, null, batch);
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
    }), [judge, view, clock, lastWall, offset, running, geom, onBatch, gripSv, handXs, onHandSample]);

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
      grip: gripLabel(grip, gripPrefs),
      daresReceived: dareBarsRef.current,
      assist: plan.assist,
      limp: plan.limp,
    }, plan.chart.chartVersion, plan.chart.beatmapHash);
    // Progress: PB, stars, mastery, silent offset auto-tune, ghost of a PB run.
    // 25% or more March sections posts to the March board (design 4.6).
    const board = plan.format === 'ride' ? 'ride' : sum.marchShare >= 0.25 ? 'march' : 'stage';
    const p0 = progressRef.current;
    const { next, newPb } = recordRound(p0, { stage: plan.stage, difficulty: plan.difficulty, board, score: sum.score, stars: sum.stars, ftue: plan.ftue });
    const tuned = autoTuneOffset(offset.value, s);
    next.offsets = { ...next.offsets, speaker: tuned };
    if (newPb && !plan.ftue && sum.cleared) {
      next.ghosts = {
        ...next.ghosts,
        [ghostKey(plan.stage, plan.format, plan.difficulty)]: {
          stage: plan.stage, format: plan.format, difficulty: plan.difficulty, seed: plan.seed, touches: proof.touches,
          marchBars: proof.march_bars, autoFever: plan.autoFever, chartVersion: plan.chart.chartVersion, score: sum.score, name: 'Your best', barScores: [], at: Date.now(),
        },
      };
    }
    progressRef.current = next;
    void saveProgress(next);
    lastRun.current = plan.format === 'queue' && !plan.ftue ? {
      stage: plan.stage, format: plan.format, difficulty: plan.difficulty, seed: plan.seed, touches: proof.touches,
      marchBars: proof.march_bars, autoFever: plan.autoFever, chartVersion: plan.chart.chartVersion, score: sum.score, name: 'Me', barScores: [], at: Date.now(),
    } : null;
    const win = plan.format === 'ride' && !plan.ftue ? sum.rideWin : sum.stars > 0;
    const stars = plan.format === 'ride' && !plan.ftue ? (sum.rideWin ? Math.max(1, sum.stars) : 0) : sum.stars;
    if (reason !== 'stall') {
      if (win) GameAudio.play(stars >= 2 ? 'rh_win' : 'rh_clear');
      if (newPb && sum.score > 0) setTimeout(() => GameAudio.play('fx.purchase', { volume: 0.8 }), 900);
    }
    const topRival = rivals.current.slice().sort((x, y) => y.finalScore - x.finalScore)[0];
    const goal = nextGoal(sum, s.accN, plan.format === 'ride' && !plan.ftue, s.limped === 1);
    const res: GameResult = {
      score: sum.score,
      stars: win ? stars : 0,
      maxCombo: sum.maxCombo,
      message: resultMessage(sum, plan.ftue, reason, s.limped === 1),
      thresholds: undefined,
      rival: topRival ? { name: topRival.name, score: topRival.finalScore } : null,
      stats: [
        { label: 'Accuracy', value: `${Math.round(sum.accuracy)}%` },
        { label: sum.steadinessLabel, value: String(sum.steadiness) },
        { label: 'Timing', value: sum.timingWords.replace("You're ", '') },
        ...(sum.feverBars ? [{ label: 'Fever', value: `${Math.round(sum.feverBars / 4)} drop${sum.feverBars > 4 ? 's' : ''}` }] : []),
        ...(sum.marchBars.length ? [{ label: 'Marching', value: `${sum.marchBars.length / 4 >= 1 ? Math.round(sum.marchBars.length / 4) : 1} sect.` }] : []),
        ...(rivals.current.length ? [{ label: 'Drum-Off', value: placeText(sum.accuracy, rivals.current) }] : []),
        ...(goal ? [{ label: 'Next goal', value: goal }] : []),
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
  }, [plan, running, judge, pocket, offset, grip, gripPrefs]);

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
      personalBest={plan ? pbBefore.current : undefined}
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
      onChallenge={props.onChallengeCrew && result && lastRun.current ? () => lastRun.current && props.onChallengeCrew?.(lastRun.current) : undefined}
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
              grip={grip}
              hand={gripPrefs.hand}
              swap={gripPrefs.swap}
              approach={plan.assist ? 2080 : plan.difficulty === 1 ? 1600 : 1300}
              dare={dareSv}
            />
          ) : null}
          <GestureDetector gesture={gesture}>
            <View style={[styles.touchZone, { top: geom.touchTop, height: fieldH - geom.touchTop }]} />
          </GestureDetector>
          {rivals.current.length ? (
            <View pointerEvents="none" style={styles.rivalStrip}>
              {rivals.current.map((r, i) => (
                <View key={r.id} style={[styles.rivalChip, { borderColor: r.color }]}>
                  <Text style={styles.rivalName} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.rivalScore}>{`${Math.round(r.accuracy)}%`}</Text>
                  {void i}
                </View>
              ))}
            </View>
          ) : null}
          {deltaChip != null && rivals.current.find((r) => r.isGhost) ? (
            <DeltaChip bar={deltaChip} myScore={score} ghost={rivals.current.find((r) => r.isGhost)!} />
          ) : null}
          <View style={styles.chipRow} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pocket ? 'Sound on' : 'Playing without sound'}
              hitSlop={8}
              onPress={() => setPocket((p) => !p)}
              style={[styles.chip, pocket && styles.chipOn]}
            >
              <Text style={[styles.chipTxt, pocket && styles.chipTxtOn]}>{pocket ? 'FEEL' : 'SOUND'}</Text>
            </Pressable>
            {plan && plan.format === 'queue' && !plan.ftue && hasRim ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change grip"
                hitSlop={8}
                onPress={() => {
                  // One Thumb -> Two Thumbs -> Two Thumbs swapped -> One Thumb.
                  const g = gripPrefs;
                  const cur = grip;
                  if (cur === GRIP_ONE) saveGrip({ ...g, grip: GRIP_TWO, swap: 0 });
                  else if (!g.swap) saveGrip({ ...g, grip: GRIP_TWO, swap: 1 });
                  else saveGrip({ ...g, grip: GRIP_ONE, swap: 0 });
                }}
                style={styles.chip}
              >
                <Text style={styles.chipTxt}>{grip === GRIP_TWO ? (gripPrefs.swap ? '2 THUMBS SWAP' : '2 THUMBS') : '1 THUMB'}</Text>
              </Pressable>
            ) : null}
          </View>
          {/* MARCH pill (design 4.6): 44pt target on the HUD, never shakes. */}
          {plan && !plan.ftue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={marchOn ? 'Back to the full chart' : 'March: big beats only'}
              hitSlop={6}
              onPress={toggleMarch}
              style={[styles.marchPill, marchLive && styles.marchPillLive, marchFrom ? styles.marchPillPending : null, walkHint === 1 && styles.marchPillHint]}
            >
              <Text style={[styles.marchTxt, marchLive && styles.marchTxtLive]} numberOfLines={1}>
                {marchFrom ?? (marchLive ? 'MARCHING' : 'MARCH')}
              </Text>
              {walkHint ? (
                <Text style={styles.marchHint} numberOfLines={1}>{walkHint === 1 ? 'Walking? Tap to march' : 'Standing? Tap for full chart'}</Text>
              ) : null}
            </Pressable>
          ) : null}
          {/* Tap the armed Fever meter to launch (accessibility path). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Launch Firework Fever"
            disabled={!armedJs}
            onPress={launchFromMeter}
            style={styles.meterTap}
          />
          {DEV_PERF ? <PerfOverlay probe={perfProbe} visible style={styles.perf} /> : null}
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

function placeText(accuracy: number, rivals: Rival[]): string {
  const place = drumOffPlace(accuracy, rivals);
  return ['1ST', '2ND', '3RD', '4TH'][place - 1] ?? `${place}TH`;
}

function countInBeats(chart: Chart): number[] {
  // Pre-roll bar 2 (file bar 1): numerals 4-3-2-1 on its beats.
  const out: number[] = [];
  for (let k = 4; k <= 8; k++) out.push(chart.beats[k]);
  return out;
}

function resultMessage(sum: RoundSummary, ftue: boolean, reason: string, limped: boolean): string {
  if (reason === 'stall') return 'The parade needs you!';
  if (ftue) return 'Parade cleared';
  if (limped) return sum.stars > 0 ? 'Limped home!' : 'Keep marching!';
  if (sum.allPerfect) return 'ALL PERFECT!';
  if (sum.fullCombo) return 'FULL COMBO!';
  if (sum.accuracy >= STAR_ACCURACY.three) return 'SHOWSTOPPER!';
  if (sum.accuracy >= STAR_ACCURACY.two) return 'What a parade!';
  if (sum.stars > 0) return 'Parade cleared';
  // Never a 0-star failure title (design 6.8).
  return 'Keep marching!';
}

/** The concrete next goal (design 6.8): never a fixed hit count, always reachable. */
function nextGoal(sum: RoundSummary, judged: number, ride: boolean, limped: boolean): string {
  if (ride) {
    if (sum.rideWin) return '';
    const hr = Math.round(sum.hitRate * 100);
    return hr < 75 ? `Hit 3 of every 4 (${hr}%)` : 'Fewer misstaps';
  }
  const next = sum.accuracy < STAR_ACCURACY.one ? [STAR_ACCURACY.one, 1] : sum.accuracy < STAR_ACCURACY.two ? [STAR_ACCURACY.two, 2] : sum.accuracy < STAR_ACCURACY.three ? [STAR_ACCURACY.three, 3] : null;
  if (!next) return limped || !sum.fullCombo ? 'Go for FULL COMBO' : '';
  const more = Math.max(1, Math.ceil(((next[0] - sum.accuracy) * judged) / 60));
  return `${more} more PERFECT${more > 1 ? 's' : ''} for ${next[1]} star${next[1] > 1 ? 's' : ''}`;
}

function gripLabel(grip: number, g: GripPrefs): string {
  if (grip === GRIP_TWO) return g.swap ? 'two_thumbs_swap' : 'two_thumbs';
  return g.hand < 0 ? 'one_thumb_l' : 'one_thumb_r';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#4fc3ff' },
  touchZone: { position: 'absolute', left: 0, right: 0 },
  loading: { position: 'absolute', top: '40%', alignSelf: 'center', backgroundColor: '#fff8e4', borderRadius: 16, borderWidth: 3, borderColor: '#0b3a6b', paddingHorizontal: 16, paddingVertical: 8 },
  loadingTxt: { fontFamily: 'Shark', fontSize: 18, color: '#0b3a6b' },
  chipRow: { position: 'absolute', left: 12, top: 146, alignItems: 'flex-start' },
  chip: { backgroundColor: '#fff8e4', borderRadius: 12, borderWidth: 2, borderColor: '#0b3a6b', paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6 },
  chipOn: { backgroundColor: '#1f7fe0' },
  chipTxt: { fontFamily: 'Shark', fontSize: 12, color: '#0b3a6b' },
  chipTxtOn: { color: '#ffffff' },
  marchPill: { position: 'absolute', left: 12, top: 94, minWidth: 104, height: 44, borderRadius: 22, borderWidth: 3, borderColor: '#0b3a6b', backgroundColor: '#ffffff', paddingHorizontal: 14, justifyContent: 'center', alignItems: 'flex-start' },
  marchPillLive: { backgroundColor: '#ffcf3b' },
  marchPillPending: { borderStyle: 'dashed', backgroundColor: '#eaf6ff' },
  marchPillHint: { borderColor: '#1f7fe0', backgroundColor: '#e3f4ff' },
  marchTxt: { fontFamily: 'Shark', fontSize: 15, color: '#0b3a6b' },
  marchTxtLive: { color: '#0b3a6b' },
  marchHint: { fontFamily: 'Knockout', fontSize: 11, color: '#1f6fc0' },
  perf: { position: 'absolute', right: 8, bottom: 8 },
  meterTap: { position: 'absolute', right: 6, top: 34, width: 64, height: 64, borderRadius: 32 },
  rivalStrip: { position: 'absolute', top: 46, left: 64, right: 64, flexDirection: 'row', justifyContent: 'center' },
  rivalChip: { backgroundColor: 'rgba(255,248,228,0.92)', borderWidth: 2, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginHorizontal: 3, alignItems: 'center', minWidth: 64 },
  rivalName: { fontFamily: 'Knockout', fontSize: 10, color: '#0b3a6b' },
  rivalScore: { fontFamily: 'Shark', fontSize: 11, color: '#0b3a6b' },
  delta: { position: 'absolute', top: 94, right: 12, backgroundColor: '#ffffff', borderWidth: 3, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 2, alignItems: 'center' },
  deltaTxt: { fontFamily: 'Shark', fontSize: 16 },
  deltaLbl: { fontFamily: 'Knockout', fontSize: 11, color: '#0b3a6b' },
});

export default RhythmTapGame;
