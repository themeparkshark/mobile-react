import client from '../../client';

export default async function currentTheme() {
  const response = await client.get(`/current-theme`);

  return response.data.data;
}
