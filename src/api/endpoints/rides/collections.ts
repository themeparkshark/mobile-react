import client from '../../client';

export interface CollectionItem {
  id: number;
  name: string;
  type: string;
  park_id: number;
  image_url: string | null;
  completed: boolean;
}

export interface RideCollection {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  category: string;
  xp_reward: number;
  coin_reward: number;
  total_items: number;
  completed_items: number;
  is_complete: boolean;
  starts_at: string | null;
  ends_at: string | null;
  items: CollectionItem[];
}

export async function getRideCollections(): Promise<RideCollection[]> {
  const { data } = await client.get('/ride-collections');
  return data.data;
}
