/**
 * Local best-round ghosts per boss per week (design 11.4). The server keeps
 * the authoritative weekly best for friends and boards (WS6); this local copy
 * lets a player race their own best on the same seed and variant right away,
 * offline, in any line.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RoundLog } from '../sim/round';
import type { BossId } from '../sim/constants';

export interface StoredGhost { name: string; damage: number; log: RoundLog; savedAt: number }

export function weekKey(now: number): number {
  // ISO-ish week number since epoch (Monday start), stable across time zones enough for a local cache.
  return Math.floor((now / 86400000 + 3) / 7);
}

const key = (boss: BossId, week: number) => `boss_ghost_v4:${boss}:${week}`;

export async function loadGhost(boss: BossId, now = Date.now()): Promise<StoredGhost | null> {
  try {
    const raw = await AsyncStorage.getItem(key(boss, weekKey(now)));
    if (!raw) return null;
    const g = JSON.parse(raw) as StoredGhost;
    return g && g.log && Array.isArray(g.log.bouts) && g.log.bouts.length === 3 ? g : null;
  } catch {
    return null;
  }
}

/** Keep the week's best full round (3 bouts). Returns true when it became the new ghost. */
export async function saveGhostIfBest(boss: BossId, g: StoredGhost): Promise<boolean> {
  if (g.log.bouts.length !== 3) return false;
  try {
    const cur = await loadGhost(boss, g.savedAt);
    if (cur && cur.damage >= g.damage) return false;
    await AsyncStorage.setItem(key(boss, weekKey(g.savedAt)), JSON.stringify(g));
    return true;
  } catch {
    return false;
  }
}
