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
