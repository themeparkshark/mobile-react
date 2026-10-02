/**
 * Parade Beat progress (design 3.7, 4.5, 5.5): FTUE flags, stage unlocks,
 * personal bests per board, per-route timing offsets, mastery XP and the
 * saved ghost runs. Local and offline; the server owns rewards.
 *
 * The pure reducers are node-tested; load/save wrap AsyncStorage and never
 * throw (a storage failure must not break a round).
 */

import type { GripPrefs } from '../core/grip';
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
  /** Rev 6 ghosts only (Fever is always automatic since rev 7). */
  autoFever?: boolean;
  /** Chart version the run was judged on (a version bump retires old ghosts). */
  chartVersion?: string;
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
  /** Best stars per stage:difficulty (d2 unlocks at 2 stars on d1). */
  starsD?: Record<string, number>;
  /** Grip and handedness once the player has picked or we detected them. */
  grip?: GripPrefs;
  /** The player has walked during a round (the MARCH callout shows on stage 4 otherwise). */
  walkSeen?: boolean;
  /** Easy Beat (rev 7, 3.5): remembered per player, applies from the next round. */
  easyBeat?: boolean;
  /** d2 clears with no MARCH sections (Two Thumbs is offered once after 3). */
  d2CleanClears?: number;
  /** The one-time Two Thumbs prompt was answered (never asked again). */
  twoThumbsAsked?: boolean;
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

/** Rev 7 (5.3): the launch stages unlock in order on a clear (1 Stage star). */
export function unlockedStages(p: ParadeProgress): StageId[] {
  const out: StageId[] = [];
  for (const id of STAGE_ORDER) {
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
  const open = unlockedStages(p);
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

/** Rev 6: 3 cosmetic tiers per stage (crowd hats, drum skin decal, baton trail). */
export const MASTERY_TIERS = [2000, 6000, 12000];

/** Difficulty a stage plays at: d2 needs 2 stars on that stage's d1 (design 5.5). */
export function effectiveDifficulty(p: ParadeProgress, stage: StageId, wanted: number): 1 | 2 {
  if (wanted <= 1) return 1;
  return (p.starsD?.[`${stage}:1`] ?? 0) >= 2 ? 2 : 1;
}

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
    starsD: { ...(p.starsD ?? {}), [`${r.stage}:${r.difficulty}`]: Math.max(p.starsD?.[`${r.stage}:${r.difficulty}`] ?? 0, r.stars) },
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
