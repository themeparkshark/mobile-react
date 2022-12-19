import client from '../../../client';
import { ItemType } from '../../../../models/item-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function items(item: ItemType): Promise<ItemType> {
  const { data } = await client.get<ApiResponseType<ItemType>>(
    `/me/inventory/items/${item.id}`
  );

  return data.data;
}
