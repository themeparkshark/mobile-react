import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function getFriends(params?: {
  readonly limit?: number;
  readonly order_by?: string;
}): Promise<UserType[]> {
  const { data } = await client.get<ApiResponseType<UserType[]>>(
    '/me/friends',
    {
      params,
    }
  );

  return data.data;
}
