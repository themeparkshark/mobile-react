/**
 * Local Sharky progress (cache; WS7 makes it server-authoritative later):
 * unlock tier (= runs played, capped at 12), personal bests per mode, the
 * best ghost per mode (seed + input log, so it races on the identical course),
 * a difficulty rating from recent stars, missions and Ride Trail tokens.
 *
 * Every read and write tolerates missing or broken storage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InputEntry } from '../sim/core';

const KEY = '@sharky_swim/v2';

export interface GhostRecord {
  seed: number;
  mode: number;
  tier: number;
  difficulty: number;
  runs: number;
  score: number;
  finishStep: number;
  inputs: string;
  name: string;
  at: number;
  /** Score at each gate (Trackmania splits compare score, design 7.10). */
  splits?: number[];
}

export interface MissionState {
  id: string;
  progress: number;
  done: boolean;
}

export interface SharkyProgress {
  runs: number;
  best: Record<string, number>;
  recentStars: number[];
  ghosts: Record<string, GhostRecord>;
  missions: MissionState[];
  rank: number;
  rankCount: number;
  rideTokens: Record<string, number>;
  boostHintSeen: boolean;
}

export const EMPTY_PROGRESS: SharkyProgress = {
  runs: 0,
  best: {},
  recentStars: [],
  ghosts: {},
  missions: [],
  rank: 0,
  rankCount: 0,
  rideTokens: {},
  boostHintSeen: false,
};

export async function loadProgress(): Promise<SharkyProgress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_PROGRESS };
    const p = JSON.parse(raw) as Partial<SharkyProgress>;
    return { ...EMPTY_PROGRESS, ...p, best: p.best ?? {}, ghosts: p.ghosts ?? {}, rideTokens: p.rideTokens ?? {} };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

export async function saveProgress(p: SharkyProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Offline-first: a failed cache write never blocks play.
  }
}

/** Unlock tier from runs (design 5.9). */
export function unlockTier(runs: number): number {
  return Math.max(0, Math.min(12, runs));
}

/** Local difficulty rating: clamp(1, 3, 1 + floor(bestStarsLast5 / 2)). */
export function ratedDifficulty(p: SharkyProgress): 1 | 2 | 3 {
  const last = p.recentStars.slice(-5);
  const best = last.length ? Math.max(...last) : 0;
  return Math.max(1, Math.min(3, 1 + Math.floor(best / 2))) as 1 | 2 | 3;
}

/** The "NEW!" card shown after a run that crossed an unlock (design 5.9). */
export function unlockCard(runsBefore: number, runsAfter: number): string | null {
  const cards: Record<number, string> = {
    1: 'NEW: Prize Boxes',
    2: 'NEW: Overdrive',
    3: 'NEW: Rally your crew',
    4: 'NEW: Power-ups',
  };
  for (let r = runsBefore + 1; r <= runsAfter; r++) if (cards[r]) return cards[r];
  return null;
}

export type { InputEntry };
