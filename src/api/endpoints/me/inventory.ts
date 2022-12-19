import client from '../../client';
import { InventoryType } from '../../../models/inventory-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function me(): Promise<InventoryType> {
  const { data } = await client.get<ApiResponseType<InventoryType>>(
    '/me/inventory'
  );

  return data.data;
}
