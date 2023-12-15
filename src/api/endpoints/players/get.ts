import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function get(player: number): Promise<PlayerType> {
  const { data } = await client.get<ApiResponseType<PlayerType>>(
    `/players/${player}`
  );

  return data.data;
}
