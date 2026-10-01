/**
 * The server credits nearby time between two samples up to 90 s apart
 * (config mobile.line_max_credit_gap_seconds). Until then the countdown keeps
 * running on its own. A still guest gets a fix every 30 s heartbeat, so it no
 * longer drops to "Checking" between them (QA saw that about once a minute).
 */
export const PART_ESTIMATE_WINDOW_MS = 90_000;

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
  const estimated = age >= 0 && age <= PART_ESTIMATE_WINDOW_MS;
  const display = confirmed + (estimated ? Math.floor(age / 1000) : 0);
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
