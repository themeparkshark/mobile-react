/**
 * One motion language for the whole app: the same timings, curves and springs
 * for every big moment (ride-coin reveal, coin level-up, Set Complete, box and
 * chest openings) and for any sheet or modal that adopts it.
 *
 * Pure data and pure rules (no React, no Reanimated), so it is unit tested
 * (tools/tests/motion-language.test.cjs). The Reanimated curves built from
 * these numbers live in ./motionEasing.ts.
 *
 * Every big moment follows the same four beats:
 *   1. anticipation: the thing gathers (wobble, charge, glow builds)
 *   2. hit-stop: one held frame, a white flash, the haptic
 *   3. burst: gold rays and sparkles bloom, the prize pops past full size
 *   4. settle: it springs back to rest and the label stamps in
 * Then it waits for the kid, or hands off (never a dead hold).
 */

/** Milliseconds. Short names, one meaning each. */
export const DURATION = {
  /** A press: scale down and back. */
  tap: 90,
  /** Small state changes: a chip, a check, a label swap. */
  quick: 160,
  /** Most fades and moves. */
  base: 240,
  /** Sheets and modals coming in. */
  enter: 300,
  /** Sheets and modals going out (exits are faster than entrances). */
  exit: 200,
  /** The held frame before a burst. */
  hitStop: 70,
  /** The white flash on a burst (capped for photosensitivity). */
  flash: 220,
  /** The gold bloom swelling and easing back. */
  bloom: 560,
  /** Sparkles flying out and fading. */
  sparkle: 900,
  /** A number counting up. */
  count: 650,
  /** One full turn of the slow gold rays. */
  raySpin: 16000,
} as const;

/** Cubic bezier control points (x1, y1, x2, y2). */
export const BEZIER = {
  /** Things arriving: fast start, soft landing. */
  out: [0.22, 1, 0.36, 1],
  /** Things leaving: soft start, fast end. */
  in: [0.55, 0, 1, 0.45],
  /** Moves between two places on screen. */
  inOut: [0.65, 0, 0.35, 1],
  /** A charge that speeds up toward the burst. */
  charge: [0.5, 0, 0.9, 0.6],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Reanimated withSpring configs. */
export const SPRING = {
  /** The prize popping past full size and back: lively, one visible overshoot. */
  pop: { damping: 9, stiffness: 220, mass: 1 },
  /** Labels and plates stamping in. */
  stamp: { damping: 11, stiffness: 300, mass: 0.9 },
  /** Settling with no visible wobble (sheets, cards). */
  settle: { damping: 18, stiffness: 200, mass: 1 },
  /** A soft landing for big art (a shark dropping onto the stage). */
  land: { damping: 12, stiffness: 160, mass: 1 },
} as const;

/** The hit-stop flash: never brighter than this (the app's photosensitivity cap, progressionModel FLASH_CAP). */
export const FLASH_MAX_OPACITY = 0.4;

/** How bright the burst flash may be: none with Dim Flashing Lights or Reduce Motion. */
export function flashPeak(dimFlashingLights: boolean, reduced: boolean): number {
  return dimFlashingLights || reduced ? 0 : FLASH_MAX_OPACITY;
}

/** Particle caps. Budgeted further by the power policy (particleScale). */
export const PARTICLES = {
  /** Gold sparkles in a burst. */
  sparkles: 12,
  /** Confetti pieces in a burst. */
  confetti: 28,
} as const;

/** The gold of every big moment (the rays, the glow, the hot core). */
export const GOLD_FX = {
  rays: '#FFC93C',
  raysSoft: '#FFF1B8',
  glow: '#FFD54A',
  core: '#FFFBEA',
} as const;

export type MomentKind = 'coinReveal' | 'coinRepeat' | 'levelUp' | 'setComplete' | 'chest' | 'box';

export interface MomentBeats {
  /** When the burst lands (ms from the start). 0 when reduced. */
  readonly burstAt: number;
  /** Anticipation length (ms). */
  readonly anticipation: number;
  /** When the label stamps in. */
  readonly labelAt: number;
  /** When the moment is fully settled and can hand off or wait for a tap. */
  readonly settledAt: number;
  /** Whether rays may turn and sparkles fly. */
  readonly fx: boolean;
}

/**
 * The beat plan of a moment. Tested caps: the burst always lands inside 1.5 s
 * (the coin level-up charge inside 1.2 s), and everything settles inside 2.6 s.
 * Reduce Motion: no anticipation, no fx, the label is there at once.
 */
export function momentBeats(kind: MomentKind, options: { readonly reduced: boolean }): MomentBeats {
  if (options.reduced) {
    return { burstAt: 0, anticipation: 0, labelAt: 0, settledAt: 400, fx: false };
  }
  const anticipation = ANTICIPATION[kind];
  const burstAt = anticipation + DURATION.hitStop;
  const labelAt = burstAt + 120;
  const settledAt = burstAt + SETTLE[kind];
  return { burstAt, anticipation, labelAt, settledAt, fx: true };
}

const ANTICIPATION: Readonly<Record<MomentKind, number>> = {
  coinReveal: 1150,
  coinRepeat: 160,
  levelUp: 1000,
  setComplete: 380,
  chest: 420,
  box: 900,
};

const SETTLE: Readonly<Record<MomentKind, number>> = {
  coinReveal: 1000,
  coinRepeat: 420,
  levelUp: 900,
  setComplete: 1100,
  chest: 900,
  box: 900,
};

/** Particle count under the power budget: never zero in the foreground, zero when reduced or asleep. */
export function momentParticles(base: number, budget: { readonly particleScale: number; readonly animate: boolean },
  reduced: boolean): number {
  if (reduced || !budget.animate || base <= 0) return 0;
  return Math.max(1, Math.round(Math.min(base, PARTICLES.sparkles * 3) * budget.particleScale));
}

/** May the slow rays turn? Only while ambient loops are allowed (not idle, not reduced, not asleep). */
export function raysMayTurn(budget: { readonly ambient: boolean; readonly animate: boolean }, reduced: boolean): boolean {
  return !reduced && budget.animate && budget.ambient;
}

/**
 * The level-up charge bar: how full it looks at `elapsed` ms. It eases to 85 percent over the charge,
 * then creeps toward 97 percent while a slow server answers (never stuck, never fake-complete).
 */
export function chargeFill(elapsed: number, chargeMs: number): number {
  if (elapsed <= 0) return 0;
  if (elapsed < chargeMs) {
    const t = elapsed / chargeMs;
    return 0.85 * (1 - Math.pow(1 - t, 2));
  }
  const extra = elapsed - chargeMs;
  return Math.min(0.97, 0.85 + 0.12 * (1 - Math.exp(-extra / 1500)));
}
