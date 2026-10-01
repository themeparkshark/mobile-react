/**
 * Local Banana progress: queue runs (the unlock gate), teaching cards already
 * seen, personal bests, the PB ghost per ride, BEST JUGGLE per Daily Seed,
 * Ride Mastery steps and whether the ball is learned (the local fallback for
 * the server's ride_intro / ride lookup). Display and pacing only: nothing
 * here changes a verified score, and the server never trusts it (unlock,
 * rules and cards travel inside the proof and are replayed).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROGRESS_KEY, R_INTRO, R_RIDE, TWIST_CROSSWIND, TWIST_PRIZES } from './constants';
import { dayKey, hashDay } from './day';

export interface BananaProgress {
  queueRuns: number;
  cards: number;
  bestRide: number;
  bestQueue: number;
  /** A verified run with best_life_bounces >= 10 and a hanging-prize POP: Ride moves to full rules. */
  ballLearned: boolean;
  /** Ride Mastery steps (2+ star Rides) per ride id: 1 Bronze, 2 Silver, 3 Gold. */
  mastery: Record<string, number>;
  /** BEST JUGGLE per ride per Daily Seed: key ride:day -> bounces. */
  juggle: Record<string, number>;
  /** First Win of the Day: ride:day keys already won. */
  firstWins: Record<string, boolean>;
  /** Wide Basket preference for unranked queue runs. */
  wideBasket: boolean;
  /** PB ghosts by key (mode:seed): compact proof input + score. */
  ghosts: Record<string, { input: string; score: number; at: number; rules?: string; unlock?: number; cards?: number; twist?: number }>;
}

export const EMPTY_PROGRESS: BananaProgress = {
  queueRuns: 0, cards: 0, bestRide: 0, bestQueue: 0, ballLearned: false, mastery: {}, juggle: {}, firstWins: {},
  wideBasket: false, ghosts: {},
};

function obj<T>(v: unknown): Record<string, T> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {};
}

export async function loadProgress(): Promise<BananaProgress> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return { ...EMPTY_PROGRESS, ghosts: {}, mastery: {}, juggle: {}, firstWins: {} };
    const p = JSON.parse(raw) as Partial<BananaProgress>;
    const num = (v: unknown) => (Number.isFinite(v) ? Number(v) : 0);
    return {
      queueRuns: num(p.queueRuns),
      cards: num(p.cards),
      bestRide: num(p.bestRide),
      bestQueue: num(p.bestQueue),
      ballLearned: p.ballLearned === true,
      mastery: obj<number>(p.mastery),
      juggle: obj<number>(p.juggle),
      firstWins: obj<boolean>(p.firstWins),
      wideBasket: p.wideBasket === true,
      ghosts: obj(p.ghosts),
    };
  } catch {
    return { ...EMPTY_PROGRESS, ghosts: {}, mastery: {}, juggle: {}, firstWins: {} };
  }
}

export async function saveProgress(p: BananaProgress): Promise<void> {
  // Keep only the 12 newest ghosts and the last 40 juggle / first-win keys.
  const keys = Object.keys(p.ghosts).sort((a, b) => p.ghosts[b].at - p.ghosts[a].at);
  const ghosts: BananaProgress['ghosts'] = {};
  keys.slice(0, 12).forEach((k) => {
    ghosts[k] = p.ghosts[k];
  });
  const trim = <T>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).slice(-40));
  try {
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify({ ...p, ghosts, juggle: trim(p.juggle), firstWins: trim(p.firstWins) }));
  } catch {
    // storage is best effort
  }
}

/** Queue unlock gate (6.4): run 1 catch + ball + puffer, run 2 the Gull Set + pail + forks, run 3+ ranked. */
export function unlockFor(queueRuns: number): number {
  return Math.max(1, Math.min(3, queueRuns + 1));
}

/** Local fallback for the server's ruleset lookup (6.1). */
export function rulesFor(p: BananaProgress): number {
  return p.ballLearned ? R_RIDE : R_INTRO;
}

/** A run that teaches the ball: 10+ bounces in one life and at least one hanging-prize POP. */
export function learnsBall(bestLife: number, pops: number): boolean {
  return bestLife >= 10 && pops >= 1;
}

/** Daily Seed per ride per park-local day (ghosts, BEST JUGGLE, the twist). */
export function dailySeed(date: Date, rideId?: number | string): number {
  const base = hashDay(date);
  const r = String(rideId ?? 'park');
  let h = base;
  for (let i = 0; i < r.length; i++) {
    h ^= r.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Today's Park Twist for a ride (queue unlock 3+ and heats): one of the 4, from the Daily Seed. */
export function twistForDay(date: Date, rideId?: number | string): number {
  const h = dailySeed(date, rideId);
  return TWIST_CROSSWIND + (h % (TWIST_PRIZES - TWIST_CROSSWIND + 1));
}

export function juggleKey(date: Date, rideId?: number | string): string {
  return `${rideId ?? 'park'}:${dayKey(date)}`;
}

/** Mastery: 2+ star Ride runs step Bronze (1) -> Silver (2) -> Gold (3). */
export function masteryAfter(cur: number, stars: number): number {
  return stars >= 2 ? Math.min(3, cur + 1) : cur;
}

export const MASTERY_NAMES = ['', 'BRONZE', 'SILVER', 'GOLD'];
