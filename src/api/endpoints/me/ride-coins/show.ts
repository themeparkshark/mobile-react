import api from '../../../api';
import type { RideCoinLevelType } from '../../../../models/ride-coin-level-type';

/** Park grouping and tier fields the collection API adds to every coin. */
export interface CollectedRideCoin extends RideCoinLevelType {
  readonly task_type?: 'task' | 'secret_task';
  readonly park_id?: number | null;
  readonly park_name?: string | null;
  readonly tier_name?: string;
  readonly next_tier_name?: string | null;
  /** Coin detail only: the ride journal for this ride. */
  readonly your_rides?: {
    readonly count: number;
    readonly last_rode_at: string | null;
    readonly average_rating: number | null;
    readonly last_memory: string | null;
  } | null;
}

/** One owned coin for its detail sheet (GET /me/ride-coins/{assetId}). 404 when not collected. */
export default async function getRideCoin(assetId: number, timeoutMs = 8_000): Promise<{ data: CollectedRideCoin }> {
  const response = await api.get(`/me/ride-coins/${assetId}`, { timeout: timeoutMs });
  return response.data;
}
