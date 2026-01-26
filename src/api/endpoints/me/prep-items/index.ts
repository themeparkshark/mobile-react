import { PrepItemsResponseType } from '../../../../models/prep-items-response-type';
import client from '../../../client';

/**
 * Get player's prep items based on current location.
 * Also regenerates energy and spawns new items if needed.
 */
export default async function getPrepItems(
  latitude: number,
  longitude: number
): Promise<PrepItemsResponseType> {
  const { data } = await client.get<PrepItemsResponseType>('/me/prep-items', {
    params: {
      latitude,
      longitude,
    },
  });

  return data;
}
