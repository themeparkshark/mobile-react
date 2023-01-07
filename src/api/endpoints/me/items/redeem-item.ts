import client from '../../../client';
import { ItemType } from '../../../../models/item-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function redeemItem(item: ItemType): Promise<ItemType> {
  const { data } = await client.post<ApiResponseType<ItemType>>(
    `/items/${item.id}/redeem`,
  );

  return data.data;
}
