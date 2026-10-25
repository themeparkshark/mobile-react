/**
 * "First coin today!": the first real coin a player collects on a local day
 * gets its own little crown (pure rules, unit tested in
 * tools/tests/first-coin-today.test.cjs). Honest: only a real collection
 * counts, once per player per local day, and a new day starts fresh.
 */

/**
 * The ribbon's beat sheet (ms from the moment the coin leaves the map). One
 * continuous throw: the ribbon is already sliding down while the coin flies,
 * the crown slams onto the coin on the very frame it lands in the slot (the
 * golden buzz, the sting, a held squash of the coin and the ribbon), the rings
 * burst, and when the ribbon leaves the coin hops out and flies home.
 */
export const FIRST_COIN = {
  /** A warm gold band sweeps the screen left to right. */
  sweepMs: 600,
  sweepOpacity: 0.18,
  /** The ribbon slides down below the HUD rows (SPRING.settle) with Finn's cheer, at once. */
  ribbonAt: 0,
  /** The coin flies up from the map into the ribbon's coin slot with a gold trail... */
  coinFlyAt: 40,
  coinFlyMs: 440,
  /** ...and the crown drops (a 120 ms slam) so it hits on the coin's landing frame. */
  crownAt: 40 + 440 - 120,
  /** The ribbon sits this far below the top of the map (clear of Ride Control and the Adventure chip). */
  topOffset: 150,
  /** Two sparkle rings around the ribbon's coin, 12 each (capped by momentParticles), on the impact frame. */
  sparkleAt: 480,
  /** The slam's gold ring starts this wide (pt radius) and about doubles: wider than the ribbon is tall. */
  ringPt: 52,
  /** The ribbon kicks down this far on the held slam frame. */
  kickPt: 6,
  sparkleWaveMs: 160,
  sparkles: 12,
  /** A white shine runs across the ribbon after the rings (no still frame between the burst and the flight home). */
  shineAt: 960,
  shineMs: 420,
  /** Finn pumps his fist a second time while the shine runs. */
  pumpAt: 1120,
  /** The ribbon leaves at this time (slides up, faster than it came)... */
  exitAt: 1560,
  exitMs: 200,
  /** ...and the crowned coin hops out of its slot and flies home, 2.5x big at its peak, with a gold trail. */
  homeAt: 1480,
  homeMs: 420,
  homePeak: 2.5,
  /** The ribbon ends left of the map's right rail (its pins stay visible). */
  railClear: 62,
  /** Wave 5 round 2: the fan holds full strength for the hit-stop, then eases down to this over fanFadeMs and rides out with the ribbon. */
  fanHoldMs: 70,
  fanFadeMs: 400,
  fanRest: 0.45,
  /** The whole layer kicks this far on the slam frame (full power only, never with Reduce Motion). */
  screenKickPt: 3,
} as const;

export type FirstCoinPlan = { readonly [K in keyof typeof FIRST_COIN]: number };

/**
 * After the first few days a regular player has seen the full ribbon many times: from the fourth celebrated day the
 * crown still slams with its fan and rings, and the coin goes straight home (no sunrise band, no shine, no second
 * fist pump), all in about 1.1 s. Same honesty rule: only the real first coin of the day.
 */
export const FIRST_COIN_SHORT: FirstCoinPlan = {
  ...FIRST_COIN,
  sweepMs: 0,
  coinFlyAt: 20,
  coinFlyMs: 340,
  crownAt: 20 + 340 - 120,
  sparkleAt: 360,
  shineAt: 99_999,
  pumpAt: 99_999,
  exitAt: 700,
  exitMs: 180,
  homeAt: 640,
  homeMs: 380,
};

/** The full ribbon plays on the first FULL_DAYS celebrated days; after that the short one. */
export const FIRST_COIN_FULL_DAYS = 3;

/** Which ribbon a first coin gets, from how many days (this one included) have had one. */
export function firstCoinVariant(daysCelebrated: number): 'full' | 'short' {
  return Number.isFinite(daysCelebrated) && daysCelebrated > FIRST_COIN_FULL_DAYS ? 'short' : 'full';
}

/** The impact frame: the coin lands in the slot and the crown hits. */
export function firstCoinImpactAt(plan: FirstCoinPlan = FIRST_COIN): number {
  return plan.coinFlyAt + plan.coinFlyMs;
}

/** When the whole ribbon is gone. */
export function firstCoinEndsAt(plan: FirstCoinPlan = FIRST_COIN): number {
  return Math.max(plan.exitAt + plan.exitMs, plan.homeAt + plan.homeMs);
}

/** Is this collection the first of the day? (stored = the last day a first coin was celebrated) */
export function isFirstCoinToday(stored: string | null | undefined, today: string): boolean {
  return !!today && stored !== today;
}
