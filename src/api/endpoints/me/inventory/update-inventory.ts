import { ApiResponseType } from '../../../../models/api-response-type';
import { InventoryType } from '../../../../models/inventory-type';
import { ItemType } from '../../../../models/item-type';
import client from '../../../client';

export default async function items(item: ItemType): Promise<InventoryType> {
  const { data } = await client.put<ApiResponseType<InventoryType>>(
    '/me/inventory',
    {
      item_id: item.id,
    }
  );

  return data.data;
}
