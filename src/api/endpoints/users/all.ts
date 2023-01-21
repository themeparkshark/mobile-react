import client from '../../client';
import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';

export default async function searchUsers(query: string): Promise<UserType[]> {
  const { data } = await client.get<ApiResponseType<UserType[]>>(
    '/users',
    {
      params: {
        query,
      }
    }
  );

  return data.data;
}
