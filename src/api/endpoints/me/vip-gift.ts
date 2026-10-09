import client from '../../client';

/** The VIP monthly member gift and the member calendar (GET /api/me/vip-gift). */
export type VipGiftState =
  | { readonly enabled: false; readonly plan?: VipPlanTime }
  | {
    readonly enabled: true; readonly member: boolean; readonly month: string; readonly claimed: boolean; readonly coins: number;
    readonly pin: { readonly name: string; readonly art: string; readonly ready: boolean; readonly icon_url: string | null } | null;
    readonly calendar: readonly { readonly month: string; readonly claimed: boolean; readonly pin: string | null }[];
    readonly plan?: VipPlanTime;
  };
export type VipPlanTime = { readonly vip: boolean; readonly gift_until: string | null; readonly gift_last_day: string | null };

/** Null on an older server without the route. */
export async function getVipGift(): Promise<VipGiftState | null> {
  try {
    const { data } = await client.get<{ data: VipGiftState }>('/me/vip-gift', { timeout: 10000 });
    return data?.data ?? null;
  } catch {
    return null;
  }
}

export async function claimVipGift(): Promise<{ month: string; granted: { coins?: number; item?: { item_id?: number } }; gift: VipGiftState }> {
  const { data } = await client.post('/me/vip-gift/claim', {}, { timeout: 15000 });
  return data.data;
}

export async function redeemVipGiftPlan(signedTransaction: string): Promise<VipPlanTime> {
  const { data } = await client.post('/me/vip/gift-redeem', { signed_transaction: signedTransaction }, { timeout: 15000 });
  return data.data;
}
