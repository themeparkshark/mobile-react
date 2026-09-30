/**
 * clock.ts: the studio game clock. Two clocks, one struct, worklet-safe.
 *
 *   simMs  gameplay time. Drives spawns, timers, scoring. Wall-locked by
 *          default: presentation effects never change it, so replays, ghost
 *          runs and multiplayer stay deterministic. A "sim" hit-stop (opt-in,
 *          e.g. Whack's golden freeze where taps are stamped at the frozen
 *          time) is the only thing besides pause that holds it.
 *   fxMs   presentation time. Hit-stop freezes it, slow-mo scales it, and
 *          every FX/animation reads it, so a freeze really freezes the world.
 *
 * Also here: per-slot LOCAL hit-stop (only the struck target, its FX and its
 * local clock freeze), a global freeze budget (never more than a set share of
 * wall time), stacked-stop attenuation, slow-mo with an eased return, and the
 * fixed-step accumulator for 60 Hz deterministic sims.
 *
 * Pause is a separate flag: while paused, nothing advances. Line movement is
 * NOT a pause (QUEUE REALITY): only a manual pause, backgrounding or a
 * queue-exit wrap-up stops the clock.
 */

import { ease } from './ease';

export interface ClockConfig {
  /** Max share of wall time that global freezes may take (0.02 = 2%). */
  freezeBudget: number;
  /** Window (ms) over which the budget is measured (leaky bucket). */
  budgetWindowMs: number;
  /** Stops closer together than this are attenuated (stacking). */
  stackWindowMs: number;
  /** Attenuation for the 1st, 2nd, 3rd+ stop inside the stack window. */
  stackScale: [number, number, number];
  /** Minimum gap between non-forced stops; closer ones are skipped. */
  minGapMs: number;
  /** Max frame delta accepted (ms); longer gaps (background) are clamped. */
  maxFrameMs: number;
  /** Local hit-stop slots (targets/holes/lanes). */
  slots: number;
}

export const DEFAULT_CLOCK_CONFIG: ClockConfig = {
  freezeBudget: 0.04,
  budgetWindowMs: 5000,
  stackWindowMs: 600,
  stackScale: [1, 0.6, 0.35],
  minGapMs: 0,
  maxFrameMs: 100,
  slots: 16,
};

export interface GameClock {
  cfg: ClockConfig;
  wallMs: number;
  simMs: number;
  fxMs: number;
  paused: boolean;
  /** Wall time until which the presentation (and optionally sim) is frozen. */
  freezeUntil: number;
  freezeHoldsSim: boolean;
  /** Leaky bucket of frozen ms (decays with the budget window). */
  bucketMs: number;
  lastStopWall: number;
  stackCount: number;
  /** Slow-mo: scale while held, then eased back to 1. */
  slowScale: number;
  slowHoldUntil: number;
  slowEaseMs: number;
  slowHoldsSim: boolean;
  /** Last computed scale (read by renderers for motion blur etc.). */
  fxScale: number;
  /** Deltas produced by the last advance(). */
  lastSimDt: number;
  lastFxDt: number;
  /** Fixed-step accumulator (ms of sim time not yet stepped). */
  acc: number;
  steps: number;
  /** Per-slot local freeze deadlines in fxMs. */
  localUntil: number[];
  /** Stats for perf/proof: total frozen ms and number of stops. */
  frozenTotalMs: number;
  stopCount: number;
}

