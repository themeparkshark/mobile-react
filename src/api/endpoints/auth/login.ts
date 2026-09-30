import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

/**
 * authorizationCode (optional, from the same Sign in with Apple credential) lets
 * the server keep an Apple refresh token so account deletion can revoke the
 * app's Apple grant (App Review 5.1.1(v)).
 */
export default async function login(
  user: string,
  identity_token: string,
  authorizationCode?: string | null
): Promise<PlayerType> {
  const response = await client.post<ApiResponseType<PlayerType>>(
    '/auth/login',
    {
      user,
      identity_token,
      ...(authorizationCode ? { authorization_code: authorizationCode } : {}),
    },
    { timeout: 15000 }
  );

  const player = response.data?.data;
  if (typeof player?.token !== 'string' || !player.token.trim()) {
    throw new Error('Sign-in did not return a session.');
  }
  return player;
}
