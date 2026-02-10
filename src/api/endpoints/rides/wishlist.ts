import client from '../../client';

export interface WishlistRide {
  id: number;
  name: string;
  type: string;
  park_id: number;
  image_url: string | null;
  park_name: string;
  added_at: string;
}

export async function getWishlist(): Promise<WishlistRide[]> {
  const { data } = await client.get('/ride-wishlist');
  return data.data;
}

export async function toggleWishlist(rideId: number): Promise<{ wishlisted: boolean }> {
  const { data } = await client.post('/ride-wishlist', { ride_id: rideId });
  return data.data;
}
