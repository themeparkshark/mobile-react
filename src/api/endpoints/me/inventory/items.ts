import client from '../../../client';
import { ApiResponseType } from '../../../../models/api-response-type';
import { ItemType } from '../../../../models/item-type';

export default async function items(itemType: number) {
  const { data } = await client.get<ApiResponseType<ItemType[]>>(
    '/me/inventory/items',
    {
      params: {
        itemType,
      },
    }
  );

  return data.data;
}