export function createClock(cfg: Partial<ClockConfig> = {}): GameClock {
  'worklet';
  const full: ClockConfig = {
    freezeBudget: cfg.freezeBudget ?? DEFAULT_CLOCK_CONFIG.freezeBudget,
    budgetWindowMs: cfg.budgetWindowMs ?? DEFAULT_CLOCK_CONFIG.budgetWindowMs,
    stackWindowMs: cfg.stackWindowMs ?? DEFAULT_CLOCK_CONFIG.stackWindowMs,
    stackScale: cfg.stackScale ?? [1, 0.6, 0.35],
    minGapMs: cfg.minGapMs ?? DEFAULT_CLOCK_CONFIG.minGapMs,
    maxFrameMs: cfg.maxFrameMs ?? DEFAULT_CLOCK_CONFIG.maxFrameMs,
    slots: cfg.slots ?? DEFAULT_CLOCK_CONFIG.slots,
  };
  const localUntil: number[] = [];
  for (let i = 0; i < full.slots; i++) localUntil.push(0);
  return {
    cfg: full,
    wallMs: 0,
    simMs: 0,
    fxMs: 0,
    paused: false,
    freezeUntil: 0,
    freezeHoldsSim: false,
    bucketMs: 0,
    lastStopWall: -1e9,
    stackCount: 0,
    slowScale: 1,
    slowHoldUntil: 0,
    slowEaseMs: 0,
    slowHoldsSim: false,
    fxScale: 1,
    lastSimDt: 0,
    lastFxDt: 0,
    acc: 0,
    steps: 0,
    localUntil,
    frozenTotalMs: 0,
    stopCount: 0,
  };
}

export interface HitStopOptions {
  /** Also hold gameplay time (default false: presentation-only). */
  holdSim?: boolean;
  /** Ignore budget, gap and stacking (boss KO, round end). */
  force?: boolean;
}

/**
 * Request a global hit-stop. Returns the ms actually granted (after budget,
 * stacking and gap rules), 0 when refused.
 */
export function hitStop(c: GameClock, ms: number, opts: HitStopOptions = {}): number {
  'worklet';
  if (ms <= 0) return 0;
  let granted = ms;
  if (!opts.force) {
    const sinceLast = c.wallMs - c.lastStopWall;
    if (sinceLast < c.cfg.minGapMs) return 0;
    c.stackCount = sinceLast < c.cfg.stackWindowMs ? c.stackCount + 1 : 0;
    const idx = c.stackCount > 2 ? 2 : c.stackCount;
    granted = ms * c.cfg.stackScale[idx];
    const allowance = c.cfg.freezeBudget * c.cfg.budgetWindowMs - c.bucketMs;
    if (allowance <= 0) return 0;
    if (granted > allowance) granted = allowance;
  }
  const until = c.wallMs + granted;
  if (until > c.freezeUntil) c.freezeUntil = until;
  if (opts.holdSim) c.freezeHoldsSim = true;
  c.lastStopWall = c.wallMs;
  c.stopCount += 1;
  return granted;
}

/** Slow-motion: `scale` for holdMs, then eased back to 1 over easeMs. */
export function slowMo(c: GameClock, scale: number, holdMs: number, easeMs = 120, holdSim = false): void {
  'worklet';
  c.slowScale = scale;
  c.slowHoldUntil = c.wallMs + holdMs;
  c.slowEaseMs = easeMs;
  c.slowHoldsSim = holdSim;
}

/** Local hit-stop for one slot (target/hole/lane): its fx clock holds for ms. */
export function localStop(c: GameClock, slot: number, ms: number): void {
  'worklet';
  if (slot < 0 || slot >= c.localUntil.length) return;
  const until = c.fxMs + ms;
  if (until > c.localUntil[slot]) c.localUntil[slot] = until;
}

/** Presentation dt for a slot this frame: 0 while its local stop holds. */
export function slotDt(c: GameClock, slot: number): number {
  'worklet';
  if (slot >= 0 && slot < c.localUntil.length && c.fxMs < c.localUntil[slot]) return 0;
  return c.lastFxDt;
}

export function slotFrozen(c: GameClock, slot: number): boolean {
  'worklet';
  return slot >= 0 && slot < c.localUntil.length && c.fxMs < c.localUntil[slot];
}

export function isFrozen(c: GameClock): boolean {
  'worklet';
  return c.wallMs < c.freezeUntil;
}

