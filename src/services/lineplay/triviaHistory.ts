/**
 * No-repeat rotation for queue trivia: the ids of the last
 * TRIVIA_NO_REPEAT_WINDOW questions a player has been dealt, oldest first,
 * stored per player on the device so it works offline and across sessions.
 *
 * fetchRideTrivia skips any question in this window while a fresh one is
 * eligible, and only when every eligible question has been seen does it
 * fall back to the one seen longest ago. A deal is remembered by its slot key
 * so re-rendering a card or replaying a slot shows the same question instead
 * of burning a new one. Nothing here throws to the UI.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRIVIA_NO_REPEAT_WINDOW = 150;
const PREFIX = 'lineplay_trivia_seen_v1_';
const MAX_REMEMBERED_DEALS = 400;

let storageKey = `${PREFIX}guest`;
let recent: string[] = [];
let loadedKey: string | null = null;
const deals = new Map<string, string>();

function trim(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Keep the latest occurrence of each id, newest last.
  for (let i = ids.length - 1; i >= 0 && out.length < TRIVIA_NO_REPEAT_WINDOW; i--) {
    const id = ids[i];
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.reverse();
}

function persist(): void {
  void AsyncStorage.setItem(storageKey, JSON.stringify(recent)).catch(() => undefined);
}

/** Load this player's history. Deals made before it loads are kept. */
export async function primeTriviaHistory(playerId?: number | null): Promise<void> {
  const key = `${PREFIX}${playerId ?? 'guest'}`;
  if (loadedKey === key) return;
  if (key !== storageKey) {
    storageKey = key;
    recent = [];
    deals.clear();
  }
  try {
    const raw = await AsyncStorage.getItem(key);
    const stored = raw ? JSON.parse(raw) : [];
    recent = trim([...(Array.isArray(stored) ? stored : []), ...recent]);
    loadedKey = key;
  } catch {
    // A fresh window still prevents repeats within this session.
  }
}

/** Question id -> position in the window (0 = seen longest ago). */
export function recentTriviaIds(): ReadonlyMap<string, number> {
  return new Map(recent.map((id, index) => [id, index]));
}

export function markTriviaSeen(id: string, dealKey?: string): void {
  recent = trim([...recent, id]);
  if (dealKey) {
    deals.set(dealKey, id);
    if (deals.size > MAX_REMEMBERED_DEALS) deals.delete(deals.keys().next().value as string);
  }
  persist();
}

/** The question already dealt to this slot, if any. */
export function dealtTriviaId(dealKey: string): string | undefined {
  return deals.get(dealKey);
}

/** Test hook. */
export function resetTriviaHistory(): void {
  recent = [];
  deals.clear();
  loadedKey = null;
  storageKey = `${PREFIX}guest`;
}
