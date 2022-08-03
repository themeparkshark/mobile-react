import client from '../../client';

export default async function deleteUser() {
  const response = await client.delete('/me');

  return response.data;
}
