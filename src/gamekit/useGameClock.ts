/**
 * useGameClock: the studio loop. Fixed-step deterministic sim + presentation
 * clock with hit-stop, slow-mo and local stops, all on the UI thread.
 *
 *   const clock = useGameClock({
 *     stepMs: 1000 / 60,
 *     onStep: (dtSec, step) => { 'worklet'; simStep(sim.value, step); },
 *     onFrame: (alpha, fxDtMs) => { 'worklet'; /* interpolate, FX *\/ },
 *   });
 *   clock.hitStop(65);                  // presentation freeze (sim keeps time)
 *   clock.hitStop(110, { holdSim: true, force: true }); // golden: freeze all
 *   clock.slowMo(0.35, 280, 120);       // eased slow-mo
 *   <FxStage timeScale={clock.fxScale} />; useCamera({ timeScale: clock.fxScale })
 *
 * Pause is for real interruptions only (manual, background, lock). Line
 * movement never pauses (QUEUE REALITY).
 */

import { useMemo, useRef } from 'react';
import {
  runOnJS,
  runOnUI,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  advanceClock,
  clockSnapshot,
  createClock,
  drainSteps,
  hitStop,
  localStop,
  pauseClock,
  restoreClock,
  resumeClock,
  slowMo,
  stepAlpha,
  type ClockConfig,
  type GameClock,
  type HitStopOptions,
} from './core/clock';

export interface GameClockOptions {
  stepMs?: number;
  config?: Partial<ClockConfig>;
  /** Fixed-step worklet (deterministic gameplay). */
  onStep?: (dtSec: number, stepIndex: number, clock: GameClock) => void;
  /** Once per displayed frame after stepping (render interpolation, FX). */
  onFrame?: (alpha: number, fxDtMs: number, clock: GameClock) => void;
  /** Start running (default true). */
  autostart?: boolean;
  /** Max steps per frame before dropping backlog. */
  maxStepsPerFrame?: number;
}

export interface GameClockHandle {
  clock: SharedValue<GameClock>;
  /** fx time scale this frame (0 frozen, <1 slow-mo): feed FxStage/useCamera. */
  fxScale: SharedValue<number>;
  /** Gameplay ms (mirrored each frame, read-only). */
  simMs: SharedValue<number>;
  hitStop: (ms: number, opts?: HitStopOptions) => void;
  slowMo: (scale: number, holdMs: number, easeMs?: number, holdSim?: boolean) => void;
  localStop: (slot: number, ms: number) => void;
  pause: () => void;
  resume: () => void;
  setActive: (active: boolean) => void;
  /** JSON-safe clock snapshot for interruption saves (async, UI thread). */
  snapshot: () => Promise<{ simMs: number; fxMs: number; steps: number; acc: number }>;
  restore: (snap: { simMs: number; fxMs: number; steps: number; acc?: number }) => void;
}

export function useGameClock({
  stepMs = 1000 / 60,
  config,
  onStep,
  onFrame,
  autostart = true,
  maxStepsPerFrame = 4,
}: GameClockOptions = {}): GameClockHandle {
  const clock = useSharedValue<GameClock>(createClock(config));
  const fxScale = useSharedValue(1);
  const simMs = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    'worklet';
    const raw = info.timeSincePreviousFrame;
    if (raw == null) return;
    const c = clock.value;
    advanceClock(c, raw);
    const n = drainSteps(c, stepMs, maxStepsPerFrame);
    if (onStep) {
      for (let i = 0; i < n; i++) onStep(stepMs / 1000, c.steps - n + i, c);
    }
    if (onFrame) onFrame(stepAlpha(c, stepMs), c.lastFxDt, c);
    const scale = c.paused ? 0 : c.fxScale;
    if (fxScale.value !== scale) fxScale.value = scale;
    simMs.value = c.simMs;
  }, autostart);

  // useFrameCallback returns a new handle every render; read it through a ref so
  // this clock handle (and every hook that memoizes on it) stays stable.
  const frameRef = useRef(frame);
  frameRef.current = frame;
  return useMemo<GameClockHandle>(() => ({
    clock,
    fxScale,
    simMs,
    hitStop: (ms, opts = {}) => runOnUI((m: number, o: HitStopOptions) => {
      'worklet';
      hitStop(clock.value, m, o);
    })(ms, opts),
    slowMo: (scale, holdMs, easeMs = 120, holdSim = false) => runOnUI((s: number, h: number, e: number, hs: boolean) => {
      'worklet';
      slowMo(clock.value, s, h, e, hs);
    })(scale, holdMs, easeMs, holdSim),
    localStop: (slot, ms) => runOnUI((s: number, m: number) => {
      'worklet';
      localStop(clock.value, s, m);
    })(slot, ms),
    pause: () => runOnUI(() => {
      'worklet';
      pauseClock(clock.value);
    })(),
    resume: () => runOnUI(() => {
      'worklet';
      resumeClock(clock.value);
    })(),
    setActive: (active) => frameRef.current.setActive(active),
    snapshot: () => new Promise((resolve) => {
      // The clock is mutated in place on the UI thread: read it there.
      runOnUI(() => {
        'worklet';
        runOnJS(resolve)(clockSnapshot(clock.value));
      })();
    }),
    restore: (snap) => runOnUI((s: { simMs: number; fxMs: number; steps: number; acc?: number }) => {
      'worklet';
      restoreClock(clock.value, s);
    })(snap),
  }), [clock, fxScale, simMs]);
}
