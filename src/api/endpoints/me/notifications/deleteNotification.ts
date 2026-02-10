import client from '../../../client';

export default async function deleteNotification(notification: string) {
  await client.delete(`/me/notifications/${notification}`);
}
