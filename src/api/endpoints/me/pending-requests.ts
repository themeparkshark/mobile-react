import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

/** Requests waiting on me. */
export default async function getFriendRequests(): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>(
    '/me/friend-requests'
  );

  return data.data;
}

/** Requests I sent that are still waiting (servers before Social v2 ignore the flag and return incoming). */
export async function getSentFriendRequests(): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>(
    '/me/friend-requests',
    { params: { direction: 'sent' } }
  );

  return data.data.filter(player => player.friend_status === 'outgoing');
}
