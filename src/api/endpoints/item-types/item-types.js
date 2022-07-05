import client from '../../client';

export default async function itemTypes() {
  const response = await client.get('/item-types');

  return response.data.data;
}
