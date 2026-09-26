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

const TASK = 'lineplay-queue-heartbeat';
const STORAGE_KEY = 'lineplay_active_background_session_v1';
const MAX_SESSION_AGE_MS = 3 * 60 * 60 * 1000;
const MAX_SAMPLE_AGE_MS = 90_000;
const MIN_SEND_GAP_MS = 20_000;

interface ActiveQueueSession {
  sessionId: string;
  playerId: number;
  startedAt: number;
  lastSentAt: number;
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
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Theme Park Shark LinePlay',
            notificationBody: 'Checking queue progress while you wait',
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
    await AsyncStorage.removeItem(STORAGE_KEY);
    await stopTask();
  });
}

export function clearQueueBackgroundHeartbeat(): Promise<void> {
  return serialize(async () => {
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
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    try {
      const response = await client.post(`/me/line-sessions/${active.sessionId}/heartbeat`, {
        latitude: sample.coords.latitude,
        longitude: sample.coords.longitude,
      }, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
      if (response.data?.status === 'completed') {
        await AsyncStorage.removeItem(STORAGE_KEY);
        await stopTask();
        return;
      }
    } catch (requestError) {
      const status = (requestError as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 404) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        await stopTask();
      }
      // A rejected/far sample or network outage earns no time. Retry only
      // when the OS supplies another recent location.
    }
  });
});
