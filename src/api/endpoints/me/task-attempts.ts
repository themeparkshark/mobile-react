import type { AttemptTrivia } from '../../../services/task-attempt/coinTrivia';
import type { GroupKind } from '../../../services/lineplay/lineGroup';
import { markStandingsStale, parkWinNote } from '../../../screens/LeaderboardsScreen/standingsCache';
import { winNote } from '../../../screens/LeaderboardsScreen/standingsV2Model';
import { showToast } from '../../../utils/toast';
import type { PerkChipData } from '../../../components/coin/progressionModel';
import client from '../../client';
import { noteCoinGame } from '../../../services/lineplay/coinGames';
import { withPlainAttemptNames } from '../../../helpers/plainRideName';

export type TaskAttemptGame = 'tap' | 'timing' | 'memory' | 'trivia' | 'photo';
export type TaskAttemptStatus = 'started' | 'won' | 'lost' | 'expired';

export interface TaskGameProof {
  game: TaskAttemptGame;
  score: number;
  elapsed_ms: number;
  seed: number;
  correct_count?: number;
  total_answered?: number;
  /** Whack-a-Shark ride goal progress (sharks whacked, golden counts 2). */
  hits?: number;
}

/** What this win did for the player's team at the ride (Ride Control). */
export interface RushReward {
  readonly wait: number;
  readonly typical: number;
  readonly bonus_parts: number;
  readonly bonus_xp: number;
}

export type RideControlReward =
  | { needs_team: true; ride_name?: string | null }
  | {
      needs_team?: undefined;
      ride_name: string;
      team: 'mouse' | 'globe' | 'shark';
      points: number;
      underdog: boolean;
      controller: 'mouse' | 'globe' | 'shark' | null;
      previous_controller: 'mouse' | 'globe' | 'shark' | null;
      flipped: boolean;
      captain: number | null;
    };

export interface EarnedCoinEdition {
  id: number;
  name: string;
  color: string;
  project_title: string;
  source: string;
  earned_at: string;
}

export interface TaskAttempt {
  id: number;
  task_type: 'task' | 'secret_task';
  task_id: number;
  ticket_cost: number;
  rescue_pass?: boolean;
  rescue_retry_available?: boolean;
  /** Which free way paid for this try (daily free try, a held extra try, or the retry after one). */
  rescue_source?: 'daily' | 'held' | 'held_retry' | null;
  game: TaskAttemptGame;
  seed?: number;
  status: TaskAttemptStatus;
  first_coin_ticket_returned?: boolean;
  rewards: {
    coins_earned: number;
    xp_earned: number;
    energy_earned: number;
    ride_parts_earned: number;
    /** Ride Parts already earned for this coin while waiting in its line, named on the win card (fix w4 T070). */
    line_parts?: number | null;
    task_name: string;
    coin_asset_id?: number | null;
    coin_times_collected?: number | null;
    next_ride_ticket_earned?: number;
    coin_edition?: EarnedCoinEdition;
    ride_control?: RideControlReward;
    /** Bonus paid because the ride was on a short-wait Rush when the attempt started. */
    rush?: RushReward;
    /** True on the first catch of this ride coin (paid at the top of the ride-coin ladder). */
    first_catch?: boolean;
    /** XP before the VIP bonus. */
    base_xp?: number;
    /** Coin perk procs the server paid on this win (progression v2): chips only, never computed here. */
    perks?: PerkChipData[];
    /** Ticket Back returned the Ticket this win spent. */
    ticket_back?: number;
  } | null;
  expires_at: string;
  /**
   * The rules the server checks for this try (core-loop builds). Fix round w3 T027 / T223: a
   * picture-only try plays the kid rules (Whack-a-Shark 10 bonks, Memory Match 6 pairs).
   */
  rules?: TaskAttemptRules;
  /** What TRY AGAIN deals after this loss: the other picture game after two misses on one (T232). */
  retry_game?: TaskAttemptGame | null;
  /** Beat the Buzzer's dealt round from the fact-checked bank (core-loop builds, T196): played as dealt. */
  trivia?: AttemptTrivia | null;
}

