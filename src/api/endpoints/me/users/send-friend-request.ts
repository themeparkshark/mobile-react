import { ApiResponseType } from '../../../../models/api-response-type';
import { UserType } from '../../../../models/user-type';
import client from '../../../client';

export default async function sendFriendRequest(
  user: UserType
): Promise<UserType[]> {
  const { data } = await client.post<ApiResponseType<UserType[]>>(
    `/users/${user.id}/send-friend-request`
  );

  return data.data;
}
