import client from '../../client';

export interface TripGoalRide {
  readonly task_id: number;
  readonly asset_id: number;
  readonly park_id: number;
  readonly park_name: string;
  readonly ride_name: string;
  readonly coin_url: string;
  readonly coin_owned: boolean;
  readonly coin_level: number | null;
}

export interface TripGoalData {
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
