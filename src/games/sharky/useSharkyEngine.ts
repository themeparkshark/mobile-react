/**
 * useSharkyEngine: runs the Tide Run sim on the UI thread.
 *
 *   - fixed 60 Hz steps from the studio GameClock (hit-stop and slow-mo hold
 *     the sim too, so juice never costs a racer steps or tide time);
 *   - input from RNGH worklets goes into a UI-thread queue and is applied on
 *     the next step; every applied input is mirrored to JS (the proof log);
 *   - rival sims (house-crew bots, async ghosts) step in lockstep with their
 *     own logs, so a ghost replays exactly;
 *   - sim events leave the UI thread through the engine event ring, one
 *     runOnJS per frame, prefixed by a camera record so JS can place FX.
 */

import { useCallback, useMemo, useRef } from 'react';
import { runOnUI, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useGameClock } from '../../gamekit/useGameClock';
import { useEventBridge } from '../../gamekit/fx/useEventBridge';
import { forEachEvent, pushEvent } from '../../gamekit/core/eventRing';
import {
  EV_STRIDE,
  IN_EXT,
  PH_DONE,
  anchorX,
  applyInput,
  createSim,
  step as simStep,
  type InputEntry,
  type SimConfig,
  type SimState,
} from './sim/core';

/** Bridge-only kinds (outside the sim's event space). */
export const BR_CAM = 90;
export const BR_INPUT = 91;
export const BR_RIVAL = 92;

export const MAX_RIVALS = 3;

export interface RivalSlot {
  /** 0 empty, 1 sim-driven (bot/ghost log), 2 remote (live whispers). */
  kind: number;
  sim: SimState | null;
  log: InputEntry[];
  k: number;
  /** Remote: last known distance/y (u) and velocity for extrapolation. */
  rDist: number;
  rY: number;
  rVel: number;
  rAt: number;
  done: number;
}

export interface EngineInput {
  q: number[];
  holding: boolean;
  /** Slide tracking for Dash (UI thread). */
  startX: number;
  startY: number;
  startT: number;
  slideFired: boolean;
  fingers: number;
}

export interface SharkyEngine {
  sim: SharedValue<SimState>;
  rivals: SharedValue<RivalSlot[]>;
  input: SharedValue<EngineInput>;
  running: SharedValue<boolean>;
  tick: SharedValue<number>;
  alpha: SharedValue<number>;
  clock: ReturnType<typeof useGameClock>;
  /** JS: the applied input log (proof, ghosts, restore). */
  log: React.MutableRefObject<InputEntry[]>;
  reset: (cfg: SimConfig, rivals?: Array<{ cfg: SimConfig; log: InputEntry[] } | null>) => void;
  setRunning: (on: boolean) => void;
  /** Queue an ext input (revive, pause_resume, line boost, draft) for the next step. */
  ext: (sub: number, arg: number) => void;
  /** Push a remote rival position (live race whispers). */
  remote: (slot: number, dist: number, y: number, vel: number) => void;
}

export function emptyRival(): RivalSlot {
  'worklet';
  return { kind: 0, sim: null, log: [], k: 0, rDist: 0, rY: 500, rVel: 0, rAt: 0, done: 0 };
}

function emptyInput(): EngineInput {
  'worklet';
  return { q: [], holding: false, startX: 0, startY: 0, startT: 0, slideFired: false, fingers: 0 };
}

