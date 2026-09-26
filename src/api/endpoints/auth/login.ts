import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function login(
  user: string,
  identity_token: string
): Promise<PlayerType> {
  const response = await client.post<ApiResponseType<PlayerType>>(
    '/auth/login',
    {
      user,
      identity_token,
    },
    { timeout: 15000 }
  );

  const player = response.data?.data;
  if (typeof player?.token !== 'string' || !player.token.trim()) {
    throw new Error('Sign-in did not return a session.');
  }
  return player;
}
