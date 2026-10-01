/**
 * How much ambient life the game map may run. Pure rules, unit tested.
 *
 * The map runs all day in a park, so every moving thing on it is budgeted:
 *  - `full`: the whole living map. Its ambient clock ticks at 30 Hz: every
 *    idle loop is slow (bobs, glows, drifting clouds), so 30 updates a second
 *    looks the same while halving the UI-thread work for up to 120 sprites,
 *    all day, in the heat. The shark, camera and every tap response still run
 *    at the display rate; they never read this clock.
 *  - `lite`: fewer sprites on a 30 Hz clock, chosen automatically when the
 *    phone starts dropping frames (a hot phone, Low Power Mode throttling).
 *  - `calm`: nothing moves. Reduce Motion always lands here; so does a phone
 *    that keeps struggling even on `lite` (it probes back up after a while).
 */

export type AliveTier = 'full' | 'lite' | 'calm';

export interface AliveCaps {
  /** Ambient clock rate. 0 freezes every ambient loop. */
  readonly hz: 0 | 30 | 60;
  /** Drifting cloud shadows (screen space). */
  readonly clouds: number;
  /** Birds in a passing flock. */
  readonly birds: number;
  /** Fireflies around the shark after dark. */
  readonly fireflies: number;
  /** Sun glints on water (map anchored). */
  readonly waterGlints: number;
  /** Ride islands whose wait glow breathes; the rest hold a still glow. */
  readonly pulsingRides: number;
  /** Floating coins that bob, glint and cast a shadow. */
  readonly idleCoins: number;
  /** Limited coins with the moving shimmer (others keep a still halo). */
  readonly limitedShimmer: number;
  /** Sleeping "z" drifting over closed rides. */
  readonly sleepyRides: number;
  /** Sparkles left behind the walking shark. */
  readonly trail: number;
  /** Fireworks bursts on screen at once during the night sky show. */
  readonly skyShowBursts: number;
  /** Sparks per firework burst. */
  readonly sparksPerBurst: number;
  /** Friends drawn as ghost sharks. */
  readonly ghosts: number;
}

export const ALIVE_CAPS: Readonly<Record<AliveTier, AliveCaps>> = {
  full: { hz: 30, clouds: 3, birds: 3, fireflies: 6, waterGlints: 6, pulsingRides: 10, idleCoins: 4,
    limitedShimmer: 4, sleepyRides: 3, trail: 8, skyShowBursts: 4, sparksPerBurst: 14, ghosts: 5 },
  lite: { hz: 30, clouds: 2, birds: 2, fireflies: 3, waterGlints: 3, pulsingRides: 4, idleCoins: 3,
    limitedShimmer: 2, sleepyRides: 2, trail: 5, skyShowBursts: 3, sparksPerBurst: 10, ghosts: 3 },
  calm: { hz: 0, clouds: 0, birds: 0, fireflies: 0, waterGlints: 0, pulsingRides: 0, idleCoins: 0,
    limitedShimmer: 0, sleepyRides: 0, trail: 0, skyShowBursts: 0, sparksPerBurst: 0, ghosts: 5 },
};

/** Hard ceiling on independently animated ambient sprites, whatever the tier. */
export const MAX_AMBIENT_SPRITES = 120;

/**
 * Worst case number of moving ambient sprites a tier can put on screen at once
 * (each island effect counts its sprites). Daytime life (clouds, gulls, sun
 * glints) and night life (fireflies, the night show) never run together, so
 * only the bigger of the two counts. Tests hold every tier under
 * MAX_AMBIENT_SPRITES so a crowded park never turns into a particle storm.
 */
export function ambientSpriteBudget(caps: AliveCaps): number {
  const day = caps.clouds * 3 + caps.birds * 2 + caps.waterGlints;
  const night = caps.fireflies + caps.skyShowBursts * caps.sparksPerBurst;
  return Math.max(day, night) + caps.pulsingRides + caps.idleCoins * 3 + caps.limitedShimmer * 3 +
    caps.sleepyRides * 3 + caps.trail + (caps.hz ? caps.ghosts : 0);
}

/** Frame governor state: strain 0 = healthy, 1 = lite, 2 = calm (probing back after a rest). */
export interface FrameGovernor {
  readonly strain: 0 | 1 | 2;
  readonly slow: number;
  readonly healthy: number;
  /** When strain reached 2 (ms), so the governor can probe `lite` again. */
  readonly calmSince: number | null;
}

