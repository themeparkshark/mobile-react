import { PlayerType } from '../../../models/player-type';
import client from '../../client';

/** Take back a request I sent that is still waiting. */
export default async function cancelFriendRequest(player: Pick<PlayerType, 'id'>): Promise<void> {
  try {
    await client.post(`/players/${player.id}/cancel-friend-request`);
  } catch (error) {
    // Preview build: the production API has no cancel route yet (404). Its deny
    // route clears my own outgoing request to that player first, same result.
    if ((error as { response?: { status?: number } })?.response?.status !== 404) throw error;
    await client.post(`/players/${player.id}/deny-friend-request`);
  }
}
