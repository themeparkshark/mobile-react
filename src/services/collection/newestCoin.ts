/**
 * The newest coin on a park shelf (hold-fix 3, T128): the shelf opens on its tab and its slot glows, so the
 * kid sees at once where the coin they just won went. Written on this phone when a win adds a coin for the
 * first time; the glow stays until the coin's card is opened, a newer coin takes its place, or 3 days pass.
 * The shelf API has no "won at" time, so this lives on the phone (server field listed for the backend lane).
 * Storage is best effort: every read and write swallows errors, and no record simply means no glow.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NewestCoin {
  readonly taskId: number;
  readonly at: number;
  readonly seen: boolean;
}

export const NEWEST_GLOW_MS = 3 * 24 * 60 * 60 * 1000;

export function newestKey(playerId: number | string, parkId: number | string): string {
  return `shelf:newest:v1@p${playerId}:park${parkId}`;
}

export function parseNewest(raw: string | null | undefined): NewestCoin | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<NewestCoin>;
    if (typeof v?.taskId !== 'number' || !Number.isSafeInteger(v.taskId) || v.taskId <= 0 || typeof v.at !== 'number') return null;
    return { taskId: v.taskId, at: v.at, seen: v.seen === true };
  } catch {
    return null;
  }
}

/** The slot that glows: the newest coin, while it is on the shelf, unseen and under 3 days old. Pure. */
export function glowTaskId(record: NewestCoin | null, ownedIds: ReadonlySet<number>, now: number = Date.now()): number | null {
  if (!record || record.seen || now - record.at > NEWEST_GLOW_MS || !ownedIds.has(record.taskId)) return null;
  return record.taskId;
}

export async function noteNewestCoin(playerId: number, parkId: number, taskId: number, now: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(newestKey(playerId, parkId), JSON.stringify({ taskId, at: now, seen: false }));
  } catch {
    // No record: no glow. The win itself is never touched.
  }
}

export async function loadNewestCoin(playerId: number, parkId: number): Promise<NewestCoin | null> {
  try {
    return parseNewest(await AsyncStorage.getItem(newestKey(playerId, parkId)));
  } catch {
    return null;
  }
}

/** The coin's card was opened: its slot stops glowing. */
export async function markNewestSeen(playerId: number, parkId: number, taskId: number): Promise<void> {
  const record = await loadNewestCoin(playerId, parkId);
  if (!record || record.taskId !== taskId || record.seen) return;
  try {
    await AsyncStorage.setItem(newestKey(playerId, parkId), JSON.stringify({ ...record, seen: true }));
  } catch {
    // Best effort.
  }
}
