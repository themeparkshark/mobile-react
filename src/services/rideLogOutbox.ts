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
 *
 * Every ride also remembers whose ride it is. It is only ever sent while that
 * same player is signed in, so on a shared family phone one kid's ride never
 * lands in another kid's journal, and a signed-out phone sends nothing.
 */

export const RIDE_LOG_OUTBOX_KEY = 'tps.rideLogOutbox.v2';
/**
 * A ride that still has not reached the server after 30 days is let go. Tries
 * never run out before that: a whole park day in a dead zone only waits longer.
 */
export const RIDE_LOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface QueuedRideLog {
  readonly payload: LogRidePayload & { readonly source_detection_id: string };
  readonly ride_name: string;
  readonly park_id: number | null;
  /** The player who logged this ride. Only that player's session ever sends it. */
  readonly player_id: number;
  /** When it was kept on the phone (ms). */
  readonly queued_at: number;
}

/** A phone-made id for a ride logged by hand (the server keeps 100 characters). */
export function manualRideLogId(now = Date.now(), random = Math.random()): string {
  return `manual-${now.toString(36)}-${random.toString(36).slice(2, 10) || '0'}`;
}

/**
 * Should a failed save wait in the outbox? Yes when the server never answered
 * (no signal, timeout), had a hiccup (408, 429, 5xx), or could not tell who we
 * are right now (401, 403: an expired sign-in, fixed by signing in again).
 * No when it read the ride and said no (another 4xx such as a ride that no
 * longer exists), because sending the same ride again cannot work.
 */
export function shouldQueueRideLog(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  // React Native reports a dropped connection as status 0.
  if (typeof status !== 'number' || status <= 0) return true;
  return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
}

let signedInPlayerId: number | null = null;
let queue: RedeemRetryQueue<QueuedRideLog> | null = null;
const listeners = new Set<(count: number) => void>();

function tooOld(item: QueuedRideLog, now: number): boolean {
  return typeof item.queued_at === 'number' && now - item.queued_at > RIDE_LOG_MAX_AGE_MS;
}

function outbox(): RedeemRetryQueue<QueuedRideLog> {
  queue ??= new RedeemRetryQueue<QueuedRideLog>({
    storageKey: RIDE_LOG_OUTBOX_KEY,
    // Never give up by count: a dead-zone day can mean dozens of tries. Age decides instead.
    maxAttempts: Number.POSITIVE_INFINITY,
    executor: async item => {
      const now = Date.now();
      // Someone else's ride (or nobody signed in): it waits for its own player.
      if (signedInPlayerId === null || item.player_id !== signedInPlayerId) return tooOld(item, now);
      try {
        await logRide(item.payload);
        return true;
      } catch (error) {
        // A real "no" from the server drops the ride; anything else waits for signal.
        return !shouldQueueRideLog(error) || tooOld(item, now);
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

/**
 * Who is signed in now (null when signed out). Rides only ever send for this
 * player. Called by RideLogOutboxSync whenever the signed-in player changes.
 */
export function setRideLogOutboxPlayer(playerId: number | null): void {
  signedInPlayerId = playerId ?? null;
  void announce().catch(() => undefined);
}

/** Keep a ride on the phone until it can be sent. Safe to call twice for the same ride. */
export async function queueRideLog(item: QueuedRideLog): Promise<void> {
  await outbox().enqueue(item, item.payload.source_detection_id);
  await announce();
}

/** Send the signed-in player's waiting rides once. Returns how many reached the server. */
export async function drainRideLogs(): Promise<number> {
  if (signedInPlayerId === null) return 0;
  const sent = await outbox().drain();
  await announce();
  return sent;
}

/** The signed-in player's rides waiting on this phone, oldest first. */
export async function pendingRideLogs(): Promise<QueuedRideLog[]> {
  if (signedInPlayerId === null) return [];
  try {
    const items = await outbox().peek();
    return items.map(item => item.payload).filter(item => item.player_id === signedInPlayerId);
  } catch {
    return [];
  }
}

/** How many of the signed-in player's rides are waiting on this phone. */
export async function pendingRideLogCount(): Promise<number> {
  return (await pendingRideLogs()).length;
}

/** "One ride", "Two rides", "12 rides": words for small counts so "1" never reads as "I". */
export function rideCountWords(count: number): string {
  const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  const n = Math.max(0, Math.floor(count));
  return `${words[n] ?? String(n)} ${n === 1 ? 'ride' : 'rides'}`;
}

/** Hear when the number of waiting rides changes. Returns the unsubscribe. */
export function onRideLogOutboxChange(listener: (count: number) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
