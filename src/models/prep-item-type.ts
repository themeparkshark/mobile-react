export interface PrepItemType {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly icon_url: string | null;
  readonly energy_reward: number;
  readonly ticket_reward: number;
  readonly experience_reward: number;
  readonly rarity: number;
  // Pivot data (when spawned for player)
  readonly latitude?: number;
  readonly longitude?: number;
  readonly active_from?: string;
  readonly active_to?: string;
  readonly pivot_id?: number;
}
