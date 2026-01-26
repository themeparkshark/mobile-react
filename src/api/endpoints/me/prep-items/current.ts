import { CurrentPrepItemResponseType } from '../../../../models/current-prep-item-response-type';
import client from '../../../client';

/**
 * Check if player is near any prep item that can be collected.
 */
export default async function getCurrentPrepItem(
  latitude: number,
  longitude: number
): Promise<CurrentPrepItemResponseType | null> {
  const { data } = await client.get<{ data: CurrentPrepItemResponseType | null }>(
    '/me/current-prep-item',
    {
      params: {
        latitude,
        longitude,
      },
    }
  );

  return data.data;
}
