import client from '../../client';

export default async function current() {
  const response = await client.get('/current-theme');

  return response.data.data;
}
