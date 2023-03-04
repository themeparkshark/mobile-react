import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function all(page: number): Promise<UserType[]> {
  const { data } = await client.get<ApiResponseType<UserType[]>>('/users', {
    params: {
      page: page,
    },
  });

  return data.data;
}
