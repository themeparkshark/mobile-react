import { PrepItemsResponseType } from '../../../../models/prep-items-response-type';
import client from '../../../client';
import { getCached, setCache } from '../../../../utils/apiCache';

const PREP_ITEMS_URL = '/me/prep-items';

/**
 * Get player's prep items based on current location.
 * Also regenerates energy and spawns new items if needed.
 * Caches successful responses for stale-while-revalidate pattern.
 */
export default async function getPrepItems(
  latitude: number,
  longitude: number
): Promise<PrepItemsResponseType> {
  const params = { latitude, longitude };
  const { data } = await client.get<PrepItemsResponseType>(PREP_ITEMS_URL, { params });

  // Cache on success (non-blocking)
  setCache(PREP_ITEMS_URL, params, data).catch(() => {});

  return data;
}

/**
 * Return cached prep items without hitting the network.
 * Returns null if no cached data is available.
 */
export async function getCachedPrepItems(
  latitude: number,
  longitude: number
): Promise<PrepItemsResponseType | null> {
  return getCached<PrepItemsResponseType>(PREP_ITEMS_URL, { latitude, longitude });
}
