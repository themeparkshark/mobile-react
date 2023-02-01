import { ApiResponseType } from '../../../../models/api-response-type';
import { LeaderboardType } from '../../../../models/leaderboard-type';
import client from '../../../client';

export default async function get(park: number): Promise<LeaderboardType[]> {
  const { data } = await client.get<ApiResponseType<LeaderboardType[]>>(
    `/parks/${park}/leaderboards`
  );

  return data.data;
}
