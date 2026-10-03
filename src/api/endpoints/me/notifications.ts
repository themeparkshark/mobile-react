import { ApiResponseType } from '../../../models/api-response-type';
import { NotificationType } from '../../../models/notification-type';
import client from '../../client';

type Paged<T> = ApiResponseType<T> & { readonly links?: { readonly next?: string | null } };

export default async function getNotifications(
  page: number
): Promise<NotificationType[]> {
  return (await getNotificationsPage(page)).items;
}

/** One page plus whether another exists (the list stops asking at the end). */
export async function getNotificationsPage(page: number): Promise<{ items: NotificationType[]; hasMore: boolean }> {
  const { data } = await client.get<Paged<NotificationType[]>>('/me/notifications', { params: { page } });
  const items = data.data ?? [];
  const hasMore = data.links ? Boolean(data.links.next) : items.length >= 15;
  return { items, hasMore };
}
