import client from '../../client';
import { UserType } from '../../../models/user-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function me(): Promise<UserType> {
  const { data } = await client.get<ApiResponseType<UserType>>('/me');

  return data.data;
}
