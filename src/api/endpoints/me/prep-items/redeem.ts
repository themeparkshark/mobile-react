import { RedeemPrepItemResponseType } from '../../../../models/redeem-prep-item-response-type';
import client from '../../../client';
import deviceTimeZone from '../../../../helpers/deviceTimeZone';

/**
 * Redeem/collect a prep item.
 */
export default async function redeemPrepItem(
  prepItemId: number,
  pivotId: number,
  latitude?: number,
  longitude?: number
): Promise<RedeemPrepItemResponseType> {
  const { data } = await client.post<RedeemPrepItemResponseType>(
    `/prep-items/${prepItemId}/redeem`,
    {
      pivot_id: pivotId,
      lat: latitude,
      lng: longitude,
      timezone: deviceTimeZone(),
    }
  );

  return data;
}
