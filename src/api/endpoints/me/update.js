import client from '../../client';

export default async function updateUser(data) {
  const response = await client.put('/me', data);

  return response.data.data;
}
