import client from '../../client';

export default async function me() {
  const response = await client.get('/me/inventory');

  return response.data.data;
}
