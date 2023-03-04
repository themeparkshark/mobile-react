import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function getFriends(
  page: number,
  perPage?: number
): Promise<UserType[]> {
  const { data } = await client.get<ApiResponseType<UserType[]>>(
    '/me/friends',
    {
      params: {
        page: page,
        perPage: perPage ?? 15,
      },
    }
  );

  return data.data;
}
