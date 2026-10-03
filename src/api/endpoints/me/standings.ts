import type { InventoryType } from '../../../models/inventory-type';
import client from '../../client';

/**
 * Standings v2 (next-wave/standings-v2/PROPOSAL.md): GET /me/standings.
 * Every field is read defensively by standingsV2Model, because an older
 * server may not have this endpoint at all (404) or may send fewer fields.
 */
export type StandingsBoardKey = 'week' | 'friends' | 'all_time';

export interface StandingsRowDto {
  readonly rank: number | null;
  readonly id: number;
  readonly screen_name: string;
  readonly score: number;
  readonly is_me?: boolean;
  readonly avatar_url?: string | null;
  readonly inventory?: InventoryType | null;
}

export interface StandingsBoardDto {
  readonly board: StandingsBoardKey;
  readonly metric: 'ride_wins' | 'ride_coins';
  readonly park_id: number | null;
  readonly available: number | null;
  readonly players_count: number;
  readonly friends_count?: number | null;
  readonly week?: { readonly starts_at: string; readonly ends_at: string; readonly timezone?: string };
  readonly rows: readonly StandingsRowDto[];
  readonly me?: StandingsRowDto | null;
  readonly chase?: { readonly id: number; readonly screen_name: string; readonly rank: number; readonly score: number; readonly to_pass: number } | null;
}

export async function getStandings(board: StandingsBoardKey, parkId?: number | null): Promise<StandingsBoardDto> {
  const { data } = await client.get<StandingsBoardDto>('/me/standings', {
    params: { board, ...(board === 'all_time' && parkId ? { park: parkId } : {}) },
  });
  return data;
}
