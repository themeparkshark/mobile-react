import client from '../../client';

/** Shark Shop wishlist: one push the day a hearted item is back. */
export async function addToWishlist(itemId: number): Promise<number[]> {
  const { data } = await client.put<{ data: { item_ids: number[] } }>(`/me/wishlist/${itemId}`);
  return data.data.item_ids;
}

export async function removeFromWishlist(itemId: number): Promise<number[]> {
  const { data } = await client.delete<{ data: { item_ids: number[] } }>(`/me/wishlist/${itemId}`);
  return data.data.item_ids;
}

export interface WishlistItem {
  readonly id: number;
  readonly name: string;
  readonly cost: number;
  readonly rarity: number;
  readonly icon_url: string | null;
  readonly icon_thumb_url: string | null;
  readonly in_shop_today: boolean;
}

/** Hearted items, each marked in the shop today or coming back later. */
export async function getWishlist(): Promise<{ item_ids: number[]; items: WishlistItem[] }> {
  const { data } = await client.get<{ data: { item_ids: number[]; items?: WishlistItem[] } }>('/me/wishlist');
  return { item_ids: data.data.item_ids, items: data.data.items ?? [] };
}
