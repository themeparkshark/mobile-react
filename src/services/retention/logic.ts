/**
 * Daily 3 and level-chest presentation rules, kept free of React so they are
 * unit-tested (tools/tests/retention-logic.test.cjs).
 */
import type { DailyGoal, DailyThreeState, LevelChest, PaidRewards } from '../../api/endpoints/retention';

export type RewardKind = 'coins' | 'tickets' | 'energy' | 'xp' | 'freezes' | 'mystery_boxes' | 'item';

export interface RewardRow {
  readonly kind: RewardKind;
  readonly amount: number;
  readonly label: string;
  readonly image?: string | null;
}

const LABEL: Record<Exclude<RewardKind, 'item'>, [string, string]> = {
  coins: ['coin', 'coins'],
  tickets: ['Ticket', 'Tickets'],
  energy: ['Energy', 'Energy'],
  xp: ['XP', 'XP'],
  freezes: ['Streak Freeze', 'Streak Freezes'],
  mystery_boxes: ['Mystery Box', 'Mystery Boxes'],
};

/** The reveal order: the rare stuff lands last, the way a pack opening saves the chase. */
const ORDER: RewardKind[] = ['coins', 'tickets', 'energy', 'xp', 'freezes', 'item', 'mystery_boxes'];

/** What the server actually paid, as reveal rows (zeros skipped). */
export function rewardRows(paid: PaidRewards): RewardRow[] {
  const rows: RewardRow[] = [];
  for (const kind of ORDER) {
    if (kind === 'item') {
      if (paid.item) rows.push({ kind, amount: 1, label: paid.item.name, image: paid.item.image });
      continue;
    }
    const amount = Math.max(0, Math.floor(Number(paid[kind] ?? 0)));
    if (amount > 0) rows.push({ kind, amount, label: LABEL[kind][amount === 1 ? 0 : 1] });
  }
  return rows;
}

export function doneCount(goals: readonly DailyGoal[]): number {
  return goals.filter(g => g.done).length;
}

/** Goals that just turned done since the last look (each one gets its own pop). */
export function newlyDone(prev: readonly DailyGoal[] | null | undefined, next: readonly DailyGoal[]): string[] {
  if (!prev) return [];
  const before = new Map(prev.map(g => [g.key, g.done]));
  return next.filter(g => g.done && before.get(g.key) === false).map(g => g.key);
}

export type ButtonAttention = 'claim' | 'weekly' | 'risk' | 'none';

/**
 * The map button at a glance: three pips (one per goal), the streak number,
 * and one attention state. A ready chest beats everything; a streak at risk
 * only nags from 5 PM local, so the morning is calm.
 */
export function buttonState(s: DailyThreeState, localHour: number): { pips: boolean[]; streak: number; attention: ButtonAttention } {
  const pips = s.goals.slice(0, 3).map(g => g.done);
  while (pips.length < 3) pips.push(false);
  const attention: ButtonAttention = s.claimable ? 'claim' : s.week.claimable ? 'weekly'
    : s.streak.at_risk && s.streak.days > 0 && localHour >= 17 ? 'risk' : 'none';
  return { pips, streak: s.streak.days, attention };
}

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** One-letter weekday for a YYYY-MM-DD date (calendar math only, no timezone shifts). */
export function weekdayLetter(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  return LETTERS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "New goals in 5h" / "in 40m": whole hours above an hour, minutes below. */
export function resetLabel(resetsAt: string, now: number): string {
  const ms = Date.parse(resetsAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'New goals soon';
  const mins = Math.ceil(ms / 60000);
  return mins >= 60 ? `New goals in ${Math.floor(mins / 60)}h` : `New goals in ${mins}m`;
}

/** The next chest to present: the lowest unopened level. */
export function nextLevelChest(chests: readonly LevelChest[]): LevelChest | null {
  return [...chests].filter(c => !c.opened).sort((a, b) => a.level - b.level)[0] ?? null;
}

/** Streak copy: never shames, always says what to do. */
export function streakLine(s: DailyThreeState): string {
  const d = s.streak.days;
  if (s.done) return d > 1 ? `${d} days in a row!` : 'Streak started!';
  if (d > 0) return `${d}-day streak. Finish today to make it ${d + 1}!`;
  return 'Finish all 3 to start a streak';
}

export interface PushAskRecord {
  readonly asks: number;
  readonly lastAt: number | null;
}

export const PUSH_ASK_MAX = 3;
export const PUSH_ASK_GAP_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The reminders pre-prompt appears only right after a win (a chest just
 * opened), only while iOS has not been asked yet, at most 3 times, 3 days apart.
 */
export function pushAskAllowed(record: PushAskRecord, pushState: string, now: number): boolean {
  if (pushState !== 'undetermined') return false;
  if (record.asks >= PUSH_ASK_MAX) return false;
  return record.lastAt === null || now - record.lastAt >= PUSH_ASK_GAP_MS;
}

/** Whether a goal can be started from the sheet, and where the tap goes. */
export function goalAction(goal: DailyGoal): 'chest' | 'closet' | 'friends' | 'map' | null {
  if (goal.done) return null;
  switch (goal.kind) {
    case 'chest': return 'chest';
    case 'look': return 'closet';
    case 'heart': return 'friends';
    default: return 'map';
  }
}
