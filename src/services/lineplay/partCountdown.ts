/** Animate the next queue milestone between server checks without granting rewards. */
export function partCountdown(
  verifiedSeconds: number,
  verifiedAt: number | null,
  now: number,
  intervalSeconds: number,
): { progressSeconds: number; remainingSeconds: number; checking: boolean; estimated: boolean; needsCheck: boolean } {
  const interval = Math.max(1, Math.floor(intervalSeconds));
  const confirmed = Math.max(0, Math.floor(verifiedSeconds));
  const age = verifiedAt == null ? Infinity : now - verifiedAt;
  const estimated = age >= 0 && age <= 45_000;
  const display = confirmed + (estimated ? Math.min(30, Math.floor(age / 1000)) : 0);
  const nextBoundary = (Math.floor(confirmed / interval) + 1) * interval;
  const checking = display >= nextBoundary;
  return {
    progressSeconds: checking ? interval : display % interval,
    remainingSeconds: Math.max(0, nextBoundary - display),
    checking,
    estimated,
    needsCheck: !estimated,
  };
}
