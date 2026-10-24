/**
 * "First coin today!": the first real coin a player collects on a local day
 * gets its own little crown (pure rules, unit tested in
 * tools/tests/first-coin-today.test.cjs). Honest: only a real collection
 * counts, once per player per local day, and a new day starts fresh.
 */

/** The ribbon's beat sheet (ms from the moment the catch hands off). */
export const FIRST_COIN = {
  /** A warm gold band sweeps the screen left to right. */
  sweepMs: 600,
  sweepOpacity: 0.18,
  /** The ribbon slides down below the HUD rows (SPRING.settle) with Finn's cheer. */
  ribbonAt: 100,
  /** The coin you just caught flies up from the map into the ribbon's coin slot... */
  coinFlyAt: 120,
  coinFlyMs: 420,
  /** ...lands with a held frame, then the crown drops onto it with a stamp squash. */
  crownAt: 600,
  /** The ribbon sits this far below the top of the map (clear of Ride Control and the Adventure chip). */
  topOffset: 150,
  /** Two sparkle rings around the ribbon's coin, 12 each (capped by momentParticles). */
  sparkleAt: 540,
  sparkleWaveMs: 160,
  sparkles: 12,
  /** The ribbon stays this long, then slides up (exits faster than entrances). */
  holdMs: 1800,
  exitMs: 200,
} as const;

/** When the whole ribbon is gone. */
export function firstCoinEndsAt(): number {
  return FIRST_COIN.ribbonAt + 300 + FIRST_COIN.holdMs + FIRST_COIN.exitMs;
}

/** Is this collection the first of the day? (stored = the last day a first coin was celebrated) */
export function isFirstCoinToday(stored: string | null | undefined, today: string): boolean {
  return !!today && stored !== today;
}
