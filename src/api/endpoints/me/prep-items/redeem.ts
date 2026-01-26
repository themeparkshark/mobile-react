import { RedeemPrepItemResponseType } from '../../../../models/redeem-prep-item-response-type';
import client from '../../../client';

/**
 * Redeem/collect a prep item.
 */
export default async function redeemPrepItem(
  prepItemId: number,
  pivotId: number,
  doubleRewards: boolean = false
): Promise<RedeemPrepItemResponseType> {
  const { data } = await client.post<RedeemPrepItemResponseType>(
    `/prep-items/${prepItemId}/redeem`,
    {
      pivot_id: pivotId,
      double_rewards: doubleRewards,
    }
  );

  return data;
}
