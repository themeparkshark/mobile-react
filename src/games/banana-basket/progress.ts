/**
 * Local Banana progress: queue runs (the one-system-per-run unlock gate),
 * teaching cards already seen, personal bests and the PB ghost per ride.
 * Display and pacing only: nothing here changes a verified score, and the
 * server never trusts it (unlock and cards travel inside the proof).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROGRESS_KEY, TWIST_BEACH, TWIST_BREEZY } from './constants';
import { hashDay } from './day';

export interface BananaProgress {
  queueRuns: number;
  cards: number;
  bestRide: number;
  bestQueue: number;
  /** PB ghosts by key (mode:ride:seed): compact proof input + score. */
  ghosts: Record<string, { input: string; score: number; at: number }>;
}

export const EMPTY_PROGRESS: BananaProgress = { queueRuns: 0, cards: 0, bestRide: 0, bestQueue: 0, ghosts: {} };

export async function loadProgress(): Promise<BananaProgress> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return { ...EMPTY_PROGRESS, ghosts: {} };
    const p = JSON.parse(raw) as Partial<BananaProgress>;
    return {
      queueRuns: Number.isFinite(p.queueRuns) ? Number(p.queueRuns) : 0,
      cards: Number.isFinite(p.cards) ? Number(p.cards) : 0,
      bestRide: Number.isFinite(p.bestRide) ? Number(p.bestRide) : 0,
      bestQueue: Number.isFinite(p.bestQueue) ? Number(p.bestQueue) : 0,
      ghosts: p.ghosts && typeof p.ghosts === 'object' ? p.ghosts : {},
    };
  } catch {
    return { ...EMPTY_PROGRESS, ghosts: {} };
  }
}

export async function saveProgress(p: BananaProgress): Promise<void> {
  // Keep only the 12 newest ghosts.
  const keys = Object.keys(p.ghosts).sort((a, b) => p.ghosts[b].at - p.ghosts[a].at);
  const ghosts: BananaProgress['ghosts'] = {};
  keys.slice(0, 12).forEach((k) => {
    ghosts[k] = p.ghosts[k];
  });
  try {
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...p, ghosts }));
  } catch {
    // storage is best effort
  }
}

/** Queue unlock gate: run N (1-based, lifetime) adds one system until 5. */
export function unlockFor(queueRuns: number): number {
  return Math.max(1, Math.min(5, queueRuns + 1));
}

/**
 * Today's Park Twist (seeded by the park-local date so the whole crew shares
 * it). Gull Season waits for its gull art, so the rotation is Breezy and
 * Beach Party; water-ride decks force Splashdown in the sim.
 */
export function twistForDay(date: Date): number {
  const pool = [TWIST_BREEZY, TWIST_BEACH];
  return pool[hashDay(date) % pool.length];
}
