import client from '../../client';

export default async function stores(store) {
  const response = await client.get(`/stores/${store}`);

  return response.data.data;
}
