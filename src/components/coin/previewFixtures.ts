/**
 * Preview fixtures for progression v2 (dev preview screens only): the same
 * 10-row perk track and level-up reply the server sends, so the shelf, the
 * coin sheet, the level-up FX and the Crowning can be captured without a
 * backend. Never used for real players.
 */
import type { CoinBossBlock, LevelUpUnlocks, PerkTrackRow } from './progressionModel';
import { coinTier } from '../../constants/coinTiers';

const ROWS: readonly [number, string, string, string, PerkTrackRow['kind'], number][] = [
  [1, 'classic', 'Classic', 'Your coin on the shelf', 'milestone', 0],
  [2, 'line_mastery', 'Line Mastery', 'First line payout +1 Part', 'perk', 0],
  [3, 'ticket_back', 'Ticket Back', 'First paid win returns your Ticket', 'perk', 0],
  [4, 'double_day', 'Double Day', 'First win here pays double', 'perk', 0],
  [5, 'queue_crew', 'Queue Crew', '+1 Part per 3 line Parts', 'perk', 0],
  [6, 'sapphire_stand', 'Sapphire Stand', 'Sapphire rim, stand, 100 coins', 'milestone', 100],
  [7, 'ride_regular', 'Ride Regular', 'Every win here +1 Part', 'perk', 0],
  [8, 'starlight', 'Starlight', 'Orbiting stars and 150 coins', 'milestone', 150],
  [9, 'royal_pennant', 'Royal Pennant', 'Royal pennant and 200 coins', 'milestone', 200],
  [10, 'ride_boss', 'Ride Boss', "Wake this ride's Boss Shark", 'boss', 0],
];

export function previewPerkTrack(level: number, procToday: readonly string[] = []): PerkTrackRow[] {
  return ROWS.map(([row, key, name, short, kind, coins]) => ({
    level: row, key, name, short, kind, coins, unlocked: level >= row, proc_today: procToday.includes(key), boss_glimpse: row === 5,
  }));
}

export function previewUnlocks(level: number): LevelUpUnlocks {
  const row = ROWS[Math.max(0, Math.min(ROWS.length - 1, level - 1))];
  return { level, kind: row[4], key: row[1], name: row[2], short: row[3], tier: coinTier(level).name,
    boss_unlocked: level >= 10, glimpse_unlocked: level === 5, coins: row[5] };
}

export const PREVIEW_BOSS: CoinBossBlock = {
  family: 'pirate', name: 'Captain Tidefin', signature: 'Anchor Drop', state: 'ready', groggy: true,
  cleared: { normal: false, hard: false, shark: false }, stars: 0, gilded_progress: { done: 0, needed: 3 },
  twist_this_week: 'double_slam',
};

/** Level-up XP on the v2 curve (config/progression.php curve.xp). */
export const PREVIEW_LEVEL_XP: Readonly<Record<number, number>> = { 2: 20, 3: 30, 4: 40, 5: 60, 6: 80, 7: 100, 8: 130, 9: 160, 10: 250 };
