import client from '../../../client';

export default async function items(item) {
  const response = await client.post(`/me/inventory/items/${item.id}/purchase`);

  return response.data.data;
}
