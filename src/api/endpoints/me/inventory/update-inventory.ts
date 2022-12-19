import client from '../../../client';
import { ItemType } from '../../../../models/item-type';
import { InventoryType } from '../../../../models/inventory-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function items(item: ItemType): Promise<InventoryType> {
  const { data } = await client.put<ApiResponseType<InventoryType>>(
    '/me/inventory',
    {
      item: item.id,
    }
  );

  return data.data;
}
