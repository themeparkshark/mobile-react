import { PlayerType } from '../../../models/player-type';
import client from '../../client';

/** "Not now": quiet, the other player is never told. */
export default async function denyFriendRequest(player: Pick<PlayerType, 'id'>): Promise<void> {
  await client.post(`/players/${player.id}/deny-friend-request`);
}