export function useSharkyEngine(
  initial: SimConfig,
  onEvents: (batch: number[]) => void,
): SharkyEngine {
  const sim = useSharedValue<SimState>(createSim(initial));
  const rivals = useSharedValue<RivalSlot[]>([emptyRival(), emptyRival(), emptyRival()]);
  const input = useSharedValue<EngineInput>(emptyInput());
  const running = useSharedValue(false);
  const tick = useSharedValue(0);
  const alpha = useSharedValue(0);
  const log = useRef<InputEntry[]>([]);

  const handler = useRef(onEvents);
  handler.current = onEvents;
  const bridge = useEventBridge((batch) => {
    // Mirror applied inputs into the JS log before anyone else reads the batch.
    forEachEvent(batch, (kind, a, b, c, t) => {
      if (kind === BR_INPUT) log.current.push({ step: t, kind: a, sub: b, arg: c });
    });
    handler.current(batch);
  }, 512);
  const ring = bridge.ring;

  const clock = useGameClock({
    config: { freezeBudget: 0.05, slots: 4 },
    maxStepsPerFrame: 4,
    onStep: () => {
      'worklet';
      if (!running.value) return;
      const s = sim.value;
      if (s.phase === PH_DONE) return;
      const inp = input.value;
      const r = ring.value;
      // Apply queued inputs (encoded as groups of 3: kind, sub, arg).
      const q = inp.q;
      for (let i = 0; i + 2 < q.length; i += 3) {
        const kind = q[i];
        applyInput(s, kind, q[i + 1], q[i + 2]);
        pushEvent(r, BR_INPUT, kind, q[i + 1], q[i + 2], s.step);
      }
      if (q.length) inp.q = [];
      // Lockstep rival sims.
      const rv = rivals.value;
      for (let j = 0; j < rv.length; j++) {
        const g = rv[j];
        if (g.kind !== 1 || !g.sim || g.done) continue;
        const gs = g.sim;
        while (g.k < g.log.length && g.log[g.k].step <= gs.step) {
          const e = g.log[g.k];
          applyInput(gs, e.kind, e.sub, e.arg);
          g.k++;
        }
        simStep(gs);
        if (gs.phase === PH_DONE) {
          g.done = 1;
          pushEvent(r, BR_RIVAL, j, gs.endReason, gs.finishStep, gs.score);
        }
      }
      simStep(s);
      // Camera record, then this step's sim events.
      pushEvent(r, BR_CAM, s.dist >> 8, anchorX(s), s.y >> 8, s.step);
      for (let e = 0; e < s.evN; e++) {
        const o = e * EV_STRIDE;
        pushEvent(r, s.ev[o], s.ev[o + 1], s.ev[o + 2], s.ev[o + 3], s.ev[o + 4]);
      }
    },
    onFrame: (a) => {
      'worklet';
      alpha.value = a;
      tick.value = tick.value + 1;
      bridge.flush();
    },
  });

  const reset = useCallback((cfg: SimConfig, rv: Array<{ cfg: SimConfig; log: InputEntry[] } | null> = []) => {
    log.current = [];
    const slots: RivalSlot[] = [];
    for (let j = 0; j < MAX_RIVALS; j++) {
      const g = rv[j];
      if (g) slots.push({ kind: 1, sim: createSim(g.cfg), log: g.log, k: 0, rDist: 0, rY: 500, rVel: 0, rAt: 0, done: 0 });
      else slots.push(emptyRival());
    }
    runOnUI((c: SimConfig, sl: RivalSlot[]) => {
      'worklet';
      sim.value = createSim(c);
      rivals.value = sl;
      input.value = emptyInput();
      running.value = false;
    })(cfg, slots);
  }, [sim, rivals, input, running]);

  const setRunning = useCallback((on: boolean) => {
    runOnUI((v: boolean) => {
      'worklet';
      running.value = v;
    })(on);
  }, [running]);

  const ext = useCallback((sub: number, arg: number) => {
    runOnUI((sb: number, ag: number) => {
      'worklet';
      input.value.q.push(IN_EXT, sb, ag);
    })(sub, arg);
  }, [input]);

  const remote = useCallback((slot: number, dist: number, y: number, vel: number) => {
    runOnUI((j: number, d: number, yy: number, v: number) => {
      'worklet';
      const g = rivals.value[j];
      if (!g) return;
      g.kind = 2;
      g.rDist = d;
      g.rY = yy;
      g.rVel = v;
      g.rAt = sim.value.step;
    })(slot, dist, y, vel);
  }, [rivals, sim]);

  return useMemo(() => ({ sim, rivals, input, running, tick, alpha, clock, log, reset, setRunning, ext, remote }),
    [sim, rivals, input, running, tick, alpha, clock, reset, setRunning, ext, remote]);
}
