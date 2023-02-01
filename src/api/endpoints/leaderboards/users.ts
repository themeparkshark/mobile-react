import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function leaderboardUsers(
  leaderboard: number,
  page?: number
): Promise<UserType[]> {
  const { data } = await client.get<ApiResponseType<UserType[]>>(
    `/leaderboards/${leaderboard}/users`,
    {
      params: {
        page: page ?? 1,
      },
    }
  );

  return data.data;
}
