/**
 * The launch tip picker (fix w3 T135), kept free of React and imports so Splash and Loading share it.
 * Before a player has won a coin, the tip is about the first minute (pick any coin, walk there,
 * PLAY!) or a shark fact, never levels, Ride Parts, Energy, LinePlay or sets they have not met yet.
 */
export const LATER_TIP = /\blevel up\b|\bRide Parts?\b|\bEnergy\b|\bcollection set\b|\bLinePlay\b|\bTap GO\b|\bSecret coins\b/i;
export const FIRST_MINUTE_TIPS: readonly string[] = [
  'Every ride has a coin. Pick any one, walk there, tap PLAY!',
  'Bigger rides cost more Tickets. Every coin is yours to pick.',
];

/** The tips this player can use now: first-minute ones until the first coin win. */
export function launchFactPool(facts: readonly string[] | null | undefined, wins?: number | null): string[] {
  const all = (facts ?? []).filter((f): f is string => typeof f === 'string' && f.trim().length > 0);
  if (Number(wins) > 0) return all;
  return [...FIRST_MINUTE_TIPS, ...all.filter(f => !LATER_TIP.test(f) && !FIRST_MINUTE_TIPS.includes(f))];
}

export function pickLaunchFact(facts: readonly string[] | null | undefined, wins?: number | null, random: () => number = Math.random): string | null {
  const pool = launchFactPool(facts, wins);
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : null;
}
