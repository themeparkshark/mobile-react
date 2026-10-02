import { RedeemPrepItemResponseType } from '../../../../models/redeem-prep-item-response-type';
import client from '../../../client';
import deviceTimeZone from '../../../../helpers/deviceTimeZone';

/** Home Hunt v3 catch details (CONTRACT.md App requests). Older servers ignore them. */
export interface RedeemCatchDetails {
  readonly catch_style?: 'chomp' | 'ride_photo';
  readonly photo_quality?: 'good' | 'great' | 'frame_it';
  readonly rides?: number;
  readonly photos?: number;
}

/**
 * Redeem/collect a prep item.
 */
export default async function redeemPrepItem(
  prepItemId: number,
  pivotId: number,
  latitude?: number,
  longitude?: number,
  details?: RedeemCatchDetails,
): Promise<RedeemPrepItemResponseType> {
  const { data } = await client.post<RedeemPrepItemResponseType>(
    `/prep-items/${prepItemId}/redeem`,
    {
      pivot_id: pivotId,
      lat: latitude,
      lng: longitude,
      timezone: deviceTimeZone(),
      ...(details ?? {}),
    }
  );

  return data;
}
