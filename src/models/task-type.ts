/**
 * A limited coin's rotation (Coin Map 2.0). In rotation it says when it leaves
 * (ends_on is the last park-local day); out of rotation it returns later.
 */
export interface LimitedWindow {
  readonly active: boolean;
  readonly ends_at: string | null;
  readonly ends_on?: string | null;
  readonly returns: boolean;
  /** The dated special edition this coin belongs to ("November 2026 Edition"); newer servers only. */
  readonly edition?: string | null;
}

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
  /** Null or absent for a permanent coin. */
  readonly limited?: LimitedWindow | null;
}
