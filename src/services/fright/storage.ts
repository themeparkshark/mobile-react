/**
 * AsyncStorage for Fin-ister Nights, every call wrapped: storage can be
 * missing or throw (private mode, full disk) and the mode must still work.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FRIGHT_KEYS = {
  queue: 'fright.queue.v1',
  night: 'fright.night.v1',
  seen: 'fright.seen.v1',
  spooky: 'fright.spooky.v1',
  run: 'fright.localrun.v1',
  ambient: 'fright.ambient.v1',
} as const;

export async function readKey(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeKey(key: string, value: string | null): Promise<void> {
  try {
    if (value == null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  } catch {
    // Decoration only: the server keeps the truth.
  }
}

export async function readJson<T>(key: string): Promise<T | null> {
  const raw = await readKey(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): Promise<void> {
  return writeKey(key, value == null ? null : JSON.stringify(value));
}
