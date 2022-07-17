import client from '../../client';

export default async function get(catalog) {
  const response = await client.get(`/catalogs/${catalog}`);

  return response.data.data;
}
