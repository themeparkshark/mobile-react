/**
 * One park, one truth. The big X/Y counts every permanent coin here: rides
 * plus shows and famous sights. The Ride Passport is the rides-only part of
 * that same shelf, so the chips split the total into parts that add back up
 * (RIDES 9/25 + SIGHTS 6/10 = 15/35) instead of showing a second total.
 */
export function parkCoinParts(collected: number, available: number,
  passportCollected: number | undefined, passportAvailable: number | undefined) {
  if (typeof passportAvailable !== 'number' || passportAvailable <= 0 || available <= 0) return null;
  const rides = { collected: Math.max(0, Math.min(passportCollected ?? 0, passportAvailable)), available: passportAvailable };
  const sightsAvailable = Math.max(0, available - passportAvailable);
  const sights = sightsAvailable > 0
    ? { collected: Math.max(0, Math.min(collected - rides.collected, sightsAvailable)), available: sightsAvailable }
    : null;
  return { rides, sights };
}
