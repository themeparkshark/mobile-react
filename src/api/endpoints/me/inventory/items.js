import client from '../../../client';

export default async function items(itemType) {
  const response = await client.get('/me/inventory/items', {
    params: {
      itemType,
    },
  });

  return response.data.data;
}
