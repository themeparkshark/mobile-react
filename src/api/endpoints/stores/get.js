import client from '../../client';

export default async function get(store) {
  const response = await client.get(`/stores/${store}`);

  return response.data.data;
}
