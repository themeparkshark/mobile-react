import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function reportPlayer(
  player: number
): Promise<PlayerType> {
  const { data } = await client.post<ApiResponseType<PlayerType>>(
    `/players/${player}/report`
  );

  return data.data;
}
