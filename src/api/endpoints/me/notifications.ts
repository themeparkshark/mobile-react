import client from '../../client';
import { ApiResponseType } from '../../../models/api-response-type';
import { NotificationType } from '../../../models/notification-type';

export default async function getNotifications(
  page: number
): Promise<NotificationType[]> {
  const { data } = await client.get<ApiResponseType<NotificationType[]>>(
    '/me/notifications',
    {
      params: {
        page,
      },
    }
  );

  return data.data;
}
