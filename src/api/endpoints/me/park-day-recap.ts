import client from '../../client';

export interface ParkDayRecap {
  readonly park_id: number;
  readonly park_name: string;
  readonly park_day: string;
  readonly previous_active_day: string | null;
  readonly timezone: string;
  readonly ride_wins: number;
  readonly distinct_rides_won: number;
  readonly new_coins: number;
  readonly line_play_sessions: number;
  readonly eligible_line_minutes: number;
  readonly ride_parts_earned: number;
  readonly coin_upgrades: number;
  readonly park_project_points: number;
  /** The day's coins with art, for the share card (newer servers). */
  readonly coins?: ReadonlyArray<{
    readonly asset_id: number;
    readonly ride_name: string;
    readonly coin_url: string | null;
    readonly new: boolean;
  }>;
  readonly moments: ReadonlyArray<{
    readonly type: 'new_coin' | 'ride_win' | 'line_play' | 'upgrade' | 'project';
    readonly title: string;
    readonly at: string;
    readonly story_memento?: {
      readonly chapter_title: string | null;
      readonly route_name: string | null;
    } | null;
  }>;
}

export async function getParkDayRecap(parkId: number, date?: string): Promise<ParkDayRecap> {
  const { data } = await client.get<{ data: ParkDayRecap }>('/me/park-day-recap', {
    params: { park_id: parkId, ...(date ? { date } : {}) },
  });
  return data.data;
}
