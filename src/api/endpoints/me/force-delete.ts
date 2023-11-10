import client from '../../client';

export default async function forceDeleteUser() {
  await client.delete('/me/force-delete');
}
