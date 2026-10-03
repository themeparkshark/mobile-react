import { ShopToday } from '../../../models/shop-today';
import client from '../../client';

/**
 * Today's Shark Shop shelves (shop-v2/CONTRACT.md). Null when the backend
 * predates Shop v2 or the store doesn't rotate: the screen keeps the old grid.
 */
export default async function getShopToday(storeId: number): Promise<ShopToday | null> {
  try {
    const { data } = await client.get<{ data: ShopToday }>(`/stores/${storeId}/today`);
    return Array.isArray(data?.data?.sections) ? data.data : null;
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 405) return null;
    throw error;
  }
}
