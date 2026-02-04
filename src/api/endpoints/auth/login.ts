import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function login(
  user: string,
  identity_token: string
): Promise<PlayerType> {
  console.log('🦈 Login API: sending request...');
  const response = await client.post<ApiResponseType<PlayerType>>(
    '/auth/login',
    {
      user,
      identity_token,
    }
  );

  console.log('🦈 Login API: raw response status:', response.status);
  console.log('🦈 Login API: response.data:', JSON.stringify(response.data).substring(0, 500));
  console.log('🦈 Login API: response.data.data:', JSON.stringify(response.data?.data).substring(0, 500));
  console.log('🦈 Login API: token in data.data?', !!response.data?.data?.token);

  return response.data.data;
}
