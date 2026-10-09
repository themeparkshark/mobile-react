import client from '../../client';
import { deviceTimezone } from '../daily-gifts/create';

/**
 * Retention routes (backend claude/fb-retention-be, routes/api/retention.php).
 * New routes only; each answers {enabled: false} (GET) or 404 (POST) while its
 * server flag is off, so this code is inert until the server turns it on.
 */

export type GoalKind = 'chest' | 'catch' | 'play' | 'heart' | 'look';

export interface DailyGoal {
  readonly key: string;
  readonly kind: GoalKind;
  readonly target: number;
  readonly progress: number;
  readonly done: boolean;
  readonly park: boolean;
  readonly title: string;
  readonly hint: string;
  readonly icon: string;
  /** Show a progress bar (only where the title names the count). */
  readonly bar?: boolean;
  /** A second way to finish this goal (e.g. 'heart' on the new-look goal). */
  readonly alt?: string | null;
}

export interface Milestone { readonly day: number; readonly gear: boolean; readonly mystery_boxes: number; readonly label: string; readonly days_away?: number }

export type WeekDayState = 'done' | 'freeze' | 'missed' | 'today' | 'future' | 'before';

export interface DailyThreeReward { readonly coins: number; readonly tickets: number; readonly energy: number; readonly xp: number }
export interface WeeklyReward { readonly coins: number; readonly bonus_coins?: number; readonly tickets: number; readonly freezes: number; readonly mystery_boxes: number }

export interface DailyThreeState {
  readonly enabled: true;
  readonly date: string;
  readonly resets_at: string;
  readonly level: number;
  readonly goals: readonly DailyGoal[];
  readonly done: boolean;
  readonly claimable: boolean;
  readonly claimable_date: string | null;
  /** A streak milestone prize inside the chest that can be opened now. */
  readonly claimable_milestone?: Milestone | null;
  /** The reminder pushes are on (the switch on the card). */
  readonly reminders?: boolean;
  readonly claimed: boolean;
  /** What the last Daily 3 chest paid (today or yesterday), for a claim whose answer was lost. */
  readonly claimed_rewards?: (PaidRewards & { readonly date?: string }) | null;
  readonly reward: DailyThreeReward;
  readonly streak: {
    readonly days: number; readonly best: number; readonly freezes: number; readonly freeze_cap: number;
    readonly freeze_price: number; readonly at_risk: boolean; readonly counted_today: boolean;
    /** Freezes that saved the streak since the player last saw that card. */
    readonly freeze_saved?: number;
    readonly next_milestone?: Milestone | null;
  };
  readonly week: {
    readonly key: string;
    readonly days: readonly { readonly date: string; readonly state: WeekDayState }[];
    readonly done: number; readonly needed: number; readonly claimable: boolean; readonly claimed: boolean;
    readonly reward: WeeklyReward;
    readonly claimed_rewards?: PaidRewards | null;
  };
}

export type DailyThreePayload = DailyThreeState | { readonly enabled: false };

export interface PaidRewards {
  readonly coins?: number;
  readonly tickets?: number;
  readonly energy?: number;
  readonly xp?: number;
  readonly freezes?: number;
  readonly mystery_boxes?: number;
  /** Coins standing in for gear or a box that could not be given (shown as their own row). */
  readonly bonus_coins?: number;
  readonly date?: string;
  readonly milestone?: { readonly day: number; readonly label: string } | null;
  readonly item?: { readonly id: number; readonly name: string; readonly image: string | null; readonly rarity: number | null } | null;
  readonly level?: number;
}

export interface LevelChest {
  readonly level: number;
  readonly opened: boolean;
  readonly preview: { readonly coins: number; readonly bonus_coins?: number; readonly tickets: number; readonly energy: number; readonly item: boolean; readonly mystery_boxes: number };
  readonly rewards: PaidRewards | null;
}

export type LevelChestsPayload = { readonly enabled: true; readonly level: number; readonly chests: readonly LevelChest[] } | { readonly enabled: false };

const tz = () => { const t = deviceTimezone(); return t ? { timezone: t } : {}; };

export async function getDailyThree(): Promise<DailyThreePayload> {
  const { data } = await client.get<{ data: DailyThreePayload }>('/me/daily-three', { params: tz(), timeout: 10000 });
  if (!data?.data || typeof data.data !== 'object') throw new Error('Daily 3 response was malformed.');
  return data.data;
}

/** Claims answer fast or the reveal recovers by reading back what was paid (never a 12 s shake). */
const CLAIM_TIMEOUT_MS = 6000;

export async function claimDailyThree(): Promise<{ rewards: PaidRewards; state: DailyThreeState }> {
  const { data } = await client.post<{ data: { rewards: PaidRewards; state: DailyThreeState } }>('/me/daily-three/claim', tz(), { timeout: CLAIM_TIMEOUT_MS });
  return data.data;
}

export async function claimWeeklyBox(): Promise<{ rewards: PaidRewards; state: DailyThreeState }> {
  const { data } = await client.post<{ data: { rewards: PaidRewards; state: DailyThreeState } }>('/me/daily-three/weekly/claim', tz(), { timeout: CLAIM_TIMEOUT_MS });
  return data.data;
}

export async function buyStreakFreeze(): Promise<{ state: DailyThreeState }> {
  const { data } = await client.post<{ data: { state: DailyThreeState } }>('/me/daily-three/freeze', tz());
  return data.data;
}

export async function setReminders(enabled: boolean): Promise<{ state: DailyThreeState }> {
  const { data } = await client.put<{ data: { state: DailyThreeState } }>('/me/daily-three/reminders', { enabled, ...tz() });
  return data.data;
}

export async function markFreezeSeen(): Promise<{ state: DailyThreeState }> {
  const { data } = await client.post<{ data: { state: DailyThreeState } }>('/me/daily-three/freeze-seen', tz());
  return data.data;
}

export async function getLevelChests(): Promise<LevelChestsPayload> {
  const { data } = await client.get<{ data: LevelChestsPayload }>('/me/level-chests', { timeout: 10000 });
  if (!data?.data || typeof data.data !== 'object') throw new Error('Level chests response was malformed.');
  return data.data;
}

export async function openLevelChest(level: number): Promise<{ rewards: PaidRewards }> {
  const { data } = await client.post<{ data: { rewards: PaidRewards } }>(`/me/level-chests/${level}/open`, undefined, { timeout: CLAIM_TIMEOUT_MS });
  return data.data;
}
