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
    // This optional badge must not raise an in-app development warning when
    // the API is temporarily unavailable. Keep the failure visible in Metro.
    if (__DEV__) console.log('Notification count unavailable:',
      error instanceof Error ? error.message : String(error));
    return { unread_notifications_count: 0 };
  }
}
