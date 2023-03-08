import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function getFriendSuggestions(): Promise<UserType[]> {
  const { data } = await client.get<ApiResponseType<UserType[]>>('/me/friend-suggestions',);

  return data.data;
}
