/**
 * perfTier.ts: automatic quality tiers so an older phone keeps 60 fps.
 *
 * Current Quest: "Lite tier auto-selected when the first-60-frame p95 exceeds
 * 14 ms" (work time; the default here reads vsync intervals, see TierConfig). Sharky: the low-perf tier swaps shaders for baked tiles and halves
 * FX. Boss: heavy shaders at half resolution. This module owns the decision:
 *
 *   - After `sampleFrames` frames (skipping `warmupFrames` of mount jank) the
 *     p95 picks a starting tier.
 *   - During play it only ever steps DOWN, and only when a rolling window of
 *     `windowFrames` is clearly over budget (hysteresis), never back up
 *     mid-run (no visible flip-flopping).
 *   - `TIER_SCALES` tells FX what each tier means.
 *
 * Pure and worklet-safe; `usePerfTier` runs it on the UI thread.
 */

export type PerfTierName = 'full' | 'lite' | 'min';
export const TIER_FULL = 0;
export const TIER_LITE = 1;
export const TIER_MIN = 2;
export const TIER_NAMES: PerfTierName[] = ['full', 'lite', 'min'];

export interface TierScale {
  /** Multiplier on particle caps and burst counts. */
  particles: number;
  /** RuntimeEffect shaders on (off = baked tiles / solid fills). */
  shaders: boolean;
  /** Shader render scale (half-res offscreen for caustics/whirlpool). */
  shaderRes: number;
  /** Ambient life (fish shadows, clouds, bubbles) multiplier. */
  ambient: number;
  /** Blur masks (contact shadows) on. */
  blur: boolean;
  /** Afterimages / ribbon trail points multiplier. */
  trails: number;
}

export const TIER_SCALES: TierScale[] = [
  { particles: 1, shaders: true, shaderRes: 1, ambient: 1, blur: true, trails: 1 },
  { particles: 0.5, shaders: true, shaderRes: 0.5, ambient: 0.5, blur: true, trails: 0.6 },
  { particles: 0.3, shaders: false, shaderRes: 0.5, ambient: 0, blur: false, trails: 0.4 },
];

export interface TierConfig {
  warmupFrames: number;
  sampleFrames: number;
  /**
   * p95 frame INTERVAL above this picks lite. The probe measures vsync
   * intervals (useFrameCallback), so a healthy 60 Hz frame is 16.7 ms and any
   * interval over ~19 ms is a missed vsync. (Current Quest's "14 ms" is frame
   * WORK time; pass liteP95Ms: 14 when you feed measured work time instead.)
   */
  liteP95Ms: number;
  /** p95 interval above this picks min (dropping every other frame). */
  minP95Ms: number;
  /** Rolling window for later downgrades. */
  windowFrames: number;
  /** A window whose p95 exceeds threshold * this factor steps down. */
  downgradeFactor: number;
  /** Frames between downgrades. */
  cooldownFrames: number;
  /** Frames over this are hitches (app switch, GC): ignored. */
  outlierMs: number;
}

export const DEFAULT_TIER_CONFIG: TierConfig = {
  warmupFrames: 20,
  sampleFrames: 60,
  liteP95Ms: 19,
  minP95Ms: 28,
  windowFrames: 120,
  downgradeFactor: 1.15,
  cooldownFrames: 240,
  outlierMs: 250,
};

export interface TierProbe {
  cfg: TierConfig;
  tier: number;
  decided: boolean;
  frames: number;
  buf: number[];
  sinceChange: number;
  /** Tier forced by the dev tester (-1 = auto). */
  forced: number;
}

export function createTierProbe(cfg: Partial<TierConfig> = {}, startTier = 0): TierProbe {
  'worklet';
  return {
    cfg: { ...DEFAULT_TIER_CONFIG, ...cfg },
    tier: startTier,
    decided: false,
    frames: 0,
    buf: [],
    sinceChange: 0,
    forced: -1,
  };
}

function p95(buf: number[]): number {
  'worklet';
  if (buf.length === 0) return 0;
  const s = buf.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
}

function tierFor(cfg: TierConfig, ms: number): number {
  'worklet';
  if (ms > cfg.minP95Ms) return TIER_MIN;
  if (ms > cfg.liteP95Ms) return TIER_LITE;
  return TIER_FULL;
}

/** Feed one frame time. Returns true when the tier changed on this frame. */
export function tierFrame(p: TierProbe, frameMs: number): boolean {
  'worklet';
  if (p.forced >= 0) {
    if (p.tier !== p.forced) { p.tier = p.forced; return true; }
    return false;
  }
  p.frames += 1;
  p.sinceChange += 1;
  if (p.frames <= p.cfg.warmupFrames || frameMs > p.cfg.outlierMs || frameMs <= 0) return false;
  p.buf.push(frameMs);
  if (!p.decided) {
    if (p.buf.length < p.cfg.sampleFrames) return false;
    p.decided = true;
    const next = Math.max(p.tier, tierFor(p.cfg, p95(p.buf)));
    p.buf = [];
    p.sinceChange = 0;
    if (next !== p.tier) { p.tier = next; return true; }
    return false;
  }
  if (p.buf.length > p.cfg.windowFrames) p.buf.shift();
  if (p.tier >= TIER_MIN || p.buf.length < p.cfg.windowFrames || p.sinceChange < p.cfg.cooldownFrames) return false;
  const threshold = p.tier === TIER_FULL ? p.cfg.liteP95Ms : p.cfg.minP95Ms;
  if (p95(p.buf) > threshold * p.cfg.downgradeFactor) {
    p.tier += 1;
    p.buf = [];
    p.sinceChange = 0;
    return true;
  }
  return false;
}

/** Scale a particle/burst count by tier (never below 1 when asked for any). */
export function tierCount(tier: number, n: number): number {
  'worklet';
  if (n <= 0) return 0;
  return Math.max(1, Math.round(n * TIER_SCALES[Math.max(0, Math.min(2, tier))].particles));
}
