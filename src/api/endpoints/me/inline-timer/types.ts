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
  /** Queue Bonus Rounds servers only. */
  readonly generation?: number;
  readonly next_code_at?: string | null;
  /** Live players only; Echo seats are app-side flavor and never counted. */
  readonly live_players?: number;
  readonly lonely?: boolean;
  /** Captain Fin's hint in a lonely round, after your second guess on a stage. */
  readonly fin_hint?: { readonly position: number; readonly symbol: number } | null;
}

/** A bonus slot as the ring draws it. "hidden" slots (skipped or capped) are never drawn. */
export type LineBonusSlotState = 'locked' | 'open' | 'claimed' | 'hidden';
export type LineBonusSource = 'current_quest' | 'crew_puzzle' | 'crew_assist' | 'trivia';

export interface LineBonusSlot {
  readonly index: number;
  readonly opens_at_eligible_seconds: number;
  readonly state: LineBonusSlotState;
  readonly source: LineBonusSource | null;
  readonly saved?: boolean;
}

export interface LineBonusClaim {
  readonly index: number;
  readonly source: LineBonusSource;
  readonly parts: number;
  readonly saved?: boolean;
}

export interface LineBonusEncore {
  readonly kind: 'encore' | 'floor';
  readonly source: LineBonusSource;
  readonly xp: number;
  readonly energy: number;
}

/** Queue Bonus Rounds (queue-bonus.md 8.3). Absent or null while the server flag is off. */
export interface LineBonusSummary {
  readonly enabled: boolean;
  readonly slots: readonly LineBonusSlot[];
  readonly next_opens_at_eligible_seconds: number | null;
  readonly saved: { readonly source: LineBonusSource; readonly saved_at: string | null } | null;
  readonly claimed_now: readonly LineBonusClaim[];
  readonly encore_now: readonly LineBonusEncore[];
  readonly perks_now?: readonly { readonly kind: 'mastery' | 'queue_crew'; readonly parts: number }[];
  readonly coin_day_done: boolean;
  readonly remaining_coin_day: number;
  readonly remaining_park_day: number;
  readonly park_day_used?: number;
  readonly park_day_cap?: number;
  readonly encore?: {
    readonly xp: number; readonly energy: number; readonly floor_xp: number;
    readonly session_left: number; readonly park_day_left: number;
  };
  readonly sources: { readonly current_quest: boolean; readonly crew_puzzle: boolean; readonly trivia: boolean };
  readonly motion?: { readonly moving: boolean; readonly left_line: boolean };
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

/**
 * The wait screen block (L2): the line's coin and its live Part balance,
 * players at this ride now, and the posted-vs-real ratio from recent waits.
 * Absent on older servers and null while the flag is off.
 */
export interface LineWaitScreenSummary {
  readonly coin_asset_id: number | null;
  readonly parts_banked: number | null;
  readonly in_line_now: number | null;
  /** Median (time in line / posted wait) here; null until 5 waits back it. */
  readonly wait_ratio: number | null;
  readonly wait_ratio_samples: number;
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
  bonus?: LineBonusSummary | null;
  wait_screen?: LineWaitScreenSummary | null;
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
    bonus_round_parts?: number;
    live_parts?: number;
    encore_xp?: number;
    encore_energy?: number;
    bonus_park_day_used?: number;
    bonus_park_day_cap?: number;
  } | null;
}
