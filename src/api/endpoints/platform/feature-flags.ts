import client from '../../client';
import { appVersionHeaders } from '../../platform';

/**
 * GET /api/feature-flags (public, cached 60s by the server). Switches the app
 * and backend flip together, plus the forced-update floor.
 *
 * One shared read for the whole app (T095): every switch reader (guide, map,
 * retention, money, LinePlay, progression, help) goes through the default
 * export, so one slow answer can never turn features off for a whole session.
 * - The last good answer is kept and served while a new read fails.
 * - A failed read tries again by itself (2 s, 5 s, 15 s, 30 s, then every
 *   minute) while the app is open, each try with a longer timeout, and again on
 *   map focus and app foreground (refreshFeatureFlags, flagWatch.ts).
 * - Every new answer is sent to onFeatureFlags listeners, so a screen that read
 *   "off" during a slow start turns its feature on in place.
 * - Answers belong to the signed-in player (preview lists): a new session
 *   never reads another player's switches.
 */
export type FeatureFlagName =
  | 'adventure_ticket'
  | 'game_proof'
  | 'map_gym_swords'
  | 'park_projects'
  | 'progression_v2'
  | 'queue_tickets'
  | 'ride_coin_editions'
  | 'ride_boss'
  | 'ride_rescue_pass'
  /** Studio sound (wow-sound lane): off until Dustin approves the listening pack. See gamekit/audio/studioSwitch.ts. */
  | 'studio_sound'
  | 'vip_sync';

export type FeatureFlagsPayload = {
  readonly flags: Partial<Record<FeatureFlagName, boolean>> & Record<string, boolean>;
  readonly min_app_version: string;
  readonly update_required: boolean;
  readonly app_store_url: string;
};

/** The first read's timeout; each retry after a slow answer waits longer. */
export const FLAG_TIMEOUTS_MS = [8000, 15000, 25000] as const;
/** Waits between tries after a failed read, while the app is open. */
export const FLAG_RETRY_MS = [2000, 5000, 15000, 30000, 60000] as const;
/** A good answer is reused this long (the server itself caches 60 s). */
export const FLAG_FRESH_MS = 5 * 60 * 1000;

/** The raw read: one request, a bounded timeout, a malformed answer rejects. */
export async function fetchFeatureFlags(timeout: number = FLAG_TIMEOUTS_MS[0]): Promise<FeatureFlagsPayload> {
  // Sent here as well as by the shared client: update_required depends on it.
  const { data } = await client.get<{ data: FeatureFlagsPayload }>('/feature-flags', {
    timeout,
    headers: appVersionHeaders(),
  });
  const payload = data?.data;
  if (!payload || typeof payload.flags !== 'object' || payload.flags === null) {
    throw new Error('Feature flags response was malformed.');
  }
  return payload;
}

type Listener = (payload: FeatureFlagsPayload) => void;
/** Dev JS only: one log line per read outcome (lane device proofs read the Metro log). */
const DEV_LOG = typeof __DEV__ !== 'undefined' && __DEV__;
type Timer = ReturnType<typeof setTimeout>;

let good: FeatureFlagsPayload | null = null;
let goodAt = 0;
let goodFor: string | null = null;
let failures = 0;
let pending: Promise<FeatureFlagsPayload> | null = null;
let retryTimer: Timer | null = null;
let watching = false;
let active = true;
let fetcher: (timeout: number) => Promise<FeatureFlagsPayload> = fetchFeatureFlags;
let clock: () => number = Date.now;
const listeners = new Set<Listener>();

/** Whose switches these are: the session's bearer token (never stored or shown, only compared). */
function sessionKey(): string {
  try {
    const auth = (client as { defaults?: { headers?: { common?: Record<string, unknown> } } })?.defaults?.headers?.common?.Authorization;
    return typeof auth === 'string' ? auth : '';
  } catch {
    return '';
  }
}

function forgetIfOtherSession(): void {
  const key = sessionKey();
  if (goodFor !== null && goodFor !== key) {
    good = null; goodAt = 0; failures = 0; pending = null;
  }
}

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry(): void {
  clearRetry();
  if (!watching || !active) return;
  const wait = FLAG_RETRY_MS[Math.min(failures - 1, FLAG_RETRY_MS.length - 1)] ?? FLAG_RETRY_MS[FLAG_RETRY_MS.length - 1];
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (watching && active) void read().catch(() => undefined);
  }, wait);
  (retryTimer as { unref?: () => void }).unref?.();
}

