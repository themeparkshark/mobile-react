import { ApiResponseType } from '../../../../models/api-response-type';
import { ItemType } from '../../../../models/item-type';
import client from '../../../client';

export default async function items(itemType: number, page: number) {
  const { data } = await client.get<ApiResponseType<ItemType[]> & { links?: { next?: string | null } }>(
    '/me/inventory/items',
    {
      params: {
        item_type_id: itemType,
        page,
      },
    }
  );

  return { items: data.data, hasMore: !!data.links?.next };
}
