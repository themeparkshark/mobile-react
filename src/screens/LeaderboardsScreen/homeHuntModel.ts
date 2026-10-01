/**
 * Home Hunt Standings logic. Pure, so it is unit tested
 * (tools/tests/home-hunt-standings.test.cjs). Every field is read defensively:
 * an older or partial server answer never throws.
 */
import type { GameIconName } from '../../ui/iconNames';
import type { HomeHuntBoard, HomeHuntWeek, HuntBoardRow } from '../../api/endpoints/me/homeHunt';

export type StandingsTabKey = 'coins' | 'rides' | 'xp' | 'hunt';
export interface StandingsTabSpec { readonly key: StandingsTabKey; readonly label: string; readonly icon: GameIconName }

const BASE_TABS: readonly StandingsTabSpec[] = [
  { key: 'coins', label: 'Coins Won', icon: 'coin' },
  { key: 'rides', label: 'Rides', icon: 'ride' },
  { key: 'xp', label: 'Experience', icon: 'xp' },
];
const HUNT_TAB: StandingsTabSpec = { key: 'hunt', label: 'Home Hunt', icon: 'map' };

/** Three tabs when the server flag is off, four when it is on. */
export function standingsTabs(homeHuntEnabled: boolean): readonly StandingsTabSpec[] {
  return homeHuntEnabled ? [...BASE_TABS, HUNT_TAB] : BASE_TABS;
}

/** Four tabs share the same rail, so the type and icons tighten. */
export function standingsTabSizing(count: number): { readonly font: number; readonly icon: number; readonly stacked: boolean } {
  return count > 3 ? { font: 12, icon: 20, stacked: true } : { font: 15, icon: 22, stacked: false };
}

/** Which tab a deep link asks for ({ tab: 'home_hunt' }); falls back to the first. */
export function initialStandingsTab(param: unknown, tabs: readonly StandingsTabSpec[]): number {
  if (param === 'home_hunt' || param === 'hunt') {
    const index = tabs.findIndex(tab => tab.key === 'hunt');
    if (index >= 0) return index;
  }
  return 0;
}

export type HuntBoardView = 'zone' | 'friends';

/** A row, ready to draw. Near Me rows can never navigate and never carry a username. */
export interface HuntRowModel {
  readonly key: string;
  readonly rank: number;
  readonly name: string;
  readonly points: number;
  readonly finds: number;
  readonly isMe: boolean;
  /** Friends rows only: the player to open. Always null for Near Me. */
  readonly playerId: number | null;
  readonly rankChange: number;
  readonly avatar: {
    readonly id: number;
    readonly screen_name: string;
    readonly avatar_url: string | null;
    readonly inventory: unknown;
  };
}

/**
 * Build a row from a board row. Near Me uses ONLY the Hunter Name (`name`):
 * no username, screen name, user id or coordinates are read, and there is no
 * Player navigation. Friends rows may open the friend's profile.
 */
export function huntRowModel(row: HuntBoardRow, view: HuntBoardView): HuntRowModel {
  const rank = Number.isFinite(row?.rank) ? Number(row.rank) : 0;
  const name = typeof row?.name === 'string' ? row.name : '';
  const friendId = view === 'friends' && Number.isFinite(row?.user_id) ? Number(row.user_id) : null;
  return {
    key: `${view}:${rank}:${name}`,
    rank,
    name,
    points: Number(row?.points) || 0,
    finds: Number(row?.finds) || 0,
    isMe: row?.is_me === true,
    playerId: friendId,
    rankChange: Number(row?.rank_change) || 0,
    avatar: {
      id: friendId ?? -Math.max(1, rank),
      screen_name: name,
      avatar_url: row?.avatar_url ?? null,
      inventory: row?.inventory ?? null,
    },
  };
}

export function huntRows(board: HomeHuntBoard | null | undefined, view: HuntBoardView): readonly HuntRowModel[] {
  const rows = Array.isArray(board?.rows) ? board!.rows! : [];
  return rows.map(row => huntRowModel(row, view));
}

