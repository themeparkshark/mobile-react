import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function me(): Promise<UserType> {
  const { data } = await client.get<ApiResponseType<UserType>>('/me');

  return data.data;
}
