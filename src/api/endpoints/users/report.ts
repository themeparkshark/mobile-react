import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function reportUser(user: number): Promise<UserType> {
  const { data } = await client.post<ApiResponseType<UserType>>(
    `/users/${user}/report`
  );

  return data.data;
}
