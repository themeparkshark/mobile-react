/**
 * The park day moments' animation builders, with one dev-only capture aid:
 * EXPO_PUBLIC_MOMENT_SLOWMO=<n> (dev builds only) plays every park day moment
 * n times slower, so a starved simulator under heavy host load still records
 * enough frames; the clip is then sped back up n times (ffmpeg setpts) to show
 * the real timing. Durations and delays scale by n, springs by physics
 * (stiffness / n^2, damping / n: the same curve, n times longer). In every
 * other build the factor is 1 and these are Reanimated's own builders.
 */
import {
  withDelay as rWithDelay, withSequence, withSpring as rWithSpring, withTiming as rWithTiming,
  type AnimationCallback, type ReduceMotion, type WithSpringConfig, type WithTimingConfig,
} from 'react-native-reanimated';

const raw = __DEV__ ? Number(process.env.EXPO_PUBLIC_MOMENT_SLOWMO ?? '1') : 1;
/** The capture slow-motion factor (1 outside dev captures). */
export const MOMENT_SLOW = Number.isFinite(raw) && raw >= 1 && raw <= 60 ? raw : 1;

/** A JS timer length in moment time (safety timers must not cut a slowed capture short). */
export function momentMs(ms: number): number {
  return ms * MOMENT_SLOW;
}

export function withTiming<T extends number>(to: T, config?: WithTimingConfig, callback?: AnimationCallback): T {
  'worklet';
  if (MOMENT_SLOW === 1) return rWithTiming(to, config, callback);
  return rWithTiming(to, { ...(config ?? {}), duration: (config?.duration ?? 300) * MOMENT_SLOW }, callback);
}

export function withDelay<T extends number>(ms: number, animation: T, reduceMotion?: ReduceMotion): T {
  'worklet';
  return rWithDelay(ms * MOMENT_SLOW, animation, reduceMotion);
}

export function withSpring<T extends number>(to: T, config?: WithSpringConfig, callback?: AnimationCallback): T {
  'worklet';
  if (MOMENT_SLOW === 1 || !config) return rWithSpring(to, config, callback);
  const s = MOMENT_SLOW;
  const scaled = { ...config } as Record<string, unknown>;
  if (typeof config.stiffness === 'number') scaled.stiffness = config.stiffness / (s * s);
  if ('damping' in config && typeof config.damping === 'number') scaled.damping = config.damping / s;
  if ('duration' in config && typeof config.duration === 'number') scaled.duration = config.duration * s;
  return rWithSpring(to, scaled as WithSpringConfig, callback);
}

export { withSequence };
