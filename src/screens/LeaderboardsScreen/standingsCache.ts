/**
 * The standings tabs keep their last board in module caches so tab switches are
 * instant. A won coin changes Park Coins and XP standings, so a win bumps this
 * generation and the next visit refetches instead of showing the board from
 * before the win (QA P2-6: "Nobody has earned coins at this park yet" right
 * after a win).
 */
let generation = 0;

export function markStandingsStale(): void {
  generation += 1;
}

export function standingsGeneration(): number {
  return generation;
}

/**
 * Sign-out and account switches end the Standings session: every cached
 * board (friends' photos included) is dropped before the next player sees
 * the screen. Kept here, dependency free, so AuthProvider can call it.
 */
let session = 0;

export function endStandingsSession(): void {
  session += 1;
  generation += 1;
}

export function standingsSession(): number {
  return session;
}
