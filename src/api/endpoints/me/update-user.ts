import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function updateUser(payload: {
  readonly enabled_music?: boolean;
  readonly enabled_sound_effects?: boolean;
  readonly username?: string;
}): Promise<UserType> {
  const { data } = await client.put<ApiResponseType<UserType>>('/me', payload);

  return data.data;
}
