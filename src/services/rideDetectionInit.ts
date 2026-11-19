/**
 * Ride detection start-up retry (T073). One failed GET /rides at launch used to leave detection and the wait poll
 * off for the whole session. Now the start-up retries with backoff, and the map's "Tap to try again" retries it
 * at once too. Pure parts are exported for tests.
 */

/** Backoff after a failed start-up: 5 s, 15 s, 30 s, 60 s, then every 2 minutes. */
export const RIDE_INIT_RETRY_MS: readonly number[] = [5_000, 15_000, 30_000, 60_000, 120_000];

export function rideInitRetryDelay(failures: number): number {
  const index = Math.max(0, Math.min(Math.floor(failures) - 1, RIDE_INIT_RETRY_MS.length - 1));
  return RIDE_INIT_RETRY_MS[index];
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** The map's retry (and any screen that just got a network answer back) asks detection to start again now. */
export function requestRideDetectionRetry(): void {
  listeners.forEach(listener => {
    try { listener(); } catch { /* a listener never breaks the others */ }
  });
}

export function onRideDetectionRetry(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