export const GOVERNOR_START: FrameGovernor = { strain: 0, slow: 0, healthy: 0, calmSince: null };

/** UI-thread frame interval (ms) averaged over a ~2 s window. */
export const SLOW_FRAME_MS = 22; // under ~45 fps
export const JANK_FRAME_MS = 32; // under ~30 fps: even lite is too much
export const HEALTHY_FRAME_MS = 18.5; // a steady 60 (or better)
const SLOW_WINDOWS = 2;
const HEALTHY_WINDOWS = 15; // ~30 s of smooth frames before stepping back up
export const CALM_PROBE_MS = 90_000;

/** Feed one measured window; sustained slow frames step down, a long smooth stretch steps up. */
export function governFrames(state: FrameGovernor, windowAvgMs: number, now: number): FrameGovernor {
  if (!Number.isFinite(windowAvgMs) || windowAvgMs <= 0) return state;
  if (windowAvgMs > SLOW_FRAME_MS) {
    const slow = state.slow + 1;
    if (slow < SLOW_WINDOWS) return { ...state, slow, healthy: 0 };
    // One tier at a time. From lite, only real jank (under ~30 fps) goes calm:
    // a map that is merely busy at ~40 fps is not our ambient life's doing.
    if (state.strain === 0) return { strain: 1, slow: 0, healthy: 0, calmSince: null };
    if (state.strain === 1 && windowAvgMs > JANK_FRAME_MS) return { strain: 2, slow: 0, healthy: 0, calmSince: now };
    return { ...state, slow: 0, healthy: 0 };
  }
  if (windowAvgMs < HEALTHY_FRAME_MS) {
    const healthy = state.healthy + 1;
    if (healthy < HEALTHY_WINDOWS || state.strain === 0) return { ...state, slow: 0, healthy };
    const strain = (state.strain - 1) as 0 | 1;
    return { strain, slow: 0, healthy: 0, calmSince: null };
  }
  return { ...state, slow: 0 };
}

/** Calm stops the ambient clock, so nothing gets measured: after a rest, try `lite` again. */
export function governIdle(state: FrameGovernor, now: number): FrameGovernor {
  if (state.strain === 2 && state.calmSince !== null && now - state.calmSince >= CALM_PROBE_MS) {
    return { strain: 1, slow: 0, healthy: 0, calmSince: null };
  }
  return state;
}

export function aliveTier({ reducedMotion, strain }: { reducedMotion: boolean; strain: 0 | 1 | 2 }): AliveTier {
  if (reducedMotion || strain === 2) return 'calm';
  return strain === 1 ? 'lite' : 'full';
}

/**
 * The highest rank any island budget can reach. Ranks past it all behave the
 * same, so the map clamps them here: walking past distant islands reorders
 * their ranks constantly, and an unclamped rank re-rendered every far island
 * on every GPS step.
 */
export const ALIVE_RANK_LIMIT = Math.max(...(['full', 'lite', 'calm'] as const).flatMap(tier => {
  const caps = ALIVE_CAPS[tier];
  return [caps.pulsingRides, caps.idleCoins, caps.limitedShimmer, caps.sleepyRides];
}));

/** An island's rank as markers need it: exact inside every budget, one value beyond. */
export function clampAliveRank(rank: number | undefined): number | undefined {
  return rank === undefined ? undefined : Math.min(rank, ALIVE_RANK_LIMIT);
}

/** Only the nearest few islands spend animation; `rank` is the island's distance order (0 = nearest). */
export function withinBudget(rank: number | undefined, cap: number): boolean {
  return cap > 0 && (rank ?? 0) < cap;
}

/**
 * Deterministic 0..1 noise for a seed, usable in worklets (no Math.random, so
 * a flock or a glint replays the same way for the same seed).
 */
export function hash01(seed: number): number {
  'worklet';
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Grace for frame jitter: a 60 Hz display still lands every second frame at 30 Hz. */
export const CLOCK_STEP_GRACE_S = 0.002;

/**
 * Whether the ambient clock advances on this frame, given the seconds since
 * its last update and the seconds per update (1 / hz). Time based, so the rate
 * holds on a 120 Hz ProMotion display as well as at 60 Hz. Runs on the UI thread.
 */
export function clockStepDue(sinceS: number, stepS: number): boolean {
  'worklet';
  return stepS > 0 && sinceS + CLOCK_STEP_GRACE_S >= stepS;
}
