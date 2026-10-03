import { PlayerType } from '../../../models/player-type';
import client from '../../client';

/** Take back a request I sent that is still waiting. */
export default async function cancelFriendRequest(player: Pick<PlayerType, 'id'>): Promise<void> {
  await client.post(`/players/${player.id}/cancel-friend-request`);
}
