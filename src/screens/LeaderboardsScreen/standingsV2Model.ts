/**
 * Standings v2 logic (next-wave/standings-v2/PROPOSAL.md). Pure, so it is unit
 * tested (tools/tests/standings-v2-model.test.cjs). Every server field is read
 * defensively: a partial answer never throws.
 *
 * Three boards, one number each:
 *   week      rides won this week (each ride once per park day), every park
 *   friends   the same number, you and your friends
 *   all_time  ride coins collected, all parks or one park
 */
import type { GameIconName } from '../../ui/iconNames';
import type { StandingsBoardDto, StandingsBoardKey, StandingsRowDto } from '../../api/endpoints/me/standings';

export type StandingsV2TabKey = StandingsBoardKey | 'hunt';

export interface StandingsV2Tab {
  readonly key: StandingsV2TabKey;
  readonly label: string;
  readonly icon: GameIconName;
}

const BOARD_TABS: readonly StandingsV2Tab[] = [
  { key: 'week', label: 'This Week', icon: 'timer' },
  { key: 'friends', label: 'Friends', icon: 'heart' },
  { key: 'all_time', label: 'All-Time', icon: 'trophy' },
];
const HUNT_TAB: StandingsV2Tab = { key: 'hunt', label: 'Home Hunt', icon: 'map' };

/** Three boards; the Home Hunt board joins as a fourth tab only when its server flag is on. */
export function standingsV2Tabs(homeHuntEnabled: boolean): readonly StandingsV2Tab[] {
  return homeHuntEnabled ? [...BOARD_TABS, HUNT_TAB] : BOARD_TABS;
}

/** A deep link's { tab } param to a tab index. Old names map to their new board. */
export function initialStandingsV2Tab(param: unknown, tabs: readonly StandingsV2Tab[]): number {
  const wanted: Record<string, StandingsV2TabKey> = {
    week: 'week', today: 'week', rides: 'week', coins: 'week',
    friends: 'friends',
    all_time: 'all_time', alltime: 'all_time', collection: 'all_time', xp: 'all_time',
    home_hunt: 'hunt', hunt: 'hunt',
  };
  const key = typeof param === 'string' ? wanted[param] : undefined;
  const index = key ? tabs.findIndex(tab => tab.key === key) : -1;
  return index >= 0 ? index : 0;
}

export type StandingsMetric = 'ride_wins' | 'ride_coins';

/** "1 ride", "3 rides", "1 ride coin", "12 ride coins". */
export function unitWord(metric: StandingsMetric, count: number): string {
  const one = count === 1;
  return metric === 'ride_coins' ? (one ? 'ride coin' : 'ride coins') : (one ? 'ride' : 'rides');
}

export interface StandingsRowModel {
  readonly key: string;
  readonly rank: number | null;
  readonly id: number;
  readonly name: string;
  readonly score: number;
  readonly isMe: boolean;
  /** Shaped like PlayerType for <Avatar>: the dressed shark, a photo only on the Friends board. */
  readonly avatar: { readonly id: number; readonly screen_name: string; readonly avatar_url: string | null; readonly inventory: unknown };
}

export interface StandingsBoardModel {
  readonly board: StandingsBoardKey;
  readonly metric: StandingsMetric;
  readonly parkId: number | null;
  readonly available: number | null;
  readonly playersCount: number;
  readonly friendsCount: number | null;
  readonly endsAt: string | null;
  readonly rows: readonly StandingsRowModel[];
  readonly me: StandingsRowModel | null;
  readonly chase: { readonly name: string; readonly rank: number; readonly score: number; readonly toPass: number } | null;
}

