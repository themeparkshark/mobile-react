import client from '../../client';
import type { TeamId } from '../../../constants/teams';
import type { BossId } from '../parks/raid';

export interface HomeCheerTarget {
  readonly asset_id: number;
  readonly ride_name: string | null;
  readonly controller: TeamId;
  /** True when your team holds it (gap = its lead); otherwise how far behind you are. */
  readonly holding: boolean;
  readonly gap: number;
}

export interface LiveParkSummary {
  readonly park_id: number;
  readonly name: string;
  readonly rides_held: Record<TeamId, number>;
  readonly leading_team: TeamId | null;
  readonly rushes: number;
  readonly raid: {
    readonly id: number; readonly boss: BossId; readonly ride_name: string | null;
    readonly hp_max: number; readonly hp_left: number; readonly ends_at: string; readonly fighters: number;
  } | null;
  readonly cheers: readonly HomeCheerTarget[];
}

export interface LiveParks {
  /** The next boss surfacing anywhere (shown in the player's own time zone). */
  readonly next_boss: { readonly at: string; readonly park_name: string } | null;
  readonly your_team: TeamId | null;
  readonly totals: Record<TeamId, number>;
  readonly leading_team: TeamId | null;
  readonly cheers_left: number;
  readonly cheer_points: number;
  readonly parks: readonly LiveParkSummary[];
}

export async function getLiveParks(): Promise<LiveParks> {
  const { data } = await client.get<{ data: LiveParks }>('/live-parks');
  return data.data;
}

export type CheerResult =
  | { ok: true; duplicate?: boolean; cheer?: { ride_name: string; team: TeamId; points: number; controller: TeamId; flipped: boolean; underdog: boolean } }
  | { ok: false; error: 'needs_team' | 'coin_not_owned' | 'bad_proof' | 'no_cheers_left' | 'not_found' | 'network' };

export async function cheerRide(parkId: number, body: { asset_id: number; client_request_id: string; hits: number; duration_ms: number }): Promise<CheerResult> {
  try {
    const { data } = await client.post<{ data: { cheer?: any; duplicate?: boolean } }>(`/parks/${parkId}/cheer`, body);
    return { ok: true, ...data.data };
  } catch (e: any) {
    return { ok: false, error: e?.response?.data?.data?.error ?? 'network' };
  }
}
