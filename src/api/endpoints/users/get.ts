import client from '../../client';
import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';

export default async function get(user: UserType): Promise<UserType> {
  const { data } = await client.get<ApiResponseType<UserType>>(
    `/users/${user.id}`
  );

  return data.data;
}
