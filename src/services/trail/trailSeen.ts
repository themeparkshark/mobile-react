import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What each Trail path and steps-to-go number last showed, by key, saved on
 * the phone. Opening the sheet animates only the walk since you last looked,
 * even after the app was closed for the morning (the Pikmin Bloom moment).
 * Small (one entry per box), written at most once a second, never awaited.
 */
const KEY = 'trail.seen.v1';
const MAX = 60;
const seen = new Map<string, number>();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function hydrateTrailSeen(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, number>;
    for (const [k, v] of Object.entries(obj)) if (!seen.has(k) && Number.isFinite(v)) seen.set(k, v);
  } catch { /* nothing saved */ }
}

export function getSeen(key: string | undefined): number | null {
  return key ? seen.get(key) ?? null : null;
}

export function setSeen(key: string, value: number): void {
  seen.delete(key);
  seen.set(key, value);
  while (seen.size > MAX) seen.delete(seen.keys().next().value as string);
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void AsyncStorage.setItem(KEY, JSON.stringify(Object.fromEntries(seen))).catch(() => undefined);
  }, 1000);
}
