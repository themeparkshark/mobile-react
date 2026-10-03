import { PlayerType } from '../../../models/player-type';
import client from '../../client';

/** Block: ends the friendship and requests both ways; the other player is never told. */
export async function blockPlayer(player: Pick<PlayerType, 'id'>): Promise<void> {
  await client.post(`/players/${player.id}/block`);
}

export async function unblockPlayer(player: Pick<PlayerType, 'id'>): Promise<void> {
  await client.delete(`/players/${player.id}/block`);
}
