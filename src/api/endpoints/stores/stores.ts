import client from '../../client';
import { StoreType } from '../../../models/store-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function stores(): Promise<StoreType[]> {
  const { data } = await client.get<ApiResponseType<StoreType[]>>('/stores');

  return data.data;
}
