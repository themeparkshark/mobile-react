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
  botTargetY,
  createSim,
  planHold,
  IN_DASH,
  IN_PRESS,
  IN_RELEASE,
  PH_PLAY,
  MODE_RACE,
  MODE_GHOST,
  EXT_DRAFT_ON,
  EXT_DRAFT_OFF,
  step as simStep,
  type InputEntry,
  type SimConfig,
  type SimState,
} from './sim/core';

/** Bridge-only kinds (outside the sim's event space). */
export const BR_CAM = 90;
export const BR_INPUT = 91;
export const BR_RIVAL = 92;
/** Rival position sample for overtakes / position tags: slot, dist, y, step. */
export const BR_RIVALPOS = 93;

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
  /** Slipstream: steps spent in a rival's draft zone, and a re-arm latch. */
  draftZone: number;
  draftUsed: boolean;
}

/** Ambient/presentation particles (not part of the sim): bubble jet, rising bubbles, sand puffs. */
export const AMB_N = 56;
export interface Ambient {
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
  life: number[];
  max: number[];
  size: number[];
  kind: number[];
  next: number;
  jetAcc: number;
  riseAcc: number;
  puffAcc: number;
  seed: number;
}

function createAmbient(): Ambient {
  'worklet';
  const z = () => {
    const a: number[] = [];
    for (let i = 0; i < AMB_N; i++) a.push(0);
    return a;
  };
  return { x: z(), y: z(), vx: z(), vy: z(), life: z(), max: z(), size: z(), kind: z(), next: 0, jetAcc: 0, riseAcc: 0, puffAcc: 0, seed: 7 };
}

function ambRand(a: Ambient): number {
  'worklet';
  a.seed = (a.seed * 1103515245 + 12345) & 0x7fffffff;
  return a.seed / 0x7fffffff;
}

function ambSpawn(a: Ambient, x: number, y: number, vx: number, vy: number, life: number, size: number, kind: number): void {
  'worklet';
  const i = a.next;
  a.next = (a.next + 1) % AMB_N;
  a.x[i] = x;
  a.y[i] = y;
  a.vx[i] = vx;
  a.vy[i] = vy;
  a.life[i] = life;
  a.max[i] = life;
  a.size[i] = size;
  a.kind[i] = kind;
}

/** Advance ambient particles by fxDt (ms): freezes with hit-stop, slows with slow-mo. */
function ambStep(a: Ambient, s: SimState, dtMs: number): void {
  'worklet';
  if (dtMs <= 0) return;
  const dt = dtMs / 1000;
  const du = s.dist / 256;
  const y = s.y / 256;
  const playing = s.phase === PH_PLAY && s.float === 0;
  // Jetpack bubble jet: a downward cone while holding, one every 40ms.
  if (playing && s.holding) {
    a.jetAcc += dtMs;
    while (a.jetAcc >= 40) {
      a.jetAcc -= 40;
      ambSpawn(a, du - 50 + ambRand(a) * 16, y + 18, -40 - ambRand(a) * 60, 200 + ambRand(a) * 60, 0.55, 12 + ambRand(a) * 10, 0);
    }
    // Sand kicked up where the jet reaches the floor band.
    if (y > 700) {
      a.puffAcc += dtMs;
      while (a.puffAcc >= 120) {
        a.puffAcc -= 120;
        ambSpawn(a, du - 30 + ambRand(a) * 40, 958, -20, -60 - ambRand(a) * 40, 0.5, 26 + ambRand(a) * 10, 1);
      }
    }
  } else {
    a.jetAcc = 0;
  }
  // Frenzy: a gold sparkle trail off the tail (kind 3).
  if (playing && s.frenzy > 0) {
    a.puffAcc += dtMs;
    while (a.puffAcc >= 45) {
      a.puffAcc -= 45;
      ambSpawn(a, du - 60 + ambRand(a) * 20, y - 10 + ambRand(a) * 30, -120 - ambRand(a) * 80, -30 + ambRand(a) * 60, 0.45, 18 + ambRand(a) * 8, 3);
    }
  }
  // Ambient bubbles rise from the reef (cap stays low: 60 ambient max).
  a.riseAcc += dtMs;
  while (a.riseAcc >= 420) {
    a.riseAcc -= 420;
    ambSpawn(a, du - 200 + ambRand(a) * 1200, 940, 0, -90 - ambRand(a) * 70, 6, 8 + ambRand(a) * 12, 2);
  }
  for (let i = 0; i < AMB_N; i++) {
    if (a.life[i] <= 0) continue;
    a.life[i] -= dt;
    a.x[i] += a.vx[i] * dt;
    a.y[i] += a.vy[i] * dt;
    if (a.kind[i] === 0) a.vy[i] *= 0.94;
    if (a.kind[i] === 2) a.x[i] += Math.sin((a.life[i] + i) * 3) * 0.6;
    if (a.kind[i] === 2 && a.y[i] < 44) a.life[i] = 0;
  }
}

