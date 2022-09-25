import client from '../../client';

export default async function allParks() {
  const response = await client.get('/parks');

  return response.data.data;
}
