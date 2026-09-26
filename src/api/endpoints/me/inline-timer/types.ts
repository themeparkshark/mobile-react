export interface CrewPuzzleGuess {
  readonly client_request_id?: string;
  readonly stage: number;
  readonly symbols: readonly number[];
  readonly exact: number;
  readonly misplaced: number;
  readonly solved_stage: boolean;
}

export interface CrewPuzzleSummary {
  readonly route: 'route_a' | 'route_b';
  readonly stage: number;
  readonly total_stages: number;
  readonly completed: boolean;
  readonly completed_at: string | null;
  readonly total_guesses: number;
  readonly participants: number;
  readonly can_guess: boolean;
  readonly seconds_until_guess: number;
  readonly needs_nearby_sample: boolean;
  readonly recent_guesses: readonly CrewPuzzleGuess[];
  readonly last_result: CrewPuzzleGuess | null;
}

export interface LineSignalSummary {
  readonly park_day: string;
  readonly community_target: number;
  readonly participants: number;
  readonly route_a_count: number;
  readonly route_b_count: number;
  readonly unlocked_route: 'route_a' | 'route_b' | null;
  readonly player_choice: 'route_a' | 'route_b' | null;
  readonly can_choose: boolean;
  readonly solo_route: 'route_a' | 'route_b' | null;
  readonly seconds_until_eligible: number;
  readonly seconds_until_solo: number;
  readonly puzzle: CrewPuzzleSummary | null;
}

export interface LineSessionResponse {
  success: boolean;
  session_id: string;
  status: 'active' | 'completed';
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  eligible_seconds: number;
  /** Present on servers that mint Parts at each verified milestone. */
  parts_credited?: number;
  parts_remaining_today?: number;
  part_interval_seconds: number;
  session_part_cap: number;
  ticket_interval_seconds?: number;
  ticket_available?: boolean | null;
  mastery_bonus_available?: boolean;
  crew_puzzle_bonus_available?: boolean;
  current_quest_bonus_enabled?: boolean;
  current_quest_seed?: number;
  current_quest_verified?: boolean;
  signal: LineSignalSummary | null;
  park_project: import('../park-projects').ParkProject | null;
  rewards: {
    coin_asset_id?: number;
    ride_parts: Array<{ ride_part: import('../../../../models/ride-part-type').RidePartType; quantity: number }>;
    bonus_energy: number;
    experience: number;
    tickets?: number;
    mastery_bonus_parts?: number;
    crew_puzzle_bonus_parts?: number;
    current_quest_bonus_parts?: number;
  } | null;
}
