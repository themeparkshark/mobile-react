import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function login(credential): Promise<PlayerType> {
  const response = await client.post<ApiResponseType<PlayerType>>(
    '/auth/login',
    {
      user: credential.user,
      identity_token: credential.identityToken,
    }
  );

  return response.data.data;
}
