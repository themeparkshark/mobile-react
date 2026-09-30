/**
 * EngineDemo: "Bonk Lab", the studio engine showcase and test bench (dev
 * MiniGameTester). A tiny walk-safe whack board that exercises every engine
 * system through the real code paths:
 *
 *   - useGameClock: fixed 60 Hz sim on the UI thread, global + local hit-stop,
 *     eased slow-mo (golden), fx clock driving FX and camera
 *   - Skia scene: bright sky, teal-water holes (no black voids), Alex's shark
 *     art rising with anticipation, squash and sink, all in one canvas
 *   - FxStage: stars, sparks, splash, ink, confetti, coins magnetized to the
 *     HUD, rings, bloom, capped flash, gold fever vignette, Shark-font fly-ups
 *   - Shaders: shockwave distortion, fever warmth + sunburst, shimmer meter,
 *     noise dissolve
 *   - useCamera: trauma shake, punch zoom, directional kicks (x0.3 walking)
 *   - Feel grammar: sound + haptic + time + camera + FX in one call
 *   - Combo/fever framework, flurry tallies, seeded RNG + bag variety
 *   - GameAudio: Chris's sounds + the studio library (wh_bonk pitch ladder,
 *     sh_* one-shots), music bed with a bar-synced fever switch
 *   - GameShellV2 QUEUE REALITY: movement heads-up (never pauses), pocket hold
 *     with snapshot + quick 3-2-1, "YOUR RIDE'S UP!" wrap-up, results card
 *   - PerfOverlay: UI fps, fps p5, JS fps, frame graph
 *
 * `autoplay` runs a bot plus a scripted tour of every system (used for the
 * demo video). Everything here is dev-only.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, LogBox, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Canvas,
  Group,
  Image as SkImage,
  LinearGradient,
  Oval,
  Path,
  Rect,
  Skia,
  rect,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { GameShellV2, type GameResult, type GameShellV2Handle } from '../GameShellV2';
import { LinePlayMovementContext, type LinePlayMovement } from '../LinePlayMovementContext';
import { useGameClock } from '../useGameClock';
import { FxStage, type FxStageHandle } from '../fx/FxStage';
import { useCamera } from '../fx/useCamera';
import { DissolveImage, ShockwaveGroup, Shimmer, Sunburst, WarmGroup, useLoopProgress, useShockwave } from '../fx/ShaderFx';
import { useFeel, type FeelDef } from '../feel';
import { createRng, rngFloat, rngInt } from '../core/rng';
import { ease, impactSquash } from '../core/ease';
import { slotDt } from '../core/clock';
import {
  EV_BREAK, EV_FEVER_END, EV_FEVER_START, EV_TIER_UP, comboFeverHit, comboFeverMiss, comboFeverTick,
  comboMultiplier, createComboFever, DEFAULT_COMBO_FEVER, hasEv, type ComboFeverState,
} from '../core/comboFever';
import { createFlurry, flurryHit, flurryResolve, FLURRY_START, FLURRY_GROW, starsFor } from '../core/scoring';
import { GameAudio } from '../audio/GameAudio';
import { registerStudioAudio } from '../audio/studioLibrary';
import { useGameMusic } from '../audio/useGameMusic';
import { playHaptic } from '../Haptics';
import { PerfOverlay, usePerfProbe } from '../perf/PerfOverlay';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

registerStudioAudio('whack');

const { width: SW, height: SH } = Dimensions.get('window');
const FIELD_H = SH - 124;
const TOP_ZONE = Math.round(FIELD_H * 0.24);
const CONTROLS_H = 96;
const BOARD_TOP = TOP_ZONE + 8;
const BOARD_H = FIELD_H - TOP_ZONE - CONTROLS_H - 16;
const COLS = 3;
const ROWS = 3;
const N = COLS * ROWS;
const CELL_W = SW / COLS;
const CELL_H = BOARD_H / ROWS;
const HOLE_RX = Math.min(CELL_W * 0.36, 58);
const HOLE_RY = HOLE_RX * 0.36;
const SHARK = Math.min(CELL_W * 0.78, 118);
const THRESHOLDS = { one: 12000, two: 30000, three: 60000 };
const HUD_SCORE = { x: SW - 60, y: 10 };

const HOLE_X: number[] = [];
const HOLE_Y: number[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    HOLE_X.push(CELL_W * (c + 0.5));
    HOLE_Y.push(BOARD_TOP + CELL_H * (r + 0.72));
  }
}

// Hole states
const IDLE = 0;
const UP = 1;
const BONKED = 2;
const ESCAPE = 3;
// Tiers
const LATE = 0;
const GOOD = 1;
const QUICK = 2;
const CRIT = 3;

interface Sim {
  t: number;
  state: number[];
  kind: number[];
  upAt: number[];
  life: number[];
  anim: number[];
  botAt: number[];
  nextSpawn: number;
  gap: number;
  rng: { s: number };
  bot: boolean;
  forceGolden: boolean;
  running: boolean;
}

function createSim(seed: number): Sim {
  'worklet';
  const z = (v: number) => {
    const a: number[] = [];
    for (let i = 0; i < N; i++) a.push(v);
    return a;
  };
  return {
    t: 0, state: z(IDLE), kind: z(0), upAt: z(0), life: z(0), anim: z(0), botAt: z(0),
    nextSpawn: 400, gap: 720, rng: createRng(seed), bot: false, forceGolden: false, running: false,
  };
}

function pick(...names: string[]): string {
  for (const n of names) if (GameAudio.hasCue(n)) return n;
  return names[names.length - 1];
}

export interface EngineDemoProps {
  visible: boolean;
  onClose: () => void;
  autoplay?: boolean;
}

export default function EngineDemo({ visible, onClose, autoplay = false }: EngineDemoProps) {
  const reducedMotion = useReducedGameMotion();
  const shell = useRef<GameShellV2Handle>(null);
  const fx = useRef<FxStageHandle>(null);
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [fever, setFever] = useState(false);
  const [combo, setCombo] = useState(0);
  const [showPerf, setShowPerf] = useState(true);
  const [walking, setWalking] = useState(false);
  const [movement, setMovement] = useState<LinePlayMovement>({ moving: false, onResume: () => undefined });
  const [runId, setRunId] = useState(0);
  const scoreRef = useRef(0);
  const comboRef = useRef<ComboFeverState>(createComboFever({ ...DEFAULT_COMBO_FEVER, windowMs: Infinity, graceMisses: 1 }));
  const flurry = useRef(createFlurry(900, 3));
  const statsRef = useRef({ hits: 0, quick: 0, misses: 0, golden: 0 });
  const perf = usePerfProbe(visible);

  const sim = useSharedValue<Sim>(createSim(20260930));
  const tick = useSharedValue(0);
  const warm = useSharedValue(0);
  const sun = useSharedValue(0);
  const dissolve = useSharedValue(0);
  const feverActive = useSharedValue(false);
  const wave = useShockwave();
  const shimmer = useLoopProgress(1200, feverActive);
  const badge = useSharedValue(1);
  const badgeShake = useSharedValue(0);
  const meter = useSharedValue(0);

  // -- Audio ----------------------------------------------------------------
  const cues = useMemo(() => ({
    bonk: pick('wh_bonk', 'fx.hit'),
    crit: pick('wh_crit', 'fx.hit'),
    golden: pick('wh_golden_hit', 'fx.coin'),
    whiff: pick('wh_whiff', 'ui.tap'),
    duck: pick('wh_duck', 'fx.whoosh'),
    tier: pick('wh_tier', 'fx.reveal'),
    breakCue: pick('sh_combo_break', 'fx.nopeShort'),
    fever: pick('sh_fever_start', 'fx.reveal'),
    feverEnd: pick('sh_fever_end', 'fx.whoosh'),
    coin: pick('coin_tick', 'fx.coin'),
    tally: pick('sh_tally', 'fx.reveal'),
    splash: pick('sh_splash_l', 'fx.whoosh'),
    rideUp: pick('sh_ride_up', 'fx.reward'),
    tellGolden: pick('wh_tell_golden', 'ui.select'),
  }), []);
  const mainBed = GameAudio.bed('mus_whack_main') ? 'mus_whack_main' : 'chris.track1';
  const feverBed = GameAudio.bed('mus_whack_fever') ? 'mus_whack_fever' : mainBed;
  useGameMusic(visible && !result ? (fever ? feverBed : mainBed) : null, { at: 'bar' });

  const plays = useRef(0);
  useEffect(() => {
    if (!visible) return undefined;
    // Dev bench: sound on even when no player (and its sound setting) is loaded.
    GameAudio.setSfxEnabled(true);
    void GameAudio.init().then(() => GameAudio.preload(Object.values(cues)));
    GameAudio.onPlay = () => { plays.current += 1; };
    return () => { GameAudio.onPlay = null; };
  }, [visible, cues]);

  // -- Clock + sim ------------------------------------------------------------
  const onHitRef = useRef<(i: number, tier: number, kind: number, reaction: number) => void>(() => undefined);
  const onEscapeRef = useRef<(i: number, kind: number) => void>(() => undefined);
  const onTellRef = useRef<(i: number, kind: number) => void>(() => undefined);
  const hitJS = useCallback((i: number, tier: number, kind: number, reaction: number) => onHitRef.current(i, tier, kind, reaction), []);
  const escapeJS = useCallback((i: number, kind: number) => onEscapeRef.current(i, kind), []);
  const tellJS = useCallback((i: number, kind: number) => onTellRef.current(i, kind), []);

  const clock = useGameClock({
    config: { slots: N, freezeBudget: 0.05 },
    onStep: (dtSec) => {
      'worklet';
      const s = sim.value;
      if (!s.running) return;
      s.t += dtSec * 1000;
      if (s.t >= s.nextSpawn) {
        // Pick a free hole; golden ~8% (or forced).
        let tries = 0;
        let i = rngInt(s.rng, 0, N - 1);
        while (s.state[i] !== IDLE && tries < N) {
          i = (i + 1) % N;
          tries += 1;
        }
        if (s.state[i] === IDLE) {
          s.state[i] = UP;
          s.kind[i] = s.forceGolden || rngFloat(s.rng) < 0.08 ? 1 : 0;
          s.forceGolden = false;
          s.upAt[i] = s.t;
          s.life[i] = 1150 - Math.min(450, s.t / 90);
          s.anim[i] = 0;
          s.botAt[i] = s.t + 240 + rngFloat(s.rng) * 380;
          runOnJS(tellJS)(i, s.kind[i]);
        }
        s.gap = Math.max(380, s.gap - 6);
        s.nextSpawn = s.t + s.gap * (0.75 + rngFloat(s.rng) * 0.5);
      }
      for (let i = 0; i < N; i++) {
        if (s.state[i] === UP) {
          if (s.bot && s.t >= s.botAt[i]) {
            const reaction = s.t - s.upAt[i];
            s.state[i] = BONKED;
            s.anim[i] = 0;
            runOnJS(hitJS)(i, reaction < 380 ? QUICK : reaction < 650 ? GOOD : LATE, s.kind[i], reaction);
          } else if (s.t - s.upAt[i] > s.life[i]) {
            s.state[i] = ESCAPE;
            s.anim[i] = 0;
            runOnJS(escapeJS)(i, s.kind[i]);
          }
        } else if ((s.state[i] === BONKED && s.anim[i] > 520) || (s.state[i] === ESCAPE && s.anim[i] > 160)) {
          s.state[i] = IDLE;
        }
      }
    },
    onFrame: (_alpha, _fxDt, c) => {
      'worklet';
      const s = sim.value;
      for (let i = 0; i < N; i++) s.anim[i] += slotDt(c, i);
      tick.value = tick.value + 1;
    },
  });

  // -- Camera (board only; HUD never shakes) ----------------------------------
  const camera = useCamera({ width: SW, height: FIELD_H, timeScale: clock.fxScale, reducedMotion, walking });

  // -- Feel table ---------------------------------------------------------------
  const table = useMemo<Record<string, FeelDef>>(() => ({
    late: { sfx: cues.bonk, ladder: true, spatial: true, haptic: 'lateHit', burst: [{ emitter: 'glints' }], ring: { from: 8, to: 40, ms: 150 }, flyUp: { size: 'sm' } },
    good: { sfx: cues.bonk, ladder: true, spatial: true, haptic: 'goodHit', burst: [{ emitter: 'stars' }], ring: { from: 10, to: 70, ms: 180 }, flyUp: { size: 'md' }, kick: 2 },
    quick: {
      sfx: cues.bonk, ladder: true, spatial: true, haptic: 'quickHit',
      burst: [{ emitter: 'impact' }, { emitter: 'splash', count: 10 }, { emitter: 'stars', count: 4 }],
      ring: { color: '#ffcf3b', from: 12, to: 80, ms: 200 }, bloom: { radius: 90, peak: 0.7, ms: 180 },
      flyUp: { size: 'lg', color: '#ffcf3b' }, kick: 3,
    },
    crit: {
      sfx: cues.crit, spatial: true, haptic: 'crit', shake: 0.25, punch: 0.035,
      burst: [{ emitter: 'impact', size: 1.4 }, { emitter: 'sparks' }, { emitter: 'splash', count: 8 }],
      ring: { color: '#ffcf3b', from: 14, to: 110, ms: 240 }, bloom: { radius: 120, peak: 0.9, ms: 220 },
      flyUp: { size: 'lg', color: '#ffe07a' },
    },
    golden: {
      sfx: cues.golden, haptic: 'golden', hitStop: 110, forceStop: true, slowMo: [0.35, 280, 120], punch: 0.05,
      burst: [{ emitter: 'speedLines' }, { emitter: 'coins', count: 16, magnet: true }, { emitter: 'sparkles' }],
      vignette: { color: '#ffcf3b', peak: 0.35, inMs: 40, holdMs: 60, outMs: 260 }, flash: { color: '#fff6d0', peak: 0.3, ms: 180 },
      flyUp: { size: 'xl', color: '#ffcf3b' }, duckDb: 6,
    },
    escape: { sfx: cues.duck, volume: 0.6, spatial: true, burst: [{ emitter: 'bubbles', count: 3 }] },
    tierUp: { sfx: cues.tier, ladder: true, haptic: 'tierUp', burst: [{ emitter: 'confetti', count: 16 }] },
    comboBreak: { sfx: cues.breakCue, haptic: 'comboBreak' },
    fever: {
      sfx: cues.fever, haptic: 'feverStart', hitStop: 80, forceStop: true, punch: 0.04,
      flash: { color: '#ffffff', peak: 0.4, ms: 160 }, burst: [{ emitter: 'speedLines', count: 16 }, { emitter: 'confetti', count: 30 }],
      vignette: { color: '#ffcf3b', peak: 0.3, inMs: 120, holdMs: 5600, outMs: 300 }, flyUp: { size: 'xl', color: '#ffcf3b' },
    },
    feverEnd: { sfx: cues.feverEnd },
    tellGolden: { sfx: cues.tellGolden, volume: 0.7, spatial: true, haptic: 'goldenTell', tell: true },
  }), [cues]);
  const feel = useFeel(table, { fx, camera, clock, width: SW, calm: reducedMotion });

  const bumpBadge = useCallback(() => {
    badge.value = withSequence(withTiming(1.3, { duration: 120, easing: Easing.out(Easing.back(2)) }), withSpring(1, { damping: 9, stiffness: 300 }));
  }, [badge]);

  const endFever = useCallback(() => {
    setFever(false);
    feverActive.value = false;
    warm.value = withTiming(0, { duration: 300 });
    sun.value = withTiming(0, { duration: 300 });
    camera.frame(1);
    feel('feverEnd');
  }, [camera, feel, feverActive, sun, warm]);

  const handleCombo = useCallback((ev: number, x: number, y: number) => {
    const c = comboRef.current;
    setCombo(c.streak);
    meter.value = withTiming(c.fever ? 1 : Math.min(1, c.streak / 10), { duration: 200 });
    if (hasEv(ev, EV_TIER_UP)) {
      bumpBadge();
      feel('tierUp', { x: SW / 2, y: TOP_ZONE * 0.45, step: c.tier - 1 });
    }
    if (hasEv(ev, EV_FEVER_START)) {
      setFever(true);
      feverActive.value = true;
      warm.value = withTiming(1, { duration: 200 });
      sun.value = withTiming(0.8, { duration: 300 });
      camera.frame(1.02);
      feel('fever', { x: SW / 2, y: BOARD_TOP + BOARD_H / 2, text: 'FEVER!' });
    }
    if (hasEv(ev, EV_FEVER_END)) endFever();
    if (hasEv(ev, EV_BREAK) && c.lastBreak >= 5) {
      feel('comboBreak', { x, y });
      badgeShake.value = withSequence(
        withTiming(6, { duration: 30 }), withTiming(-6, { duration: 40 }), withTiming(4, { duration: 40 }), withTiming(0, { duration: 40 }),
      );
    }
  }, [bumpBadge, badgeShake, camera, endFever, feel, feverActive, meter, sun, warm]);

  onTellRef.current = (i, kind) => {
    if (kind === 1) feel('tellGolden', { x: HOLE_X[i], y: HOLE_Y[i] });
  };

  onHitRef.current = (i, tierIn, kind, _reaction) => {
    const x = HOLE_X[i];
    const y = HOLE_Y[i] - SHARK * 0.45;
    const now = Date.now();
    const c = comboRef.current;
    const tier = tierIn === QUICK && Math.random() < 0.15 ? CRIT : tierIn;
    const ev = comboFeverHit(c, now, tier >= QUICK ? 1.5 : 1);
    const base = kind === 1 ? 500 : tier === CRIT ? 250 : tier === QUICK ? 150 : tier === GOOD ? 100 : 60;
    const pts = Math.round(base * comboMultiplier(c));
    scoreRef.current += pts;
    setScore(scoreRef.current);
    const st = statsRef.current;
    st.hits += 1;
    if (tier >= QUICK) st.quick += 1;
    if (kind === 1) st.golden += 1;
    const fl = flurryHit(flurry.current, now, pts);
    const showText = fl !== FLURRY_GROW && fl !== FLURRY_START;
    const at = { x, y, slot: i, step: c.streak % 8, dx: 0, dy: -1, magnetTo: HUD_SCORE };
    if (kind === 1) {
      feel('golden', { ...at, text: `GOLDEN! +${pts}` });
      wave.fire(x, y + SHARK * 0.3, { radius: 220, strength: 10, ms: 460 });
    } else if (tier === CRIT) feel('crit', { ...at, text: showText ? `CRIT! +${pts}` : undefined });
    else if (tier === QUICK) feel('quick', { ...at, text: showText ? `QUICK +${pts}` : undefined });
    else if (tier === GOOD) feel('good', { ...at, text: showText ? `+${pts}` : undefined });
    else feel('late', { ...at, text: showText ? `+${pts}` : undefined });
    if (fl === FLURRY_START || fl === FLURRY_GROW) {
      fx.current?.flyUp(`${flurry.current.hits} HITS +${flurry.current.points}`, SW / 2, TOP_ZONE * 0.9, { size: 'md', color: '#ffe07a', rise: 12, ms: 900, key: 'flurry' });
    }
    // Local hit-stop per tier (only this hole's FX clock holds).
    clock.localStop(i, tier === CRIT ? 90 : tier === QUICK ? 65 : 45);
    handleCombo(ev, x, y);
  };

  onEscapeRef.current = (i, kind) => {
    const c = comboRef.current;
    statsRef.current.misses += 1;
    feel('escape', { x: HOLE_X[i], y: HOLE_Y[i] });
    const ev = kind === 1 ? 0 : comboFeverMiss(c, Date.now());
    handleCombo(ev, HOLE_X[i], HOLE_Y[i]);
  };

  // Fever timer + flurry resolve (4 Hz on JS is plenty).
  useEffect(() => {
    if (!visible) return undefined;
    const iv = setInterval(() => {
      const now = Date.now();
      const ev = comboFeverTick(comboRef.current, now, 250);
      if (hasEv(ev, EV_FEVER_END)) endFever();
      if (flurryResolve(flurry.current, now)) {
        GameAudio.play(cues.tally);
        bumpBadge();
      }
    }, 250);
    return () => clearInterval(iv);
  }, [visible, endFever, bumpBadge, cues.tally]);

  // -- Input: one board-level tap with forgiving hit tests -------------------
  const tap = useMemo(() => Gesture.Tap().maxDuration(400).onBegin((e) => {
    'worklet';
    const s = sim.value;
    if (!s.running) return;
    let best = -1;
    let bestD = 1e9;
    for (let i = 0; i < N; i++) {
      if (s.state[i] !== UP) continue;
      const dx = e.x - HOLE_X[i];
      const dy = e.y - (HOLE_Y[i] - SHARK * 0.4);
      const d = dx * dx + dy * dy;
      // Big, forgiving targets: a bump or a step never punishes (walk-safe).
      if (d < (SHARK * 0.75) * (SHARK * 0.75) && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    if (best < 0) return;
    const reaction = s.t - s.upAt[best];
    s.state[best] = BONKED;
    s.anim[best] = 0;
    runOnJS(hitJS)(best, reaction < 380 ? QUICK : reaction < 650 ? GOOD : LATE, s.kind[best], reaction);
  }), [sim, hitJS]);

  // -- Shell hooks --------------------------------------------------------------
  const setRunning = useCallback((running: boolean) => {
    sim.modify((v) => {
      'worklet';
      v.running = running;
      return v;
    });
  }, [sim]);
  const setBot = useCallback((on: boolean) => {
    sim.modify((v) => {
      'worklet';
      v.bot = on;
      return v;
    });
  }, [sim]);

  const finish = useCallback((message?: string) => {
    setRunning(false);
    const st = statsRef.current;
    const s = scoreRef.current;
    const res: GameResult = {
      score: s,
      stars: starsFor(s, THRESHOLDS),
      message,
      maxCombo: comboRef.current.maxStreak,
      thresholds: THRESHOLDS,
      stats: [
        { label: 'QUICK', value: `${st.quick}` },
        { label: 'ACCURACY', value: `${st.hits + st.misses ? Math.round((100 * st.hits) / (st.hits + st.misses)) : 0}%` },
      ],
      meta: { game: 'engine-demo', score: s, seed: 20260930, fps_p5: perf.summary().fpsP5 },
    };
    setResult(res);
  }, [perf, setRunning]);

  const restart = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    setCombo(0);
    setResult(null);
    setFever(false);
    comboRef.current = createComboFever({ ...DEFAULT_COMBO_FEVER, windowMs: Infinity, graceMisses: 1 });
    statsRef.current = { hits: 0, quick: 0, misses: 0, golden: 0 };
    warm.value = 0;
    sun.value = 0;
    meter.value = 0;
    feverActive.value = false;
    sim.value = createSim(20260930 + runId + 1);
    setRunId((n) => n + 1);
    setMovement({ moving: false, onResume: () => undefined });
  }, [feverActive, meter, runId, sim, sun, warm]);

  // -- Scripted tour (autoplay) ---------------------------------------------------
  const toolbar = useMemo(() => ({
    confetti: () => fx.current?.burst('confetti', SW / 2, TOP_ZONE, { count: 36 }),
    coins: () => fx.current?.burst('coins', SW / 2, BOARD_TOP + BOARD_H / 2, { count: 14, tx: HUD_SCORE.x, ty: HUD_SCORE.y }),
    ink: () => {
      fx.current?.burst('ink', SW * 0.3, BOARD_TOP + BOARD_H * 0.4);
      GameAudio.play(pick('wh_ink_splat', 'fx.hit'));
    },
    splash: () => {
      fx.current?.burst('splash', SW * 0.7, BOARD_TOP + BOARD_H * 0.5, { count: 16 });
      fx.current?.ring(SW * 0.7, BOARD_TOP + BOARD_H * 0.5, { color: '#bfe5ff', to: 90 });
      GameAudio.play(cues.splash);
    },
    shock: () => {
      wave.fire(SW / 2, BOARD_TOP + BOARD_H / 2, { radius: 260, strength: 12, ms: 520 });
      camera.shake(0.45);
      playHaptic('breakPart');
    },
    dissolve: () => {
      dissolve.value = withSequence(withTiming(1, { duration: 900 }), withTiming(1, { duration: 400 }), withTiming(0, { duration: 700 }));
      GameAudio.play(pick('sh_sparkle', 'fx.reveal'));
    },
    golden: () => {
      sim.modify((v) => {
        'worklet';
        v.forceGolden = true;
        v.nextSpawn = v.t;
        return v;
      });
    },
    fever: () => {
      const c = comboRef.current;
      let ev = 0;
      while (!c.fever) ev |= comboFeverHit(c, Date.now());
      handleCombo(ev, SW / 2, BOARD_TOP);
    },
    lineMoves: () => {
      // Simulate LinePlay reporting the queue shuffling forward.
      let n = 0;
      const step = () => {
        setMovement((m) => ({ ...m, moving: true, lastAdvance: { at: Date.now(), metres: 3 } }));
        setTimeout(() => setMovement((m) => ({ ...m, moving: false })), 350);
        n += 1;
        if (n < 3) setTimeout(step, 700);
      };
      setWalking(true);
      step();
      setTimeout(() => setWalking(false), 4000);
    },
    pocket: () => {
      shell.current?.requestPause('Paused while away');
      setTimeout(() => shell.current?.resume(), 1800);
    },
    rideUp: () => {
      GameAudio.play(cues.rideUp);
      setMovement((m) => ({ ...m, queueEnded: 'boarding' }));
    },
  }), [camera, cues, dissolve, handleCombo, sim, wave]);

  useEffect(() => {
    if (!visible || !autoplay) return undefined;
    // Clean capture: no dev warning toasts over the tour.
    LogBox.ignoreAllLogs(true);
    setBot(true);
    const plan: [number, () => void][] = [
      [4200, toolbar.confetti],
      [6200, toolbar.splash],
      [7600, toolbar.ink],
      [9000, toolbar.golden],
      [12500, toolbar.shock],
      [14500, toolbar.dissolve],
      [16500, toolbar.lineMoves],
      [21500, toolbar.pocket],
      [26500, toolbar.golden],
      [29000, toolbar.coins],
      [32000, toolbar.rideUp],
    ];
    const timers = plan.map(([ms, fn]) => setTimeout(fn, ms));
    return () => timers.forEach(clearTimeout);
  }, [visible, autoplay, runId, setBot, toolbar]);

  const onWrapUp = useCallback((reason: string) => {
    setRunning(false);
    const s = scoreRef.current;
    return {
      score: s,
      stars: starsFor(s, THRESHOLDS),
      maxCombo: comboRef.current.maxStreak,
      thresholds: THRESHOLDS,
      stats: [{ label: 'QUICK', value: `${statsRef.current.quick}` }],
      meta: { game: 'engine-demo', reason },
    };
  }, [setRunning]);

  const onArrive = useCallback((n: number) => {
    for (let k = 0; k < n; k++) setTimeout(() => GameAudio.playLadder(cues.coin, k + 4), k * 20);
    playHaptic('tick');
  }, [cues.coin]);

  // -- Render ---------------------------------------------------------------------
  const sharkImg = useImage(require('../../assets/games/whack/shark-pop-1.png'));
  const goldenImg = useImage(require('../../assets/games/whack/golden-shark.png'));
  const mascotImg = useImage(require('../../assets/games/whack/shark-pop-2.png'));

  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badge.value }, { translateX: badgeShake.value }] }));
  const meterStyle = useAnimatedStyle(() => ({ width: `${meter.value * 100}%` }));

  const tier = comboRef.current.tier;
  const tierColor = comboRef.current.cfg.tiers[tier]?.color ?? '#00a5f5';

  return (
    <LinePlayMovementContext.Provider value={movement}>
      <GameShellV2
        ref={shell}
        visible={visible}
        title="Bonk Lab"
        subtitle={`Engine demo · ${GameAudio.backendName}`}
        score={score}
        multiplier={comboMultiplier(comboRef.current)}
        fever={fever}
        personalBest={5200}
        objective="Bonk the sharks. Big targets, one thumb."
        result={result}
        thresholds={THRESHOLDS}
        gameId="engine-demo"
        sessionKey={`engine-demo:${runId}`}
        getSnapshot={() => ({ score: scoreRef.current, state: { combo: comboRef.current.streak, stats: statsRef.current } })}
        onWrapUp={onWrapUp}
        onStart={() => {
          setRunning(true);
          if (autoplay) setBot(true);
        }}
        onPause={() => {
          setRunning(false);
          clock.pause();
        }}
        onResume={() => {
          clock.resume();
          setRunning(true);
        }}
        onComplete={() => onClose()}
        onClose={onClose}
        onRematch={restart}
        onChallenge={() => GameAudio.play('ui.confirm')}
      >
        <GestureHandlerRootView style={styles.fill}>
          {/* Board: one Skia canvas inside the camera; shockwave + fever warmth */}
          <GestureDetector gesture={tap}>
            <Animated.View style={[StyleSheet.absoluteFill, camera.style]}>
              <Board sim={sim} tick={tick} wave={wave} warm={warm} sun={sun} reducedMotion={reducedMotion} shark={sharkImg} golden={goldenImg} />
            </Animated.View>
          </GestureDetector>

          {/* Show zone: combo badge, fever meter, flurry tallies, dissolve demo */}
          <View style={styles.topZone}>
            <Animated.View style={[styles.badge, { backgroundColor: tierColor }, badgeStyle]}>
              <Text style={styles.badgeNum}>{`x${combo}`}</Text>
              <Text style={styles.badgeLabel}>{comboRef.current.cfg.tiers[tier]?.label || 'COMBO'}</Text>
            </Animated.View>
            <View style={styles.meterWrap}>
              <Text style={styles.meterLabel}>{fever ? 'FEVER!' : 'FEVER METER'}</Text>
              <View style={styles.meterTrack}>
                <Animated.View style={[styles.meterFill, meterStyle]} />
                <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Shimmer x={0} y={0} width={SW * 0.5} height={18} progress={shimmer} alpha={0.6} />
                </Canvas>
              </View>
            </View>
            <Canvas style={styles.mascot} pointerEvents="none">
              <DissolveImage image={mascotImg} x={0} y={0} width={84} height={84} progress={dissolve} edgeColor="#ffcf3b" />
            </Canvas>
          </View>

          <FxStage ref={fx} width={SW} height={FIELD_H} timeScale={clock.fxScale} reducedMotion={reducedMotion}
            onArrive={onArrive} />

          {/* Dev controls */}
          <View style={styles.controls}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlRow}>
              {([
                ['Confetti', toolbar.confetti], ['Coins', toolbar.coins], ['Ink', toolbar.ink], ['Splash', toolbar.splash],
                ['Shockwave', toolbar.shock], ['Dissolve', toolbar.dissolve], ['Fever', toolbar.fever], ['Golden', toolbar.golden],
                ['Line moves', toolbar.lineMoves], ['Pocket it', toolbar.pocket], ["Ride's up", toolbar.rideUp],
                ['Bot', () => setBot(true)], ['Perf', () => setShowPerf((v) => !v)], ['End run', () => finish()],
              ] as [string, () => void][]).map(([label, fn]) => (
                <TouchableOpacity key={label} style={styles.chip} onPress={fn} accessibilityRole="button">
                  <Text style={styles.chipText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <PerfOverlay probe={perf} visible={showPerf} style={styles.perf} extra={() => `sfx ${plays.current}  voices ${GameAudio.activeVoices()}  ${walking ? 'walking' : 'standing'}`} />
        </GestureHandlerRootView>
      </GameShellV2>
    </LinePlayMovementContext.Provider>
  );
}

const SKY_START = vec(0, TOP_ZONE);
const SKY_END = vec(0, FIELD_H);
const SKY = ['#3db8ff', '#bfeaff', '#e8f7ff'];

/**
 * The board canvas is memoized so score/combo re-renders of the demo never
 * touch Skia nodes while the UI thread draws them (all motion is driven by
 * shared values).
 */
const Board = React.memo(function Board({ sim, tick, wave, warm, sun, reducedMotion, shark, golden }: {
  sim: SharedValue<Sim>;
  tick: SharedValue<number>;
  wave: ReturnType<typeof useShockwave>;
  warm: SharedValue<number>;
  sun: SharedValue<number>;
  reducedMotion: boolean;
  shark: ReturnType<typeof useImage>;
  golden: ReturnType<typeof useImage>;
}) {
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <ShockwaveGroup wave={wave} enabled={!reducedMotion}>
        <WarmGroup amount={warm}>
          <Rect x={0} y={TOP_ZONE} width={SW} height={FIELD_H - TOP_ZONE}>
            <LinearGradient start={SKY_START} end={SKY_END} colors={SKY} />
          </Rect>
          <Sunburst cx={SW / 2} cy={BOARD_TOP + BOARD_H * 0.45} radius={SW * 0.9} intensity={sun} width={SW} height={FIELD_H} rays={12} />
          {HOLE_X.map((_, i) => (
            <Hole key={i} index={i} sim={sim} tick={tick} shark={shark} golden={golden} />
          ))}
        </WarmGroup>
      </ShockwaveGroup>
    </Canvas>
  );
});

const WATER = ['#1c8fa6', '#46c3d1'];

const Hole = React.memo(function Hole({ index, sim, tick, shark, golden }: {
  index: number;
  sim: SharedValue<Sim>;
  tick: SharedValue<number>;
  shark: ReturnType<typeof useImage>;
  golden: ReturnType<typeof useImage>;
}) {
  const cx = HOLE_X[index];
  const cy = HOLE_Y[index];
  const transform = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const st = s.state[index];
    const a = s.anim[index];
    let rise = 0;
    let sy = 1;
    if (st === UP) {
      // Emerge 120ms with overshoot, then an idle bob.
      rise = ease('outBack', a / 120, 1.6) + (a > 120 ? Math.sin(a / 100) * 0.02 : 0);
      sy = a < 120 ? 0.9 + 0.1 * (a / 120) : 1;
    } else if (st === BONKED) {
      sy = impactSquash(a, 0.2, 240);
      rise = a < 200 ? 1 : 1 - ease('inBack', (a - 200) / 220, 1.4);
    } else if (st === ESCAPE) {
      rise = 1 - ease('inQuad', a / 140);
    }
    if (rise < 0) rise = 0;
    const sx = 1 / Math.sqrt(sy);
    // Base-anchored: at rise 0 the shark sits fully below the mouth line.
    const baseY = cy + SHARK * 1.1 - rise * SHARK * 0.9;
    return [
      { translateX: cx },
      { translateY: baseY },
      { scaleX: sx },
      { scaleY: sy },
      { translateX: -SHARK / 2 },
      { translateY: -SHARK },
    ];
  });
  const goldenOpacity = useDerivedValue(() => {
    tick.value;
    return sim.value.kind[index] === 1 ? 1 : 0;
  });
  const normalOpacity = useDerivedValue(() => 1 - goldenOpacity.value);
  const clip = useMemo(() => rect(cx - SHARK, cy - SHARK * 1.6, SHARK * 2, SHARK * 1.6 + HOLE_RY * 0.3), [cx, cy]);
  const waterStart = useMemo(() => vec(cx, cy - HOLE_RY), [cx, cy]);
  const waterEnd = useMemo(() => vec(cx, cy + HOLE_RY), [cx, cy]);
  const lip = useMemo(() => {
    const p = Skia.Path.Make();
    p.addArc(rect(cx - HOLE_RX, cy - HOLE_RY, HOLE_RX * 2, HOLE_RY * 2), 8, 164);
    return p;
  }, [cx, cy]);
  return (
    <Group>
      {/* Teal water interior (never a black void) with a white back-lip rim light */}
      <Oval x={cx - HOLE_RX} y={cy - HOLE_RY} width={HOLE_RX * 2} height={HOLE_RY * 2}>
        <LinearGradient start={waterStart} end={waterEnd} colors={WATER} />
      </Oval>
      <Oval x={cx - HOLE_RX} y={cy - HOLE_RY} width={HOLE_RX * 2} height={HOLE_RY * 2} style="stroke" strokeWidth={2} color="#ffffff" />
      <Group clip={clip}>
        <Group transform={transform}>
          {shark ? <SkImage image={shark} x={0} y={0} width={SHARK} height={SHARK} opacity={normalOpacity} /> : null}
          {golden ? <SkImage image={golden} x={0} y={0} width={SHARK} height={SHARK} opacity={goldenOpacity} /> : null}
        </Group>
      </Group>
      {/* Front lip overlaps the occupant by about 10% */}
      <Path path={lip} style="stroke" strokeWidth={11} strokeCap="round" color="#05346e" />
      <Path path={lip} style="stroke" strokeWidth={6} strokeCap="round" color="#f6e8bf" />
    </Group>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#bfe5ff' },
  topZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: TOP_ZONE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#0879ca',
    borderBottomWidth: 3,
    borderBottomColor: '#05346e',
  },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNum: { fontFamily: 'Shark', fontSize: 28, color: '#ffffff', textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  badgeLabel: { fontFamily: 'Knockout', fontSize: 11, color: '#ffffff', letterSpacing: 1 },
  meterWrap: { flex: 1, marginHorizontal: 12 },
  meterLabel: { fontFamily: 'Shark', fontSize: 16, color: '#ffffff', marginBottom: 4 },
  meterTrack: { height: 18, borderRadius: 9, backgroundColor: '#bfe5ff', borderWidth: 3, borderColor: '#05346e', overflow: 'hidden' },
  meterFill: { height: '100%', backgroundColor: '#ffcf3b' },
  mascot: { width: 84, height: 84 },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, height: CONTROLS_H, justifyContent: 'center' },
  perf: { top: undefined, bottom: CONTROLS_H + 4, left: 8, right: undefined },
  controlRow: { paddingHorizontal: 10, alignItems: 'center' },
  chip: {
    backgroundColor: '#fff8e4',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#05346e',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
  },
  chipText: { fontFamily: 'Shark', fontSize: 15, color: '#05346e' },
});
