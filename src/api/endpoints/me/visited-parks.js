import client from '../../client';

export default async function visitedParks() {
  const response = await client.get('/me/visited-parks');

  return response.data.data;
}
