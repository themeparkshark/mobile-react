import { ApiResponseType } from '../../../../models/api-response-type';
import client from '../../../client';
import { NotificationType } from "../../../../models/notification-type";

export default async function markAllAsRead() {
  await client.post<ApiResponseType<NotificationType[]>>(
    '/me/notifications/mark-all-as-read');
}
