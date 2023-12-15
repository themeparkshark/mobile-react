import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function updatePlayer(payload: {
  readonly enabled_music?: boolean;
  readonly enabled_sound_effects?: boolean;
  readonly username?: string;
}): Promise<PlayerType> {
  const { data } = await client.put<ApiResponseType<PlayerType>>(
    '/me',
    payload
  );

  return data.data;
}
