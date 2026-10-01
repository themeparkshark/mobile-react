import { ApiResponseType } from '../../../../models/api-response-type';
import { ItemType } from '../../../../models/item-type';
import client from '../../../client';

/**
 * One page of the player's items of a type. pinItemId (a deep link's
 * highlightItemId) comes back first on page 1 and never on a later page.
 */
export default async function items(itemType: number, page: number, pinItemId?: number) {
  const { data } = await client.get<ApiResponseType<ItemType[]> & { links?: { next?: string | null } }>(
    '/me/inventory/items',
    {
      params: {
        item_type_id: itemType,
        page,
        ...(pinItemId ? { pin_item_id: pinItemId } : {}),
      },
    }
  );

  return { items: data.data, hasMore: !!data.links?.next };
}
