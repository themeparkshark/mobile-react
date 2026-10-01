/**
 * walkSense: step and walk detection from the accelerometer, for QUEUE REALITY.
 *
 * The line is always moving, so walking NEVER pauses a game. Games use this to
 * be kinder while the player shuffles forward:
 * - calm the camera (useCamera `walking`),
 * - widen hit forgiveness and grace misses (`jostle`),
 * - show the gentle heads-up affordance,
 * - log `walking` in the proof so the server can judge fairly.
 *
 * Pure and worklet-safe. Units: acceleration in g (expo-sensors Accelerometer),
 * time in ms. No permission prompt is needed for the accelerometer on iOS.
 *
 * Algorithm: a slow low-pass tracks gravity, the dynamic part is |a| - gravity,
 * a fast low-pass smooths it, and a step is a peak above `threshold` at least
 * `minStepMs` after the previous one. Walking starts after `startSteps` steps
 * inside `windowMs` and stops when no step lands for `stopAfterMs`.
 */

export interface WalkSenseConfig {
  /** Dynamic peak (g) that counts as a step. */
  threshold: number;
  /** Refractory time between steps (a fast walk is about 2.5 steps/s). */
  minStepMs: number;
  /** Steps needed inside windowMs to call it walking. */
  startSteps: number;
  windowMs: number;
  /** No step for this long ends the walk. */
  stopAfterMs: number;
  /** Gravity low-pass time constant. */
  gravityTauMs: number;
  /** Signal smoothing time constant. */
  smoothTauMs: number;
  /** Jostle (0-1) decay time constant. */
  jostleTauMs: number;
}

export const DEFAULT_WALK_SENSE: WalkSenseConfig = {
  threshold: 0.07,
  minStepMs: 280,
  startSteps: 4,
  windowMs: 4000,
  stopAfterMs: 2500,
  gravityTauMs: 900,
  smoothTauMs: 45,
  jostleTauMs: 600,
};

export const WALK_EV_STEP = 1;
export const WALK_EV_START = 2;
export const WALK_EV_STOP = 4;

export interface WalkSenseState {
  cfg: WalkSenseConfig;
  lastT: number;
  gravity: number;
  smooth: number;
  prevSmooth: number;
  rising: boolean;
  peak: number;
  lastStepT: number;
  /** Recent step times (ring of 8). */
  stepTimes: number[];
  stepHead: number;
  steps: number;
  walking: boolean;
  /** Steps per second over the recent window (0 when still). */
  cadence: number;
  /** 0-1 how much the phone is being bumped around right now. */
  jostle: number;
}

export function createWalkSense(cfg: Partial<WalkSenseConfig> = {}): WalkSenseState {
  'worklet';
  return {
    cfg: { ...DEFAULT_WALK_SENSE, ...cfg },
    lastT: -1,
    gravity: 1,
    smooth: 0,
    prevSmooth: 0,
    rising: false,
    peak: 0,
    lastStepT: -1e9,
    stepTimes: [-1e9, -1e9, -1e9, -1e9, -1e9, -1e9, -1e9, -1e9],
    stepHead: 0,
    steps: 0,
    walking: false,
    cadence: 0,
    jostle: 0,
  };
}

function alphaFor(dtMs: number, tauMs: number): number {
  'worklet';
  return 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tauMs));
}

function stepsInWindow(s: WalkSenseState, t: number): number {
  'worklet';
  let n = 0;
  for (let i = 0; i < s.stepTimes.length; i++) if (t - s.stepTimes[i] <= s.cfg.windowMs) n++;
  return n;
}

/**
 * Feed one accelerometer sample. Returns a bitmask of WALK_EV_* events.
 */
export function walkSample(s: WalkSenseState, tMs: number, x: number, y: number, z: number): number {
  'worklet';
  const c = s.cfg;
  const dt = s.lastT < 0 ? 20 : Math.min(200, tMs - s.lastT);
  s.lastT = tMs;
  const mag = Math.sqrt(x * x + y * y + z * z);
  s.gravity += (mag - s.gravity) * alphaFor(dt, c.gravityTauMs);
  const dyn = mag - s.gravity;
  s.prevSmooth = s.smooth;
  s.smooth += (dyn - s.smooth) * alphaFor(dt, c.smoothTauMs);

  // Jostle: fast attack, slow release, normalized so a firm step reads ~0.5.
  const j = Math.min(1, Math.abs(dyn) / (c.threshold * 4));
  s.jostle = j > s.jostle ? j : s.jostle + (j - s.jostle) * alphaFor(dt, c.jostleTauMs);

  let ev = 0;
  const up = s.smooth > s.prevSmooth;
  if (up) {
    s.rising = true;
    if (s.smooth > s.peak) s.peak = s.smooth;
  } else if (s.rising) {
    // Local maximum just passed.
    s.rising = false;
    if (s.peak >= c.threshold && tMs - s.lastStepT >= c.minStepMs) {
      s.lastStepT = tMs;
      s.stepTimes[s.stepHead] = tMs;
      s.stepHead = (s.stepHead + 1) % s.stepTimes.length;
      s.steps++;
      ev |= WALK_EV_STEP;
    }
    s.peak = 0;
  }

  const recent = stepsInWindow(s, tMs);
  s.cadence = recent >= 2 ? recent / (c.windowMs / 1000) : 0;
  if (!s.walking && recent >= c.startSteps) {
    s.walking = true;
    ev |= WALK_EV_START;
  } else if (s.walking && tMs - s.lastStepT > c.stopAfterMs) {
    s.walking = false;
    s.cadence = 0;
    ev |= WALK_EV_STOP;
  }
  return ev;
}

/**
 * Forgiveness helper: scale a hit radius or timing window by how bumpy the
 * phone is right now. Walking adds `walkBonus`, jostle adds up to `jostleBonus`.
 */
export function walkForgiveness(s: WalkSenseState, walkBonus = 0.15, jostleBonus = 0.2): number {
  'worklet';
  return 1 + (s.walking ? walkBonus : 0) + s.jostle * jostleBonus;
}
