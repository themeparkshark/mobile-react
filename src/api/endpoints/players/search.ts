import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function searchPlayers(query: string): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>(
    '/players/search',
    {
      params: {
        query,
      },
    }
  );

  return data.data;
}
