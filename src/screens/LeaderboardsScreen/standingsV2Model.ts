/**
 * Standings v2 logic (next-wave/standings-v2/PROPOSAL.md). Pure, so it is unit
 * tested (tools/tests/standings-v2-model.test.cjs). Every server field is read
 * defensively: a partial answer never throws.
 *
 * Three boards, one number each:
 *   week      rides won this week (each ride once per park day), every park
 *   friends   the same number, you and your friends
 *   all_time  ride coins collected, all parks or one park
 * Ties go to whoever reached the number first.
 */
import type { GameIconName } from '../../ui/iconNames';
import type { StandingsBoardDto, StandingsBoardKey, StandingsPageDto, StandingsRowDto } from '../../api/endpoints/me/standings';

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

/**
 * The tab Standings opens on (v3 r2): the board where your spot means
 * something today. Friends when 2 or more friends rode this week; else This
 * Week when you have rides; else All-Time, your collection. Null until both
 * weekly boards are known (keep This Week meanwhile).
 */
export function defaultStandingsTab(week: Pick<StandingsBoardModel, 'me'> & { readonly lastWeek?: StandingsBoardModel['lastWeek'] } | null, friends: Pick<StandingsBoardModel, 'rows'> | null): 'week' | 'friends' | 'all_time' | null {
  if (!week || !friends) return null;
  // Monday: an unseen results card (Tickets, a title) lives on This Week, so open there first.
  if (week.lastWeek && !week.lastWeek.seen) return 'week';
  const friendsRiding = friends.rows.filter(row => !row.isMe && row.score > 0).length;
  if (friendsRiding >= 2) return 'friends';
  if ((week.me?.score ?? 0) > 0) return 'week';
  return 'all_time';
}

export type StandingsMetric = 'ride_wins' | 'ride_coins';

/** "1 ride", "3 rides", "1 ride coin", "12 ride coins". */
export function unitWord(metric: StandingsMetric, count: number): string {
  const one = count === 1;
  return metric === 'ride_coins' ? (one ? 'ride coin' : 'ride coins') : (one ? 'ride' : 'rides');
}

