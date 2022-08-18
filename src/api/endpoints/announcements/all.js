import client from '../../client';

export default async function current() {
  const response = await client.get('/announcements');

  return response.data.data;
}
