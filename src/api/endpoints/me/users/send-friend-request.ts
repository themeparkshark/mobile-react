import client from '../../../client';
import { ApiResponseType } from '../../../../models/api-response-type';
import { UserType } from '../../../../models/user-type';

export default async function sendFriendRequest(
  user: UserType
): Promise<UserType[]> {
  const { data } = await client.post<ApiResponseType<UserType[]>>(
    `/me/users/${user.id}/send-friend-request`
  );

  return data.data;
}
