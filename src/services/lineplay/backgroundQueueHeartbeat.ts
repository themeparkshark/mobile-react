/**
 * Keep server-verified queue time moving while iOS suspends the screen timer.
 * This task only runs for an already-started server session and only when the
 * guest has already granted background location. The server still decides
 * proximity, eligible seconds, and all rewards.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import client from '../../api/client';
import { appendTrail, isCheckpointFix, type CheckpointFix } from './checkpointCredit';

const TASK = 'lineplay-queue-heartbeat';
const STORAGE_KEY = 'lineplay_active_background_session_v1';
const MAX_SESSION_AGE_MS = 3 * 60 * 60 * 1000;
const MAX_SAMPLE_AGE_MS = 90_000;
const MIN_SEND_GAP_MS = 20_000;
/** Fixes the background task took while the server was unreachable (L1). */
const TRAIL_PREFIX = 'lineplay_background_trail_v1_';
/**
 * A guest who walked away from the line without ending LinePlay is far from
 * the ride on every sample. Stop the background task after this long instead of
 * posting a rejected heartbeat every 20 s for up to three hours (a tester's
 * abandoned Autopia session did exactly that all evening).
 */
export const MAX_AWAY_MS = 20 * 60 * 1000;
/**
 * iOS delivers a fix about every second while this task runs (no distance
 * filter, so a guest standing in line still gets samples). In the background
 * those fixes are batched natively and handed to JS this often, just over the
 * send gap, so every batch can send: the JS runtime wakes about twice a minute
 * instead of sixty times. The newest fix in a batch is at most a second old.
 */
export const BACKGROUND_BATCH_MS = MIN_SEND_GAP_MS + 5_000;

/**
 * In-memory copy of the last send attempt. Foreground fixes are not batched,
 * so without this every 1 Hz fix read AsyncStorage just to learn it was too
 * soon. Storage stays the source of truth after an app kill (this resets to 0).
 */
let lastAttemptAt = 0;

interface ActiveQueueSession {
  sessionId: string;
  playerId: number;
  startedAt: number;
  lastSentAt: number;
  /** First far-from-the-ride answer in the current away streak. */
  awaySince?: number | null;
}

let operation: Promise<unknown> = Promise.resolve();
function serialize<T>(run: () => Promise<T>): Promise<T> {
  const result = operation.then(run, run);
  operation = result.catch(() => undefined);
  return result;
}

async function readActive(): Promise<ActiveQueueSession | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ActiveQueueSession;
    if (typeof value.sessionId !== 'string' || !value.sessionId ||
        !Number.isInteger(value.playerId) || value.playerId < 1 ||
        !Number.isFinite(value.startedAt) || !Number.isFinite(value.lastSentAt)) return null;
    return value;
  } catch {
    return null;
  }
}

async function stopTask(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
}

export function activateQueueBackgroundHeartbeat(sessionId: string, playerId: number): Promise<boolean> {
  return serialize(async () => {
    const permission = await Location.getBackgroundPermissionsAsync();
    if (!permission.granted) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      await stopTask();
      return false;
    }
    const previous = await readActive();
    lastAttemptAt = 0;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      sessionId, playerId,
      startedAt: previous?.sessionId === sessionId ? previous.startedAt : Date.now(),
      lastSentAt: previous?.sessionId === sessionId ? previous.lastSentAt : 0,
    } satisfies ActiveQueueSession));
    try {
      if (!await Location.hasStartedLocationUpdatesAsync(TASK)) {
        await Location.startLocationUpdatesAsync(TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 30_000,
          distanceInterval: 0,
          deferredUpdatesInterval: BACKGROUND_BATCH_MS,
          pausesUpdatesAutomatically: false,
          // Always access is granted, so iOS does not need the blue status-bar
      // pill; it sat over other apps (streams, video) and tapping it opened us.
      showsBackgroundLocationIndicator: false,
          foregroundService: {
            notificationTitle: 'Theme Park Shark LinePlay',
            notificationBody: 'Counting your time in line',
            notificationColor: '#00A5F5',
          },
        });
      }
      return true;
    } catch (error) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      console.warn('[LinePlay] background queue tracking unavailable:', error);
      return false;
    }
  });
}

export function deactivateQueueBackgroundHeartbeat(sessionId: string): Promise<void> {
  return serialize(async () => {
    const active = await readActive();
    if (active?.sessionId !== sessionId) return;
    lastAttemptAt = 0;
    await AsyncStorage.removeItem(STORAGE_KEY);
    await stopTask();
  });
}

