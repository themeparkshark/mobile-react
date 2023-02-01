import { ApiResponseType } from '../../../models/api-response-type';
import { ItemTypeType } from '../../../models/item-type-type';
import client from '../../client';

export default async function itemTypes(): Promise<ItemTypeType[]> {
  const { data } = await client.get<ApiResponseType<ItemTypeType[]>>(
    '/item-types'
  );

  return data.data;
}
