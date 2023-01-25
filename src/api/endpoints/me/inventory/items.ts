import client from '../../../client';
import { ApiResponseType } from '../../../../models/api-response-type';
import { ItemType } from '../../../../models/item-type';

export default async function items(itemType: number, page: number) {
  const { data } = await client.get<ApiResponseType<ItemType[]>>(
    '/me/inventory/items',
    {
      params: {
        itemType,
        page,
      },
    }
  );

  return data.data;
}
