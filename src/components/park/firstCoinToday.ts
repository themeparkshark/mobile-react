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
  sparkleWaveMs: 160,
  sparkles: 12,
  /** The ribbon leaves at this time (slides up, faster than it came)... */
  exitAt: 2000,
  exitMs: 200,
  /** ...and the crowned coin hops out of its slot and flies home (the shelf button) as it goes. */
  homeAt: 1920,
  homeMs: 380,
} as const;

/** The impact frame: the coin lands in the slot and the crown hits. */
export function firstCoinImpactAt(): number {
  return FIRST_COIN.coinFlyAt + FIRST_COIN.coinFlyMs;
}

/** When the whole ribbon is gone. */
export function firstCoinEndsAt(): number {
  return Math.max(FIRST_COIN.exitAt + FIRST_COIN.exitMs, FIRST_COIN.homeAt + FIRST_COIN.homeMs);
}

/** Is this collection the first of the day? (stored = the last day a first coin was celebrated) */
export function isFirstCoinToday(stored: string | null | undefined, today: string): boolean {
  return !!today && stored !== today;
}
