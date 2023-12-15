import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function leaderboardPlayers(
  leaderboard: number,
  page?: number
): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>(
    `/leaderboards/${leaderboard}/players`,
    {
      params: {
        page: page ?? 1,
      },
    }
  );

  return data.data;
}
