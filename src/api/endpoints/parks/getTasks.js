import client from '../../client';

export default async function getTasks(park) {
  const response = await client.get(`/me/parks/${park}/tasks`);

  return response.data.data;
}