export interface TaskAttemptRules {
  trivia?: { questions: number; win_correct: number; question_ms: number };
  kid?: boolean;
  tap?: { win_bonks: number };
  memory?: { pairs: number };
}

/** Kid rules for this try: the server's word when it sends one, else the try was asked as picture-only. */
export function kidRulesFor(attempt: Pick<TaskAttempt, 'rules'> | null | undefined, pictureOnly: boolean): boolean {
  const kid = attempt?.rules?.kid;
  return typeof kid === 'boolean' ? kid : pictureOnly;
}

/**
 * Where Park Tickets come from right now (server config). Out-of-Tickets copy
 * reads this so it never points at a source that is switched off.
 */
export interface TicketSources {
  home: boolean;
  queue: boolean;
  queue_per_park_day: number;
}

export interface TaskAttemptResponse {
  attempt: TaskAttempt;
  tickets: number;
  ticket_sources?: TicketSources;
}

/** One line telling a player where their next Ticket comes from. */
export function ticketSourceCopy(sources: TicketSources | null | undefined): string {
  if (sources?.queue) {
    return `Earn Tickets from home finds, or play while you wait in line (up to ${sources.queue_per_park_day} a park day).`;
  }
  return 'Earn Tickets from home finds before your next park visit.';
}

/**
 * Core-loop extras (the server honors them once be-core-loop deploys; older servers ignore them):
 * retry_of names the lost attempt so TRY AGAIN deals the same game, picture_only asks for
 * Whack-a-Shark or Memory Match only (the "Picture games only" setting).
 */
export interface StartAttemptExtras {
  readonly retry_of?: number | null;
  readonly picture_only?: boolean;
  /** Who is playing (the LinePlay crew): "family" (with kids) deals the kids trivia deck (T199). */
  readonly crew?: GroupKind | null;
}

export async function startTaskAttempt(
  requestId: string,
  type: 'task' | 'secret_task',
  taskId: number,
  latitude: number,
  longitude: number,
  extras?: StartAttemptExtras,
): Promise<TaskAttemptResponse> {
  const { data } = await client.post<{ data: TaskAttemptResponse }>('/me/task-attempts', {
    client_request_id: requestId,
    task_type: type,
    task_id: taskId,
    latitude,
    longitude,
    ...(extras?.retry_of ? { retry_of: extras.retry_of } : {}),
    ...(extras?.picture_only ? { picture_only: 1 } : {}),
    ...(extras?.crew ? { crew: extras.crew } : {}),
  });
  // A coin game is open at this coin: ride detection never counts the time spent playing it as its line.
  if (type === 'task') noteCoinGame(taskId);
  // The win card names the ride like the guide card (hold R2).
  return withPlainAttemptNames(data.data);
}

export async function getTaskAttempt(id: number): Promise<TaskAttemptResponse> {
  const { data } = await client.get<{ data: TaskAttemptResponse }>(`/me/task-attempts/${id}`);
  // The win card names the ride like the guide card (hold R2).
  return withPlainAttemptNames(data.data);
}

export async function resolveTaskAttempt(
  id: number,
  outcome: 'win' | 'loss',
  proof?: TaskGameProof,
): Promise<TaskAttemptResponse> {
  const { data } = await client.post<{ data: TaskAttemptResponse }>(
    `/me/task-attempts/${id}/resolve`,
    { outcome, ...(outcome === 'win' && proof ? { proof } : {}) },
  );
  // The coin game closed: a ride's clock in ride detection starts from here.
  const played = data?.data?.attempt;
  if (played?.task_type === 'task') noteCoinGame(played.task_id);
  // Standings v2: a won ride changes your weekly number, so the next Standings
  // look refetches (and can celebrate the climb) instead of showing the old board.
  if (data?.data?.attempt?.status === 'won') {
    markStandingsStale();
    // The weekly goal moment: the win screen shows it when its coin reveal ends.
    const note = winNote((data.data.attempt.rewards as { standings?: unknown } | null | undefined)?.standings);
    if (note) parkWinNote(note, left => showToast(left.text, left.big ? 'reward' : 'success', left.big ? 4000 : 2200));
  }
  // The win card names the ride like the guide card (hold R2).
  return withPlainAttemptNames(data.data);
}
