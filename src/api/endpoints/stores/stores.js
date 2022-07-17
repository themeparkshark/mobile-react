import client from '../../client';

export default async function stores() {
  const response = await client.get('/stores');

  return response.data.data;
}