/** Current slow-mo scale including the eased return. */
function currentSlow(c: GameClock): number {
  'worklet';
  if (c.slowScale === 1) return 1;
  if (c.wallMs < c.slowHoldUntil) return c.slowScale;
  const t = c.slowEaseMs > 0 ? (c.wallMs - c.slowHoldUntil) / c.slowEaseMs : 1;
  if (t >= 1) {
    c.slowScale = 1;
    return 1;
  }
  return c.slowScale + (1 - c.slowScale) * ease('inOutQuad', t);
}

/**
 * Advance by a wall-clock frame delta. Updates simMs/fxMs and the fixed-step
 * accumulator. Returns the sim delta (ms).
 */
export function advanceClock(c: GameClock, frameMs: number): number {
  'worklet';
  const dt = frameMs > c.cfg.maxFrameMs ? c.cfg.maxFrameMs : frameMs < 0 ? 0 : frameMs;
  if (c.paused) {
    c.lastSimDt = 0;
    c.lastFxDt = 0;
    return 0;
  }
  // Budget bucket leaks at the budget rate.
  c.bucketMs -= dt * c.cfg.freezeBudget;
  if (c.bucketMs < 0) c.bucketMs = 0;

  const frozenBefore = c.wallMs < c.freezeUntil;
  c.wallMs += dt;
  let frozenPart = 0;
  if (frozenBefore) {
    const end = c.freezeUntil < c.wallMs ? c.freezeUntil : c.wallMs;
    frozenPart = end - (c.wallMs - dt);
    if (frozenPart < 0) frozenPart = 0;
    c.bucketMs += frozenPart;
    c.frozenTotalMs += frozenPart;
  }
  const live = dt - frozenPart;
  const slow = currentSlow(c);
  c.fxScale = frozenPart >= dt ? 0 : slow;
  const fxDt = live * slow;
  const simDt = (c.freezeHoldsSim ? live : dt) * (c.slowHoldsSim ? slow : 1);
  if (!(c.wallMs < c.freezeUntil)) c.freezeHoldsSim = false;
  c.fxMs += fxDt;
  c.simMs += simDt;
  c.acc += simDt;
  c.lastFxDt = fxDt;
  c.lastSimDt = simDt;
  return simDt;
}

/**
 * Pop fixed steps from the accumulator: returns how many `stepMs` steps to
 * run now (capped, the rest is dropped to stay real-time after a stall).
 */
export function drainSteps(c: GameClock, stepMs: number, maxSteps = 4): number {
  'worklet';
  let n = 0;
  while (c.acc >= stepMs && n < maxSteps) {
    c.acc -= stepMs;
    n += 1;
  }
  if (n >= maxSteps && c.acc >= stepMs) c.acc = c.acc % stepMs;
  c.steps += n;
  return n;
}

/** Interpolation alpha for rendering between fixed steps. */
export function stepAlpha(c: GameClock, stepMs: number): number {
  'worklet';
  return stepMs > 0 ? c.acc / stepMs : 0;
}

export function pauseClock(c: GameClock): void {
  'worklet';
  c.paused = true;
}

export function resumeClock(c: GameClock): void {
  'worklet';
  c.paused = false;
  // Frozen effects that were mid-flight end cleanly after a resume.
  c.freezeUntil = c.wallMs;
  c.freezeHoldsSim = false;
}

/** Serializable subset for interruption snapshots. */
export function clockSnapshot(c: GameClock): { simMs: number; fxMs: number; steps: number; acc: number } {
  'worklet';
  return { simMs: c.simMs, fxMs: c.fxMs, steps: c.steps, acc: c.acc };
}

export function restoreClock(c: GameClock, snap: { simMs: number; fxMs: number; steps: number; acc?: number }): void {
  'worklet';
  c.simMs = snap.simMs;
  c.fxMs = snap.fxMs;
  c.steps = snap.steps;
  c.acc = snap.acc ?? 0;
  c.freezeUntil = c.wallMs;
  c.slowScale = 1;
}
