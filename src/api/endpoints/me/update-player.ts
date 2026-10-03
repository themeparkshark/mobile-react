import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function updatePlayer(payload: {
  readonly enabled_music?: boolean;
  readonly enabled_sound_effects?: boolean;
  readonly wishlist_alerts?: boolean;
  readonly username?: string;
  /** "Let sharks find me" (servers with the kid-safety update). */
  readonly discoverable?: boolean;
  /** Required by the server (Social v2 R4) whenever discoverable turns on: the grown-up gate was passed. */
  readonly grown_up_confirmed?: boolean;
}): Promise<PlayerType> {
  const { data } = await client.put<ApiResponseType<PlayerType>>(
    '/me',
    payload
  );

  return data.data;
}
