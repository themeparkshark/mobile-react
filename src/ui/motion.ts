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
  /** A big label slamming down from oversize (a serial stamp): accelerates into the hit, lands on a known frame. */
  slam: 120,
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
  /** One loop of the resting twinkles around a gold pin (each star winks once per loop). */
  twinkle: 2400,
  /** The gap between glints sweeping a gold pin while it rests on screen. */
  glintGap: 1600,
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

/** How bouncy a spring is: 1 is critical (no overshoot), below about 0.5 visibly wobbles. */
export function dampingRatio(spring: { readonly damping: number; readonly stiffness: number; readonly mass: number }): number {
  return spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
}

/** The squash a slammed label shows on impact (fraction of its size). Kept small so it reads as weight, not a glitch. */
export const SLAM_SQUASH = 0.07;

/** The hit-stop flash: never brighter than this (the app's photosensitivity cap, progressionModel FLASH_CAP). */
export const FLASH_MAX_OPACITY = 0.4;

/** How bright the burst flash may be: none with Dim Flashing Lights or Reduce Motion. */
export function flashPeak(dimFlashingLights: boolean, reduced: boolean): number {
  return dimFlashingLights || reduced ? 0 : FLASH_MAX_OPACITY;
}

/** The slow ray turn starts only once the gold is at least this visible (and stops below it). */
export const RAY_TURN_FROM = 0.05;

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

export type MomentKind = 'coinReveal' | 'coinRepeat' | 'levelUp' | 'setComplete' | 'chest' | 'box' | 'chaser';

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
  // The stage pops, then each set piece snaps onto the shark before the bloom.
  setComplete: 900,
  chest: 420,
  box: 900,
  // The rarest pull waits longest: three rattles with light leaking from the lid.
  chaser: 1350,
};

const SETTLE: Readonly<Record<MomentKind, number>> = {
  coinReveal: 1000,
  coinRepeat: 420,
  levelUp: 900,
  setComplete: 1100,
  chest: 900,
  box: 900,
  chaser: 1100,
};

/**
 * When each set piece snaps onto the shark during the Set Complete anticipation (ms from the start).
 * The first lands after the stage pop, the last a beat before the burst; at most 6 get their own snap.
 */
export function pieceSnapTimes(count: number, beats: Pick<MomentBeats, 'anticipation' | 'fx'>): number[] {
  const n = Math.max(0, Math.min(6, Math.floor(count)));
  if (n === 0 || !beats.fx) return [];
  const first = 260;
  const last = Math.max(first, beats.anticipation - 140);
  if (n === 1) return [Math.round((first + last) / 2)];
  return Array.from({ length: n }, (_, i) => Math.round(first + ((last - first) * i) / (n - 1)));
}

/**
 * The chaser's three rattles before the lid gives (ms from the start, each one stronger).
 * Fits inside the chaser anticipation with a held beat before the burst.
 */
export function chaserRattles(beats: Pick<MomentBeats, 'anticipation' | 'fx'>): readonly { readonly at: number; readonly deg: number }[] {
  if (!beats.fx) return [];
  const gap = Math.round((beats.anticipation - 200) / 3);
  return [0, 1, 2].map(i => ({ at: i * gap, deg: 8 + i * 5 }));
}

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

/** A slow server: the level-up label switches to "Almost there!" this long after the tap (the charge ends at 0.9 s). */
export const SLOW_SERVER_LABEL_MS = 1600;

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

export interface LevelUpPayoff {
  /** The big fan behind the card at the burst (GoldBurst amount). */
  readonly fanPeak: number;
  /** How much of that fan stays lit behind the card while the kid reads it. */
  readonly fanHold: number;
  /** The fan's size in screen widths: a bigger tier throws rays further past the card's edges. */
  readonly fanScale: number;
  /** How far the tier ring pulses out (1 + this, times its 132 pt start). */
  readonly ringReach: number;
  /** The tier ring's band width (pt). */
  readonly ringWidth: number;
  /** One sparkle wave, or a second wider one for the top tiers. */
  readonly sparkleWaves: 1 | 2;
  /** Sparkles per wave before the power budget (momentParticles caps it again). */
  readonly sparkles: number;
}

/**
 * The level-up payoff grows with the tier, so a kid can rank Silver, Gold, Prismatic and Legendary
 * at a glance, with no reading: a bigger fan that stays lit, a wider and thicker ring, more sparkles,
 * and from Legendary (Level 5) up a second sparkle wave. Every field only grows with the level (tested).
 */