/**
 * Hand the foreground the fixes this task kept while offline, and forget
 * them. The foreground merges them into its own trail and syncs.
 */
export function takeBackgroundTrail(sessionId: string): Promise<CheckpointFix[]> {
  return serialize(async () => {
    const key = `${TRAIL_PREFIX}${sessionId}`;
    try {
      const raw = await AsyncStorage.getItem(key);
      await AsyncStorage.removeItem(key);
      const parsed = raw ? JSON.parse(raw) as unknown : [];
      return Array.isArray(parsed) ? parsed.filter(isCheckpointFix) : [];
    } catch {
      return [];
    }
  });
}

async function keepOfflineFix(sessionId: string, fix: CheckpointFix): Promise<void> {
  const key = `${TRAIL_PREFIX}${sessionId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    const trail = Array.isArray(parsed) ? parsed.filter(isCheckpointFix) : [];
    await AsyncStorage.setItem(key, JSON.stringify(appendTrail(trail, fix)));
  } catch {
    // Storage trouble never stops the heartbeat.
  }
}

export function clearQueueBackgroundHeartbeat(): Promise<void> {
  return serialize(async () => {
    lastAttemptAt = 0;
    await AsyncStorage.removeItem(STORAGE_KEY);
    await stopTask();
  });
}

TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[LinePlay] background location unavailable:', error);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const sample = locations?.[locations.length - 1];
  if (!sample) return;
  // Too soon after the last attempt: skip without touching storage.
  if (lastAttemptAt && Date.now() - lastAttemptAt >= 0 && Date.now() - lastAttemptAt < MIN_SEND_GAP_MS) return;

  await serialize(async () => {
    const active = await readActive();
    if (!active) {
      await stopTask();
      return;
    }
    const now = Date.now();
    if (now - active.startedAt > MAX_SESSION_AGE_MS) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      await stopTask();
      return;
    }
    // OS delivery may be delayed or batched. A stale coordinate must not
    // stand in for the guest's current position and mint queue time.
    if (!Number.isFinite(sample.timestamp) || now - sample.timestamp < 0 ||
        now - sample.timestamp > MAX_SAMPLE_AGE_MS ||
        now - active.lastSentAt < MIN_SEND_GAP_MS) return;

    const cachedPlayer = await AsyncStorage.getItem('player');
    let currentPlayerId: number | null = null;
    try { currentPlayerId = Number(JSON.parse(cachedPlayer ?? 'null')?.id) || null; } catch { /* signed out */ }
    const token = await SecureStore.getItemAsync('token');
    if (currentPlayerId !== active.playerId || !token) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      await stopTask();
      return;
    }

    // Throttle attempts as well as successes. A far sample or network outage
    // must not trigger a request for every noisy GPS callback.
    active.lastSentAt = now;
    lastAttemptAt = now;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    try {
      const accuracy = sample.coords.accuracy;
      const response = await client.post(`/me/line-sessions/${active.sessionId}/heartbeat`, {
        latitude: sample.coords.latitude,
        longitude: sample.coords.longitude,
        ...(typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0
          ? { accuracy_meters: Math.min(10_000, accuracy) } : {}),
      }, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
      if (response.data?.status === 'completed') {
        await AsyncStorage.removeItem(STORAGE_KEY);
        await stopTask();
        return;
      }
      if (active.awaySince) {
        active.awaySince = null;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      }
    } catch (requestError) {
      const response = (requestError as { response?: { status?: number; data?: { code?: string } } })?.response;
      const status = response?.status;
      if (status === 401 || status === 404) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        await stopTask();
        return;
      }
      if (status === 422 && response?.data?.code === 'NOT_NEAR_RIDE') {
        const awaySince = active.awaySince ?? now;
        if (now - awaySince >= MAX_AWAY_MS) {
          await AsyncStorage.removeItem(STORAGE_KEY);
          await stopTask();
          return;
        }
        active.awaySince = awaySince;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      }
      if (!response) {
        // No signal (an indoor queue, airplane mode): keep the fix for the
        // foreground to sync, so the server can still place the guest.
        await keepOfflineFix(active.sessionId, { latitude: sample.coords.latitude,
          longitude: sample.coords.longitude, accuracyMeters: sample.coords.accuracy ?? null,
          at: sample.timestamp });
      }
      // A rejected/far sample earns no time. Retry only when the OS supplies
      // another recent location.
    }
  });
});