/** The sticky You row. Present only when the server sends your score row. */
export function huntMeRow(board: HomeHuntBoard | null | undefined, view: HuntBoardView): HuntRowModel | null {
  const me = board?.me;
  if (!me) return null;
  return huntRowModel({ rank: me.rank ?? 0, name: me.name, points: me.points, finds: me.finds, is_me: true,
    avatar_url: me.avatar_url, inventory: me.inventory }, view);
}

/** Top three rank slots, and the rows from rank 4 down. */
export function huntPodium<T extends { readonly rank: number }>(rows: readonly T[]): {
  readonly podium: readonly [T | null, T | null, T | null]; readonly rest: readonly T[];
} {
  const at = (rank: number) => rows.find(row => row.rank === rank) ?? null;
  return { podium: [at(1), at(2), at(3)], rest: rows.filter(row => row.rank > 3) };
}

/** "18 points to Top 25%", or the tier you hold when there is no next tier. */
export function tierProgressLine(week: Pick<HomeHuntWeek, 'next_tier' | 'tier' | 'unranked'> | null | undefined): string {
  if (!week) return '';
  if (week.unranked) return 'Not ranked this week.';
  const next = week.next_tier;
  if (next && Number.isFinite(next.points_needed) && next.label) {
    const n = Math.max(0, Math.ceil(next.points_needed));
    return `${n} ${n === 1 ? 'point' : 'points'} to ${next.label}`;
  }
  return week.tier?.label ? `${week.tier.label} tier` : '';
}

/** 0 to 1 progress toward the next tier: points over points plus what is still needed. */
export function tierProgressFraction(week: Pick<HomeHuntWeek, 'points' | 'next_tier'> | null | undefined): number {
  const points = Math.max(0, Number(week?.points) || 0);
  const needed = Number(week?.next_tier?.points_needed);
  if (!Number.isFinite(needed) || needed < 0) return 0;
  return points + needed === 0 ? 0 : Math.min(1, points / (points + needed));
}

/** Settings error text: the server's 422 message when there is one. */
export function settingsErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

/** Countdown to the end of the week: "3d 4h", "5h 12m", "9m", or "Ended". */
export function countdownText(endsAt: string | null | undefined, now: number): string {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  if (!Number.isFinite(end)) return '';
  const ms = end - now;
  if (ms <= 0) return 'Ended';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

/** Birth years for the wheel, newest first. There is no default selection. */
export function birthYearOptions(currentYear: number, span = 100): readonly number[] {
  const years: number[] = [];
  for (let year = currentYear; year > currentYear - span; year -= 1) years.push(year);
  return years;
}

/** The age question appears when the server asks for it, until it is answered or skipped. */
export function shouldAskAge(week: Pick<HomeHuntWeek, 'needs_age'> | null | undefined, handledThisSession: boolean): boolean {
  return week?.needs_age === true && !handledThisSession;
}

export interface HuntSettingsState {
  readonly visibilityEnabled: boolean;
  readonly visibilityValue: boolean;
  readonly rerollsLeft: number;
  readonly canReroll: boolean;
  readonly nudgeValue: boolean;
}

/** Toggle states for the settings block. The visibility toggle is only live for 13 and up. */
export function huntSettingsState(week: Partial<HomeHuntWeek> | null | undefined): HuntSettingsState {
  const rerolls = Math.max(0, Number(week?.rerolls_left) || 0);
  return {
    visibilityEnabled: week?.can_toggle_visibility === true,
    visibilityValue: week?.near_me_visible === true,
    rerollsLeft: rerolls,
    canReroll: rerolls > 0,
    nudgeValue: week?.friend_nudge_enabled === true,
  };
}

/** Rank change arrow for the odometer: a rising pluck on a rank up. */
export function rankMovement(previous: number | null | undefined, next: number | null | undefined): 'up' | 'down' | 'same' {
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous === next) return 'same';
  return (next as number) < (previous as number) ? 'up' : 'down';
}
