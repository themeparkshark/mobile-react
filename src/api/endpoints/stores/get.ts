import { ApiResponseType } from '../../../models/api-response-type';
import { StoreType } from '../../../models/store-type';
import client from '../../client';

export default async function get(store: number): Promise<StoreType> {
  const { data } = await client.get<ApiResponseType<StoreType>>(
    `/stores/${store}`
  );

  return data.data;
}
