import { ApiResponseType } from '../../../models/api-response-type';
import { ItemType } from '../../../models/item-type';
import client from '../../client';

export default async function getItems(
  catalog: number,
  page: number
): Promise<ItemType[]> {
  const response = await client.get<ApiResponseType<ItemType[]>>(
    `/catalogs/${catalog}/items`,
    {
      params: {
        page,
      },
    }
  );

  return response.data.data;
}
