import client from '../../../client';

export default async function markAsRead(notification: string) {
  await client.put(`/me/notifications/${notification}`);
}
