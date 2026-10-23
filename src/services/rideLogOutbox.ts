import { logRide, type LogRidePayload } from '../api/endpoints/player-rides';
import { RedeemRetryQueue } from './lineplay/RedeemRetryQueue';

/**
 * Ride journal outbox. A ride logged in a park dead zone is kept on the phone
 * and sent again later (when the app comes back to the front, and whenever the
 * Ride Tracker or Ride Journal opens), so weak signal never throws a ride away.
 *
 * Every saved ride carries a phone-made id in source_detection_id. The server
 * saves a ride once per id (PlayerRideController@store firstOrCreate), so a
 * retry after a lost reply never makes a second journal entry.
 */

export const RIDE_LOG_OUTBOX_KEY = 'tps.rideLogOutbox.v1';
/** About a week of app opens in a weak-signal park before a ride is given up. */
const MAX_ATTEMPTS = 60;

export interface QueuedRideLog {
  readonly payload: LogRidePayload & { readonly source_detection_id: string };
  readonly ride_name: string;
  readonly park_id: number | null;
}

/** A phone-made id for a ride logged by hand (the server keeps 100 characters). */
export function manualRideLogId(now = Date.now(), random = Math.random()): string {
  return `manual-${now.toString(36)}-${random.toString(36).slice(2, 10) || '0'}`;
}

/**
 * Should a failed save wait in the outbox? Yes when the server never answered
 * (no signal, timeout) or had a hiccup (408, 429, 5xx). No when it read the
 * ride and said no (a 4xx such as a ride that no longer exists), because
 * sending the same ride again cannot work.
 */
export function shouldQueueRideLog(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  // React Native reports a dropped connection as status 0.
  if (typeof status !== 'number' || status <= 0) return true;
  return status === 408 || status === 429 || status >= 500;
}

let queue: RedeemRetryQueue<QueuedRideLog> | null = null;
const listeners = new Set<(count: number) => void>();

function outbox(): RedeemRetryQueue<QueuedRideLog> {
  queue ??= new RedeemRetryQueue<QueuedRideLog>({
    storageKey: RIDE_LOG_OUTBOX_KEY,
    maxAttempts: MAX_ATTEMPTS,
    executor: async item => {
      try {
        await logRide(item.payload);
        return true;
      } catch (error) {
        // A real "no" from the server drops the ride; anything else waits for signal.
        return !shouldQueueRideLog(error);
      }
    },
  });
  return queue;
}

async function announce(): Promise<number> {
  const count = await pendingRideLogCount();
  listeners.forEach(listener => listener(count));
  return count;
}

/** Keep a ride on the phone until it can be sent. Safe to call twice for the same ride. */
export async function queueRideLog(item: QueuedRideLog): Promise<void> {
  await outbox().enqueue(item, item.payload.source_detection_id);
  await announce();
}

/** Send every waiting ride once. Returns how many reached the server. */
export async function drainRideLogs(): Promise<number> {
  const sent = await outbox().drain();
  await announce();
  return sent;
}

export async function pendingRideLogCount(): Promise<number> {
  try {
    return await outbox().size();
  } catch {
    return 0;
  }
}

/** Hear when the number of waiting rides changes. Returns the unsubscribe. */
export function onRideLogOutboxChange(listener: (count: number) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
