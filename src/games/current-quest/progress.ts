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

export interface CqProgress {
  runsCompleted: number;
  tideSeen: boolean;
  bestShells: number;
  /** Pool boards 3-shelled (chart sketches, design 4.5). */
  sketches: string[];
  /** Recent verified-shape local runs, newest first (ghost challenges). */
  ghosts: GhostRun[];
  arrows: boolean;
  misfireHintShown: boolean;
}

export const EMPTY_PROGRESS: CqProgress = {
  runsCompleted: 0, tideSeen: false, bestShells: 0, sketches: [], ghosts: [], arrows: false, misfireHintShown: false,
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
