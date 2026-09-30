/**
 * storage.ts — Memory Match+ personal-best persistence.
 *
 * A tiny, defensive AsyncStorage wrapper. Zero network. A failing storage
 * subsystem must never crash the game (offline-first quality bar) — every call
 * swallows errors and returns a safe default.
 *
 * Best is keyed by difficulty so ride and queue boards keep separate records.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'tps.memorymatch.best.v1';

function keyFor(difficulty: number): string {
  return `${KEY_PREFIX}.d${difficulty}`;
}

/** Read the stored personal best for a difficulty. Returns 0 when absent. */
export async function loadPersonalBest(difficulty: number): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(difficulty));
    if (raw == null) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Persist a new score only if it beats the stored best. Returns the resulting
 * best and whether this call set a new record (for the results flourish).
 */
export async function savePersonalBest(
  difficulty: number,
  score: number,
): Promise<{ best: number; isNewBest: boolean }> {
  try {
    const prev = await loadPersonalBest(difficulty);
    if (score > prev) {
      await AsyncStorage.setItem(keyFor(difficulty), String(score));
      return { best: score, isNewBest: true };
    }
    return { best: prev, isNewBest: false };
  } catch {
    // Storage unavailable — report the run's own score as best, no record flag.
    return { best: score, isNewBest: false };
  }
}

// -----------------------------------------------------------------------------
// Ride Sprint personal-best ghost (design 4.1, 6.8)
// -----------------------------------------------------------------------------

const GHOST_PREFIX = 'tps.memorymatch.ghost.v1';

export interface MemoryGhost {
  /** Elapsed ms at each pair of the best clear. */
  pairTimes: number[];
  clearMs: number;
  /** true when this is the ride's median stand-in, not a real run. */
  median?: boolean;
}

/** The stand-in when a player has no clear on this ride yet (a typical 34s clear). */
export function medianGhost(pairs = 8, clearMs = 34000): MemoryGhost {
  const pairTimes: number[] = [];
  for (let i = 1; i <= pairs; i++) pairTimes.push(Math.round((clearMs * Math.pow(i / pairs, 0.9))));
  return { pairTimes, clearMs, median: true };
}

export async function loadGhost(key: string): Promise<MemoryGhost | null> {
  try {
    const raw = await AsyncStorage.getItem(`${GHOST_PREFIX}.${key}`);
    if (!raw) return null;
    const g = JSON.parse(raw) as MemoryGhost;
    return Array.isArray(g.pairTimes) && Number.isFinite(g.clearMs) ? g : null;
  } catch {
    return null;
  }
}

/** Save when faster than the stored ghost. Returns true on a new PB. */
export async function saveGhostIfBest(key: string, ghost: MemoryGhost): Promise<boolean> {
  try {
    const prev = await loadGhost(key);
    if (prev && !prev.median && prev.clearMs <= ghost.clearMs) return false;
    await AsyncStorage.setItem(`${GHOST_PREFIX}.${key}`, JSON.stringify(ghost));
    return true;
  } catch {
    return false;
  }
}

/** Ghost pairs at an elapsed time. */
export function ghostPairsAt(ghost: MemoryGhost, elapsedMs: number): number {
  let n = 0;
  while (n < ghost.pairTimes.length && ghost.pairTimes[n] <= elapsedMs) n++;
  return n;
}
