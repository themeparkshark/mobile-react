import { ApiResponseType } from '../../../models/api-response-type';
import { ItemType } from '../../../models/item-type';
import client from '../../client';

export default async function getPins(page: number): Promise<ItemType[]> {
  const { data } = await client.get<ApiResponseType<ItemType[]>>('/me/pins', {
    params: {
      page,
    },
  });

  return data.data;
}