function read(): Promise<FeatureFlagsPayload> {
  if (pending) return pending;
  const key = sessionKey();
  const timeout = FLAG_TIMEOUTS_MS[Math.min(failures, FLAG_TIMEOUTS_MS.length - 1)];
  pending = fetcher(timeout).then(payload => {
    if (sessionKey() !== key) return payload; // signed out or switched meanwhile: not this session's answer
    if (DEV_LOG) console.log(`[flags] answer after ${failures} failed tries: ${Object.keys(payload.flags).filter(k => payload.flags[k] === true).length} on, ${listeners.size} listeners`);
    good = payload; goodAt = clock(); goodFor = key; failures = 0;
    clearRetry();
    listeners.forEach(listener => { try { listener(payload); } catch { /* one bad listener never blocks the rest */ } });
    return payload;
  }, error => {
    failures += 1;
    scheduleRetry();
    if (DEV_LOG) console.log(`[flags] read failed (${(error as { code?: string })?.code ?? 'error'}, timeout ${timeout} ms), try ${failures}; retry ${retryTimer ? 'scheduled' : 'on focus'}; serving ${good ? 'last good' : 'nothing yet'}`);
    // The last good answer stands in while the server is slow: a feature that was on stays on.
    if (good && goodFor === key) return good;
    throw error;
  }).finally(() => { pending = null; });
  return pending;
}

/**
 * The player's switches. A fresh good answer is reused; otherwise one read
 * (shared by every caller) goes out. Resolves with the last good answer when
 * the read fails; rejects only when there has never been one.
 */
export default function getFeatureFlags(): Promise<FeatureFlagsPayload> {
  forgetIfOtherSession();
  if (good && clock() - goodAt < FLAG_FRESH_MS) return Promise.resolve(good);
  // A retry is already waiting after a failed read: no pile-up on a slow server, the retry answers everyone.
  if (retryTimer && !pending) return good ? Promise.resolve(good) : Promise.reject(new Error('Feature flags are retrying.'));
  return read();
}

/** The last good answer for this session, or null. */
export function featureFlagsNow(): FeatureFlagsPayload | null {
  forgetIfOtherSession();
  return good;
}

/** Map focus and app foreground: read again when the last read failed (or the answer is old). */
export function refreshFeatureFlags(): Promise<FeatureFlagsPayload | null> {
  forgetIfOtherSession();
  const due = !good || failures > 0 || clock() - goodAt >= FLAG_FRESH_MS;
  if (!due) return Promise.resolve(good);
  clearRetry(); // focus and foreground read now instead of waiting for the backoff
  return read().catch(() => null);
}

/** Every new good answer, to update a screen in place. Returns the unsubscribe. */
export function onFeatureFlags(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Turned on once by the root (flagWatch.ts): retries run only in the real app, never in a test. */
export function setFeatureFlagWatch(on: boolean): void {
  watching = on;
  if (!on) clearRetry();
  else if (failures > 0 && !retryTimer) scheduleRetry();
}

/** App foreground and background: no retries while the app sleeps; a return reads at once if due. */
export function setFeatureFlagsAppActive(isActive: boolean): void {
  active = isActive;
  if (!isActive) { clearRetry(); return; }
  void refreshFeatureFlags();
}

/** Sign-out: forget the switches (the next account may be on other preview lists). */
export function resetFeatureFlags(): void {
  good = null; goodAt = 0; goodFor = null; failures = 0; pending = null;
  clearRetry();
}

/** Tests only: a fake network and clock. */
export function setFeatureFlagsFetcherForTests(next: ((timeout: number) => Promise<FeatureFlagsPayload>) | null, now?: () => number): void {
  fetcher = next ?? fetchFeatureFlags;
  clock = now ?? Date.now;
  resetFeatureFlags();
}

/** Tests only: how many reads failed in a row. */
export function featureFlagFailuresForTests(): number {
  return failures;
}
