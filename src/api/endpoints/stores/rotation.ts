import client from '../../client';

export interface StoreRotation {
  next_rotation_at: string | null;
  interval_days: number;
}

export default async function getStoreRotation(storeId: number | string): Promise<StoreRotation> {
  try {
    const response = await client.get(`/stores/${storeId}/rotation`);
    return response.data;
  } catch (error) {
    return {
      next_rotation_at: null,
      interval_days: 7,
    };
  }
}
