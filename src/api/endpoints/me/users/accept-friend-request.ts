import { ApiResponseType } from '../../../../models/api-response-type';
import { UserType } from '../../../../models/user-type';
import client from '../../../client';

export default async function acceptFriendRequest(
  user: UserType
): Promise<UserType[]> {
  const { data } = await client.post<ApiResponseType<UserType[]>>(
    `/me/users/${user.id}/accept-friend-request`
  );

  return data.data;
}
