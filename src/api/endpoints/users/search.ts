import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function searchUsers(query: string): Promise<UserType[]> {
  const { data } = await client.get<ApiResponseType<UserType[]>>(
    '/users/search',
    {
      params: {
        query,
      },
    }
  );

  return data.data;
}
