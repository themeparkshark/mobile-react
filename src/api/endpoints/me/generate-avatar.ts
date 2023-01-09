import client from '../../client';
import { UserType } from '../../../models/user-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function generateAvatar(): Promise<UserType> {
  const { data } = await client.post<ApiResponseType<UserType>>('/me/generate-avatar');

  return data.data;
}
