import { PrepItemsResponseType } from '../../../../models/prep-items-response-type';
import client from '../../../client';
import { getCached, setCache } from '../../../../utils/apiCache';
import deviceTimeZone from '../../../../helpers/deviceTimeZone';
import { setRidePhotoServerEnabled } from '../../../../screens/ExploreScreen/ridePhoto';

const PREP_ITEMS_URL = '/me/prep-items';

/**
 * Get player's prep items based on current location.
 * Also regenerates energy and spawns new items if needed.
 * Caches successful responses for stale-while-revalidate pattern.
 */
export default async function getPrepItems(
  latitude: number,
  longitude: number,
  playerId: number
): Promise<PrepItemsResponseType> {
  if (!Number.isInteger(playerId) || playerId < 1) {
    throw new Error('A signed-in player is required to load home finds.');
  }
  // Home finds and player_stats are account-specific. Keep playerId out of the
  // HTTP location query but include it in every local cache key.
  const cacheParams = { latitude, longitude, playerId };
  const params = { latitude, longitude, timezone: deviceTimeZone() };
  const { data } = await client.get<PrepItemsResponseType>(PREP_ITEMS_URL, {
    params,
    timeout: 10_000,
  });

  // Ride Photo release gate (see ridePhoto.ts): only an explicit server flag turns it on.
  setRidePhotoServerEnabled((data?.player_stats as { ride_photo_enabled?: unknown } | undefined)?.ride_photo_enabled);

  // Cache on success (non-blocking)
  setCache(PREP_ITEMS_URL, cacheParams, data).catch(() => {});

  return data;
}

/**
 * Return cached prep items without hitting the network.
 * Returns null if no cached data is available.
 */
export async function getCachedPrepItems(
  latitude: number,
  longitude: number,
  playerId: number
): Promise<PrepItemsResponseType | null> {
  if (!Number.isInteger(playerId) || playerId < 1) return null;
  return getCached<PrepItemsResponseType>(PREP_ITEMS_URL, { latitude, longitude, playerId });
}
