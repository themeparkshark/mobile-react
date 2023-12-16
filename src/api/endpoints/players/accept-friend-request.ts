import { ApiResponseType } from '../../../../models/api-response-type';
import { PlayerType } from '../../../../models/player-type';
import client from '../../../client';

export default async function acceptFriendRequest(
  player: PlayerType
): Promise<PlayerType[]> {
  const { data } = await client.post<ApiResponseType<PlayerType[]>>(
    `/players/${player.id}/accept-friend-request`
  );

  return data.data;
}
