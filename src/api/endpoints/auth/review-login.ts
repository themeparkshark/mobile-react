import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

/**
 * Signs in the App Store review account with its review code (from the App
 * Review notes in App Store Connect). Returns the session token.
 */
export default async function reviewLogin(code: string): Promise<string> {
  const response = await client.post<ApiResponseType<PlayerType>>(
    '/auth/review-login',
    { code: code.trim() },
    { timeout: 15000 },
  );
  const token = response.data?.data?.token;
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Review sign-in did not return a session.');
  }
  return token;
}
