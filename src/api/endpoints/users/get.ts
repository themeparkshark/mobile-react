import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function get(user: number): Promise<UserType> {
  const { data } = await client.get<ApiResponseType<UserType>>(
    `/users/${user}`
  );

  return data.data;
}
