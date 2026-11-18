/**
 * Which coin cards this player has seen (fix round W3, T047): once a coin's
 * card has been read, the map's PLAY! starts that coin's game in one press
 * while the player holds Tickets. Saved per player (AsyncStorage
 * "tps.coinCardSeen.v1@p<id>"); a failed read only means one more card.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tps.coinCardSeen.v1';
const MAX_KEPT = 200;
const memory = new Map<string, Set<string>>();
const loading = new Map<string, Promise<Set<string>>>();

export function coinCardKey(playerId: number | string): string {
  return `${KEY}@p${playerId}`;
}

function coinId(taskType: string, taskId: number): string {
  return `${taskType}:${taskId}`;
}

function load(playerId: number): Promise<Set<string>> {
  const key = coinCardKey(playerId);
  const known = memory.get(key);
  if (known) return Promise.resolve(known);
  const pending = loading.get(key);
  if (pending) return pending;
  const read = AsyncStorage.getItem(key).then(raw => {
    const list = raw ? JSON.parse(raw) : [];
    const set = new Set<string>(Array.isArray(list) ? list.filter((v: unknown) => typeof v === 'string') : []);
    memory.set(key, set);
    return set;
  }).catch(() => { const set = new Set<string>(); memory.set(key, set); return set; })
    .finally(() => loading.delete(key));
  loading.set(key, read);
  return read;
}

/** Read the saved list early (the map calls this), so the PLAY! press can answer at once. */
export function warmCoinCardsSeen(playerId: number | null | undefined): void {
  if (playerId != null) void load(playerId);
}

/** True only when the list is loaded and has this coin: an unknown answer means "show the card". */
export function coinCardSeenNow(playerId: number | null | undefined, taskType: string, taskId: number): boolean {
  if (playerId == null) return false;
  return memory.get(coinCardKey(playerId))?.has(coinId(taskType, taskId)) === true;
}

export async function markCoinCardSeen(playerId: number | null | undefined, taskType: string, taskId: number): Promise<void> {
  if (playerId == null) return;
  const set = await load(playerId);
  const id = coinId(taskType, taskId);
  if (set.has(id)) return;
  set.add(id);
  const list = [...set].slice(-MAX_KEPT);
  try { await AsyncStorage.setItem(coinCardKey(playerId), JSON.stringify(list)); } catch { /* best effort */ }
}

/** Tests only. */
export function resetCoinCardsSeenForTests(): void {
  memory.clear();
  loading.clear();
}
