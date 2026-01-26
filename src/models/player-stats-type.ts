export interface PlayerStatsType {
  readonly energy: number;
  readonly max_energy: number;
  readonly tickets: number;
  readonly current_streak: number;
  readonly longest_streak: number;
  readonly streak_multiplier: number;
  readonly streak_at_risk: boolean;
  readonly seconds_until_next_energy: number;
  readonly energy_regenerated?: number;
  readonly experience?: number;
}
