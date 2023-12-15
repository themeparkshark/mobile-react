import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function getFriends(
  page: number,
  perPage?: number
): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>(
    '/me/friends',
    {
      params: {
        page: page,
        perPage: perPage ?? 15,
      },
    }
  );

  return data.data;
}