/** A rival for reset: a replayed sim (bot / ghost) or a live remote player. */
export type RivalSpec = { cfg: SimConfig; log: InputEntry[] } | { remote: true };

export interface SharkyEngine {
  sim: SharedValue<SimState>;
  rivals: SharedValue<RivalSlot[]>;
  input: SharedValue<EngineInput>;
  ambient: SharedValue<Ambient>;
  running: SharedValue<boolean>;
  tick: SharedValue<number>;
  alpha: SharedValue<number>;
  clock: ReturnType<typeof useGameClock>;
  /** JS: the applied input log (proof, ghosts, restore). */
  log: React.MutableRefObject<InputEntry[]>;
  reset: (cfg: SimConfig, rivals?: Array<RivalSpec | null>) => void;
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
  return { q: [], holding: false, startX: 0, startY: 0, startT: 0, slideFired: false, fingers: 0, draftZone: 0, draftUsed: false };
}

export function useSharkyEngine(
  initial: SimConfig,
  onEvents: (batch: number[]) => void,
  autoplay = false,
  autoSalt = 0,
  /** Dev perf runs: 'cheap' steers by the target line only (no lookahead planner on the UI thread). */
  autoCheap = false,
): SharkyEngine {
  const sim = useSharedValue<SimState>(createSim(initial));
  const rivals = useSharedValue<RivalSlot[]>([emptyRival(), emptyRival(), emptyRival()]);
  const input = useSharedValue<EngineInput>(emptyInput());
  const ambient = useSharedValue<Ambient>(createAmbient());
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
      // Dev autoplay: the planner bot plays through the real input path.
      if (autoplay && s.phase === PH_PLAY && s.step % 6 === 0) {
        const ty = botTargetY(s, (s.speed >> 8) + 120);
        const prefer = (s.y >> 8) > ty ? 1 : 0;
        // Per-device salt so two lab phones don't play identical races.
        const pref = autoSalt > 0 && ((s.step / 6) | 0) % 7 === autoSalt % 7 ? 1 - prefer : prefer;
        let c = autoCheap ? prefer : planHold(s, autoSalt > 0 ? 7 : 6, 12, 400, pref);
        if (c < 0) c = prefer;
        if (c === 1 && !s.holding) inp.q.push(IN_PRESS, 0, 0);
        if (c === 0 && s.holding) inp.q.push(IN_RELEASE, 0, 0);
        if (s.boost >= 200 && s.dash === 0 && s.step % 240 === 0) inp.q.push(IN_DASH, 0, 0);
      }
      // Slipstream (design 10.4): 40-160u behind a rival, |dy| <= 90, for 300ms.
      const rvs = rivals.value;
      if ((s.mode === MODE_RACE || s.mode === MODE_GHOST) && s.phase === PH_PLAY) {
        const du = s.dist >> 8;
        const sy = s.y >> 8;
        let zone = -1;
        for (let j = 0; j < rvs.length; j++) {
          const g = rvs[j];
          if (!g || g.kind === 0) continue;
          let rd = 0;
          let ry = 500;
          if (g.kind === 1 && g.sim) {
            rd = g.sim.dist >> 8;
            ry = g.sim.y >> 8;
          } else {
            rd = g.rDist + (g.rVel * (s.step - g.rAt)) / 60;
            ry = g.rY;
          }
          const dx = rd - du;
          if (dx >= 40 && dx <= 160 && ry - sy <= 90 && sy - ry <= 90) zone = j;
          if (s.step % 6 === 0) pushEvent(r, BR_RIVALPOS, j, rd, ry, s.step);
        }
        inp.draftZone = zone >= 0 ? inp.draftZone + 1 : 0;
        if (zone < 0) inp.draftUsed = false;
        if (!s.draft && zone >= 0 && inp.draftZone >= 18 && !inp.draftUsed) {
          inp.q.push(IN_EXT, EXT_DRAFT_ON, zone);
          inp.draftUsed = true;
        } else if (s.draft && zone < 0) {
          inp.q.push(IN_EXT, EXT_DRAFT_OFF, 0);
        }
      }
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
    onFrame: (a, fxDt) => {
      'worklet';
      if (running.value) ambStep(ambient.value, sim.value, fxDt);
      alpha.value = a;
      tick.value = tick.value + 1;
      bridge.flush();
    },
  });

  const reset = useCallback((cfg: SimConfig, rv: Array<RivalSpec | null> = []) => {
    log.current = [];
    const slots: RivalSlot[] = [];
    for (let j = 0; j < MAX_RIVALS; j++) {
      const g = rv[j];
      if (g && 'remote' in g) slots.push({ ...emptyRival(), kind: 2 });
      else if (g) slots.push({ kind: 1, sim: createSim(g.cfg), log: g.log, k: 0, rDist: 0, rY: 500, rVel: 0, rAt: 0, done: 0 });
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

  return useMemo(() => ({ sim, rivals, input, ambient, running, tick, alpha, clock, log, reset, setRunning, ext, remote }),
    [sim, rivals, input, ambient, running, tick, alpha, clock, reset, setRunning, ext, remote]);
}
