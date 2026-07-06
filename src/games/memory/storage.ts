/**
 * storage.ts — Memory Match+ personal-best persistence.
 *
 * A tiny, defensive AsyncStorage wrapper. Zero network. A failing storage
 * subsystem must never crash the game (offline-first quality bar) — every call
 * swallows errors and returns a safe default.
 *
 * Best is keyed by difficulty so the 4x4 and 4x5 boards keep separate records.
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
