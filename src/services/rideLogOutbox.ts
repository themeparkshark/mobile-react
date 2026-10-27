import AsyncStorage from '@react-native-async-storage/async-storage';
import { logRide, type LogRidePayload, type LogRideResponse } from '../api/endpoints/player-rides';
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

export type RideLogWaitReason = 'signal' | 'signin';

/**
 * Why a kept ride is waiting, so the kid hears the real fix: an expired
 * sign-in (401, 403) waits for signing in again, everything else for signal.
 */
export function rideLogWaitReason(error: unknown): RideLogWaitReason {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return status === 401 || status === 403 ? 'signin' : 'signal';
}

/** The line under "Kept on your phone". */
export function rideLogWaitLine(reason: RideLogWaitReason, count = 1): string {
  const subject = count === 1 ? 'It joins' : 'They join';
  return reason === 'signin'
    ? `${subject} your journal when you sign in again.`
    : `${subject} your journal when you have signal.`;
}

let signedInPlayerId: number | null = null;
let queue: RedeemRetryQueue<QueuedRideLog> | null = null;
/** Rides the Ride Journal is sending right now: a drain leaves them alone so one save is one send. */
const sendingNow = new Set<string>();
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
      if (sendingNow.has(item.payload.source_detection_id)) return false;
      // Someone else's ride (or nobody signed in): it waits for its own player.
      if (signedInPlayerId === null || item.player_id !== signedInPlayerId) {
        return tooOld(item, now) && letGo(item, 'expired', now);
      }
      try {
        await logRide(item.payload);
        return true;
      } catch (error) {
        // A real "no" from the server lets the ride go; anything else waits for signal.
        if (!shouldQueueRideLog(error)) return letGo(item, 'rejected', now);
        return tooOld(item, now) && letGo(item, 'expired', now);
      }
    },
  });
  return queue;
}

export const RIDE_LOG_LET_GO_KEY = 'tps.rideLogOutbox.letGo.v1';

/**
 * A kept ride that could not join the journal: the server said no to it, or it
 * waited 30 days. The kid was told it was kept, so it never vanishes in
 * silence: the Ride Tracker shows it with a one-tap "Log it again".
 */
export interface LetGoRideLog {
  readonly id: string;
  readonly player_id: number;
  readonly ride_name: string;
  readonly park_id: number | null;
  readonly payload: QueuedRideLog['payload'];
  readonly reason: 'rejected' | 'expired';
  readonly at: number;
}

let letGoChain: Promise<unknown> = Promise.resolve();

/** Each player keeps up to 20 notes, so one kid's list never pushes out a sibling's. */
export const RIDE_LOG_LET_GO_PER_PLAYER = 20;

/** Keep only the newest notes for each player, in the same order. */
function capPerPlayer(items: LetGoRideLog[]): LetGoRideLog[] {
  const seen = new Map<number, number>();
  const kept: LetGoRideLog[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const count = seen.get(items[i].player_id) ?? 0;
    if (count >= RIDE_LOG_LET_GO_PER_PLAYER) continue;
    seen.set(items[i].player_id, count + 1);
    kept.unshift(items[i]);
  }
  return kept;
}

/**
 * Serialized read and write of the let-go list. A failed read throws, so
 * nothing is overwritten. Unreadable data is copied to <key>.corrupt first,
 * the same way the outbox sets it aside, so it is never lost in silence.
 */
function changeLetGo(fn: (items: LetGoRideLog[]) => LetGoRideLog[]): Promise<void> {
  const next = letGoChain.then(async () => {
    const raw = await AsyncStorage.getItem(RIDE_LOG_LET_GO_KEY);
    let items: LetGoRideLog[] = [];
    let readable = true;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) items = parsed as LetGoRideLog[];
      else readable = false;
    } catch {
      readable = false;
    }
    if (!readable && raw) await AsyncStorage.setItem(`${RIDE_LOG_LET_GO_KEY}.corrupt`, raw);
    await AsyncStorage.setItem(RIDE_LOG_LET_GO_KEY, JSON.stringify(capPerPlayer(fn(items))));
  });
  letGoChain = next.catch(() => undefined);
  return next;
}

/**
 * Keep a note of a ride leaving the outbox. Returns true once the note is
 * stored (the ride may leave), false if storage failed (the ride stays put).
 * A newer note for the same ride replaces the old one, with the newest memory.
 */
async function letGo(item: QueuedRideLog, reason: LetGoRideLog['reason'], now: number): Promise<boolean> {
  try {
    const id = item.payload.source_detection_id;
    await changeLetGo(items => [...items.filter(it => it.id !== id), {
      id, player_id: item.player_id, ride_name: item.ride_name, park_id: item.park_id,
      payload: item.payload, reason, at: now,
    }]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The kid chose "Try later" after the server said no: keep the ride and its
 * memory on the Ride Tracker so it can be logged again, never a dead end.
 * Returns false if it could not be stored.
 */
export async function keepRideLogForLater(item: QueuedRideLog): Promise<boolean> {
  const kept = await letGo(item, 'rejected', Date.now());
  await announce().catch(() => undefined);
  return kept;
}

/** The signed-in player's rides that could not join the journal, newest first. */
export async function letGoRideLogs(): Promise<LetGoRideLog[]> {
  if (signedInPlayerId === null) return [];
  try {
    const raw = await AsyncStorage.getItem(RIDE_LOG_LET_GO_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return (parsed as LetGoRideLog[]).filter(item => item.player_id === signedInPlayerId).reverse();
  } catch {
    return [];
  }
}

/** The kid logged it again or said okay: clear the note. */
export async function clearLetGoRideLog(id: string): Promise<void> {
  await changeLetGo(items => items.filter(item => item.id !== id));
  await announce();
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
  await outbox().enqueue(item, item.payload.source_detection_id, { replace: true });
  await announce();
}

/**
 * Save a ride memory the moment Save is tapped. The full draft (stars, face,
 * wait, note) goes into the outbox first, then one direct send; a server
 * answer takes it back out. If the screen goes away mid-save (a park change, a
 * remount, an app switch) the draft is already on the phone and the next drain
 * sends it. `kept` says whether the draft made it onto the phone. On a failed
 * send the draft stays kept and the error is thrown with `kept` attached; the
 * caller lets it go (dropRideLog) only when the server said no.
 */
export async function saveRideLogKeptFirst(item: QueuedRideLog): Promise<{ result: LogRideResponse; kept: boolean }> {
  const id = item.payload.source_detection_id;
  let kept = false;
  sendingNow.add(id);
  try {
    try {
      await outbox().enqueue(item, id, { replace: true });
      kept = true;
    } catch {
      // Storage hiccup: the direct send below still runs; the caller retries the keep on weak signal.
    }
    try {
      const result = await logRide(item.payload);
      if (kept) await outbox().remove(id).catch(() => undefined);
      return { result, kept };
    } catch (error) {
      if (error && typeof error === 'object') (error as { rideLogKept?: boolean }).rideLogKept = kept;
      throw error;
    }
  } finally {
    sendingNow.delete(id);
    void announce().catch(() => undefined);
  }
}

/** Did saveRideLogKeptFirst keep this failed save's draft on the phone? */
export function rideLogWasKept(error: unknown): boolean {
  return !!(error && typeof error === 'object' && (error as { rideLogKept?: boolean }).rideLogKept);
}

/** Take a kept ride back out (the server said no and the Ride Journal is handling it). */
export async function dropRideLog(id: string): Promise<void> {
  await outbox().remove(id);
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
