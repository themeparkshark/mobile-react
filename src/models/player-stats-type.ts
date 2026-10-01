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
  readonly ticket_guarantee_in?: number;
  /** Today's home Ticket cap is used up (economy.home_tickets); the guarantee line hides. */
  readonly home_tickets_capped?: boolean;
  readonly focused_prep_set?: {
    readonly slug: string;
    readonly name: string;
    readonly theme: string | null;
    readonly available_now: boolean;
    readonly collected_count?: number;
    readonly total_items?: number;
  } | null;
}
