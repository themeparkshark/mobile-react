import client from '../../client';

/**
 * The Shark Pass (season pass): GET /api/me/shark-pass and its actions.
 * Every number here comes from the server's season config; the app draws it.
 */
export type SharkPassReward =
  | { readonly type: 'coins' | 'tickets' | 'energy' | 'rescue_passes'; readonly amount: number; readonly ready: boolean }
  | { readonly type: 'mystery_box'; readonly boxes: number; readonly ready: boolean }
  | { readonly type: 'item'; readonly name: string; readonly slot: 'pin' | 'background' | string; readonly art: string; readonly icon_url: string | null; readonly ready: boolean };

export type SharkPassTier = {
  readonly tier: number;
  readonly unlocked: boolean;
  readonly free: SharkPassReward | null;
  readonly paid: SharkPassReward;
  readonly free_claimed: boolean;
  readonly paid_claimed: boolean;
};

export type SharkPassSeasonInfo = {
  readonly key: string;
  readonly title: string;
  readonly product_id: string;
  /** Shark Pass Plus: the Shark Pass row plus these extras (never steps or points). */
  readonly plus_product_id?: string | null;
  readonly plus_rewards?: readonly SharkPassReward[];
  readonly starts_at: string;
  readonly ends_at: string;
  /** The last day it runs ('YYYY-MM-DD', parks' time zone). */
  readonly last_day: string;
  readonly days_left: number;
  readonly points_per_tier: number;
  readonly tier_count: number;
  /** Over: no more points or sale; reached rewards stay claimable until claim_until. */
  readonly ended?: boolean;
  readonly claim_until?: string;
  /** The last full day a claim works ('YYYY-MM-DD'). */
  readonly claim_last_day?: string;
  /** For sale: running, and every season item exists on the server. */
  readonly on_sale?: boolean;
};

export type SharkPassEvent = { readonly event: string; readonly points: number; readonly count_today: number; readonly points_today: number; readonly cap: number | null };

export type SharkPassQuest = {
  readonly key: string; readonly label: string; readonly count: number; readonly bonus: number;
  readonly scope: 'day' | 'week'; readonly progress: number; readonly done: boolean;
};

export type SharkPassState =
  | { readonly enabled: false }
  | {
    readonly enabled: true;
    readonly season: SharkPassSeasonInfo | null;
    readonly next_season: SharkPassSeasonInfo | null;
    readonly progress?: {
      readonly points: number; readonly tier: number; readonly points_into_tier: number; readonly premium: boolean; readonly plus?: boolean;
      readonly vip: boolean; readonly vip_bonus_percent: number; readonly claimable: number; readonly today: readonly SharkPassEvent[];
      readonly catch_up?: boolean; readonly catch_up_percent?: number; readonly top_prize?: SharkPassReward | null;
    };
    readonly tiers?: readonly SharkPassTier[];
    readonly quests?: { readonly daily: readonly SharkPassQuest[]; readonly weekly: SharkPassQuest | null };
    readonly account_token?: string;
  };

/** Null on an older server without the route (404) so the app simply shows no pass. */
export async function getSharkPass(): Promise<SharkPassState | null> {
  try {
    const { data } = await client.get<{ data: SharkPassState }>('/me/shark-pass', { timeout: 12000 });
    return data?.data && typeof data.data.enabled === 'boolean' ? data.data : null;
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 405) return null;
    throw error;
  }
}

export async function claimSharkPassReward(tier: number, track: 'free' | 'paid'):
  Promise<{ tier: number; track: string; granted: Record<string, unknown>; pass: SharkPassState }> {
  const { data } = await client.post('/me/shark-pass/claim', { tier, track }, { timeout: 15000 });
  return data.data;
}

export async function claimAllSharkPass(): Promise<{ claimed: { tier: number; track: string; reward: SharkPassReward }[]; pass: SharkPassState }> {
  const { data } = await client.post('/me/shark-pass/claim-all', {}, { timeout: 20000 });
  return data.data;
}

export async function redeemSharkPass(signedTransaction: string): Promise<SharkPassState> {
  const { data } = await client.post('/me/shark-pass/redeem', { signed_transaction: signedTransaction }, { timeout: 15000 });
  return data.data;
}

export function sharkPassErrorCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}
