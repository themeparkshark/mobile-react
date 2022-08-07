import client from '../../client';

export default async function all() {
  const response = await client.get(`/pin-collections`);

  return response.data.data;
}
