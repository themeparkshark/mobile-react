import { ShopSetReward, ShopSetSummary } from '../../../models/shop-today';
import client from '../../client';

export interface ShopSetsResponse {
  readonly sets: ShopSetSummary[];
  readonly titles: { set_slug: string; title: string }[];
  readonly equipped_title: string | null;
}

export async function getShopSets(): Promise<ShopSetsResponse> {
  const { data } = await client.get<{ data: ShopSetsResponse }>('/me/shop-sets');
  return data.data;
}

export async function claimShopSet(slug: string): Promise<ShopSetReward> {
  const { data } = await client.post<{ data: ShopSetReward }>(`/me/shop-sets/${slug}/claim`);
  return data.data;
}

/** Wear a set title under your name, or pass null to clear it. */
export async function equipShopTitle(setSlug: string | null): Promise<string | null> {
  const { data } = await client.put<{ data: { title: string | null } }>('/me/shop-title', { set_slug: setSlug });
  return data.data.title;
}
