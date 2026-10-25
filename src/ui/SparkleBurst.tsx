/**
 * <SparkleBurst>: a one-shot spray of four-point star sparkles, code-drawn (no art, no emoji).
 *
 *   const burst = useSharedValue(0);
 *   burst.value = 0; burst.value = withTiming(1, { duration: DURATION.sparkle, easing: EASE.out });
 *   <SparkleBurst progress={burst} count={6} x={20} y={20} />
 *
 * Every star flies out from (x, y) on its own angle, pops past full size, twinkles a quarter turn,
 * drops a little with gravity and fades (one shot, then gone, as in src/ui/motion.ts). Gold stars
 * with a white core, with an occasional white or sky-blue one, in Alex's palette.
 * The count goes through momentParticles (power budget, Reduce Motion: none) and never passes
 * PARTICLES.sparkles (12). Transforms and opacity only, on the UI thread; no Skia, no SVG, no
 * layout callbacks, so it is safe on any screen.
 */
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { usePowerBudget } from '../power/PowerProvider';
import { GOLD_FX, PARTICLES, momentParticles } from './motion';
import { BRAND } from './tokens';
import useUiReducedMotion from './useUiReducedMotion';

export type SparkleColor = 'gold' | 'white' | 'sky';

export interface SparkleSpec {
  /** Direction (degrees, 0 is right, -90 is up). */
  readonly angle: number;
  /** How far it flies (pt). */
  readonly dist: number;
  /** Star size, tip to tip (pt). */
  readonly size: number;
  /** When it leaves, as a share of the burst (0 to 0.3). */
  readonly delay: number;
  readonly color: SparkleColor;
}

export interface BurstShape {
  /** Spread of angles in degrees [from, to]; default the full circle. */
  readonly spread?: readonly [number, number];
  readonly dist?: readonly [number, number];
  readonly size?: readonly [number, number];
  /** Seed for the small per-star wobble, so two bursts side by side differ. */
  readonly seed?: number;
}

/** A tiny deterministic random (no Math.random, so a burst looks the same in tests and captures). */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Plan `count` stars spread evenly over the arc with a little jitter. Pure (unit tested):
 * never more than PARTICLES.sparkles, sizes and distances stay inside the given ranges.
 */
export function burstSpecs(count: number, shape: BurstShape = {}): SparkleSpec[] {
  const n = Math.max(0, Math.min(PARTICLES.sparkles, Math.floor(count)));
  const [a0, a1] = shape.spread ?? [0, 360];
  const [d0, d1] = shape.dist ?? [18, 34];
  const [s0, s1] = shape.size ?? [10, 16];
  const seed = shape.seed ?? 1;
  const full = Math.abs(a1 - a0) >= 360;
  const out: SparkleSpec[] = [];
  for (let i = 0; i < n; i++) {
    const r1 = rand(seed * 31 + i * 7);
    const r2 = rand(seed * 17 + i * 13);
    const r3 = rand(seed * 11 + i * 3);
    const step = full ? (a1 - a0) / n : n > 1 ? (a1 - a0) / (n - 1) : 0;
    const base = n === 1 && !full ? (a0 + a1) / 2 : a0 + step * i + (full ? step / 2 : 0);
    const jitter = (r1 - 0.5) * Math.min(18, Math.abs(step) * 0.5);
    out.push({
      angle: base + jitter,
      dist: d0 + (d1 - d0) * r2,
      size: s0 + (s1 - s0) * r3,
      delay: Math.round((i % 3) * 0.06 * 100) / 100,
      // Mostly gold; every fourth star white, every fifth a sky glint.
      color: i % 5 === 4 ? 'sky' : i % 4 === 3 ? 'white' : 'gold',
    });
  }
  return out;
}

const FILL: Record<SparkleColor, string> = { gold: GOLD_FX.glow, white: '#ffffff', sky: '#bfe5ff' };

/** How much bigger the ink outline star is than the fill (Alex's hand-drawn weight). */
export const INK_OUTLINE = 1.32;

