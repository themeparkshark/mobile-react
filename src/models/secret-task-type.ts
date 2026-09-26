export interface SecretTaskType {
  readonly coin_url: string;
  readonly coins: number;
  readonly experience: number;
  readonly energy_reward?: number;
  readonly ride_parts_reward?: number;
  readonly id: number;
  readonly is_active?: boolean;
  readonly asset_id?: number;
  readonly coin_level?: number;
  readonly times_completed?: number;
  readonly ticket_cost?: number;
  readonly latitude: string;
  readonly longitude: string;
  readonly name: string;
}
