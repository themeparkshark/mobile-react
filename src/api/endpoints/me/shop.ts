import client from '../../client';

export type ShopCurrency = 'tickets' | 'coins' | 'energy' | 'rescue_passes';
export type ShopGrants = Partial<Record<ShopCurrency, number>>;

export type ShopProduct = {
  readonly product_id: string;
  readonly section: 'featured' | 'tickets' | 'coins' | 'rescue';
  readonly title: string;
  readonly badge: string | null;
  readonly grants: ShopGrants;
  /** Coin packs: how many pieces of Shark Shop gear this buys at the typical (median) gear price. */
  readonly buys?: { readonly gear: number; readonly gear_price: number } | null;
  /** A pack's own cosmetic (the Starter Pack's Starter Frame). */
  readonly frame?: { readonly key: string; readonly name: string } | null;
  readonly limit: 'once' | 'daily' | null;
  readonly deal_key: string | null;
  readonly available: boolean;
  readonly unavailable_reason: 'bought_today' | 'pouch_full' | 'unavailable' | null;
};

export type ShopWallet = Record<ShopCurrency, number>;

export type ShopCatalog = {
  readonly enabled: boolean;
  /** The shop day ('YYYY-MM-DD', parks' time zone); sent back with a Daily Deal purchase. */
  readonly day: string;
  readonly day_ends_at: string;
  /** The once-ever Starter Pack offer was seen (kept per player, any device). */
  readonly starter_seen_at?: string | null;
  /** Passed to StoreKit as appAccountToken so a purchase names its buyer. */
  readonly account_token: string;
  readonly wallet: ShopWallet;
  readonly ticket_hold_cap: number | null;
  readonly sections: readonly { key: ShopProduct['section']; title: string }[];
  readonly products: readonly ShopProduct[];
  readonly rules: readonly string[];
};

/** GET /api/me/shop: what each product grants and what this player can buy now. */
export async function getShop(): Promise<ShopCatalog> {
  const { data } = await client.get<{ data: ShopCatalog }>('/me/shop', { timeout: 15000 });
  if (!data?.data || !Array.isArray(data.data.products)) throw new Error('Shop response was malformed.');
  return data.data;
}

export type ShopRedeemResult = {
  readonly results: readonly { transaction_id: string; product_id: string; granted: ShopGrants; replay: boolean; revoked: boolean }[];
  readonly wallet: ShopWallet;
};

/**
 * POST /api/me/shop/redeem with one StoreKit 2 signed transaction. The server
 * verifies Apple's signature and grants it once per transaction id; a repeat
 * comes back as replay with nothing granted. Rejects with the axios error on
 * 409 SHOP_PURCHASE_OTHER_PLAYER and 422 SHOP_TRANSACTION_INVALID.
 */
export async function redeemShopPurchase(jws: string, shownDay?: string | null): Promise<ShopRedeemResult> {
  const { data } = await client.post<{ data: ShopRedeemResult }>('/me/shop/redeem',
    { signed_transactions: [jws], ...(shownDay ? { shown_day: shownDay } : {}) }, { timeout: 15000 });
  if (!data?.data || !Array.isArray(data.data.results)) throw new Error('Shop response was malformed.');
  return data.data;
}

/** The server's error code on a failed request, if it sent one. */
export function shopErrorCode(error: unknown): string | null {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === 'string' ? code : null;
}