/** A static four-point star: two thin diamonds crossed, a white core. `inked`: all gold with a dark-gold outline. */
export const StarShape = memo(function StarShape({ size, color = 'gold', inked = false }: {
  readonly size: number; readonly color?: SparkleColor; readonly inked?: boolean;
}) {
  const a = size / Math.SQRT2;
  const fill = FILL[inked ? 'gold' : color];
  const core = size * 0.26;
  const ink = a * INK_OUTLINE;
  return (
    <View pointerEvents="none" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {inked && <>
        <View style={{ position: 'absolute', width: ink, height: ink, backgroundColor: BRAND.goldLip, transform: [{ scaleX: 0.44 }, { rotate: '45deg' }] }} />
        <View style={{ position: 'absolute', width: ink, height: ink, backgroundColor: BRAND.goldLip, transform: [{ scaleY: 0.44 }, { rotate: '45deg' }] }} />
      </>}
      <View style={{ position: 'absolute', width: a, height: a, backgroundColor: fill, transform: [{ scaleX: 0.34 }, { rotate: '45deg' }] }} />
      <View style={{ position: 'absolute', width: a, height: a, backgroundColor: fill, transform: [{ scaleY: 0.34 }, { rotate: '45deg' }] }} />
      <View style={{ position: 'absolute', width: core, height: core, backgroundColor: inked || color === 'gold' ? GOLD_FX.core : fill,
        transform: [{ rotate: '45deg' }] }} />
    </View>
  );
});

function Star({ progress, spec, gravity, x, y, inked }: {
  readonly progress: SharedValue<number>; readonly spec: SparkleSpec; readonly gravity: number; readonly x: number; readonly y: number;
  readonly inked: boolean;
}) {
  const rad = (spec.angle * Math.PI) / 180;
  const dx = Math.cos(rad) * spec.dist;
  const dy = Math.sin(rad) * spec.dist;
  const style = useAnimatedStyle(() => {
    const raw = (progress.value - spec.delay) / (1 - spec.delay);
    const p = Math.min(1, Math.max(0, raw));
    if (p <= 0 || p >= 1) return { opacity: 0, transform: [{ scale: 0 }] };
    const out = 1 - (1 - p) * (1 - p) * (1 - p);
    // Pops past full size, then shrinks as it fades: a twinkle, not a dot.
    const scale = p < 0.22 ? 0.3 + (p / 0.22) * 0.95 : 1.25 - (p - 0.22) * 0.9;
    const opacity = p < 0.12 ? p / 0.12 : p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
    return {
      opacity,
      transform: [{ translateX: dx * out }, { translateY: dy * out + gravity * p * p }, { rotate: `${p * 90}deg` }, { scale }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - spec.size / 2, top: y - spec.size / 2 }, style]}>
      <StarShape size={spec.size} color={spec.color} inked={inked} />
    </Animated.View>
  );
}

export interface SparkleBurstProps extends BurstShape {
  /** 0 to 1 over the burst; 0 and 1 draw nothing. */
  readonly progress: SharedValue<number>;
  /** Stars before the power budget (capped at 12). */
  readonly count: number;
  /** Where the burst starts, in this view's parent (pt). */
  readonly x: number;
  readonly y: number;
  /** How far the stars drop by the end (pt). */
  readonly gravity?: number;
  /** Every star gold with a dark-gold ink outline (Alex's hand-drawn weight), for the biggest small moments. */
  readonly inked?: boolean;
}

/** A capped, budgeted one-shot burst. Renders nothing with Reduce Motion or in the background. */
function SparkleBurst({ progress, count, x, y, gravity = 10, spread, dist, size, seed, inked = false }: SparkleBurstProps) {
  const budget = usePowerBudget();
  const reduced = useUiReducedMotion();
  const n = momentParticles(count, budget, reduced);
  const specs = useMemo(() => burstSpecs(n, { spread, dist, size, seed }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, spread?.[0], spread?.[1], dist?.[0], dist?.[1], size?.[0], size?.[1], seed]);
  if (!specs.length) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'visible' }}>
      {specs.map((spec, i) => <Star key={i} progress={progress} spec={spec} gravity={gravity} x={x} y={y} inked={inked} />)}
    </View>
  );
}

export default memo(SparkleBurst);
