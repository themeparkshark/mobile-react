import { ApiResponseType } from '../../../models/api-response-type';
import { StoreType } from '../../../models/store-type';
import client from '../../client';

export default async function stores(): Promise<StoreType[]> {
  const { data } = await client.get<ApiResponseType<StoreType[]>>('/stores');

  return data.data;
}