const num = (value: unknown, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

export function rowModel(row: Partial<StandingsRowDto> | null | undefined, meId?: number | null): StandingsRowModel | null {
  if (!row || !Number.isFinite(Number(row.id))) return null;
  const id = Number(row.id);
  const name = typeof row.screen_name === 'string' && row.screen_name.trim() ? row.screen_name : `P${id}`;
  const rank = row.rank == null || !Number.isFinite(Number(row.rank)) ? null : Number(row.rank);
  return {
    key: `${id}`,
    rank,
    id,
    name,
    score: Math.max(0, num(row.score)),
    isMe: row.is_me === true || (meId != null && id === meId),
    avatar: { id, screen_name: name, avatar_url: row.avatar_url ?? null, inventory: row.inventory ?? null },
  };
}

export function boardModel(dto: Partial<StandingsBoardDto> | null | undefined, fallbackBoard: StandingsBoardKey, meId?: number | null): StandingsBoardModel {
  const board = dto?.board === 'week' || dto?.board === 'friends' || dto?.board === 'all_time' ? dto.board : fallbackBoard;
  const metric: StandingsMetric = dto?.metric === 'ride_coins' || (!dto?.metric && board === 'all_time') ? 'ride_coins' : 'ride_wins';
  const rows = (Array.isArray(dto?.rows) ? dto!.rows : [])
    .map(row => rowModel(row, meId)).filter((row): row is StandingsRowModel => row !== null);
  const chase = dto?.chase && typeof dto.chase.screen_name === 'string' && num(dto.chase.to_pass) > 0
    ? { name: dto.chase.screen_name, rank: num(dto.chase.rank), score: num(dto.chase.score), toPass: num(dto.chase.to_pass) }
    : null;
  return {
    board,
    metric,
    parkId: dto?.park_id == null ? null : num(dto.park_id),
    available: dto?.available == null ? null : num(dto.available),
    playersCount: num(dto?.players_count, rows.filter(r => r.score > 0).length),
    friendsCount: dto?.friends_count == null ? null : num(dto.friends_count),
    endsAt: typeof dto?.week?.ends_at === 'string' ? dto.week.ends_at : null,
    rows,
    me: rowModel(dto?.me ?? null, meId),
    chase,
  };
}

/** Top three places (by position) and everyone below. */
export function splitPodium<T>(rows: readonly T[]): { readonly podium: readonly [T | null, T | null, T | null]; readonly rest: readonly T[] } {
  return { podium: [rows[0] ?? null, rows[1] ?? null, rows[2] ?? null], rest: rows.slice(3) };
}

export type YouState = 'leader' | 'chasing' | 'join' | 'tied_top';

/**
 * The You card's one line. Short words, no jargon, no em dashes:
 *   leader   "You're #1! Hold the top spot."
 *   chasing  "2 more rides to pass gr8scott"
 *   join     "Win a ride to join this week"
 */
export function youLine(model: Pick<StandingsBoardModel, 'board' | 'metric' | 'me' | 'chase'>): { readonly state: YouState; readonly text: string } {
  const score = model.me?.score ?? 0;
  if (model.chase) {
    const n = model.chase.toPass;
    return { state: 'chasing', text: `${n} more ${unitWord(model.metric, n)} to pass ${model.chase.name}` };
  }
  if (score <= 0) {
    if (model.board === 'all_time') return { state: 'join', text: 'Win a ride coin to get on the board' };
    return { state: 'join', text: model.board === 'friends' ? 'Win a ride to race your friends' : 'Win a ride to join this week' };
  }
  if (model.me?.rank === 1) {
    return { state: 'leader', text: model.board === 'all_time' ? "You're #1! Top collector." : "You're #1! Hold the top spot." };
  }
  return { state: 'tied_top', text: 'Tied for the top. Win one more!' };
}

/** 0..1 fill for the chase bar: how close you are to passing the next player. */
export function chaseProgress(model: Pick<StandingsBoardModel, 'me' | 'chase'>): number {
  if (!model.chase) return (model.me?.score ?? 0) > 0 ? 1 : 0;
  const mine = Math.max(0, model.me?.score ?? 0);
  const target = mine + Math.max(1, model.chase.toPass);
  return Math.max(0, Math.min(1, mine / target));
}

/** The score chip under the tabs: "8 of 211 ride coins" or "8 rides". */
export function scoreSummary(model: Pick<StandingsBoardModel, 'metric' | 'me' | 'available'>): string {
  const score = model.me?.score ?? 0;
  if (model.metric === 'ride_coins' && model.available) return `${score} of ${model.available}`;
  return `${score} ${unitWord(model.metric, score)}`;
}

/** Countdown to the weekly reset: "3d 4h", "5h 12m", "9m", or "" without a date. */
export function resetCountdown(endsAt: string | null | undefined, now: number): string {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  if (!Number.isFinite(end)) return '';
  const minutes = Math.max(0, Math.floor((end - now) / 60_000));
  if (minutes <= 0) return 'now';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/** How many places you climbed since your last look (positive = up). 0 when unknown. */
export function rankClimb(previous: number | null | undefined, next: number | null | undefined): number {
  if (previous == null || next == null || !Number.isFinite(previous) || !Number.isFinite(next)) return 0;
  return previous - next;
}

/** The key a seen rank is stored under: one per board, park and week. */
export function seenRankKey(board: StandingsBoardKey, parkId: number | null | undefined, endsAt: string | null | undefined): string {
  return `standings-v2:${board}:${parkId ?? 'all'}:${board === 'all_time' ? 'ever' : (endsAt ?? '').slice(0, 10)}`;
}

/** Accessibility label for a row. */
export function rowLabel(row: Pick<StandingsRowModel, 'rank' | 'name' | 'score' | 'isMe'>, metric: StandingsMetric): string {
  const who = row.isMe ? `You, ${row.name}` : row.name;
  return `${row.rank ? `Rank ${row.rank}` : 'Not ranked yet'}, ${who}, ${row.score} ${unitWord(metric, row.score)}`;
}

/** A missing endpoint (an older server) or a signed-out viewer falls back to the legacy screen. */
export function isMissingEndpoint(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 404 || status === 401;
}

/** Copy for a board with nobody on it yet. */
export function emptyCopy(board: StandingsBoardKey, friendsCount: number | null): { readonly title: string; readonly message: string; readonly action: string; readonly target: 'Explore' | 'Friends' } {
  if (board === 'friends' && !friendsCount) {
    return { title: 'Race your friends', message: 'Add a friend and see who rides more this week.', action: 'Add friends', target: 'Friends' };
  }
  if (board === 'all_time') {
    return { title: 'Be the first collector', message: 'Win a ride challenge to earn a ride coin.', action: 'Find a ride', target: 'Explore' };
  }
  return { title: 'Be first this week', message: 'Nobody has won a ride yet. Win one to take the top spot.', action: 'Find a ride', target: 'Explore' };
}
