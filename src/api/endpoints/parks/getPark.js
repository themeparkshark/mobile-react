import client from '../../client';

export default async function currentPark(park) {
  const response = await client.get(`/parks/${park}`);

  return response.data.data;
}
