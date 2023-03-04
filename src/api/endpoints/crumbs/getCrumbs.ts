import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function getCrumbs(): Promise<any> {
  const { data } = await client.get<ApiResponseType<any>>('/crumbs');

  return data.data;
}
