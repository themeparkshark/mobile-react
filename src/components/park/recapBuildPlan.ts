/**
 * The park day recap build's beat sheet (ms from the card's first load), pure
 * so it is unit tested (tools/tests/park-day-recap-build.test.cjs).
 * Sky 0 to 900, title stamp at 300, a stat every 280 ms from 600 (pop, then a
 * 650 ms count), the polaroid after the last stat, the closing stamp last.
 * Everything has landed inside 3.5 s; a tap skips to the end.
 */
export const RECAP_BUILD = {
  skyMs: 900,
  titleAt: 300,
  firstStatAt: 600,
  statStepMs: 280,
  stats: 3,
  countMs: 650,
  polaroidAt: 600 + 3 * 280,
  stampAt: 600 + 3 * 280 + 420,
} as const;

/** When stat `index` pops in. */
export function recapStatAt(index: number): number {
  return RECAP_BUILD.firstStatAt + Math.max(0, Math.floor(index)) * RECAP_BUILD.statStepMs;
}

/** When the whole build has settled (the closing stamp's spring included). */
export function recapSettledAt(): number {
  return Math.max(recapStatAt(RECAP_BUILD.stats - 1) + RECAP_BUILD.countMs, RECAP_BUILD.stampAt + 120 + 400);
}

/** The best coin of the day for the polaroid: a new coin first, else the first coin. */
export function bestCoin<T extends { readonly new?: boolean; readonly coin_url?: string | null }>(coins: readonly T[] | null | undefined): T | null {
  const usable = (coins ?? []).filter(coin => !!coin.coin_url);
  return usable.find(coin => coin.new) ?? usable[0] ?? null;
}
