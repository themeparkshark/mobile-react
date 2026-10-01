import client from '../../client';
import type { ShopWallet } from './shop';

export type AdPlacement = 'double_coins' | 'daily_ticket' | 'retry' | 'line_energy';

export type AdReward = {
  readonly nonce: string;
  readonly placement: AdPlacement;
  readonly ref: string | null;
  readonly status: 'offered' | 'granted' | 'refused' | 'expired';
  readonly via: 'ssv' | 'vip' | 'client' | null;
  readonly reward: { coins?: number; tickets?: number; energy?: number; overflow_message?: string };
  readonly refused_reason: string | null;
  readonly expires_at: string;
  readonly wallet: ShopWallet;
};

export type AdSummary = {
  readonly enabled: boolean;
  readonly vip: boolean;
  readonly day: string;
  readonly day_ends_at: string;
  readonly placements: Record<AdPlacement, { daily_cap: number; used: number; remaining: number; ref?: string }>;
};

export async function getAdSummary(): Promise<AdSummary> {
  const { data } = await client.get<{ data: AdSummary }>('/me/ads', { timeout: 10000 });
  return data.data;
}

/**
 * POST /api/me/ads/rewards: an offer for one placement and ref. VIP players
 * come back already granted (no ad). Rejects on 409 ADS_ALREADY_CLAIMED,
 * 429 ADS_DAILY_CAP and 422 ADS_NOT_ELIGIBLE.
 */
export async function offerAdReward(placement: AdPlacement, ref?: string | number | null): Promise<AdReward> {
  const { data } = await client.post<{ data: AdReward }>('/me/ads/rewards',
    { placement, ...(ref != null ? { ref: String(ref) } : {}) }, { timeout: 10000 });
  return data.data;
}

/** GET /api/me/ads/rewards/{nonce}: offered until AdMob's signed callback lands. */
export async function getAdReward(nonce: string): Promise<AdReward> {
  const { data } = await client.get<{ data: AdReward }>(`/me/ads/rewards/${nonce}`, { timeout: 10000 });
  return data.data;
}

/** Testing only: the server refuses this (403) unless ADS_TRUST_CLIENT_CLAIMS is on. */
export async function claimAdReward(nonce: string): Promise<AdReward> {
  const { data } = await client.post<{ data: AdReward }>(`/me/ads/rewards/${nonce}/claim`, undefined, { timeout: 10000 });
  return data.data;
}

export function adErrorCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}
