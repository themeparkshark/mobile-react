/**
 * Parade Beat progress (design 3.7, 4.5, 5.5): FTUE flags, stage unlocks,
 * personal bests per board, per-route timing offsets, mastery XP and the
 * saved ghost runs. Local and offline; the server owns rewards.
 *
 * The pure reducers are node-tested; load/save wrap AsyncStorage and never
 * throw (a storage failure must not break a round).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STAGE_ORDER, type StageId } from '../stages';

const KEY = 'paradeBeat.progress.v1';

export interface GhostRun {
  stage: StageId;
  format: 'queue' | 'ride';
  difficulty: number;
  seed: number;
  touches: string;
  marchBars: number[];
  autoFever: boolean;
  score: number;
  name: string;
  /** Per playable bar: cumulative score at the end of the bar (delta chip). */
  barScores: number[];
  at: number;
}

export interface ParadeProgress {
  firstParadeDone: boolean;
  seenCallouts: string[];
  /** Best stars per stage (any difficulty). */
  stars: Partial<Record<StageId, number>>;
  /** stage:difficulty:board -> best score. */
  pb: Record<string, number>;
  /** route -> offset ms. */
  offsets: Record<string, number>;
  mastery: Partial<Record<StageId, number>>;
  ghosts: Record<string, GhostRun>;
  lastStage?: StageId;
  plays: number;
  earbudNudgeShown?: boolean;
}

export function emptyProgress(): ParadeProgress {
  return { firstParadeDone: false, seenCallouts: [], stars: {}, pb: {}, offsets: {}, mastery: {}, ghosts: {}, plays: 0 };
}

export async function loadProgress(): Promise<ParadeProgress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    return { ...emptyProgress(), ...JSON.parse(raw) };
  } catch {
    return emptyProgress();
  }
}

export async function saveProgress(p: ParadeProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Local progress is a convenience; never break the round.
  }
}

/** Stages unlock one by one on a clear (design 5.5). Backpack Bounce needs 2 stars on 3 stages. */
export function unlockedStages(p: ParadeProgress): StageId[] {
  const out: StageId[] = [];
  for (const id of STAGE_ORDER) {
    if (id === 'backpack_bounce_a') {
      const twoStar = STAGE_ORDER.filter((s) => (p.stars[s] ?? 0) >= 2).length;
      if (twoStar >= 3) out.push(id);
      continue;
    }
    out.push(id);
    if ((p.stars[id] ?? 0) < 1) break;
  }
  return out;
}

/**
 * Next stage for a queue round: the first unlocked stage not yet cleared,
 * otherwise a seeded pick among unlocked stages that is not the last one.
 */
export function pickQueueStage(p: ParadeProgress, seed: number): StageId {
  const open = unlockedStages(p).filter((s) => s !== 'backpack_bounce_a' || (p.stars.shark_shop_a ?? 0) >= 2);
  const fresh = open.find((s) => (p.stars[s] ?? 0) < 1);
  if (fresh) return fresh;
  const pool = open.filter((s) => s !== p.lastStage);
  const list = pool.length ? pool : open;
  return list[(seed >>> 0) % list.length];
}

export function pbKey(stage: string, difficulty: number, board: 'stage' | 'march' | 'ride'): string {
  return `${stage}:${difficulty}:${board}`;
}

/** Mastery XP (design 5.5): score / 100, doubled for a new PB, stars add 200/400/800. */
export function masteryXp(score: number, stars: number, newPb: boolean): number {
  const starXp = stars >= 3 ? 800 : stars === 2 ? 400 : stars === 1 ? 200 : 0;
  return Math.floor(score / 100) * (newPb ? 2 : 1) + starXp;
}

export const MASTERY_TIERS = [1500, 4000, 8000, 14000, 22000];

export function masteryTier(xp: number): number {
  let t = 0;
  for (const need of MASTERY_TIERS) if (xp >= need) t++;
  return t;
}

export interface RoundRecord {
  stage: StageId;
  difficulty: number;
  board: 'stage' | 'march' | 'ride';
  score: number;
  stars: number;
  ftue: boolean;
}

/** Apply a finished round; returns the new progress and whether it was a PB. */
export function recordRound(p: ParadeProgress, r: RoundRecord): { next: ParadeProgress; newPb: boolean; tierUp: boolean } {
  const key = pbKey(r.stage, r.difficulty, r.board);
  const prevPb = p.pb[key] ?? 0;
  const newPb = r.score > prevPb;
  const xp0 = p.mastery[r.stage] ?? 0;
  const xp1 = xp0 + masteryXp(r.score, r.stars, newPb);
  const next: ParadeProgress = {
    ...p,
    firstParadeDone: p.firstParadeDone || r.ftue,
    stars: { ...p.stars, [r.stage]: Math.max(p.stars[r.stage] ?? 0, r.stars) },
    pb: newPb ? { ...p.pb, [key]: r.score } : p.pb,
    mastery: { ...p.mastery, [r.stage]: xp1 },
    lastStage: r.stage,
    plays: p.plays + 1,
  };
  return { next, newPb, tierUp: masteryTier(xp1) > masteryTier(xp0) };
}

export function ghostKey(stage: string, format: string, difficulty: number): string {
  return `${stage}:${format}:${difficulty}`;
}
