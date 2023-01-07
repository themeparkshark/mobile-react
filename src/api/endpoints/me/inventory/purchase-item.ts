import client from '../../../client';
import { ItemType } from '../../../../models/item-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function items(item: ItemType, withParkCoin: boolean = false): Promise<ItemType> {
  const { data } = await client.post<ApiResponseType<ItemType>>(
    `/me/inventory/items/${item.id}/purchase`,
    {
      park_coin: withParkCoin,
    }
  );

  return data.data;
}
