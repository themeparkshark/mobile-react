import client from '../../../client';

export default async function items(item) {
  const response = await client.put('/me/inventory', {
    item: item.id,
  });

  return response.data.data;
}
