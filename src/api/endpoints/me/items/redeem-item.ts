import client from '../../../client';
import { ItemType } from '../../../../models/item-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function redeemItem(
  item: ItemType,
  doubleXP: boolean,
  doubleCoins: boolean
): Promise<ItemType> {
  const { data } = await client.post<ApiResponseType<ItemType>>(
    `/items/${item.id}/redeem`,
    {
      double_xp: doubleXP,
      double_coins: doubleCoins,
    }
  );

  return data.data;
}
