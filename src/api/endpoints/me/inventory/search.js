import client from '../../../client';

export default async function items(item) {
  const response = await client.get(`/me/inventory/items/${item.id}`);

  return response.data.data;
}
