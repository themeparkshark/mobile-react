import { PlayerType } from '../../../../models/player-type';
import client from '../../../client';

export default async function unfriend(player: PlayerType) {
  await client.delete(`/me/players/${player.id}/unfriend`);
}
