import { ApiResponseType } from '../../../models/api-response-type';
import { InventoryType } from '../../../models/inventory-type';
import client from '../../client';

export default async function me(): Promise<InventoryType> {
  const { data } = await client.get<ApiResponseType<InventoryType>>(
    '/me/inventory'
  );

  return data.data;
}
