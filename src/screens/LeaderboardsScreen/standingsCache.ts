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