/** One of Alex's eight shark colors for a player with no outfit, stable per player. */
export const SHARK_VARIANTS = 8;
export function sharkVariant(id: number): number {
  return ((Math.abs(Math.trunc(id)) % SHARK_VARIANTS) + SHARK_VARIANTS) % SHARK_VARIANTS;
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

export interface WeekGoal { readonly at: number; readonly xp: number; readonly reached: boolean }

export interface LastWeekResult {
  readonly weekStart: string;
  readonly rank: number;
  readonly score: number;
  readonly playersCount: number;
  readonly title: string | null;
  readonly tickets: number;
  /** A top-three place held for a grown-up review: no prize shown or promised yet. */
  readonly held: boolean;
  readonly seen: boolean;
}

export interface StandingsChase {
  readonly id: number;
  readonly name: string;
  readonly rank: number;
  readonly score: number;
  readonly toPass: number;
  readonly tied: boolean;
  /** v3: players toPass more jumps you past (a whole tie block), and the rank you land on. */
  readonly passes: number;
  readonly targetRank: number | null;
  readonly avatar: StandingsRowModel['avatar'];
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
  readonly aroundMe: readonly StandingsRowModel[];
  readonly me: StandingsRowModel | null;
  readonly chase: StandingsChase | null;
  readonly goals: readonly WeekGoal[];
  readonly lastWeek: LastWeekResult | null;
  /** A flagged win this week: the kid sees "Your rides are being checked" with their real count. */
  readonly review: { readonly rides: number; readonly benched: boolean } | null;
  /** Infinite scroll (v3): where the next page starts; null when every row is here. */
  readonly nextOffset: number | null;
  /** Rows the server sends per page (50 by default). */
  readonly pageSize: number;
  /** The board build later pages must read, so a rebuild never skips or repeats a player. */
  readonly build: string | null;
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
  const rowsOf = (list: unknown) => (Array.isArray(list) ? list : [])
    .map(row => rowModel(row as StandingsRowDto, meId)).filter((row): row is StandingsRowModel => row !== null);
  const rows = rowsOf(dto?.rows);
  const c = dto?.chase;
  const chase = c && typeof c.screen_name === 'string' && num(c.to_pass) > 0
    ? {
      id: num(c.id), name: c.screen_name, rank: num(c.rank), score: num(c.score), toPass: num(c.to_pass), tied: c.tied === true,
      passes: Math.max(1, num((c as { passes?: unknown }).passes, 1)),
      targetRank: (c as { target_rank?: unknown }).target_rank == null ? num(c.rank) : num((c as { target_rank?: unknown }).target_rank),
      avatar: { id: num(c.id), screen_name: c.screen_name, avatar_url: null, inventory: c.inventory ?? null },
    }
    : null;
  const goals = (Array.isArray(dto?.goals) ? dto!.goals : [])
    .filter(g => g && Number.isFinite(Number(g.at)))
    .map(g => ({ at: num(g.at), xp: num(g.xp), reached: g.reached === true }));
  const lw = dto?.last_week;
  const lastWeek = lw && Number.isFinite(Number(lw.rank)) && num(lw.rank) > 0
    ? { weekStart: String(lw.week_start ?? ''), rank: num(lw.rank), score: num(lw.score), playersCount: num(lw.players_count),
      title: typeof lw.title === 'string' && lw.title ? lw.title : null, tickets: num(lw.tickets), held: lw.held === true, seen: lw.seen === true }
    : null;
  const rv = (dto as { review?: { checking?: boolean; rides?: unknown; benched?: boolean } | null } | null | undefined)?.review;
  const review = rv && rv.checking === true ? { rides: num(rv.rides), benched: rv.benched === true } : null;
  return {
    board,
    metric,
    review,
    parkId: dto?.park_id == null ? null : num(dto.park_id),
    available: dto?.available == null ? null : num(dto.available),
    playersCount: num(dto?.players_count, rows.filter(r => r.score > 0).length),
    friendsCount: dto?.friends_count == null ? null : num(dto.friends_count),
    endsAt: typeof dto?.week?.ends_at === 'string' ? dto.week.ends_at : null,
    rows,
    aroundMe: rowsOf(dto?.around_me).filter(row => !rows.some(r => r.id === row.id)),
    me: rowModel(dto?.me ?? null, meId),
    chase,
    goals,
    lastWeek,
    nextOffset: nextOffsetOf(dto?.next_offset),
    pageSize: Math.max(3, num(dto?.page_size, 50)),
    build: typeof (dto as { build?: unknown } | null | undefined)?.build === 'string' ? (dto as { build: string }).build : null,
  };
}

/** A next_offset the list can use: a whole number above 0, else null (older servers send none). */
function nextOffsetOf(value: unknown): number | null {
  const n = Number(value);
  return value != null && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Appends one infinite-scroll page. Rows are keyed by player, so a page that
 * overlaps (the board moved between requests) never shows anyone twice, and a
 * player who climbed keeps their newest rank. Rows from the "Your spot" block
 * that are now in the list leave that block.
 */
export function mergePage(model: StandingsBoardModel, page: Partial<StandingsPageDto> | null | undefined, meId?: number | null): StandingsBoardModel {
  const incoming = (Array.isArray(page?.rows) ? page!.rows : [])
    .map(row => rowModel(row, meId)).filter((row): row is StandingsRowModel => row !== null);
  const byId = new Map<number, StandingsRowModel>();
  [...model.rows, ...incoming].forEach(row => byId.set(row.id, row));
  const rows = sortRows([...byId.values()]);
  const next = page && 'next_offset' in page ? nextOffsetOf(page.next_offset) : model.nextOffset;
  return {
    ...model,
    rows,
    aroundMe: model.aroundMe.filter(row => !byId.has(row.id)),
    playersCount: page?.players_count != null ? num(page.players_count, model.playersCount) : model.playersCount,
    // A page that came back empty ends the list even if the server said more.
    nextOffset: incoming.length ? next : null,
    build: typeof (page as { build?: unknown } | null | undefined)?.build === 'string' ? (page as { build: string }).build : model.build,
  };
}

/**
 * A background refresh brings a new first page. Pages the kid already
 * scrolled through stay (no jump, no lost place); only players the new first
 * page does not have are kept from the old rows.
 */
export function mergeRefresh(fresh: StandingsBoardModel, previous: StandingsBoardModel | null | undefined): StandingsBoardModel {
  if (!previous || previous.board !== fresh.board || previous.parkId !== fresh.parkId || previous.rows.length <= fresh.rows.length) return fresh;
  const have = new Set(fresh.rows.map(row => row.id));
  const lastRank = fresh.rows.reduce((max, row) => Math.max(max, row.rank ?? 0), 0);
  const kept = previous.rows.filter(row => !have.has(row.id) && (row.rank == null || row.rank > lastRank));
  if (!kept.length) return fresh;
  const rows = sortRows([...fresh.rows, ...kept.map(row => (row.isMe && fresh.me ? { ...row, ...fresh.me, key: row.key } : row))]);
  return {
    ...fresh,
    rows,
    aroundMe: fresh.aroundMe.filter(row => !rows.some(r => r.id === row.id)),
    nextOffset: previous.nextOffset == null ? null : Math.max(previous.nextOffset, fresh.nextOffset ?? 0),
  };
}

/** Ranked rows first by rank, then unranked rows (friends at 0) in the order they came. */
function sortRows(rows: readonly StandingsRowModel[]): StandingsRowModel[] {
  return rows.map((row, i) => ({ row, i }))
    .sort((a, b) => (a.row.rank ?? Infinity) - (b.row.rank ?? Infinity) || a.i - b.i)
    .map(entry => entry.row);
}

/** Top three places (by position) and everyone below. */
export function splitPodium<T>(rows: readonly T[]): { readonly podium: readonly [T | null, T | null, T | null]; readonly rest: readonly T[] } {
  return { podium: [rows[0] ?? null, rows[1] ?? null, rows[2] ?? null], rest: rows.slice(3) };
}

/** The list under the podium, as fixed-height items: rows, the "Not riding yet" divider, and the gap before your rows. */
export type ListItem =
  | { readonly type: 'row'; readonly key: string; readonly row: StandingsRowModel; readonly muted: boolean }
  | { readonly type: 'divider'; readonly key: string; readonly label: string }
  /** A grey placeholder row where the next page will land: same height, so nothing jumps when it fills. */
  | { readonly type: 'skeleton'; readonly key: string }
  /** After 3 failed loads, one "Tap to load more" row replaces the grey rows. */
  | { readonly type: 'retry'; readonly key: string }
  /** The end of the list: how many players are on this board. */
  | { readonly type: 'footer'; readonly key: string; readonly label: string };

export const ROW_HEIGHT = 64;
export const DIVIDER_HEIGHT = 40;
/** Placeholder rows shown at the end of the loaded rows while more exist. */
export const SKELETON_ROWS = 3;
/** Start loading the next page when the kid is this many rows from the last loaded one (1,920 pt, about 2.5 screens). */
export const PREFETCH_ROWS = 30;

/**
 * The list under the podium. With more pages to come, grey rows hold the
 * place where they will land (before the "Your spot" block), so the next page
 * fills in without moving anything.
 */
export function listItems(model: Pick<StandingsBoardModel, 'board' | 'rows' | 'aroundMe'> & { readonly nextOffset?: number | null; readonly playersCount?: number; readonly metric?: StandingsMetric },
  options: { readonly failed?: boolean } = {}): readonly ListItem[] {
  const scored = model.rows.filter(row => row.score > 0);
  const resting = model.board === 'friends' ? model.rows.filter(row => row.score <= 0) : [];
  const more = model.nextOffset != null;
  const items: ListItem[] = scored.slice(3).map(row => ({ type: 'row', key: row.key, row, muted: false }));
  const pending = (): ListItem[] => (options.failed ? [{ type: 'retry', key: 'retry' }]
    : Array.from({ length: SKELETON_ROWS }, (_, i) => ({ type: 'skeleton' as const, key: `skeleton-${i}` })));
  // Friends at 0 come last on the server too, so placeholders go after them.
  if (more && !resting.length) items.push(...pending());
  const shown = new Set(model.rows.map(row => row.id));
  const around = model.aroundMe.filter(row => !shown.has(row.id));
  if (around.length) {
    items.push({ type: 'divider', key: 'gap', label: 'Your spot' });
    around.forEach(row => items.push({ type: 'row', key: `near-${row.key}`, row, muted: false }));
  }
  if (resting.length) {
    items.push({ type: 'divider', key: 'resting', label: 'Not riding yet' });
    resting.forEach(row => items.push({ type: 'row', key: row.key, row, muted: true }));
    if (more) items.push(...pending());
  }
  // The end of the board (or of Your spot): how many are racing, never a blank void.
  if (model.board !== 'friends' && (model.playersCount ?? 0) > 3) {
    const n = model.playersCount as number;
    items.push({ type: 'footer', key: 'footer', label: model.metric === 'ride_coins' ? `${n.toLocaleString('en-US')} collectors` : `${n.toLocaleString('en-US')} riders this week` });
  }
  return items;
}

/** Index of the first placeholder row, or -1 when every row is loaded. */
export function firstSkeletonIndex(items: readonly ListItem[]): number {
  return items.findIndex(item => item.type === 'skeleton');
}

/** Whether a board model is for this tab and park (a page from another park must never land here). */
export function boardMatches(model: Pick<StandingsBoardModel, 'board' | 'parkId'> | null | undefined, board: StandingsBoardKey, parkId: number | null | undefined): boolean {
  if (!model || model.board !== board) return false;
  return board !== 'all_time' || (model.parkId ?? null) === (parkId ?? null);
}

/** Only the first page is here and more exist: page 2 can be fetched while the kid looks at the podium. */
export function onlyFirstPage(model: Pick<StandingsBoardModel, 'nextOffset' | 'rows' | 'pageSize'>): boolean {
  return model.nextOffset != null && model.rows.length <= model.pageSize;
}

/**
 * Whether to ask for the next page: the kid can see a row within
 * PREFETCH_ROWS of the placeholders, so the page lands before they reach them.
 */
export function shouldPrefetch(lastVisibleIndex: number, items: readonly ListItem[], firstVisibleIndex = 0): boolean {
  const at = firstSkeletonIndex(items);
  return at >= 0 && lastVisibleIndex >= at - PREFETCH_ROWS && safeToInsert(firstVisibleIndex, items);
}

/**
 * Whether a page may land now without moving what the kid is looking at:
 * the grey rows are on screen or below it. A kid down in the "Your spot"
 * block (below the grey rows) would see everything shift, so the page waits.
 */
export function safeToInsert(firstVisibleIndex: number, items: readonly ListItem[]): boolean {
  const at = items.findIndex(item => item.type === 'skeleton' || item.type === 'retry');
  return at < 0 || firstVisibleIndex <= at + SKELETON_ROWS - 1;
}

/** List row heights for the fixed-height items. */
export function itemLayouts(items: readonly ListItem[]): readonly { readonly length: number; readonly offset: number }[] {
  let offset = 0;
  return items.map(item => {
    const length = item.type === 'divider' ? DIVIDER_HEIGHT : item.type === 'retry' ? ROW_HEIGHT * SKELETON_ROWS : ROW_HEIGHT;
    const layout = { length, offset };
    offset += length;
    return layout;
  });
}

/** The podium's three places come from scored rows only (a 0-ride friend never stands on it). */
export function podiumRows(model: Pick<StandingsBoardModel, 'rows'>): readonly [StandingsRowModel | null, StandingsRowModel | null, StandingsRowModel | null] {
  return splitPodium(model.rows.filter(row => row.score > 0)).podium;
}

export type YouState = 'leader' | 'chasing' | 'tied' | 'join' | 'review';

/**
 * The pinned row's one next step (v3 r2). Glyph first for a 6 year old
 * (+1 cart, an arrow, the target), the sentence for readers and VoiceOver.
 * Milestones win: the top 10 when 3 or fewer away, or a weekly goal when 2
 * or fewer away; otherwise the next jump (a whole tie block at once).
 * Never names who beat you; never a dead-end button away from a park.
 */
export type NextStep =
  | { readonly kind: 'review'; readonly text: string }
  | { readonly kind: 'join'; readonly text: string; readonly canRide: boolean }
  | { readonly kind: 'leader'; readonly text: string }
  | { readonly kind: 'jump' | 'top10' | 'goal'; readonly plus: number; readonly target: string; readonly text: string;
      /** The glyph on the target chip: a crown for the podium, a trophy for the top 10, a star for a goal, an up arrow for a far jump. */
      readonly icon: 'crown' | 'trophy' | 'star' | 'up' | null };

export function nextStep(
  model: Pick<StandingsBoardModel, 'board' | 'metric' | 'me' | 'chase'> & { readonly review?: StandingsBoardModel['review']; readonly rows?: StandingsBoardModel['rows']; readonly goals?: StandingsBoardModel['goals'] },
  inPark = true,
): NextStep {
  const score = model.me?.score ?? 0;
  const unit = (n: number) => unitWord(model.metric, n);
  if (model.review?.benched && model.board !== 'all_time') {
    return { kind: 'review', text: 'Keep riding! Your rides are safe.' };
  }
  if (score <= 0 || model.me?.rank == null) {
    const what = model.metric === 'ride_coins' ? 'ride coin' : 'ride';
    return inPark
      ? { kind: 'join', canRide: true, text: `Win 1 ${what} to join!` }
      : { kind: 'join', canRide: false, text: `Next park day: win 1 ${what}!` };
  }
  if (!model.chase) {
    return { kind: 'leader', text: model.board === 'all_time' ? "You're #1! Top collector!" : "You're #1! Hold the top spot!" };
  }
  type Option = { kind: 'jump' | 'top10' | 'goal'; plus: number; target: string; text: string; icon: 'crown' | 'trophy' | 'star' | 'up' | null; order: number };
  const options: Option[] = [];
  const top10 = topTenGap(model);
  if (top10 != null && top10 <= 3) options.push({ kind: 'top10', plus: top10, target: 'TOP 10', icon: 'trophy', text: `${top10} more ${unit(top10)} to make the top 10!`, order: 0 });
  const goal = model.board !== 'all_time' ? (model.goals ?? []).find(g => !g.reached && g.at > score) : undefined;
  if (goal && goal.at - score <= 2) {
    const n = goal.at - score;
    // r3: the goal is the ride count a kid can see ("8"), never the abstract XP.
    options.push({ kind: 'goal', plus: n, target: `${goal.at}`, icon: 'star', text: `${n} more ${unit(n)} reaches your weekly goal of ${goal.at}!`, order: 1 });
  }
  const n = model.chase.toPass;
  const passes = model.chase.passes ?? 1;
  const landing = model.chase.targetRank ?? model.chase.rank;
  // A far jump reads as how many you pass (an up arrow and 1,250), not a five-digit rank.
  const far = landing > 999;
  options.push({ kind: 'jump', plus: n, order: 2,
    target: far ? passes.toLocaleString('en-US') : `#${landing}`, icon: far ? 'up' : landing <= 3 ? 'crown' : null,
    text: landing <= 3 ? `${n} more ${unit(n)} puts you on the podium!`
      : passes > 1 ? `${n} more ${unit(n)} ${n === 1 ? 'jumps' : 'jump'} you past ${passes.toLocaleString('en-US')} players!` : `${n} more ${unit(n)} to pass ${model.chase.name}!` });
  // Milestones first (r5): the top 10 within 3, or a weekly goal within 2, beats any jump
  // (#13 two rides from #12 but three from the top 10 sees TOP 10). Between two
  // milestones the closer wins, ties go to the top 10; with none, the jump.
  options.sort((x, y) => (x.kind === 'jump' ? 1 : 0) - (y.kind === 'jump' ? 1 : 0) || x.plus - y.plus || x.order - y.order);
  const { order: _order, ...best } = options[0];
  return best;
}

/** The pinned row's line state and sentence (kept for the spoken label and older callers). */
export function youLine(model: Parameters<typeof nextStep>[0], inPark = true): { readonly state: YouState; readonly text: string; readonly sub: string | null } {
  const step = nextStep(model, inPark);
  const state: YouState = step.kind === 'review' ? 'review' : step.kind === 'join' ? 'join' : step.kind === 'leader' ? 'leader'
    : model.chase?.tied ? 'tied' : 'chasing';
  return { state, text: step.text, sub: step.kind === 'review' ? 'The shark crew is double-checking a ride' : null };
}

/** How many more you need to take 10th place (ties go to whoever got there first), or null when you are in the top 10 or #10 is not loaded. */
export function topTenGap(model: Pick<StandingsBoardModel, 'me'> & { readonly rows?: StandingsBoardModel['rows'] }): number | null {
  const rank = model.me?.rank;
  if (rank == null || rank <= 10 || !model.rows) return null;
  const tenth = model.rows.find(row => row.rank === 10);
  return tenth ? Math.max(1, tenth.score - (model.me?.score ?? 0) + 1) : null;
}

/** The number on the chase chip: "+1" to join, "+N" to pass, nothing for leaders or rides under review. */
export function chaseChip(model: Pick<StandingsBoardModel, 'me' | 'chase'> & { readonly review?: StandingsBoardModel['review'] }, state: YouState): string | null {
  if (state === 'join') return '+1';
  if (state === 'chasing' || state === 'tied') return model.chase ? `+${model.chase.toPass}` : null;
  return null;
}

/** 0..1 fill for the chase bar: how close you are to passing the next player. */
export function chaseProgress(model: Pick<StandingsBoardModel, 'me' | 'chase'>): number {
  if (!model.chase) return (model.me?.score ?? 0) > 0 ? 1 : 0;
  const mine = Math.max(0, model.me?.score ?? 0);
  const target = mine + Math.max(1, model.chase.toPass);
  return Math.max(0, Math.min(1, mine / target));
}

/** "4 of 211" for All-Time, else the plain number. */
export function scoreText(model: Pick<StandingsBoardModel, 'metric' | 'available'>, score: number): string {
  return model.metric === 'ride_coins' && model.available ? `${score} of ${model.available}` : `${score}`;
}

export type WeekUrgency = 'calm' | 'last_day' | 'last_hours';

/**
 * Seven day dots, Monday to Sunday in the week's timezone (the week ends at
 * endsAt), with today glowing, and how urgent the end is.
 */
export function weekDots(endsAt: string | null | undefined, now: number): {
  readonly dots: readonly { readonly label: string; readonly state: 'past' | 'today' | 'future' }[];
  readonly daysLeft: number;
  readonly urgency: WeekUrgency;
  readonly label: string;
  readonly spoken: string;
} {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  if (!Number.isFinite(end)) {
    return { dots: letters.map(label => ({ label, state: 'future' as const })), daysLeft: 0, urgency: 'calm', label: '', spoken: '' };
  }
  const msLeft = Math.max(0, end - now);
  const dayMs = 86_400_000;
  // Index of today: 0 (Monday) .. 6 (Sunday), from the end of the week.
  const todayIndex = Math.max(0, Math.min(6, 6 - Math.floor(msLeft / dayMs)));
  const daysLeft = Math.ceil(msLeft / dayMs);
  const hours = Math.floor(msLeft / 3_600_000);
  const minutes = Math.floor((msLeft % 3_600_000) / 60_000);
  const urgency: WeekUrgency = msLeft <= 3 * 3_600_000 ? 'last_hours' : msLeft <= dayMs ? 'last_day' : 'calm';
  const label = urgency === 'last_hours' ? `Last chance! ${hours}h ${minutes}m`
    : urgency === 'last_day' ? 'Last day!' : `${daysLeft} days left`;
  const spoken = urgency === 'calm' ? `New week in ${daysLeft} days` : urgency === 'last_day' ? 'Last day of the week' : `Last chance, ${hours} hours ${minutes} minutes left this week`;
  return { dots: letters.map((l, i) => ({ label: l, state: i < todayIndex ? 'past' : i === todayIndex ? 'today' : 'future' })), daysLeft, urgency, label, spoken };
}

/**
 * The week's one-line clock for the board's single pill: "3 days left",
 * "Last day!" or "Last chance! 2h 10m". Replaces v2's seven day dots.
 */
export function weekLeft(endsAt: string | null | undefined, now: number): { readonly label: string; readonly urgency: WeekUrgency; readonly spoken: string } {
  const week = weekDots(endsAt, now);
  return { label: week.label, urgency: week.urgency, spoken: week.spoken };
}

/** How many places you climbed since your last look (positive = up). 0 when unknown. */
export function rankClimb(previous: number | null | undefined, next: number | null | undefined): number {
  if (previous == null || next == null || !Number.isFinite(previous) || !Number.isFinite(next)) return 0;
  return previous - next;
}

/** The players you passed: everyone now right below you who was at or above your old rank. */
export function passedPlayers(rows: readonly StandingsRowModel[], previous: number, next: number): readonly StandingsRowModel[] {
  if (!(previous > next)) return [];
  return rows.filter(row => !row.isMe && row.rank != null && row.rank > next && row.rank <= previous)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
}

/** The key a seen rank is stored under: one per player, board, park and week. */
export function seenRankKey(meId: number | null | undefined, board: StandingsBoardKey, parkId: number | null | undefined, endsAt: string | null | undefined): string {
  return `standings-v2:${meId ?? 0}:${board}:${parkId ?? 'all'}:${board === 'all_time' ? 'ever' : (endsAt ?? '').slice(0, 10)}`;
}

/** The podium's identity, so its entrance plays only when the top three changed. */
export function podiumSignature(podium: readonly (StandingsRowModel | null)[]): string {
  return podium.map(row => (row ? `${row.id}:${row.score}` : '-')).join('|');
}

/** Accessibility label for a row. */
export function rowLabel(row: Pick<StandingsRowModel, 'rank' | 'name' | 'score' | 'isMe'>, metric: StandingsMetric): string {
  const who = row.isMe ? `You, ${row.name}` : row.name;
  return `${row.rank ? `Rank ${row.rank}` : 'Not ranked yet'}, ${who}, ${row.score} ${unitWord(metric, row.score)}`;
}

/**
 * Only a server without the v2 endpoint falls back to the legacy screen: a
 * 404 that does not carry X-Standings. A real v2 answer (an unknown park,
 * a 401 for an expired session, a 500) never does.
 */
export function isMissingEndpoint(error: unknown): boolean {
  const response = (error as { response?: { status?: number; headers?: Record<string, unknown> } } | null)?.response;
  if (response?.status !== 404) return false;
  const headers = response.headers ?? {};
  const v2 = headers['x-standings'] ?? headers['X-Standings'];
  return v2 == null;
}

/** A v2 404 for a park that went away: the All-Time board resets to All Parks. */
export function isUnknownPark(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | null)?.response;
  return response?.status === 404 && response.data?.code === 'STANDINGS_PARK_NOT_FOUND';
}

/** Copy for a board with nobody on it yet. */
export function emptyCopy(board: StandingsBoardKey, friendsCount: number | null): { readonly title: string; readonly message: string; readonly action: string; readonly target: 'Explore' | 'Friends' } {
  if (board === 'friends' && !friendsCount) {
    return { title: 'Race your friends', message: 'Add a friend and see who rides more this week.', action: 'Add friends', target: 'Friends' };
  }
  if (board === 'all_time') {
    return { title: 'Be the first collector', message: 'Win a ride challenge to earn a ride coin.', action: 'Find a ride', target: 'Explore' };
  }
  return { title: 'The crown is up for grabs!', message: 'Nobody has won a ride this week. Win one and take the top spot.', action: 'Find a ride', target: 'Explore' };
}

/**
 * The Monday results card's lines. It leads with the rides you won, the rank
 * is small, and winner words appear only for a paid top-three result.
 */
export function lastWeekCopy(result: LastWeekResult): { readonly headline: string; readonly line: string; readonly reward: string | null } {
  // The card's header already says LAST WEEK: the lines never repeat it.
  const headline = `${result.score} ${unitWord('ride_wins', result.score)}!`;
  const paid = !result.held && result.tickets > 0 && !!result.title;
  // A top-three place that was not paid (a late, reviewed row) never shows a rank.
  // A held one says the crew is checking, and never promises the prize.
  const line = paid ? `${result.title}! #${result.rank}`
    : result.held ? 'Top 3! The shark crew is checking your week.'
    : result.rank <= 3 ? 'Great riding!' : `You finished #${result.rank}`;
  const reward = paid ? `+${result.tickets} Tickets` : null;
  return { headline, line, reward };
}

/** Spoken You card label: one number, no "0" while rides are being checked. */
export function youLabel(model: Parameters<typeof nextStep>[0] & Pick<StandingsBoardModel, 'available'>, climb: number, inPark = true): string {
  const line = youLine(model, inPark);
  if (line.state === 'review') {
    const n = model.review?.rides ?? 0;
    return `Your ${n} ${unitWord('ride_wins', n)} this week are safe. The shark crew is double-checking a ride. Keep riding!`;
  }
  const me = model.me;
  const score = me?.score ?? 0;
  const head = me?.rank ? `You are number ${me.rank} with ${scoreText(model, score)}` : `You have ${score} ${unitWord(model.metric, score)}`;
  const end = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
  return `${head}. ${end(line.text)}${climb > 0 ? ` Up ${climb} places.` : ''}`;
}

/**
 * The note a ride win leaves for Standings (rewards.standings from the resolve
 * answer): a reached weekly goal is the big one, otherwise "5 rides this week!".
 * Null when the ride did not count (a replay today, or a check).
 */
export function winNote(standings: unknown): { readonly text: string; readonly big: boolean } | null {
  const s = standings as { counted?: boolean; week_rides?: unknown; goals_reached?: { goal?: unknown; xp?: unknown }[] } | null | undefined;
  if (!s || s.counted !== true) return null;
  const goals = Array.isArray(s.goals_reached) ? s.goals_reached.filter(g => Number(g?.goal) > 0) : [];
  if (goals.length) {
    const best = goals[goals.length - 1];
    return { text: `Weekly goal: ${num(best.goal)} rides! +${goals.reduce((sum, g) => sum + num(g.xp), 0)} XP`, big: true };
  }
  const week = Math.max(1, num(s.week_rides));
  return { text: `${week} ${week === 1 ? 'ride' : 'rides'} this week!`, big: false };
}

/**
 * Whether your row is on screen, from geometry alone (a board that just
 * became the active tab cannot trust viewability events from while hidden).
 * At least 60% of the row must be inside the visible list area.
 */
export function rowOnScreen(rowTop: number, rowHeight: number, scrollTop: number, viewport: number): boolean {
  if (!(viewport > 0) || !(rowHeight > 0)) return false;
  const visible = Math.min(rowTop + rowHeight, scrollTop + viewport) - Math.max(rowTop, scrollTop);
  return visible >= rowHeight * 0.6;
}

/**
 * Tab rail geometry. The rail draws a 2 px border and 4 px padding on each
 * side, so its tabs share (width - 12); the pill is one tab wide and slides by
 * that same segment, staying centred under every tab.
 */
export function tabPillGeometry(railWidth: number, count: number): { readonly inner: number; readonly segment: number } {
  const inner = Math.max(0, railWidth - 12);
  return { inner, segment: count > 0 ? inner / count : 0 };
}
