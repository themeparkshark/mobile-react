/**
 * The last Stamp Book the player saw, so the book draws real pages on the first
 * frame of the push and the network refresh lands behind it. Memory first
 * (same app session), then the device copy (cold start). Per player; best
 * effort: a storage failure only means one loading line.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StampsResponse } from '../../api/endpoints/me/stamps';

const KEY = 'stampbook.book.v1';
let memory: { player: number | null; book: StampsResponse } | null = null;

/** Same session: the book from the last open, synchronously (null if another player or none). */
export function memoryBook(player: number | null): StampsResponse | null {
  return memory && memory.player === player ? memory.book : null;
}

/** Cold start: the device copy, if it belongs to this player. */
export async function loadBookCache(player: number | null): Promise<StampsResponse | null> {
  const hit = memoryBook(player);
  if (hit) return hit;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) as { player: number | null; book: StampsResponse } : null;
    if (!saved || saved.player !== player || !saved.book?.stamps) return null;
    memory = saved;
    return saved.book;
  } catch {
    return null;
  }
}

export function saveBookCache(player: number | null, book: StampsResponse): void {
  memory = { player, book };
  AsyncStorage.setItem(KEY, JSON.stringify(memory)).catch(() => undefined);
}
