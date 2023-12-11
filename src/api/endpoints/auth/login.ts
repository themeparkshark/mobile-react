import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function login(credential: {
  readonly user: string;
  readonly identity_token: string;
}): Promise<UserType> {
  const response = await client.post('/auth/login', {
    credential,
  });

  return response.data;
}
