import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function all(page: number): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>('/players', {
    params: {
      page: page,
    },
  });

  return data.data;
}
