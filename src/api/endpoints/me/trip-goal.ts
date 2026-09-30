import client from '../../client';

export interface AdventureRide {
  readonly task_id: number;
  readonly asset_id: number;
  readonly ride_id: number;
  readonly ride_name: string;
  readonly coin_url: string;
  /** Where the ride's queue is, so Play can be gated by distance. */
  readonly lat?: number;
  readonly lng?: number;
  readonly radius?: number;
}

export interface AdventureStamp extends AdventureRide {
  readonly kind: 'owned_coin' | 'coin_win' | 'queue_story';
  readonly confirmed_at: string;
  readonly coin_level?: number;
  /** The won attempt behind a 'coin_win' Discover stamp. */
  readonly attempt_id?: number;
  readonly chapter_title?: string;
  readonly route_name?: string | null;
}

export interface AdventureTicket {
  readonly id: number;
  readonly park_id: number;
  readonly park_day: string;
  readonly started_at: string;
  readonly ride: AdventureRide;
  readonly ride_choices: readonly AdventureRide[];
  readonly discover: AdventureStamp | null;
  readonly play: AdventureStamp | null;
  readonly phase: 'discover' | 'play' | 'celebrate' | 'complete';
  readonly celebrated_at: string | null;
  /** 'arrival' (started on park check-in) or 'choice'. */
  readonly origin?: 'arrival' | 'choice';
  /** 'get_in_line': a story finished away from the queue, so the Play stamp still waits. */
  readonly play_hint?: 'get_in_line' | null;
}

export interface TripGoalRide {
  readonly ride_id?: number | null;
  readonly task_id: number;
  readonly asset_id: number;
  readonly park_id: number;
  readonly park_name: string;
  readonly ride_name: string;
  readonly coin_url: string;
  readonly coin_owned: boolean;
  readonly coin_level: number | null;
  /** The ride is an attraction that can host an Adventure Ticket. */
  readonly adventure_ready?: boolean;
}

export interface TripGoalData {
  /** Server feature flag (config adventure.enabled). Off: no ticket UI at all. */
  readonly adventure_enabled?: boolean;
  readonly adventure_ticket?: AdventureTicket | null;
  readonly rides: TripGoalRide[];
  readonly goal: TripGoalRide | null;
  readonly goal_unavailable: boolean;
  readonly goal_plan: {
    readonly current_level: number | null;
    readonly max_level: number;
    readonly next_level: number | null;
    readonly energy_cost: number | null;
    readonly energy_needed: number;
    readonly parts_cost: number | null;
    readonly parts_owned: number;
    readonly parts_needed: number | null;
    readonly maxed: boolean;
  } | null;
  readonly wallet: {
    readonly tickets: number;
    readonly energy: number;
    readonly ticket_cost: number;
    readonly tickets_needed: number;
    readonly rescue_pass_available?: boolean;
  };
}

export async function getTripGoal(): Promise<TripGoalData> {
  const { data } = await client.get<{ data: TripGoalData }>('/me/trip-goal', {
    timeout: 10_000,
  });
  return data.data;
}

export async function setTripGoal(taskId: number): Promise<TripGoalData> {
  const { data } = await client.put<{ data: TripGoalData }>('/me/trip-goal', { task_id: taskId });
  return data.data;
}

export async function clearTripGoal(): Promise<TripGoalData> {
  const { data } = await client.delete<{ data: TripGoalData }>('/me/trip-goal');
  return data.data;
}

export async function celebrateAdventureTicket(ticketId: number): Promise<AdventureTicket> {
  const { data } = await client.post<{ data: AdventureTicket }>(`/me/adventure-tickets/${ticketId}/celebrate`, {}, { timeout: 10_000 });
  return data.data;
}
