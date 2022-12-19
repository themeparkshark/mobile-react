import client from '../../../client';
import { ParkType } from '../../../../models/park-type';
import { LeaderboardType } from '../../../../models/leaderboard-type';
import { ApiResponseType } from '../../../../models/api-response-type';

export default async function get(park: ParkType): Promise<LeaderboardType[]> {
  const { data } = await client.get<ApiResponseType<LeaderboardType[]>>(
    `/parks/${park.id}/leaderboards`
  );

  return data.data;
}
