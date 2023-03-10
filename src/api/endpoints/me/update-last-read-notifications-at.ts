import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import client from '../../client';

export default async function updateLastReadNotificationsAt(): Promise<UserType> {
  const { data } = await client.post<ApiResponseType<UserType>>(
    '/me/update-last-read-notifications-at'
  );

  return data.data;
}
