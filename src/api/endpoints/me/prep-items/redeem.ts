import { RedeemPrepItemResponseType } from '../../../../models/redeem-prep-item-response-type';
import client from '../../../client';
import deviceTimeZone from '../../../../helpers/deviceTimeZone';
import { markStampsDirty } from '../../../../screens/stampbook/dirty';

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

  // A catch that earned stamps makes the Stamp Book refetch on its next focus.
  const earned = (data as { data?: { newly_earned_stamps?: unknown[] } })?.data?.newly_earned_stamps;
  if (Array.isArray(earned) && earned.length > 0) markStampsDirty();

  return data;
}
