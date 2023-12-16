import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function login(credential: {
  readonly user: string;
  readonly identity_token: string;
}): Promise<PlayerType> {
  const response = await client.post<ApiResponseType<PlayerType>>(
    '/auth/login',
    {
      credential,
    }
  );

  return response.data.data;
}
