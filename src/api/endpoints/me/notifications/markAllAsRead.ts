import { ApiResponseType } from '../../../../models/api-response-type';
import { NotificationType } from '../../../../models/notification-type';
import client from '../../../client';

export default async function markAllAsRead() {
  await client.post<ApiResponseType<NotificationType[]>>(
    '/me/notifications/mark-all-as-read'
  );
}
