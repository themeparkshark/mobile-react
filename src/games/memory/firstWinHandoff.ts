/**
 * The first-win coin hand-off. Finn's first-win card remembers where its gold
 * coin sits on screen when the kid taps CONTINUE, and the guest shelf step
 * starts its flying coin from that exact spot and size, so it reads as the
 * same coin travelling onto the shelf (not a new coin on a new screen).
 * In memory only; a spot older than a few seconds is ignored.
 */
export type CoinSpot = { x: number; y: number; size: number };

let spot: (CoinSpot & { at: number }) | null = null;

export function setFirstWinCoinSpot(next: CoinSpot): void {
  spot = { ...next, at: Date.now() };
}

/** The remembered spot (once), or null when there is none or it is stale. */
export function takeFirstWinCoinSpot(maxAgeMs = 4000, now = Date.now()): CoinSpot | null {
  const s = spot;
  spot = null;
  if (!s || now - s.at > maxAgeMs || !(s.size > 0)) return null;
  return { x: s.x, y: s.y, size: s.size };
}
