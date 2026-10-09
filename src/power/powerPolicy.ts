/**
 * The app-wide power budget. Pure rules, unit tested.
 *
 * The game runs all day in a hot park with GPS on. Features never turn off to
 * save battery; they rest when nobody can see them and get cheaper when the
 * phone asks us to be gentle. Every feature reads one budget (usePowerBudget)
 * instead of inventing its own rules.
 *
 * Levels, from most to least work:
 *  - `full`  normal play. Everything runs exactly as designed.
 *  - `calm`  the player is idle (no touch for a while) or Battery Saver is on.
 *            Ambient loops (idle bobs, shimmer, background particles) rest on
 *            their resting frame, polls run slower, particles are halved.
 *            Anything the player taps wakes it at once.
 *  - `sleep` the app is in the background. Nothing animates, polls pause
 *            (except ones that ask for a background rate), the compass stops.
 *
 * Reduce Motion is an accessibility choice, not a power level: it only stops
 * ambient loops, it does not slow data.
 *
 * Low Power Mode: iOS exposes it only through a native module this OTA line
 * cannot add (no expo-battery in the binary), so `lowPower` comes from the
 * in-app Battery Saver switch. When a binary with expo-battery ships, feed
 * its value into the same input and nothing else changes.
 */

export type PowerLevel = 'full' | 'calm' | 'sleep';

export interface PowerInputs {
  /** App in the foreground ('inactive' banners count as foreground). */
  readonly appActive: boolean;
  /** No touch anywhere in the app for IDLE_AFTER_MS. */
  readonly idle: boolean;
  /** No real movement for STATIONARY_AFTER_MS (from published GPS fixes). */
  readonly stationary: boolean;
  /** Battery Saver on (in-app switch, or OS Low Power Mode when readable). */
  readonly lowPower: boolean;
  /** OS Reduce Motion. */
  readonly reduceMotion: boolean;
}

export interface PowerBudget {
  readonly level: PowerLevel;
  /** Ambient, decorative loops may run. Feedback animations (taps, rewards) always run. */
  readonly ambient: boolean;
  /** Anything may animate at all (false only in the background). */
  readonly animate: boolean;
  /** Multiply poll intervals by this. Infinity means paused. */
  readonly pollMultiplier: number;
  /** Scale particle counts by this (0..1). */
  readonly particleScale: number;
  /** Battery Saver: GPS may use Balanced accuracy where no queue is tracked. */
  readonly gpsRest: boolean;
  /** Compass (heading) may run. */
  readonly compass: boolean;
  readonly lowPower: boolean;
  readonly idle: boolean;
  readonly stationary: boolean;
}

/** No touch for this long counts as idle: the app's one idle constant (useUserIdle). */
export const IDLE_AFTER_MS = 2 * 60_000;
/** No fix past the jitter filter for this long counts as standing still (in line, on a bench). */
export const STATIONARY_AFTER_MS = 90_000;

export const FULL_BUDGET: PowerBudget = {
  level: 'full', ambient: true, animate: true, pollMultiplier: 1, particleScale: 1,
  gpsRest: false, compass: true, lowPower: false, idle: false, stationary: false,
};

export function powerLevel(input: PowerInputs): PowerLevel {
  if (!input.appActive) return 'sleep';
  if (input.idle || input.lowPower) return 'calm';
  return 'full';
}

export function powerBudget(input: PowerInputs): PowerBudget {
  const level = powerLevel(input);
  const common = { lowPower: input.lowPower, idle: input.idle, stationary: input.stationary };
  if (level === 'sleep') {
    return { ...common, level, ambient: false, animate: false, pollMultiplier: Infinity,
      particleScale: 0, gpsRest: true, compass: false };
  }
  if (level === 'calm') {
    // Saver on while the player is actively playing: keep loops (feature not
    // degraded), but slow data and thin particles. Idle: rest the loops too.
    const ambient = !input.reduceMotion && !input.idle;
    return { ...common, level, ambient, animate: true,
      pollMultiplier: input.lowPower && input.idle ? 3 : 2,
      particleScale: 0.5,
      gpsRest: input.lowPower,
      compass: true };
  }
  return { ...common, level, ambient: !input.reduceMotion, animate: true, pollMultiplier: 1,
    particleScale: 1, gpsRest: false, compass: true };
}

/** A poll interval under the budget, or null while paused. */
export function budgetedInterval(baseMs: number, budget: Pick<PowerBudget, 'pollMultiplier'>): number | null {
  if (!(baseMs > 0)) return null;
  if (!Number.isFinite(budget.pollMultiplier)) return null;
  return Math.round(baseMs * Math.max(1, budget.pollMultiplier));
}

/** A particle count under the budget. Never drops a requested burst to zero in the foreground. */
export function budgetedParticles(count: number, budget: Pick<PowerBudget, 'particleScale' | 'animate'>): number {
  if (!budget.animate || count <= 0) return 0;
  return Math.max(1, Math.round(count * budget.particleScale));
}

/**
 * Standing still: the jitter filter publishes nothing while you stand, so the
 * last published fix age is the signal. Unknown (no fix yet) is not still.
 */
export function isStationary(lastMoveAt: number | null, now: number, afterMs = STATIONARY_AFTER_MS): boolean {
  if (lastMoveAt === null || !Number.isFinite(lastMoveAt)) return false;
  return now - lastMoveAt >= afterMs;
}
