/**
 * parallax.ts: gyro-attitude parallax, low-passed and walk-gated (pure).
 *
 * Whack v5 (Wave 2): deck and wells locked at 0x; backdrop 0.25x and props
 * 0.5x follow gyro attitude low-passed at 0.3 Hz; it turns off while walkSense
 * reports walking. The HUD never moves. Sharky and Banana use the same layer
 * factors idea for their plates.
 *
 * Input is device attitude (pitch/roll in radians, from expo-sensors
 * DeviceMotion.rotation beta/gamma). The resting attitude is learned slowly
 * (the way the phone is held in a queue), so only deliberate tilts move the
 * world and a phone held at 40 degrees does not park the backdrop off-centre.
 */

export interface ParallaxConfig {
  /** Low-pass cutoff (Hz). */
  cutoffHz: number;
  /** Offset (px, at factor 1) for a full `rangeRad` tilt. */
  maxPx: number;
  /** Tilt that maps to maxPx. */
  rangeRad: number;
  /** How fast the resting attitude follows the hold (Hz). */
  restHz: number;
}

export const DEFAULT_PARALLAX: ParallaxConfig = { cutoffHz: 0.3, maxPx: 12, rangeRad: 0.35, restHz: 0.05 };

/** Layer factors from the designs. */
export const PARALLAX_LAYERS = {
  whack: { deck: 0, wells: 0, backdrop: 0.25, props: 0.5 },
  banana: { far: 0.03, mid: 0.1, near: 0.13 },
} as const;

export interface ParallaxState {
  cfg: ParallaxConfig;
  /** Learned resting attitude. */
  restPitch: number;
  restRoll: number;
  seeded: boolean;
  /** Output offset (px) at factor 1. */
  x: number;
  y: number;
}

export function createParallax(cfg: Partial<ParallaxConfig> = {}): ParallaxState {
  'worklet';
  return { cfg: { ...DEFAULT_PARALLAX, ...cfg }, restPitch: 0, restRoll: 0, seeded: false, x: 0, y: 0 };
}

/** One-pole low-pass coefficient for a step of dtMs at cutoffHz. */
export function lowPassAlpha(dtMs: number, cutoffHz: number): number {
  'worklet';
  return 1 - Math.exp((-2 * Math.PI * cutoffHz * dtMs) / 1000);
}

/**
 * Advance with a new attitude sample. While `enabled` is false (walking,
 * reduced motion, low thermal tier) the output eases back to 0 at the same
 * gentle rate, never snapping.
 */
export function stepParallax(s: ParallaxState, pitch: number, roll: number, dtMs: number, enabled: boolean): void {
  'worklet';
  const c = s.cfg;
  if (!s.seeded) {
    s.restPitch = pitch;
    s.restRoll = roll;
    s.seeded = true;
  }
  const kr = lowPassAlpha(dtMs, c.restHz);
  s.restPitch += (pitch - s.restPitch) * kr;
  s.restRoll += (roll - s.restRoll) * kr;
  let tx = 0;
  let ty = 0;
  if (enabled) {
    const dr = Math.max(-1, Math.min(1, (roll - s.restRoll) / c.rangeRad));
    const dp = Math.max(-1, Math.min(1, (pitch - s.restPitch) / c.rangeRad));
    tx = -dr * c.maxPx;
    ty = -dp * c.maxPx;
  }
  const k = lowPassAlpha(dtMs, c.cutoffHz);
  s.x += (tx - s.x) * k;
  s.y += (ty - s.y) * k;
}

/** Offset of one layer (px). */
export function parallaxOffset(s: ParallaxState, factor: number, axis: 'x' | 'y'): number {
  'worklet';
  if (factor === 0) return 0;
  return (axis === 'x' ? s.x : s.y) * factor;
}
