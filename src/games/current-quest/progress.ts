/**
 * Local Current Quest progress: which mechanics this device has met (so the
 * Quick Run teaches currents first, tide second), best runs per seed (async
 * ghost challenges) and the Lagoon Chart sketches. Server progress for scored
 * contexts stays server-side (design 4.1); this is only presentation state.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RunProgressHint } from './library';

const KEY = 'cq.progress.v2';

export interface GhostRun {
  readonly seed: number;
  readonly context: string;
  readonly shells: number;
  readonly strokes: number[];
  /** ms since run start at which each voyage cleared (rail playback). */
  readonly clearAt: number[];
  readonly at: number;
  readonly name?: string;
}

export interface DailyEntry {
  /** Shells of the first completion (the scored attempt); practice runs never change it. */
  shells: number;
  strokes: number[];
  pars: number[];
  /** Per voyage [clear, par, golden] for the share card grid. */
  grid: boolean[][];
}

export interface CqProgress {
  runsCompleted: number;
  tideSeen: boolean;
  bestShells: number;
  /** Best shells per run type (NEW BEST stamp): quick, daily, ride, line, showdown, chart:<node>. */
  best: Record<string, number>;
  /** Runs that met a tide board (the tide medallion's "LOW in 2" tag shows for the first 3). */
  tideRuns: number;
  /** Daily Tide (14.3): consecutive days played and the last park-local date played. */
  dailyStreak: number;
  lastDaily: string | null;
  daily: Record<string, DailyEntry>;
  /** Lagoon Chart v0: best medal (0..4) and shells per node id. */
  chart: Record<string, { medal: number; shells: number }>;
  /** R10 one-more metric, local log until the server stores it: run end times and whether PLAY AGAIN followed within 10 s. */
  replays: { at: number; again: boolean }[];
  /** Pool boards 3-shelled (chart sketches, design 4.5). */
  sketches: string[];
  /** Recent verified-shape local runs, newest first (ghost challenges). */
  ghosts: GhostRun[];
  arrows: boolean;
  misfireHintShown: boolean;
}

export const EMPTY_PROGRESS: CqProgress = {
  runsCompleted: 0, tideSeen: false, bestShells: 0, best: {}, tideRuns: 0, dailyStreak: 0, lastDaily: null, daily: {}, chart: {}, replays: [],
  sketches: [], ghosts: [], arrows: false, misfireHintShown: false,
};

let cache: CqProgress | null = null;

export async function loadProgress(): Promise<CqProgress> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? { ...EMPTY_PROGRESS, ...(JSON.parse(raw) as Partial<CqProgress>) } : { ...EMPTY_PROGRESS };
  } catch {
    cache = { ...EMPTY_PROGRESS };
  }
  return cache;
}

export async function saveProgress(update: (p: CqProgress) => CqProgress): Promise<CqProgress> {
  const next = update(await loadProgress());
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Progress is a convenience; never break a run over storage.
  }
  return next;
}

export function hintOf(p: CqProgress): RunProgressHint {
  return { runsCompleted: p.runsCompleted, tideSeen: p.tideSeen };
}

/** Best ghost to race on this seed + context (same boards), or the latest run. */
export function ghostFor(p: CqProgress, seed: number, context: string): GhostRun | null {
  const same = p.ghosts.filter((g) => g.seed === seed && g.context === context);
  if (!same.length) return null;
  return same.reduce((a, b) => (b.shells > a.shells || (b.shells === a.shells && sum(b.strokes) < sum(a.strokes)) ? b : a));
}

function sum(a: number[]): number { return a.reduce((s, x) => s + x, 0); }

export function addGhost(p: CqProgress, g: GhostRun): CqProgress {
  const ghosts = [g, ...p.ghosts].slice(0, 24);
  return { ...p, ghosts };
}

// ---------------------------------------------------------------------------
// Daily Tide streak and personal bests (pure; the server owns the scored copy)

/** Days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const pb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((pb - pa) / 86400000);
}

/** Streak after playing on `today` (any park): +1 on the next day, kept on the same day, reset after a gap. */
export function streakAfter(last: string | null, streak: number, today: string): number {
  if (!last) return 1;
  const d = daysBetween(last, today);
  if (d === 0) return Math.max(1, streak);
  if (d === 1) return streak + 1;
  return 1;
}

/** The streak still shown on the entry tile on `today` (0 once a day was missed). */
export function liveStreak(p: Pick<CqProgress, 'lastDaily' | 'dailyStreak'>, today: string): number {
  if (!p.lastDaily) return 0;
  return daysBetween(p.lastDaily, today) <= 1 ? p.dailyStreak : 0;
}

/** Record a finished Daily: the first completion is the scored attempt; the streak ticks once per day. */
export function recordDaily(p: CqProgress, today: string, entry: DailyEntry): { next: CqProgress; scored: boolean } {
  const scored = !p.daily[today];
  const daily = scored ? { ...p.daily, [today]: entry } : p.daily;
  // Keep 60 days.
  const keys = Object.keys(daily).sort().slice(-60);
  const trimmed: Record<string, DailyEntry> = {};
  for (const k of keys) trimmed[k] = daily[k];
  return {
    next: { ...p, daily: trimmed, dailyStreak: streakAfter(p.lastDaily, p.dailyStreak, today), lastDaily: today },
    scored,
  };
}

/** NEW BEST: true when `shells` beats the stored best for this run type. */
export function isNewBest(p: CqProgress, key: string, shells: number): boolean {
  return shells > (p.best[key] ?? -1) && (p.best[key] ?? -1) >= 0;
}

export function withBest(p: CqProgress, key: string, shells: number): CqProgress {
  return shells > (p.best[key] ?? -1) ? { ...p, best: { ...p.best, [key]: shells } } : p;
}

/** Park-local date as YYYY-MM-DD (the device clock stands in for the park clock in the lab). */
export function localDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Daily Tide number (#1 = Thursday, October 1, 2026). */
export function dailyNumber(date: string): number {
  return daysBetween('2026-10-01', date) + 1;
}
