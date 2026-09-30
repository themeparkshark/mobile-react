import client from '../../client';
import type { TeamId } from '../../../constants/teams';

/** The exact server contribution result; a team/MVP label alone is not a takeover. */
export interface RideControlClaim {
  readonly park_id: number;
  readonly asset_id: number;
  readonly park_day: string;
  readonly confirmed_at: string;
  readonly ride_name: string;
  readonly team: TeamId;
  readonly points: number;
  readonly controller: TeamId | null;
  readonly previous_controller: TeamId | null;
  readonly flipped: boolean;
  readonly scores: Record<TeamId, number>;
}

export interface RideControlRide {
  readonly asset_id: number;
  readonly controller: TeamId;
  readonly scores: Record<TeamId, number>;
  readonly margin: number;
  readonly contested: boolean;
  readonly carried_over: boolean;
  readonly captain: { user_id: number; username: string | null; avatar_url?: string | null; points: number } | null;
  readonly your_points: number;
  readonly flipped_at: string | null;
}

export interface RideControlPark {
  readonly park_day: string;
  readonly rides_held: Record<TeamId, number>;
  readonly leading_team: TeamId | null;
  readonly your_team: TeamId | null;
  readonly your_team_is_underdog: boolean;
  readonly rides: readonly RideControlRide[];
  readonly points: Record<string, number>;
  readonly player_daily_cap: number;
}

export async function getRideControl(parkId: number): Promise<RideControlPark> {
  const { data } = await client.get<{ data: RideControlPark }>(`/parks/${parkId}/ride-control`);
  return data.data;
}
