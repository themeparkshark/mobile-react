export interface TaskType {
  readonly coin_url: string;
  readonly coins: number;
  readonly completion_goal: number;
  readonly experience: number;
  readonly energy_reward?: number;
  readonly ride_parts_reward?: number;
  readonly id: number;
  readonly asset_id?: number;
  readonly ticket_cost?: number;
  readonly latitude: string;
  readonly longitude: string;
  readonly name: string;
  readonly times_completed: number;
  readonly coin_level?: number;
  readonly active_from?: string;
  readonly active_to?: string;
}
