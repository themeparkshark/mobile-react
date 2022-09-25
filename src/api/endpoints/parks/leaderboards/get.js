import client from '../../../client';

export default async function get(park) {
  const response = await client.get(`/parks/${park}/leaderboards`);

  return response.data.data;
}
