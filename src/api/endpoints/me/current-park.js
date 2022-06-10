import client from '../../client';

export default async function currentPark(latitude, longitude) {
  const response = await client.post('/me/current-park', {
    latitude,
    longitude,
  });

  return response.data;
}
