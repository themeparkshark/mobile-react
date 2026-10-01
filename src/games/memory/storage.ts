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
import { parseAlbum, type Album } from './modes/album';
import { EMPTY_STREAK, type StreakState } from './modes/daily';
import { EMPTY_LEDGER, NO_HEAT, type HeatToggles, type UnlockLedger } from './modes/unlocks';
import type { CoinEdition } from './engine';

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

// -----------------------------------------------------------------------------
// Album, Daily streak and today's Daily (design 4.3, 5.6). Cosmetic, local.
// -----------------------------------------------------------------------------


const ALBUM_KEY = 'tps.memorymatch.album.v1';
const STREAK_KEY = 'tps.memorymatch.streak.v1';
const DAILY_PREFIX = 'tps.memorymatch.daily.v1';
const PLAYER_KEY = 'tps.memorymatch.player.v1';

export async function loadAlbum(): Promise<Album> {
  try {
    return parseAlbum(await AsyncStorage.getItem(ALBUM_KEY));
  } catch {
    return parseAlbum(null);
  }
}

export async function saveAlbum(album: Album): Promise<void> {
  try {
    await AsyncStorage.setItem(ALBUM_KEY, JSON.stringify(album));
  } catch {
    // Cosmetic only: a failed write never breaks a run.
  }
}

export async function loadStreak(): Promise<StreakState> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    if (!raw) return EMPTY_STREAK;
    const s = JSON.parse(raw) as StreakState;
    return typeof s.streak === 'number' ? s : EMPTY_STREAK;
  } catch {
    return EMPTY_STREAK;
  }
}

export async function saveStreak(s: StreakState): Promise<void> {
  try {
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

/** Today's ranked Daily as it finished (verdicts only: no faces, no slots). */
export interface DailyRecord {
  day: string;
  deck: string;
  cleared: boolean;
  turns: number;
  pairs: number;
  score: number;
  stars: number;
  verdicts: number[];
  streak: number;
}

export async function loadDaily(day: string): Promise<DailyRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(`${DAILY_PREFIX}.${day}`);
    return raw ? (JSON.parse(raw) as DailyRecord) : null;
  } catch {
    return null;
  }
}

/** Only the first finished attempt of the day is kept (the ranked one). */
export async function saveDailyIfFirst(rec: DailyRecord): Promise<boolean> {
  try {
    const key = `${DAILY_PREFIX}.${rec.day}`;
    if (await AsyncStorage.getItem(key)) return false;
    await AsyncStorage.setItem(key, JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}

/** A stable local player key for the practice Daily shuffle. */
export async function loadPlayerKey(): Promise<string> {
  try {
    const k = await AsyncStorage.getItem(PLAYER_KEY);
    if (k) return k;
    const n = `p${Math.floor(Math.random() * 1e12).toString(36)}`;
    await AsyncStorage.setItem(PLAYER_KEY, n);
    return n;
  } catch {
    return 'local';
  }
}

// -----------------------------------------------------------------------------
// v8: Time Attack unlock ledger, Memory Rank history, glint runs, Heat,
// Ride Sprint PB (charged time) and coin edition, first-of-day intro.
// All local and cosmetic; ranked and paid results live on the server.
// -----------------------------------------------------------------------------


const V8_PREFIX = 'tps.memorymatch.v8';

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(`${V8_PREFIX}.${key}`);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as T;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(`${V8_PREFIX}.${key}`, JSON.stringify(value));
  } catch {
    // Cosmetic only.
  }
}

export async function loadLedger(): Promise<UnlockLedger> {
  const l = await readJson<UnlockLedger>('ledger', EMPTY_LEDGER);
  return { ...EMPTY_LEDGER, ...l };
}
export const saveLedger = (l: UnlockLedger) => writeJson('ledger', l);

/** Best board reached per Time Attack run, newest last (Memory Rank uses the last 10). */
export async function loadRankHistory(): Promise<number[]> {
  const h = await readJson<number[]>('rank', []);
  return Array.isArray(h) ? h.filter((x) => Number.isFinite(x)).slice(-10) : [];
}
export async function pushRankHistory(board: number): Promise<number[]> {
  const h = [...(await loadRankHistory()), board].slice(-10);
  await writeJson('rank', h);
  return h;
}

/** Finished Time Attack runs (the promise glint shows in the first 3). */
export async function loadTaRuns(): Promise<number> {
  const n = await readJson<number>('taRuns', 0);
  return Number.isFinite(n) ? n : 0;
}
export const saveTaRuns = (n: number) => writeJson('taRuns', n);

export const loadHeat = () => readJson<HeatToggles>('heat', NO_HEAT);
export const saveHeat = (h: HeatToggles) => writeJson('heat', h);

export interface RideRecord {
  /** Best charged clear time (ms). */
  bestMs: number | null;
  edition: CoinEdition;
}

export async function loadRideRecord(rideKey: string): Promise<RideRecord> {
  const r = await readJson<RideRecord>(`ride.${rideKey}`, { bestMs: null, edition: 'none' });
  return { bestMs: Number.isFinite(r.bestMs) ? r.bestMs : null, edition: r.edition ?? 'none' };
}
export const saveRideRecord = (rideKey: string, r: RideRecord) => writeJson(`ride.${rideKey}`, r);

/** The barker's intro card plays on the first play of the day only. */
export async function takeDailyIntro(day: string): Promise<boolean> {
  const last = await readJson<string>('intro', '');
  if (last === day) return false;
  await writeJson('intro', day);
  return true;
}

export const loadMastery = () => readJson<Record<string, number>>('mastery', {});
export const saveMastery = (m: Record<string, number>) => writeJson('mastery', m);
