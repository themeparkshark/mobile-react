import client from '../../client';

export default async function currentRedeemable(latitude, longitude) {
  const response = await client.get('/me/current-redeemable', {
    params: {
      latitude,
      longitude,
    },
  });

  return response.data;
}
