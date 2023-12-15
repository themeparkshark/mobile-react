import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function getFriendSuggestions(): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>(
    '/me/friend-suggestions'
  );

  return data.data;
}
