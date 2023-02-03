import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function unreadNotificationsCount(): Promise<{
  readonly unread_notifications_count: number;
}> {
  const { data } = await client.get<ApiResponseType<{
    readonly unread_notifications_count: number;
  }>>('/me/unread-notifications-count');

  return data.data;
}
