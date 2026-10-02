/**
 * thermal.ts: the sustained-performance ladder (Whack v4 "Thermal") and the
 * 120 Hz -> 60-step fallback, as one pure state machine.
 *
 * Queue sessions are long and phones get hot in the sun. perfTier picks a
 * tier from the first second; this ladder watches the whole session:
 *
 *   nominal  -> everything on
 *   fair     -> parallax, sun shafts, ambient elements and afterimages off
 *   serious  -> caustics frozen, mesh rigid, particle cap 70, 60-step mode
 *   critical -> particle cap 40, fewer confetti
 *
 * Signals:
 *   - native: ProcessInfo.thermalState from a tiny Expo module in WS9's binary
 *     (`thermalNative(state, level)`), used whenever it is present;
 *   - fallback (no native): the median frame time rises 25% over the Run 1
 *     baseline and stays there for 10 s -> one step down.
 * Steps go DOWN only within a run and UP only between runs (`thermalRunEnd`),
 * so the look never flickers mid-run.
 *
 * 120 Hz: when the display runs at 120 Hz but fps p5 stays under 100 for 5 s,
 * `step60` turns on: commit shared values every other vsync (60-step mode).
 */

export const THERMAL_NOMINAL = 0;
export const THERMAL_FAIR = 1;
export const THERMAL_SERIOUS = 2;
export const THERMAL_CRITICAL = 3;
export const THERMAL_NAMES = ['nominal', 'fair', 'serious', 'critical'] as const;
export type ThermalName = (typeof THERMAL_NAMES)[number];

export interface ThermalScale {
  /** Hard particle cap (FxStage capacity). */
  particleCap: number;
  parallax: boolean;
  ambient: boolean;
  afterimages: boolean;
  /** Animated caustics (false = frozen frame). */
  caustics: boolean;
  /** Mesh deformation (false = rigid sprites). */
  mesh: boolean;
  /** Confetti multiplier. */
  confetti: number;
  /** Force 60-step mode. */
  step60: boolean;
}

export const THERMAL_SCALES: ThermalScale[] = [
  { particleCap: 140, parallax: true, ambient: true, afterimages: true, caustics: true, mesh: true, confetti: 1, step60: false },
  { particleCap: 140, parallax: false, ambient: false, afterimages: false, caustics: true, mesh: true, confetti: 1, step60: false },
  { particleCap: 70, parallax: false, ambient: false, afterimages: false, caustics: false, mesh: false, confetti: 0.6, step60: true },
  { particleCap: 40, parallax: false, ambient: false, afterimages: false, caustics: false, mesh: false, confetti: 0.35, step60: true },
];

export interface ThermalConfig {
  /** Median rise over baseline that counts as heat (0.25 = +25%). */
  riseFactor: number;
  /** How long the rise must hold before a step (ms). */
  holdMs: number;
  /** Frames in the rolling median window. */
  windowFrames: number;
  /** Frames needed before the baseline locks. */
  baselineFrames: number;
  /** 120 Hz: p5 fps under this ... */
  p5FloorFps: number;
  /** ... for this long switches to 60-step mode. */
  p5HoldMs: number;
}

export const DEFAULT_THERMAL: ThermalConfig = {
  riseFactor: 0.25,
  holdMs: 10000,
  windowFrames: 90,
  baselineFrames: 240,
  p5FloorFps: 100,
  p5HoldMs: 5000,
};

export interface ThermalState {
  cfg: ThermalConfig;
  level: number;
  /** Highest level reached this run (levels only rise inside a run). */
  runFloor: number;
  /** Native level, -1 when the module is missing. */
  native: number;
  baseline: number;
  baselineBuf: number[];
  buf: number[];
  hotSince: number;
  /** Display refresh measured from vsync intervals (60 / 120). */
  hz: number;
  step60: boolean;
  slowSince: number;
  t: number;
  changes: number;
}

export function createThermal(cfg: Partial<ThermalConfig> = {}): ThermalState {
  'worklet';
  return {
    cfg: { ...DEFAULT_THERMAL, ...cfg },
    level: 0,
    runFloor: 0,
    native: -1,
    baseline: 0,
    baselineBuf: [],
    buf: [],
    hotSince: -1,
    hz: 60,
    step60: false,
    slowSince: -1,
    t: 0,
    changes: 0,
  };
}

function median(a: number[]): number {
  'worklet';
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
}

function p5Fps(a: number[]): number {
  'worklet';
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const worst = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
  return worst > 0 ? 1000 / worst : 0;
}

function raise(s: ThermalState, to: number): boolean {
  'worklet';
  const next = Math.min(THERMAL_CRITICAL, Math.max(s.level, to));
  if (next === s.level) return false;
  s.level = next;
  s.runFloor = next;
  if (THERMAL_SCALES[next].step60) s.step60 = true;
  s.changes += 1;
  return true;
}

/** Native thermal state (0..3) from ProcessInfo.thermalState. Raises within a run only. */
export function thermalNative(s: ThermalState, level: number): boolean {
  'worklet';
  s.native = level;
  return raise(s, level);
}

/**
 * Feed one vsync interval (ms). Returns true when the level or 60-step mode
 * changed on this frame. Hitches over 250 ms (app switch) are ignored.
 */
export function thermalFrame(s: ThermalState, frameMs: number): boolean {
  'worklet';
  if (frameMs <= 0 || frameMs > 250) return false;
  s.t += frameMs;
  const c = s.cfg;
  s.buf.push(frameMs);
  if (s.buf.length > c.windowFrames) s.buf.shift();
  if (s.buf.length >= 30) {
    const fast = median(s.buf);
    s.hz = fast < 11 ? 120 : 60;
  }
  let changed = false;
  // 120 Hz -> 60-step.
  if (s.hz === 120 && !s.step60 && s.buf.length >= 30) {
    if (p5Fps(s.buf) < c.p5FloorFps) {
      if (s.slowSince < 0) s.slowSince = s.t;
      else if (s.t - s.slowSince >= c.p5HoldMs) {
        s.step60 = true;
        changed = true;
      }
    } else s.slowSince = -1;
  }
  // Native signal wins when present.
  if (s.native >= 0) return changed;
  if (!s.baseline) {
    s.baselineBuf.push(frameMs);
    if (s.baselineBuf.length >= c.baselineFrames) {
      s.baseline = median(s.baselineBuf);
      s.baselineBuf = [];
    }
    return changed;
  }
  if (s.buf.length < c.windowFrames) return changed;
  if (median(s.buf) > s.baseline * (1 + c.riseFactor)) {
    if (s.hotSince < 0) s.hotSince = s.t;
    else if (s.t - s.hotSince >= c.holdMs) {
      s.hotSince = -1;
      s.buf = [];
      if (raise(s, s.level + 1)) changed = true;
    }
  } else s.hotSince = -1;
  return changed;
}

/**
 * Between runs: the level may recover one step (to the native level when
 * known). The baseline is kept: it is the Run 1 cool-phone reference.
 */
export function thermalRunEnd(s: ThermalState): void {
  'worklet';
  const floor = s.native >= 0 ? s.native : 0;
  s.level = Math.max(floor, s.level - 1);
  s.runFloor = s.level;
  s.step60 = THERMAL_SCALES[s.level].step60;
  s.slowSince = -1;
  s.hotSince = -1;
  s.buf = [];
}

/** Fold a perf tier and a thermal level into one particle cap. */
export function thermalParticleCap(s: ThermalState, base: number): number {
  'worklet';
  return Math.min(base, THERMAL_SCALES[s.level].particleCap);
}
