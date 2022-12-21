import client from '../../../client';
import { LeaderboardType } from '../../../../models/leaderboard-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function get(park: number): Promise<LeaderboardType[]> {
  const { data } = await client.get<ApiResponseType<LeaderboardType[]>>(
    `/parks/${park}/leaderboards`
  );

  return data.data;
}