export function levelUpPayoff(level: number): LevelUpPayoff {
  const lv = Math.max(2, Math.min(10, Math.round(level)));
  const top = lv >= 5;
  return {
    fanPeak: top ? 1 : 0.7 + 0.075 * (lv - 1),
    fanHold: top ? 0.85 : 0.3 + 0.1 * (lv - 2),
    fanScale: top ? 2.4 : 1.5 + 0.2 * (lv - 2),
    ringReach: 0.6 + 0.15 * Math.min(lv, 6),
    ringWidth: 4 + Math.min(lv, 7),
    sparkleWaves: top ? 2 : 1,
    sparkles: Math.round(PARTICLES.sparkles * (0.5 + 0.125 * Math.min(lv, 6))),
  };
}

/* ---------------------------------------------------------------------------
 * App-wide small moments (wow-ui, Oct 24). Shared by every wow lane: buttons,
 * tabs, lists, ambient loops, HUD counters, screen kicks and rolling numbers.
 * Small moments are two beats: press, then the release spring.
 * ------------------------------------------------------------------------- */

/** One squishy press for every tappable thing. */
export const PRESS = {
  /** How small a button gets under the finger. */
  scale: 0.94,
  /** The subtle press for long lists and big cards (no travel). */
  subtleScale: 0.97,
  /** Press-in time (ms), eased out so it answers on the next frame. */
  inMs: 70,
  /** How far the button sinks into its shadow (pt). */
  sinkPt: 1.5,
  /** The release spring: one small overshoot (about 1.03) and rest. */
  spring: { damping: 12, stiffness: 420, mass: 0.8 },
  /** The overshoot the release spring shows past rest. */
  overshoot: 1.03,
  /** A disabled tap shakes side to side this far (pt) over shakeMs. */
  shakePt: 3,
  shakeMs: 200,
  /** Reduce Motion: no scale, a dim on press instead. */
  reducedOpacity: 0.85,
} as const;

/** Lists arriving one row after another, only the first time. */
export const STAGGER = {
  /** Gap between rows (ms). */
  stepMs: 35,
  /** Only this many rows animate; the rest are simply there. */
  maxItems: 8,
  /** The whole stagger never runs longer than this (ms). */
  capMs: 400,
  /** How far each row rises into place (pt). */
  risePt: 12,
} as const;

/** Ambient life: breathing, bobbing, shimmers and glints. Always through the power budget. */
export const AMBIENT = {
  /** One breath in and out (ms). */
  breathMs: 2400,
  /** One bob up and down (ms). */
  bobMs: 3200,
  /** A shimmer sweep waits a random time inside this range (ms). */
  shimmerEveryMs: [8000, 12000] as const,
  /** One glint sweep (ms). */
  glintMs: 3000,
  /** Ambient sprites on screen at once, before particleScale. */
  maxSprites: 12,
} as const;

/** A HUD counter bumping when something lands in it. */
export const HUD_BUMP = {
  peak: 1.22,
  spring: SPRING.stamp,
} as const;

/** The screen kick on a hit. None while walking, in calm power or with Reduce Motion. */
export const KICK = {
  maxPt: 4,
  ms: 120,
} as const;

/** Numbers rolling up instead of jumping. */
export const COUNT = {
  ms: DURATION.count,
  /** At most this many tick sounds in one roll. */
  maxTicks: 12,
  /** The last digit lands with this bump. */
  finalBump: 1.12,
  /** Each digit column starts this much after the one to its right (ms). */
  digitStaggerMs: 30,
} as const;

/**
 * When row `index` of `count` starts in a first-mount stagger (ms), or null when it should simply be there.
 * The step shrinks for long lists so the last animated row still finishes inside STAGGER.capMs.
 */
export function staggerDelay(index: number, count: number = STAGGER.maxItems): number | null {
  if (!Number.isFinite(index) || index < 0 || index >= STAGGER.maxItems) return null;
  const animated = Math.max(1, Math.min(STAGGER.maxItems, Math.floor(count)));
  if (index >= animated) return null;
  const room = STAGGER.capMs - DURATION.base;
  const step = animated > 1 ? Math.min(STAGGER.stepMs, room / (animated - 1)) : 0;
  return Math.round(Math.floor(index) * step);
}

/** How many tick sounds a roll from `from` to `to` plays: one per step up to the cap, none when it goes down. */
export function countTicks(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.min(COUNT.maxTicks, Math.max(1, Math.round(to - from)));
}
