import client from '../../client';

export default async function get(user) {
  const response = await client.get(`/users/${user}`);

  return response.data.data;
}
