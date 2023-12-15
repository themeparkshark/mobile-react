import client from '../../client';

export default async function forceDeletePlayer() {
  await client.delete('/me/force-delete');
}
