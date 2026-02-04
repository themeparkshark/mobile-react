import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function unreadNotificationsCount(): Promise<{
  readonly unread_notifications_count: number;
}> {
  try {
    const { data } = await client.get<
      ApiResponseType<{
        readonly unread_notifications_count: number;
      }>
    >('/me/unread-notifications-count');

    return data.data ?? { unread_notifications_count: 0 };
  } catch (error) {
    console.error('Failed to fetch notification count:', error);
    return { unread_notifications_count: 0 };
  }
}
