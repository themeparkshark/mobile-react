import client from '../../client';
import { UserType } from '../../../models/user-type';
import { ApiResponseType } from '../../../models/api-response-type';

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
