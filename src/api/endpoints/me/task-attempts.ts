import client from '../../client';

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
  game: TaskAttemptGame;
  seed?: number;
  status: TaskAttemptStatus;
  first_coin_ticket_returned?: boolean;
  rewards: {
    coins_earned: number;
    xp_earned: number;
    energy_earned: number;
    ride_parts_earned: number;
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
  } | null;
  expires_at: string;
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

export async function startTaskAttempt(
  requestId: string,
  type: 'task' | 'secret_task',
  taskId: number,
  latitude: number,
  longitude: number,
): Promise<TaskAttemptResponse> {
  const { data } = await client.post<{ data: TaskAttemptResponse }>('/me/task-attempts', {
    client_request_id: requestId,
    task_type: type,
    task_id: taskId,
    latitude,
    longitude,
  });
  return data.data;
}

export async function getTaskAttempt(id: number): Promise<TaskAttemptResponse> {
  const { data } = await client.get<{ data: TaskAttemptResponse }>(`/me/task-attempts/${id}`);
  return data.data;
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
  return data.data;
}
