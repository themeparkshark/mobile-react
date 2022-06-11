import client from '../../client';

export default async function me() {
  const response = await client.get('/me');

  return response.data.data;
}
