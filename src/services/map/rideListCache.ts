/**
 * The park's ride list as the map last saw it (fix pass w5, T023): GET /me/current-redeemables, per player and park.
 *
 * On arrival the guide card names the next coin from this list and the islands draw from it, so while the server is
 * slow the card said "Finding your next coin" with nothing else on the map. In the w3 walk the request timed out
 * (12 s), the quiet retry waited 5 s and timed out again: about 30 s of "Finding". Coin spots never move, so the last
 * list is a safe first frame: the map draws it at once and the server's answer replaces it the moment it lands.
 * A list older than MAX_AGE_MS (or from another day's timed coins, which the map filters by their own windows) is
 * never used. Memory first, then the phone's storage for a cold launch. Every read and write is best effort.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Longer than a park day's gaps (a lunch break, a nap at the hotel), shorter than overnight. */
export const MAX_AGE_MS = 8 * 60 * 60 * 1000;
const PREFIX = 'map:ride-list:v1@';

interface Saved<T> { readonly fetchedAt: number; readonly list: T }

const memory = new Map<string, Saved<unknown>>();
const keyFor = (playerId: number | string, parkId: number | string) => `${PREFIX}p${playerId}:${parkId}`;

/** Pure: a saved list is usable while it is younger than MAX_AGE_MS (and not from the future). */
export function usableSaved<T>(saved: Saved<T> | null | undefined, now: number): T | null {
  if (!saved || !Number.isFinite(saved.fetchedAt) || saved.fetchedAt > now + 60_000 || now - saved.fetchedAt > MAX_AGE_MS) return null;
  return saved.list ?? null;
}

/**
 * Keep the list the map shows now. `fetchedAt` is when the server answered: a local change (a won coin leaving the
 * map) keeps the answer's time, so a list is never kept alive past its age by the map's own edits.
 */
export function rememberRideList<T>(playerId: number | string | null | undefined, parkId: number | string | null | undefined,
  list: T, fetchedAt: number): void {
  if (playerId == null || parkId == null || list == null) return;
  const key = keyFor(playerId, parkId);
  const saved = { fetchedAt, list };
  memory.set(key, saved);
  void AsyncStorage.setItem(key, JSON.stringify(saved)).catch(() => undefined);
}

/** When the list kept for this player and park was fetched, or null. */
export function rideListFetchedAt(playerId: number | string | null | undefined, parkId: number | string | null | undefined): number | null {
  if (playerId == null || parkId == null) return null;
  return memory.get(keyFor(playerId, parkId))?.fetchedAt ?? null;
}

/** The kept list from memory (same run of the app), or null. */
export function recallRideList<T>(playerId: number | string | null | undefined, parkId: number | string | null | undefined,
  now = Date.now()): T | null {
  if (playerId == null || parkId == null) return null;
  return usableSaved(memory.get(keyFor(playerId, parkId)) as Saved<T> | undefined, now);
}

/** The kept list from the phone's storage (a cold launch), or null. */
export async function loadRideList<T>(playerId: number | string | null | undefined, parkId: number | string | null | undefined,
  now = Date.now()): Promise<T | null> {
  if (playerId == null || parkId == null) return null;
  const key = keyFor(playerId, parkId);
  try {
    const raw = await AsyncStorage.getItem(key);
    const saved = raw ? JSON.parse(raw) as Saved<T> : null;
    const list = usableSaved(saved, now);
    if (list && saved && !memory.has(key)) memory.set(key, saved);
    return list;
  } catch {
    return null;
  }
}
